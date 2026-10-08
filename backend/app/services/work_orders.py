"""Work orders: the action half of the closed loop.

Every work order records who raised it (`CreatedBy`: `system:monitor` for
automatic ones, `user` for manual or chat-requested ones) and, if automatic,
the prediction that triggered it (`TriggeredByPredictionID`) — the FYP1
audit trail from an action back to the model output behind it.

Every open/close publishes a `work_order` event, so the dashboard and toasts
update live.
"""

from __future__ import annotations

from typing import Any

from . import db, events, repo

SYSTEM = "system:monitor"
USER = "user"


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


def close(wo_id: str, note: str | None = None) -> dict[str, Any]:
    wo = repo.close_work_order(wo_id, (note or "").strip() or None)
    if wo is None:
        raise WorkOrderError(f"{wo_id} doesn't exist or is already closed")
    _publish("closed", wo)
    return wo
