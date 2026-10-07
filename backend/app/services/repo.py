"""Every query against the shared data layer — the only module that writes SQL.

Functions take and return plain dicts with camelCase keys (what the API sends),
and do the JSON (de)serialisation of the JSON columns, so callers never touch
SQLite rows or column names.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
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


def delete_from_cycle(cycle: int) -> None:
    """Drop this cycle and everything after it (predictions cascade). Used when the replay seeks back."""
    with db.write() as conn:
        conn.execute("DELETE FROM tbl_SensorReading WHERE CycleNumber >= ?", (cycle,))


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


def close_work_order(wo_id: str, note: str | None = None) -> dict[str, Any] | None:
    """Close an open work order; returns None if it doesn't exist or is already closed."""
    with db.write() as conn:
        cur = conn.execute(
            "UPDATE tbl_WorkOrder SET Status = 'Closed', ClosedAt = ?, ClosedNote = ?"
            " WHERE WorkOrderID = ? AND Status = 'Open'",
            (_now(), note, wo_id),
        )
        if cur.rowcount == 0:
            return None
    return work_order(wo_id)


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


def list_insights(limit: int = 50) -> list[dict[str, Any]]:
    """Newest first. The snapshot is left out (large); fetch it per insight if needed."""
    with db.read() as conn:
        rows = conn.execute("SELECT * FROM tbl_Insight ORDER BY InsightID DESC LIMIT ?", (limit,)).fetchall()
    return [
        {
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
        for r in rows
    ]


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
            for t in ("tbl_Equipment", "tbl_SensorReading", "tbl_Prediction", "tbl_WorkOrder", "tbl_Insight")
        }
