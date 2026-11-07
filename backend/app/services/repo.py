"""Every query against the shared data layer — the only module that writes SQL.

Functions take and return plain dicts with camelCase keys (what the API sends),
and do the JSON (de)serialisation of the JSON columns, so callers never touch
SQLite rows or column names.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any

from . import db


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _loads(value: str | None) -> Any:
    return json.loads(value) if value else None


# ── readings ─────────────────────────────────────────────────────────────────


def insert_reading(
    cycle: int,
    features: dict[str, float],
    sensor_means: dict[str, float],
    stable: int | None = None,
) -> int:
    """Store one replayed cycle; returns its ReadingID. Replaces an existing row for the same cycle."""
    with db.write() as conn:
        conn.execute("DELETE FROM tbl_SensorReading WHERE CycleNumber = ?", (cycle,))
        cur = conn.execute(
            "INSERT INTO tbl_SensorReading (CycleNumber, Timestamp, Features, SensorMeans, StableFlag)"
            " VALUES (?, ?, ?, ?, ?)",
            (cycle, _now(), json.dumps(features), json.dumps(sensor_means), stable),
        )
        return int(cur.lastrowid)


def reading(cycle: int) -> dict[str, Any] | None:
    with db.read() as conn:
        row = conn.execute("SELECT * FROM tbl_SensorReading WHERE CycleNumber = ?", (cycle,)).fetchone()
    if row is None:
        return None
    return {
        "readingId": row["ReadingID"],
        "cycle": row["CycleNumber"],
        "timestamp": row["Timestamp"],
        "features": _loads(row["Features"]),
        "sensorMeans": _loads(row["SensorMeans"]),
        "stable": row["StableFlag"],
    }


def latest_cycle() -> int | None:
    with db.read() as conn:
        row = conn.execute("SELECT MAX(CycleNumber) AS c FROM tbl_SensorReading").fetchone()
    return row["c"]


def unscored_readings() -> list[tuple[int, int]]:
    """(ReadingID, CycleNumber) of readings with no predictions yet, oldest first."""
    with db.read() as conn:
        rows = conn.execute(
            "SELECT r.ReadingID, r.CycleNumber FROM tbl_SensorReading r"
            " WHERE NOT EXISTS (SELECT 1 FROM tbl_Prediction p WHERE p.ReadingID = r.ReadingID)"
            " ORDER BY r.ReadingID"
        ).fetchall()
    return [(r["ReadingID"], r["CycleNumber"]) for r in rows]


def delete_from_cycle(cycle: int) -> None:
    """Drop this cycle and everything after it (predictions cascade). Used when the replay seeks back."""
    with db.write() as conn:
        conn.execute("DELETE FROM tbl_SensorReading WHERE CycleNumber >= ?", (cycle,))
        conn.execute("DELETE FROM tbl_Insight WHERE CycleNumber >= ?", (cycle,))


# ── predictions ──────────────────────────────────────────────────────────────


def insert_predictions(reading_id: int, predictions: list[dict[str, Any]]) -> list[int]:
    """Store one prediction per component for a reading. Each dict uses the camelCase keys of `_prediction()`."""
    ids: list[int] = []
    with db.write() as conn:
        for p in predictions:
            cur = conn.execute(
                "INSERT INTO tbl_Prediction (ReadingID, EquipmentID, PredictedCondition, ClassProbabilities,"
                " FailureProbability, ConfidenceBand, TopContributingFeature, ShapTopFeatures, ModelVersion,"
                " PredictedAt, TrueCondition) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    reading_id, p["equipmentId"], p["condition"], json.dumps(p["classProbabilities"]),
                    p["failureProbability"], p.get("confidence"), p.get("topFeature"),
                    json.dumps(p.get("shap") or []), p["modelVersion"], _now(), p.get("trueCondition"),
                ),
            )
            ids.append(int(cur.lastrowid))
    return ids


_PREDICTION_SELECT = """
SELECT p.*, r.CycleNumber, e.ComponentType
FROM tbl_Prediction p
JOIN tbl_SensorReading r ON r.ReadingID = p.ReadingID
JOIN tbl_Equipment e ON e.EquipmentID = p.EquipmentID
"""


def _prediction(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "predictionId": row["PredictionID"],
        "readingId": row["ReadingID"],
        "cycle": row["CycleNumber"],
        "equipmentId": row["EquipmentID"],
        "component": row["ComponentType"],
        "condition": row["PredictedCondition"],
        "classProbabilities": _loads(row["ClassProbabilities"]),
        "failureProbability": row["FailureProbability"],
        "confidence": row["ConfidenceBand"],
        "topFeature": row["TopContributingFeature"],
        "shap": _loads(row["ShapTopFeatures"]) or [],
        "modelVersion": row["ModelVersion"],
        "predictedAt": row["PredictedAt"],
        "alertRaised": bool(row["AlertRaised"]),
        # TrueCondition is deliberately left out: it's for evaluation, never for the UI or the AI.
    }


def latest_predictions() -> list[dict[str, Any]]:
    """The most recent prediction per equipment — the FYP1 'Critical Asset Count' rule:
    only the latest state of each asset counts, never its history."""
    with db.read() as conn:
        rows = conn.execute(
            _PREDICTION_SELECT
            + " WHERE p.PredictionID IN (SELECT MAX(PredictionID) FROM tbl_Prediction GROUP BY EquipmentID)"
            " ORDER BY e.ComponentType"
        ).fetchall()
    return [_prediction(r) for r in rows]


def previous_prediction(equipment_id: str, before_prediction_id: int) -> dict[str, Any] | None:
    """The prediction for this equipment just before the given one (to tell what changed)."""
    with db.read() as conn:
        row = conn.execute(
            _PREDICTION_SELECT + " WHERE p.EquipmentID = ? AND p.PredictionID < ? ORDER BY p.PredictionID DESC LIMIT 1",
            (equipment_id, before_prediction_id),
        ).fetchone()
    return _prediction(row) if row else None


def predictions_for_cycle(cycle: int) -> list[dict[str, Any]]:
    with db.read() as conn:
        rows = conn.execute(_PREDICTION_SELECT + " WHERE r.CycleNumber = ? ORDER BY e.ComponentType", (cycle,)).fetchall()
    return [_prediction(r) for r in rows]


def trend(last_n: int = 200) -> list[dict[str, Any]]:
    """Failure probability per component over the most recent `last_n` cycles, oldest first."""
    with db.read() as conn:
        rows = conn.execute(
            """
            SELECT r.CycleNumber AS cycle, e.ComponentType AS component,
                   p.FailureProbability AS failureProbability, p.PredictedCondition AS condition
            FROM tbl_Prediction p
            JOIN tbl_SensorReading r ON r.ReadingID = p.ReadingID
            JOIN tbl_Equipment e ON e.EquipmentID = p.EquipmentID
            WHERE r.CycleNumber > (SELECT COALESCE(MAX(CycleNumber), 0) FROM tbl_SensorReading) - ?
            ORDER BY r.CycleNumber, e.ComponentType
            """,
            (last_n,),
        ).fetchall()
    return [dict(r) for r in rows]


def condition_since(equipment_id: str) -> int | None:
    """The first cycle of the equipment's current run of the same condition (e.g. 'Critical since cycle 600')."""
    with db.read() as conn:
        row = conn.execute(
            """
            WITH ordered AS (
              SELECT r.CycleNumber AS cycle, p.PredictedCondition AS cond
              FROM tbl_Prediction p JOIN tbl_SensorReading r ON r.ReadingID = p.ReadingID
              WHERE p.EquipmentID = ?
            ),
            latest AS (SELECT cond FROM ordered ORDER BY cycle DESC LIMIT 1),
            last_other AS (
              SELECT MAX(cycle) AS c FROM ordered WHERE cond != (SELECT cond FROM latest)
            )
            SELECT MIN(cycle) AS since FROM ordered
            WHERE cycle > COALESCE((SELECT c FROM last_other), -1)
            """,
            (equipment_id,),
        ).fetchone()
    return row["since"]


def condition_changes(limit: int = 30) -> list[dict[str, Any]]:
    """The most recent condition changes across all equipment, newest first."""
    with db.read() as conn:
        rows = conn.execute(
            """
            SELECT cycle, component, prev AS fromCondition, cond AS toCondition, failureProbability
            FROM (
              SELECT r.CycleNumber AS cycle, e.ComponentType AS component, p.PredictedCondition AS cond,
                     p.FailureProbability AS failureProbability,
                     LAG(p.PredictedCondition) OVER (PARTITION BY p.EquipmentID ORDER BY r.CycleNumber) AS prev
              FROM tbl_Prediction p
              JOIN tbl_SensorReading r ON r.ReadingID = p.ReadingID
              JOIN tbl_Equipment e ON e.EquipmentID = p.EquipmentID
            )
            WHERE prev IS NOT NULL AND prev != cond
            ORDER BY cycle DESC, component
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]


def recent_conditions(equipment_id: str, n: int) -> list[str]:
    """The equipment's last `n` predicted conditions, newest first."""
    with db.read() as conn:
        rows = conn.execute(
            "SELECT PredictedCondition FROM tbl_Prediction WHERE EquipmentID = ? ORDER BY PredictionID DESC LIMIT ?",
            (equipment_id, n),
        ).fetchall()
    return [r[0] for r in rows]


def mark_alert_raised(prediction_id: int) -> None:
    with db.write() as conn:
        conn.execute("UPDATE tbl_Prediction SET AlertRaised = 1 WHERE PredictionID = ?", (prediction_id,))


# ── work orders ──────────────────────────────────────────────────────────────


def _work_order(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["WorkOrderID"],
        "equipmentId": row["EquipmentID"],
        "component": row["ComponentType"],
        "triggeredByPredictionId": row["TriggeredByPredictionID"],
        "triggeredByCycle": row["TriggerCycle"],
        "priority": row["Priority"],
        "status": row["Status"],
        "createdBy": row["CreatedBy"],
        "assignedTo": row["AssignedTo"],
        "note": row["Note"],
        "createdAt": row["CreatedAt"],
        "closedAt": row["ClosedAt"],
        "closedNote": row["ClosedNote"],
    }


_WORK_ORDER_SELECT = """
SELECT w.*, e.ComponentType, r.CycleNumber AS TriggerCycle
FROM tbl_WorkOrder w
JOIN tbl_Equipment e ON e.EquipmentID = w.EquipmentID
LEFT JOIN tbl_Prediction p ON p.PredictionID = w.TriggeredByPredictionID
LEFT JOIN tbl_SensorReading r ON r.ReadingID = p.ReadingID
"""


def create_work_order(
    equipment_id: str,
    *,
    priority: str,
    created_by: str,
    note: str | None = None,
    triggered_by_prediction_id: int | None = None,
    assigned_to: str | None = "Maintenance queue",
) -> dict[str, Any]:
    """Open a work order with the next ID ('WO-0001', 'WO-0002', …)."""
    with db.write() as conn:
        row = conn.execute(
            "SELECT MAX(CAST(SUBSTR(WorkOrderID, 4) AS INTEGER)) AS n FROM tbl_WorkOrder"
        ).fetchone()
        wo_id = f"WO-{(row['n'] or 0) + 1:04d}"
        conn.execute(
            "INSERT INTO tbl_WorkOrder (WorkOrderID, EquipmentID, TriggeredByPredictionID, Priority, Status,"
            " CreatedBy, AssignedTo, Note, CreatedAt) VALUES (?, ?, ?, ?, 'Open', ?, ?, ?, ?)",
            (wo_id, equipment_id, triggered_by_prediction_id, priority, created_by, assigned_to, note, _now()),
        )
    return work_order(wo_id)  # type: ignore[return-value]


def work_order(wo_id: str) -> dict[str, Any] | None:
    with db.read() as conn:
        row = conn.execute(_WORK_ORDER_SELECT + " WHERE w.WorkOrderID = ?", (wo_id,)).fetchone()
    return _work_order(row) if row else None


def close_work_order(wo_id: str, note: str | None = None, outcome: dict[str, Any] | None = None) -> dict[str, Any] | None:
    """Close an open work order, and log its outcome in the same transaction.

    `outcome` holds the tbl_WorkOrderOutcome columns that aren't copied from the
    work order itself. Returns None if it doesn't exist or is already closed.
    """
    closed_at = _now()
    with db.write() as conn:
        cur = conn.execute(
            "UPDATE tbl_WorkOrder SET Status = 'Closed', ClosedAt = ?, ClosedNote = ?"
            " WHERE WorkOrderID = ? AND Status = 'Open'",
            (closed_at, note, wo_id),
        )
        if cur.rowcount == 0:
            return None
        if outcome is not None:
            wo = conn.execute(_WORK_ORDER_SELECT + " WHERE w.WorkOrderID = ?", (wo_id,)).fetchone()
            row = {
                "WorkOrderID": wo_id, "EquipmentID": wo["EquipmentID"], "Component": wo["ComponentType"],
                "WorkOrderCreatedBy": wo["CreatedBy"], "WorkOrderNote": wo["Note"], "Priority": wo["Priority"],
                "OpenedAt": wo["CreatedAt"], "ClosedAt": closed_at, **outcome,
            }
            conn.execute(
                f"INSERT INTO tbl_WorkOrderOutcome ({', '.join(row)}) VALUES ({', '.join('?' * len(row))})",  # noqa: S608 — fixed column names
                tuple(row.values()),
            )
    return work_order(wo_id)


def prediction(prediction_id: int) -> dict[str, Any] | None:
    with db.read() as conn:
        row = conn.execute(_PREDICTION_SELECT + " WHERE p.PredictionID = ?", (prediction_id,)).fetchone()
    return _prediction(row) if row else None


def prediction_before(equipment_id: str, at: str) -> dict[str, Any] | None:
    """The asset's latest prediction made at or before `at` (an ISO timestamp)."""
    with db.read() as conn:
        row = conn.execute(
            _PREDICTION_SELECT + " WHERE p.EquipmentID = ? AND p.PredictedAt <= ? ORDER BY p.PredictionID DESC LIMIT 1",
            (equipment_id, at),
        ).fetchone()
    return _prediction(row) if row else None


def open_work_order_for(equipment_id: str) -> dict[str, Any] | None:
    with db.read() as conn:
        row = conn.execute(
            _WORK_ORDER_SELECT + " WHERE w.EquipmentID = ? AND w.Status = 'Open' ORDER BY w.CreatedAt DESC LIMIT 1",
            (equipment_id,),
        ).fetchone()
    return _work_order(row) if row else None


def list_work_orders(status: str | None = None) -> list[dict[str, Any]]:
    """Newest first; `status` is 'Open', 'Closed' or None for both."""
    query, args = _WORK_ORDER_SELECT, ()
    if status:
        query, args = query + " WHERE w.Status = ?", (status,)
    with db.read() as conn:
        rows = conn.execute(query + " ORDER BY w.CreatedAt DESC, w.WorkOrderID DESC", args).fetchall()
    return [_work_order(r) for r in rows]


# ── work-order outcomes (the closed loop's evidence) ─────────────────────────


def _outcome(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["OutcomeID"],
        "workOrderId": row["WorkOrderID"],
        "equipmentId": row["EquipmentID"],
        "component": row["Component"],
        "workOrderCreatedBy": row["WorkOrderCreatedBy"],
        "workOrderNote": row["WorkOrderNote"],
        "priority": row["Priority"],
        "openedAt": row["OpenedAt"],
        "closedAt": row["ClosedAt"],
        "closedBy": row["ClosedBy"],
        "finding": row["Finding"],
        "action": row["Action"],
        "matchedPrediction": row["MatchedPrediction"],
        "notes": row["Notes"],
        "prediction": None if row["PredictionID"] is None and row["CycleNumber"] is None else {
            "predictionId": row["PredictionID"],
            "source": row["PredictionSource"],
            "cycle": row["CycleNumber"],
            "condition": row["PredictedCondition"],
            "failureProbability": row["FailureProbability"],
            "topDriver": row["TopDriver"],
        },
        "studyMode": bool(row["StudyMode"]),
    }


def list_outcomes(limit: int | None = None) -> list[dict[str, Any]]:
    """Newest first."""
    with db.read() as conn:
        rows = conn.execute(
            "SELECT * FROM tbl_WorkOrderOutcome ORDER BY OutcomeID DESC" + (" LIMIT ?" if limit else ""),
            (limit,) if limit else (),
        ).fetchall()
    return [_outcome(r) for r in rows]


def outcome_tallies() -> list[dict[str, Any]]:
    """Verified outcomes (a technician said whether the prediction matched), counted per
    component × predicted condition × verdict, outside study mode."""
    with db.read() as conn:
        rows = conn.execute(
            "SELECT Component, PredictedCondition, MatchedPrediction, COUNT(*) AS n FROM tbl_WorkOrderOutcome"
            " WHERE MatchedPrediction IS NOT NULL AND StudyMode = 0"
            " GROUP BY Component, PredictedCondition, MatchedPrediction"
        ).fetchall()
    return [{"component": r["Component"], "condition": r["PredictedCondition"], "matched": r["MatchedPrediction"], "n": r["n"]} for r in rows]


# ── insights ─────────────────────────────────────────────────────────────────


def insert_insight(
    *,
    trigger_type: str,
    model: str,
    mode: str,
    prompt_version: str,
    snapshot: dict[str, Any],
    text: str,
    cycle: int | None = None,
    trigger_ref: str | None = None,
    grounded: bool | None = None,
    validation: dict[str, Any] | None = None,
    attempts: int = 1,
    latency_ms: int | None = None,
    first_token_ms: int | None = None,
) -> int:
    with db.write() as conn:
        cur = conn.execute(
            "INSERT INTO tbl_Insight (CreatedAt, CycleNumber, TriggerType, TriggerRef, Model, Mode, PromptVersion,"
            " Snapshot, Text, Grounded, ValidationDetail, Attempts, LatencyMs, FirstTokenMs)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                _now(), cycle, trigger_type, trigger_ref, model, mode, prompt_version, json.dumps(snapshot), text,
                None if grounded is None else int(grounded), json.dumps(validation) if validation else None,
                attempts, latency_ms, first_token_ms,
            ),
        )
        return int(cur.lastrowid)


def list_insights(limit: int = 50, *, include_unverified: bool = True) -> list[dict[str, Any]]:
    """Newest first, chat answers left out. The snapshot is left out (large); `insight(id, snapshot=True)` has it."""
    where = " WHERE TriggerType != 'chat'" + ("" if include_unverified else " AND (Grounded IS NULL OR Grounded = 1)")
    with db.read() as conn:
        rows = conn.execute(f"SELECT * FROM tbl_Insight{where} ORDER BY InsightID DESC LIMIT ?", (limit,)).fetchall()  # noqa: S608 — fixed clause
    return [_insight(r) for r in rows]


def insight(insight_id: int, *, snapshot: bool = False) -> dict[str, Any] | None:
    with db.read() as conn:
        row = conn.execute("SELECT * FROM tbl_Insight WHERE InsightID = ?", (insight_id,)).fetchone()
    if row is None:
        return None
    out = _insight(row)
    if snapshot:
        out["snapshot"] = _loads(row["Snapshot"])
    return out


def _insight(r: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": r["InsightID"],
        "createdAt": r["CreatedAt"],
        "cycle": r["CycleNumber"],
        "triggerType": r["TriggerType"],
        "triggerRef": r["TriggerRef"],
        "model": r["Model"],
        "mode": r["Mode"],
        "promptVersion": r["PromptVersion"],
        "text": r["Text"],
        "grounded": None if r["Grounded"] is None else bool(r["Grounded"]),
        "validation": _loads(r["ValidationDetail"]),
        "attempts": r["Attempts"],
        "latencyMs": r["LatencyMs"],
        "firstTokenMs": r["FirstTokenMs"],
    }


# ── study log ────────────────────────────────────────────────────────────────

STUDY_FIELDS = ("LogID", "ParticipantID", "Condition", "TaskSet", "TaskID", "StartedAt", "EndedAt",
                "DurationMs", "Answer", "Correct", "ChatTurns", "InsightsShown")


def _study_row(r: sqlite3.Row) -> dict[str, Any]:
    return {(k[0].lower() + k[1:]).replace("ID", "Id"): r[k] for k in STUDY_FIELDS}  # LogID → logId


def start_study_task(participant: str, condition: str, task_set: str, task_id: str) -> dict[str, Any]:
    with db.write() as conn:
        cur = conn.execute(
            "INSERT INTO tbl_StudyLog (ParticipantID, Condition, TaskSet, TaskID, StartedAt) VALUES (?, ?, ?, ?, ?)",
            (participant, condition, task_set, task_id, datetime.now(timezone.utc).isoformat(timespec="milliseconds")),
        )
        row = conn.execute("SELECT * FROM tbl_StudyLog WHERE LogID = ?", (cur.lastrowid,)).fetchone()
    return _study_row(row)


def active_study_task() -> dict[str, Any] | None:
    with db.read() as conn:
        row = conn.execute("SELECT * FROM tbl_StudyLog WHERE EndedAt IS NULL ORDER BY LogID DESC LIMIT 1").fetchone()
    return _study_row(row) if row else None


def end_study_task(log_id: int, answer: str, correct: int | None) -> dict[str, Any] | None:
    """Close a running task: duration, answer, and how many chat turns and insights it saw.

    Every task starts from an emptied tbl_Insight (the replay is reset), so the
    counts are simply what is in it now; chat answers are logged there as 'chat'.
    """
    ended = datetime.now(timezone.utc)
    with db.write() as conn:
        row = conn.execute("SELECT StartedAt FROM tbl_StudyLog WHERE LogID = ? AND EndedAt IS NULL", (log_id,)).fetchone()
        if row is None:
            return None
        chat, shown = conn.execute(
            "SELECT COALESCE(SUM(TriggerType = 'chat'), 0), COALESCE(SUM(TriggerType != 'chat'), 0) FROM tbl_Insight"
        ).fetchone()
        duration = round((ended - datetime.fromisoformat(row["StartedAt"])).total_seconds() * 1000)
        conn.execute(
            "UPDATE tbl_StudyLog SET EndedAt = ?, DurationMs = ?, Answer = ?, Correct = ?, ChatTurns = ?, InsightsShown = ?"
            " WHERE LogID = ?",
            (ended.isoformat(timespec="milliseconds"), duration, answer, correct, chat, shown, log_id),
        )
        out = conn.execute("SELECT * FROM tbl_StudyLog WHERE LogID = ?", (log_id,)).fetchone()
    return _study_row(out)


def study_log(participant: str | None = None) -> list[dict[str, Any]]:
    with db.read() as conn:
        rows = conn.execute(
            "SELECT * FROM tbl_StudyLog WHERE ? IS NULL OR ParticipantID = ? ORDER BY LogID", (participant, participant)
        ).fetchall()
    return [_study_row(r) for r in rows]


# ── users, sessions and the sign-in audit log (services/auth.py) ─────────────
# Session tokens arrive here already hashed: the database never sees a cookie value.

Client = tuple[str | None, str | None]  # (IP, User-Agent) of the request, for the audit log


def _user_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["UserID"], "username": row["Username"], "displayName": row["DisplayName"],
        "email": row["Email"], "avatarUrl": row["AvatarURL"],
        "role": row["Role"], "status": row["Status"], "notifyWorkOrders": bool(row["NotifyWorkOrders"]),
    }


class AccountError(ValueError):
    """An account change or sign-in the rules refuse. `reason` is a short code the API and UI map to words."""

    def __init__(self, reason: str, message: str) -> None:
        super().__init__(message)
        self.reason = reason


def _first_admin_or_pending(conn: sqlite3.Connection) -> tuple[str, str, int]:
    """(role, status, notify) for a new sign-up: the admin if there is no active one, else a pending engineer.

    Called inside the inserting transaction, so two people signing up at once can't both become admin.
    """
    has_admin = conn.execute("SELECT 1 FROM tbl_User WHERE Role = 'admin' AND Status = 'active'").fetchone()
    return ("engineer", "pending", 0) if has_admin else ("admin", "active", 1)


def user_with_hash(username: str) -> tuple[dict[str, Any], str] | None:
    with db.read() as conn:
        row = conn.execute("SELECT * FROM tbl_User WHERE Username = ?", (username,)).fetchone()
    return (_user_row(row), row["PasswordHash"]) if row else None


def user_count() -> int:
    with db.read() as conn:
        return int(conn.execute("SELECT COUNT(*) FROM tbl_User").fetchone()[0])


def insert_user(username: str, display_name: str, password_hash: str, email: str | None = None,
                *, role: str | None = None, status: str | None = None) -> dict[str, Any]:
    """A new password account. Without role/status, the sign-up rule decides (first admin, else pending).

    Raises sqlite3.IntegrityError for a taken username or email.
    """
    with db.write() as conn:
        auto_role, auto_status, notify = _first_admin_or_pending(conn)
        role, status = role or auto_role, status or auto_status
        cur = conn.execute(
            "INSERT INTO tbl_User (Username, DisplayName, PasswordHash, CreatedAt, Email, Role, Status, NotifyWorkOrders)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (username, display_name, password_hash, _now(), email, role, status, int(role == "admin")),
        )
        row = conn.execute("SELECT * FROM tbl_User WHERE UserID = ?", (cur.lastrowid,)).fetchone()
    return _user_row(row)


def set_password(username: str, password_hash: str) -> bool:
    with db.write() as conn:
        cur = conn.execute("UPDATE tbl_User SET PasswordHash = ? WHERE Username = ?", (password_hash, username))
        if cur.rowcount:
            # A new password signs out every session of that user.
            conn.execute(
                "DELETE FROM tbl_Session WHERE UserID = (SELECT UserID FROM tbl_User WHERE Username = ?)", (username,)
            )
    return bool(cur.rowcount)


def _log(conn: sqlite3.Connection, event: str, client: Client, *, user_id: int | None = None,
         email: str | None = None, reason: str | None = None, actor_id: int | None = None) -> None:
    conn.execute(
        "INSERT INTO tbl_AuthEvent (Event, UserID, ActorID, Email, Reason, IP, UserAgent, CreatedAt)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (event, user_id, actor_id, email, reason, *client, _now()),
    )


def _open_session(conn: sqlite3.Connection, user: dict[str, Any], token_hash: str, ttl: timedelta,
                  client: Client, events: tuple[str, ...]) -> None:
    now = datetime.now(timezone.utc)
    conn.execute("DELETE FROM tbl_Session WHERE ExpiresAt < ?", (_now(),))  # cheap housekeeping
    conn.execute(
        "INSERT INTO tbl_Session (Token, UserID, CreatedAt, ExpiresAt, IP, UserAgent) VALUES (?, ?, ?, ?, ?, ?)",
        (token_hash, user["id"], _now(), (now + ttl).isoformat(timespec="seconds"), *client),
    )
    conn.execute("UPDATE tbl_User SET LastLoginAt = ? WHERE UserID = ?", (_now(), user["id"]))
    for event in events:
        _log(conn, event, client, user_id=user["id"], email=user["email"] or user["username"])


def start_session(user: dict[str, Any], token_hash: str, ttl: timedelta, client: Client,
                  events: tuple[str, ...] = ("login",)) -> None:
    """A new session and its audit rows, in one transaction."""
    with db.write() as conn:
        _open_session(conn, user, token_hash, ttl, client, events)


def google_sign_in(sub: str, email: str, name: str, picture: str | None,
                   token_hash: str, ttl: timedelta, client: Client) -> tuple[dict[str, Any], bool]:
    """Find or create the account for a Google `sub`, start its session and audit it — one transaction,
    so a sign-in is never saved without its audit row, or the reverse. Returns (user, created).

    Raises AccountError("exists") when another account has this email, ("disabled") for a switched-off one.
    """
    with db.write() as conn:
        row = conn.execute("SELECT UserID, Status FROM tbl_User WHERE GoogleSub = ?", (sub,)).fetchone()
        taken = conn.execute("SELECT 1 FROM tbl_User WHERE Email = ? COLLATE NOCASE AND GoogleSub IS NOT ?",
                             (email, sub)).fetchone()
        if taken:
            # Never link accounts by email: that is how account takeovers happen.
            raise AccountError("exists", "An account with this email already exists. Sign in with your password.")
        if row:
            if row["Status"] == "disabled":
                raise AccountError("disabled", "This account isn't active. Ask an administrator.")
            user_id, events = row["UserID"], ("login",)
            conn.execute("UPDATE tbl_User SET Email = ?, DisplayName = ?, AvatarURL = ? WHERE UserID = ?",
                         (email, name, picture, user_id))
        else:
            events = ("signup", "login")
            role, status, notify = _first_admin_or_pending(conn)
            insert = ("INSERT INTO tbl_User (Username, DisplayName, PasswordHash, CreatedAt, GoogleSub, Email, AvatarURL,"
                      " Role, Status, NotifyWorkOrders) VALUES (?, ?, '', ?, ?, ?, ?, ?, ?, ?)")
            try:
                user_id = conn.execute(insert, (email, name, _now(), sub, email, picture, role, status, notify)).lastrowid
            except sqlite3.IntegrityError:
                # ponytail: a password account already uses this email as its username; suffix rather than merge
                # (merging would need proof both belong to the same person). Add account linking if that matters.
                user_id = conn.execute(insert, (f"{email}#{sub[-6:]}", name, _now(), sub, email, picture,
                                                role, status, notify)).lastrowid
        user = _user_row(conn.execute("SELECT * FROM tbl_User WHERE UserID = ?", (user_id,)).fetchone())
        _open_session(conn, user, token_hash, ttl, client, events)
    return user, "signup" in events


def session_user(token_hash: str) -> dict[str, Any] | None:
    with db.read() as conn:
        row = conn.execute(
            "SELECT u.* FROM tbl_Session s JOIN tbl_User u ON u.UserID = s.UserID WHERE s.Token = ? AND s.ExpiresAt > ?",
            (token_hash, _now()),
        ).fetchone()
    return _user_row(row) if row else None


def end_session(token_hash: str, client: Client) -> None:
    with db.write() as conn:
        row = conn.execute(
            "SELECT u.* FROM tbl_Session s JOIN tbl_User u ON u.UserID = s.UserID WHERE s.Token = ?", (token_hash,)
        ).fetchone()
        if row:
            conn.execute("DELETE FROM tbl_Session WHERE Token = ?", (token_hash,))
            _log(conn, "logout", client, user_id=row["UserID"], email=row["Email"] or row["Username"])


def log_auth_event(event: str, client: Client, **details: Any) -> None:
    with db.write() as conn:
        _log(conn, event, client, **details)


def auth_events(limit: int = 100) -> list[dict[str, Any]]:
    """Newest first."""
    with db.read() as conn:
        rows = conn.execute("SELECT * FROM tbl_AuthEvent ORDER BY EventID DESC LIMIT ?", (limit,)).fetchall()
    return [{"event": r["Event"], "userId": r["UserID"], "actorId": r["ActorID"], "email": r["Email"],
             "reason": r["Reason"], "ip": r["IP"], "createdAt": r["CreatedAt"]} for r in rows]


def failed_logins_since(ip: str | None, since: str) -> int:
    """Failed sign-ins from one IP since an ISO time (the rate limit in services/auth.py)."""
    with db.read() as conn:
        return int(conn.execute(
            "SELECT COUNT(*) FROM tbl_AuthEvent WHERE Event = 'login_failed' AND IP IS ? AND CreatedAt >= ?", (ip, since),
        ).fetchone()[0])


# ── account administration (api/admin.py) ────────────────────────────────────


def users() -> list[dict[str, Any]]:
    """Every account for the Users page: pending first, then by name."""
    with db.read() as conn:
        rows = conn.execute(
            "SELECT * FROM tbl_User ORDER BY Status <> 'pending', DisplayName COLLATE NOCASE"
        ).fetchall()
    return [{**_user_row(r), "google": r["GoogleSub"] is not None, "createdAt": r["CreatedAt"],
             "lastLoginAt": r["LastLoginAt"]} for r in rows]


def user(user_id: int) -> dict[str, Any] | None:
    with db.read() as conn:
        row = conn.execute("SELECT * FROM tbl_User WHERE UserID = ?", (user_id,)).fetchone()
    return _user_row(row) if row else None


def pending_count() -> int:
    with db.read() as conn:
        return int(conn.execute("SELECT COUNT(*) FROM tbl_User WHERE Status = 'pending'").fetchone()[0])


# What each admin action may start from, and the audit event it writes.
_MOVES = {
    "approve": ({"pending"}, "active"),
    "reject": ({"pending"}, "disabled"),
    "disable": ({"active"}, "disabled"),
    "enable": ({"disabled"}, "active"),
}


def change_account(user_id: int, actor: dict[str, Any], client: Client, *,
                   action: str | None = None, role: str | None = None) -> dict[str, Any]:
    """One admin action (`action`: approve | reject | disable | enable) or a role change, audited.

    Leaving the server without an active admin is refused, whoever asks. Switching an
    account off ends its sessions at once. Raises AccountError.
    """
    with db.write() as conn:
        row = conn.execute("SELECT * FROM tbl_User WHERE UserID = ?", (user_id,)).fetchone()
        if row is None:
            raise AccountError("missing", f"no account {user_id}")
        status, new_role = row["Status"], role or row["Role"]
        if action:
            allowed, status = _MOVES[action]
            if row["Status"] not in allowed:
                raise AccountError("state", f"can't {action} an account that is {row['Status']}")
        if new_role not in ("admin", "engineer"):
            raise AccountError("role", f"unknown role {new_role!r}")
        was_admin = row["Role"] == "admin" and row["Status"] == "active"
        if was_admin and not (new_role == "admin" and status == "active"):
            admins = conn.execute("SELECT COUNT(*) FROM tbl_User WHERE Role = 'admin' AND Status = 'active'").fetchone()[0]
            if admins <= 1:
                raise AccountError("last_admin", "This is the only admin. Make someone else an admin first.")
        conn.execute("UPDATE tbl_User SET Status = ?, Role = ? WHERE UserID = ?", (status, new_role, user_id))
        if status == "disabled":
            conn.execute("DELETE FROM tbl_Session WHERE UserID = ?", (user_id,))
        _log(conn, action or "role", client, user_id=user_id, actor_id=actor["id"],
             email=row["Email"] or row["Username"], reason=None if action else new_role)
        out = conn.execute("SELECT * FROM tbl_User WHERE UserID = ?", (user_id,)).fetchone()
    return _user_row(out)


def make_admin(username: str) -> bool:
    """The CLI's way back in: this account becomes an active admin."""
    with db.write() as conn:
        cur = conn.execute("UPDATE tbl_User SET Role = 'admin', Status = 'active' WHERE Username = ?", (username,))
    return bool(cur.rowcount)


def update_profile(user_id: int, *, email: str | None = None, notify_work_orders: bool | None = None) -> dict[str, Any]:
    """A user's own settings. Raises sqlite3.IntegrityError if the email belongs to another account."""
    with db.write() as conn:
        if email is not None:
            conn.execute("UPDATE tbl_User SET Email = ? WHERE UserID = ?", (email or None, user_id))
        if notify_work_orders is not None:
            conn.execute("UPDATE tbl_User SET NotifyWorkOrders = ? WHERE UserID = ?", (int(notify_work_orders), user_id))
        row = conn.execute("SELECT * FROM tbl_User WHERE UserID = ?", (user_id,)).fetchone()
    return _user_row(row)


def emails(*, admins: bool = False, work_orders: bool = False) -> list[str]:
    """Addresses of active accounts: the admins, or everyone who asked for work-order emails."""
    where = "Role = 'admin'" if admins else "NotifyWorkOrders = 1" if work_orders else "1"
    with db.read() as conn:
        rows = conn.execute(
            f"SELECT Email FROM tbl_User WHERE Status = 'active' AND Email IS NOT NULL AND {where}"  # noqa: S608 — fixed
        ).fetchall()
    return [r["Email"] for r in rows]


# ── per-user cloud keys (services/cloud.py does the encryption) ──────────────


def user_clouds(user_id: int) -> dict[str, dict[str, str | None]]:
    """provider → {api_key_enc, model, base_url}."""
    with db.read() as conn:
        rows = conn.execute("SELECT * FROM tbl_UserCloud WHERE UserID = ?", (user_id,)).fetchall()
    return {r["Provider"]: {"api_key_enc": r["ApiKeyEnc"], "model": r["Model"], "base_url": r["BaseURL"]} for r in rows}


def save_user_cloud(user_id: int, provider: str, fields: dict[str, str | None]) -> None:
    """Upsert the given fields (api_key_enc, model, base_url); fields not given keep their value."""
    cols = {"api_key_enc": "ApiKeyEnc", "model": "Model", "base_url": "BaseURL"}
    with db.write() as conn:
        conn.execute("INSERT OR IGNORE INTO tbl_UserCloud (UserID, Provider, UpdatedAt) VALUES (?, ?, ?)",
                     (user_id, provider, _now()))
        for field, value in fields.items():
            conn.execute(f"UPDATE tbl_UserCloud SET {cols[field]} = ?, UpdatedAt = ? WHERE UserID = ? AND Provider = ?",  # noqa: S608 — fixed names
                         (value, _now(), user_id, provider))


def delete_user_cloud(user_id: int, provider: str) -> None:
    with db.write() as conn:
        conn.execute("DELETE FROM tbl_UserCloud WHERE UserID = ? AND Provider = ?", (user_id, provider))


def user_model(user_id: int) -> str | None:
    with db.read() as conn:
        row = conn.execute("SELECT Provider FROM tbl_UserModel WHERE UserID = ?", (user_id,)).fetchone()
    return row["Provider"] if row else None


def set_user_model(user_id: int, provider: str) -> None:
    with db.write() as conn:
        conn.execute("INSERT INTO tbl_UserModel (UserID, Provider, UpdatedAt) VALUES (?, ?, ?)"
                     " ON CONFLICT(UserID) DO UPDATE SET Provider = excluded.Provider, UpdatedAt = excluded.UpdatedAt",
                     (user_id, provider, _now()))


# ── maintenance ──────────────────────────────────────────────────────────────


def reset() -> None:
    """Empty every table except tbl_Equipment (a fresh replay)."""
    with db.write() as conn:
        for table in ("tbl_Insight", "tbl_WorkOrder", "tbl_Prediction", "tbl_SensorReading"):
            conn.execute(f"DELETE FROM {table}")  # noqa: S608 — fixed table names


def counts() -> dict[str, int]:
    with db.read() as conn:
        return {
            t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]  # noqa: S608 — fixed table names
            for t in ("tbl_Equipment", "tbl_SensorReading", "tbl_Prediction", "tbl_WorkOrder", "tbl_Insight", "tbl_StudyLog",
                      "tbl_WorkOrderOutcome")
        }
