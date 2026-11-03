"""The monitor: Critical → one automatic work order; recovery closes it; no duplicates."""

from __future__ import annotations

import pytest

from app.services import db, events, monitor, repo, settings, work_orders

COMPONENTS = ("cooler", "valve", "pump", "accumulator")


def _cycle(cycle: int, conditions: dict[str, str]) -> dict:
    """Store a reading + predictions for one cycle and return the prediction event the predictor would publish."""
    rid = repo.insert_reading(cycle, {"PS1_mean": 1.0}, {})
    rows = []
    for comp in COMPONENTS:
        cond = conditions.get(comp, "Optimal")
        fp = {"Optimal": 0.02, "Degraded": 0.6, "Critical": 0.99}[cond]
        rows.append({
            "equipmentId": db.equipment_id(comp), "condition": cond,
            "classProbabilities": {"Optimal": 1 - fp, "Degraded": 0.0, "Critical": fp},
            "failureProbability": fp, "confidence": "High", "topFeature": "FS2_mean",
            "shap": [{"feature": "FS2_mean", "label": "Volume flow 2 (mean)", "unit": "l/min", "value": 8.95, "contribution": 2.3}],
            "modelVersion": "test",
        })
    ids = repo.insert_predictions(rid, rows)
    return {"type": "prediction", "cycle": cycle, "predictions": [
        {"predictionId": pid, "equipmentId": r["equipmentId"],
         "component": db.EQUIPMENT[c]["ComponentType"], "condition": r["condition"],
         "failureProbability": r["failureProbability"], "changedFrom": None}
        for pid, r, c in zip(ids, rows, COMPONENTS)
    ]}


def test_critical_opens_one_linked_work_order(fresh_db):
    [wo] = monitor.handle(_cycle(600, {"accumulator": "Critical"}))
    assert wo["id"] == "WO-0001" and wo["component"] == "Accumulator"
    assert wo["createdBy"] == work_orders.SYSTEM and wo["triggeredByCycle"] == 600
    assert wo["priority"] == "Medium"  # accumulator criticality is Medium
    assert "Volume flow 2 (mean) = 8.95 l/min" in wo["note"]
    assert repo.predictions_for_cycle(600)[0]["alertRaised"] is True  # Accumulator sorts first
    # still Critical next cycle → no duplicate
    assert monitor.handle(_cycle(601, {"accumulator": "Critical"})) == []
    assert len(repo.list_work_orders("Open")) == 1


def test_high_criticality_asset_gets_high_priority(fresh_db):
    [wo] = monitor.handle(_cycle(10, {"valve": "Critical"}))
    assert wo["priority"] == "High"


def test_degraded_does_not_open(fresh_db):
    assert monitor.handle(_cycle(10, {"pump": "Degraded"})) == []


def test_recovery_closes_only_the_automatic_order(fresh_db):
    settings.update({"monitor": {"autoCloseOnRecovery": True}})
    monitor.handle(_cycle(10, {"valve": "Critical"}))
    manual = work_orders.open_manual("valve", "inspect seals")
    assert monitor.handle(_cycle(11, {"valve": "Degraded"})) == []  # not yet recovered
    [closed] = monitor.handle(_cycle(12, {}))
    assert closed["id"] == "WO-0001" and closed["status"] == "Closed" and "recovered" in closed["closedNote"]
    assert [w["id"] for w in repo.list_work_orders("Open")] == [manual["id"]]
    # logged, but unverified: no action or verdict, so it never counts as a confirmation
    [outcome] = repo.list_outcomes()
    assert outcome["closedBy"] == work_orders.SYSTEM and outcome["matchedPrediction"] is None
    assert work_orders.outcome_stats()["critical"]["total"] == 0


def test_auto_close_is_off_by_default(fresh_db):
    # a technician closes every work order with an outcome (the closed loop)
    monitor.handle(_cycle(10, {"cooler": "Critical"}))
    assert monitor.handle(_cycle(11, {})) == []
    assert len(repo.list_work_orders("Open")) == 1


def test_confirm_cycles_needs_a_streak(fresh_db, monkeypatch):
    settings.update({"monitor": {"confirmCycles": 2}})
    assert monitor.handle(_cycle(10, {"pump": "Critical"})) == []
    assert len(monitor.handle(_cycle(11, {"pump": "Critical"}))) == 1


def test_events_published(fresh_db):
    import asyncio

    async def main():
        q = events.subscribe()
        try:
            monitor.handle(_cycle(10, {"cooler": "Critical"}))
            got = [q.get_nowait() for _ in range(q.qsize())]
            assert got[-1]["type"] == "work_order" and got[-1]["action"] == "opened"
        finally:
            events.unsubscribe(q)

    asyncio.run(main())


def test_manual_errors(fresh_db):
    with pytest.raises(work_orders.WorkOrderError):
        work_orders.open_manual("turbine")
    with pytest.raises(work_orders.WorkOrderError):
        work_orders.close("WO-9999", finding="x", action="no_action", matched_prediction="no")
