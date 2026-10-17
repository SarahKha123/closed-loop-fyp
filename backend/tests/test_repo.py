"""The shared data layer: schema, the 'latest per equipment' rule, work orders, insights."""

from __future__ import annotations

import sqlite3

import pytest

from app.services import db, repo

COMPONENTS = ("cooler", "valve", "pump", "accumulator")


def _reading(cycle: int) -> int:
    return repo.insert_reading(cycle, {"PS1_mean": 150.0 + cycle}, {"PS1": 150.0 + cycle}, stable=1)


def _predict(reading_id: int, conditions: dict[str, str]) -> list[int]:
    rows = []
    for comp, cond in conditions.items():
        fp = {"Optimal": 0.05, "Degraded": 0.6, "Critical": 0.97}[cond]
        rows.append({
            "equipmentId": db.equipment_id(comp),
            "condition": cond,
            "classProbabilities": {"Optimal": 1 - fp, "Degraded": fp / 2, "Critical": fp / 2},
            "failureProbability": fp,
            "confidence": "High",
            "topFeature": "PS2_mean",
            "shap": [{"feature": "PS2_mean", "value": 107.9, "contribution": 0.4}],
            "modelVersion": "test",
            "trueCondition": cond,
        })
    return repo.insert_predictions(reading_id, rows)


def test_schema_and_seed(fresh_db):
    counts = repo.counts()
    assert counts["tbl_Equipment"] == 4
    assert {k: v for k, v in counts.items() if k != "tbl_Equipment"} == {
        "tbl_SensorReading": 0, "tbl_Prediction": 0, "tbl_WorkOrder": 0, "tbl_Insight": 0, "tbl_StudyLog": 0,
    }
    with sqlite3.connect(fresh_db) as conn:
        assert conn.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
        assert conn.execute("PRAGMA user_version").fetchone()[0] == db.SCHEMA_VERSION
    db.init_db()  # idempotent
    assert repo.counts()["tbl_Equipment"] == 4


def test_reading_roundtrip(fresh_db):
    rid = _reading(7)
    r = repo.reading(7)
    assert r["readingId"] == rid and r["features"] == {"PS1_mean": 157.0} and r["stable"] == 1
    assert repo.latest_cycle() == 7
    assert repo.reading(8) is None


def test_latest_prediction_per_equipment(fresh_db):
    """Only each asset's newest state counts (FYP1 Critical Asset Count rule)."""
    _predict(_reading(1), {c: "Optimal" for c in COMPONENTS})
    ids = _predict(_reading(2), {"cooler": "Optimal", "valve": "Optimal", "pump": "Optimal", "accumulator": "Critical"})
    latest = repo.latest_predictions()
    assert len(latest) == 4
    assert {p["component"]: p["condition"] for p in latest}["Accumulator"] == "Critical"
    assert all(p["cycle"] == 2 for p in latest)
    assert "trueCondition" not in latest[0]  # evaluation-only column never leaves the repo
    prev = repo.previous_prediction(db.equipment_id("accumulator"), ids[-1])
    assert prev["condition"] == "Optimal" and prev["cycle"] == 1


def test_trend_window(fresh_db):
    for cycle in range(1, 6):
        _predict(_reading(cycle), {c: "Optimal" for c in COMPONENTS})
    rows = repo.trend(last_n=2)
    assert sorted({r["cycle"] for r in rows}) == [4, 5]
    assert len(rows) == 8


def test_delete_from_cycle_cascades(fresh_db):
    for cycle in range(1, 4):
        _predict(_reading(cycle), {c: "Optimal" for c in COMPONENTS})
    repo.delete_from_cycle(2)
    assert repo.latest_cycle() == 1
    assert repo.counts()["tbl_Prediction"] == 4


def test_work_orders(fresh_db):
    [_, _, _, accum] = _predict(_reading(1), {c: "Critical" for c in COMPONENTS})
    eq = db.equipment_id("accumulator")
    a = repo.create_work_order(eq, priority="High", created_by="system:monitor", triggered_by_prediction_id=accum)
    b = repo.create_work_order(db.equipment_id("pump"), priority="Medium", created_by="user", note="check seals")
    assert (a["id"], b["id"]) == ("WO-0001", "WO-0002")
    assert a["triggeredByCycle"] == 1 and a["createdBy"] == "system:monitor" and a["component"] == "Accumulator"
    assert repo.open_work_order_for(eq)["id"] == "WO-0001"

    closed = repo.close_work_order("WO-0001", "gas recharged")
    assert closed["status"] == "Closed" and closed["closedNote"] == "gas recharged"
    assert repo.close_work_order("WO-0001") is None  # already closed
    assert repo.open_work_order_for(eq) is None
    assert [w["id"] for w in repo.list_work_orders("Open")] == ["WO-0002"]
    assert len(repo.list_work_orders()) == 2
    assert repo.create_work_order(eq, priority="Low", created_by="user")["id"] == "WO-0003"


def test_constraints_reject_bad_rows(fresh_db):
    rid = _reading(1)
    with pytest.raises(sqlite3.IntegrityError):
        repo.insert_predictions(rid, [{
            "equipmentId": "COOLER-1", "condition": "Broken", "classProbabilities": {},
            "failureProbability": 0.5, "modelVersion": "test",
        }])
    with pytest.raises(sqlite3.IntegrityError):
        repo.create_work_order("NOPE-1", priority="High", created_by="user")


def test_insights(fresh_db):
    iid = repo.insert_insight(
        trigger_type="condition_change", model="qwen3:4b", mode="local", prompt_version="insight-v1",
        snapshot={"cycle": 3}, text="Accumulator is Critical.", cycle=3, grounded=True,
        validation={"checked": 1, "mismatches": []}, latency_ms=1200,
    )
    [i] = repo.list_insights()
    assert i["id"] == iid and i["grounded"] is True and i["validation"]["checked"] == 1 and "snapshot" not in i


def test_reset_keeps_equipment(fresh_db):
    _predict(_reading(1), {c: "Optimal" for c in COMPONENTS})
    repo.reset()
    assert repo.counts() == {
        "tbl_Equipment": 4, "tbl_SensorReading": 0, "tbl_Prediction": 0, "tbl_WorkOrder": 0, "tbl_Insight": 0, "tbl_StudyLog": 0,
    }
