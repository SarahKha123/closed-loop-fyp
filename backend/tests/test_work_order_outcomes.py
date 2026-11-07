"""Closing the loop: a technician's outcome is required, logged with the prediction behind the work
order, survives a replay reset, and feeds the confirmation stat."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import auth, db, monitor, repo, settings, work_orders
from tests.test_monitor import _cycle


@pytest.fixture
def client(fresh_db):
    with TestClient(app) as c:
        yield c


def _close(wo_id: str, matched: str = "yes", **kw) -> dict:
    return work_orders.close(wo_id, finding=kw.pop("finding", "seal wear confirmed"),
                             action=kw.pop("action", "replaced"), matched_prediction=matched, **kw)


def test_outcome_copies_the_triggering_prediction(fresh_db):
    [wo] = monitor.handle(_cycle(600, {"accumulator": "Critical"}))
    closed = _close(wo["id"], notes="gas pre-charge low", closed_by="Demo Engineer")
    assert closed["status"] == "Closed" and closed["closedNote"] == "seal wear confirmed"

    [o] = repo.list_outcomes()
    assert o["workOrderId"] == wo["id"] and o["component"] == "Accumulator" and o["closedBy"] == "Demo Engineer"
    assert (o["finding"], o["action"], o["matchedPrediction"], o["notes"]) == (
        "seal wear confirmed", "replaced", "yes", "gas pre-charge low")
    p = o["prediction"]
    assert p["source"] == "trigger" and p["cycle"] == 600 and p["condition"] == "Critical"
    assert p["failureProbability"] == pytest.approx(0.99)
    assert p["topDriver"] == "Volume flow 2 (mean) = 8.95 l/min"


def test_manual_work_order_uses_latest_prediction_at_open(fresh_db):
    monitor.handle(_cycle(10, {"pump": "Degraded"}))
    wo = work_orders.open_manual("pump", "noisy")
    _close(wo["id"], matched="partially", action="repaired", finding="bearing noise, not leakage")
    p = repo.list_outcomes()[0]["prediction"]
    assert p["source"] == "latest_at_open" and p["condition"] == "Degraded" and p["cycle"] == 10


def test_outcome_is_required_and_validated(fresh_db):
    [wo] = monitor.handle(_cycle(10, {"valve": "Critical"}))
    with pytest.raises(work_orders.WorkOrderError):
        _close(wo["id"], finding="  ")
    with pytest.raises(work_orders.WorkOrderError):
        _close(wo["id"], action="fixed it")
    with pytest.raises(work_orders.WorkOrderError):
        _close(wo["id"], matched="maybe")
    assert repo.list_outcomes() == [] and repo.work_order(wo["id"])["status"] == "Open"
    _close(wo["id"])
    with pytest.raises(work_orders.WorkOrderError):
        _close(wo["id"])  # already closed: no second outcome
    assert len(repo.list_outcomes()) == 1


def test_outcomes_survive_a_replay_reset(fresh_db):
    [wo] = monitor.handle(_cycle(10, {"cooler": "Critical"}))
    _close(wo["id"])
    repo.reset()
    assert repo.list_work_orders() == [] and len(repo.list_outcomes()) == 1


def test_confirmation_stat(fresh_db):
    for cycle, comp, matched in [(10, "valve", "yes"), (20, "valve", "yes"), (30, "pump", "no"), (40, "cooler", "partially")]:
        [wo] = monitor.handle(_cycle(cycle, {comp: "Critical"}))
        _close(wo["id"], matched=matched)
    # a study-mode outcome is logged but kept out of the stat
    settings.update({"study": {"enabled": True}})
    [wo] = monitor.handle(_cycle(50, {"accumulator": "Critical"}))
    _close(wo["id"], matched="no")
    assert repo.list_outcomes()[0]["studyMode"] is True

    stats = work_orders.outcome_stats()
    c = stats["critical"]
    assert (c["total"], c["yes"], c["partially"], c["no"]) == (4, 2, 1, 1)
    assert c["confirmedRate"] == 0.5 and c["confirmedOrPartialRate"] == 0.75
    assert {r["component"]: r["yes"] for r in stats["criticalByComponent"]} == {"Cooler": 0, "Pump": 0, "Valve": 2}


def test_close_api_requires_outcome_and_records_user(client):
    wo = client.post("/api/work-orders", json={"component": "valve", "note": "check"}).json()
    bare = client.post(f"/api/work-orders/{wo['id']}/close", json={"note": "done"})
    assert bare.status_code == 422  # finding, action and matchedPrediction are required

    auth.add_user("demo", "Demo Engineer", "demo", "demo@x.com")
    client.post("/api/auth/login", json={"username": "demo", "password": "demo"})
    ok = client.post(f"/api/work-orders/{wo['id']}/close",
                     json={"finding": "false alarm, sensor fault", "action": "no_action", "matchedPrediction": "no"})
    assert ok.status_code == 200 and ok.json()["status"] == "Closed"
    again = client.post(f"/api/work-orders/{wo['id']}/close",
                        json={"finding": "x", "action": "no_action", "matchedPrediction": "no"})
    assert again.status_code == 404

    [o] = client.get("/api/work-orders/history").json()["outcomes"]
    assert o["closedBy"] == "Demo Engineer" and o["finding"] == "false alarm, sensor fault"
    assert "false alarm, sensor fault" in client.get("/api/work-orders/outcomes.csv").text
    assert client.get("/api/work-orders/outcome-stats").json()["allVerified"]["no"] == 1
