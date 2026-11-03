"""Work orders: the action half of the closed loop.

Every work order records who raised it (`CreatedBy`: `system:monitor` for
automatic ones, `user` for manual or chat-requested ones) and, if automatic,
the prediction that triggered it (`TriggeredByPredictionID`) — the FYP1
audit trail from an action back to the model output behind it.

Closing is the other half: a technician closes a work order with an outcome
(what they found, what they did, whether it matched the prediction), logged
in tbl_WorkOrderOutcome together with a copy of the prediction behind it —
prediction → action → verified outcome. `outcome_stats()` turns those into
how often technicians confirmed the model.

Every open/close publishes a `work_order` event, so the dashboard and toasts
update live.
"""

from __future__ import annotations

from typing import Any

from . import db, events, repo, settings

SYSTEM = "system:monitor"
USER = "user"

ACTIONS = ("repaired", "replaced", "no_action", "escalated")
MATCHES = ("yes", "no", "partially")


class WorkOrderError(ValueError):
    """Invalid request (unknown component, already closed, …)."""


def equipment_for(component: str) -> str:
    """'cooler' / 'Cooler' / 'COOLER-1' → 'COOLER-1'."""
    key = component.strip().lower()
    for comp, row in db.EQUIPMENT.items():
        if key in (comp, str(row["ComponentType"]).lower(), str(row["EquipmentID"]).lower()):
            return str(row["EquipmentID"])
    raise WorkOrderError(f"unknown component {component!r}")


def priority_for(equipment_id: str) -> str:
    """A Critical prediction on a high-criticality asset is High priority; anything else Medium."""
    row = next(r for r in db.EQUIPMENT.values() if r["EquipmentID"] == equipment_id)
    return "High" if row["CriticalityLevel"] == "High" else "Medium"


def _publish(action: str, wo: dict[str, Any]) -> None:
    events.publish({"type": "work_order", "action": action, "workOrder": wo})


def open_for_prediction(prediction: dict[str, Any]) -> dict[str, Any] | None:
    """Raise an automatic work order for a Critical prediction, unless one is already open for that asset."""
    equipment_id = prediction["equipmentId"]
    if repo.open_work_order_for(equipment_id):
        return None
    note = (f"Auto-created: {prediction['component']} predicted Critical at cycle {prediction['cycle']} "
            f"(failure probability {prediction['failureProbability'] * 100:.1f}%)")
    driver = (prediction.get("shap") or [None])[0]
    if driver:
        note += f"; top driver {driver['label']} = {driver['value']} {driver['unit']}"
    wo = repo.create_work_order(
        equipment_id, priority=priority_for(equipment_id), created_by=SYSTEM,
        note=note, triggered_by_prediction_id=prediction["predictionId"],
    )
    repo.mark_alert_raised(prediction["predictionId"])
    _publish("opened", wo)
    return wo


def open_manual(component: str, note: str | None = None, created_by: str = USER) -> dict[str, Any]:
    equipment_id = equipment_for(component)
    wo = repo.create_work_order(equipment_id, priority=priority_for(equipment_id), created_by=created_by,
                                note=(note or "").strip() or None)
    _publish("opened", wo)
    return wo


def _prediction_snapshot(wo: dict[str, Any]) -> dict[str, Any]:
    """The prediction behind a work order, as outcome columns: the one that triggered it, or for a
    manual one the asset's latest prediction when it was opened. Empty if it's gone (seeked past)."""
    p, source = None, None
    if wo["triggeredByPredictionId"] is not None:
        p, source = repo.prediction(wo["triggeredByPredictionId"]), "trigger"
    else:
        p, source = repo.prediction_before(wo["equipmentId"], wo["createdAt"]), "latest_at_open"
    if p is None:
        return {}
    driver = (p["shap"] or [None])[0]
    return {
        "PredictionID": p["predictionId"], "PredictionSource": source, "CycleNumber": p["cycle"],
        "PredictedCondition": p["condition"], "FailureProbability": p["failureProbability"],
        "TopDriver": f"{driver['label']} = {driver['value']} {driver['unit']}".strip() if driver else p["topFeature"],
    }


def _close(wo_id: str, note: str | None, outcome: dict[str, Any]) -> dict[str, Any]:
    current = repo.work_order(wo_id)
    if current is None or current["status"] != "Open":
        raise WorkOrderError(f"{wo_id} doesn't exist or is already closed")
    outcome = {**outcome, **_prediction_snapshot(current), "StudyMode": int(settings.get()["study"]["enabled"])}
    wo = repo.close_work_order(wo_id, note, outcome)
    if wo is None:
        raise WorkOrderError(f"{wo_id} doesn't exist or is already closed")
    _publish("closed", wo)
    return wo


def close(
    wo_id: str,
    *,
    finding: str,
    action: str,
    matched_prediction: str,
    notes: str | None = None,
    closed_by: str = USER,
) -> dict[str, Any]:
    """A technician closes a work order with what they found — the step that closes the loop."""
    finding = finding.strip()
    if not finding:
        raise WorkOrderError("say what was found")
    if action not in ACTIONS:
        raise WorkOrderError(f"action must be one of {', '.join(ACTIONS)}")
    if matched_prediction not in MATCHES:
        raise WorkOrderError(f"matchedPrediction must be one of {', '.join(MATCHES)}")
    notes = (notes or "").strip() or None
    return _close(wo_id, finding, {
        "ClosedBy": closed_by, "Finding": finding, "Action": action,
        "MatchedPrediction": matched_prediction, "Notes": notes,
    })


def close_automatically(wo_id: str, reason: str) -> dict[str, Any]:
    """The monitor closes a work order by itself (only with monitor.autoCloseOnRecovery on).
    Logged with no action or verdict, so it never counts as a technician's confirmation."""
    return _close(wo_id, reason, {"ClosedBy": SYSTEM, "Finding": reason})


def outcome_stats() -> dict[str, Any]:
    """How often technicians confirmed the model, from verified outcomes outside study mode.

    The headline is Critical predictions: of the work orders behind a Critical prediction that a
    technician closed, how many they said matched (yes), partly matched, or didn't.
    """
    def tally(rows: list[dict[str, Any]]) -> dict[str, Any]:
        counts = {m: sum(r["n"] for r in rows if r["matched"] == m) for m in MATCHES}
        total = sum(counts.values())
        return {
            "total": total, **counts,
            "confirmedRate": counts["yes"] / total if total else None,
            "confirmedOrPartialRate": (counts["yes"] + counts["partially"]) / total if total else None,
        }

    rows = repo.outcome_tallies()
    critical = [r for r in rows if r["condition"] == "Critical"]
    components = sorted({r["component"] for r in critical})
    return {
        "critical": tally(critical),
        "criticalByComponent": [{"component": c, **tally([r for r in critical if r["component"] == c])} for c in components],
        "allVerified": tally(rows),
    }
