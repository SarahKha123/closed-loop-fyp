"""The dashboard endpoints, through the real app: replay a few cycles, read them back."""

from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import predictor as predictor_mod


@pytest.fixture
def client(fresh_db):
    with TestClient(app) as c:
        yield c


def _wait_for_predictions(n: int, timeout: float = 10.0) -> None:
    from app.services import repo
    end = time.time() + timeout
    while repo.counts()["tbl_Prediction"] < n and time.time() < end:
        time.sleep(0.05)


def test_overview_before_and_after_replay(client):
    empty = client.get("/api/dashboard/overview").json()
    assert empty["cycle"] is None and empty["components"] == [] and empty["replay"]["nextCycle"] == 1665
    if not (predictor_mod.MODELS_DIR / "cooler.joblib").exists():
        pytest.skip("models not trained")
    assert empty["predictor"]["models"]["valve"] == "random_forest"

    for _ in range(3):
        assert client.post("/api/replay/step").status_code == 200
    _wait_for_predictions(12)

    ov = client.get("/api/dashboard/overview").json()
    assert ov["cycle"] == 1667
    assert ov["kpis"]["critical"] + ov["kpis"]["degraded"] + ov["kpis"]["optimal"] == 4
    assert {c["component"] for c in ov["components"]} == {"Cooler", "Valve", "Pump", "Accumulator"}
    assert all(c["since"] is not None and len(c["shap"]) == 3 for c in ov["components"])

    trend = client.get("/api/dashboard/trend?last=50").json()
    assert trend["cycles"] == [1665, 1666, 1667]
    assert len(trend["series"]["Cooler"]["failureProbability"]) == 3

    sensors = client.get("/api/dashboard/sensors").json()
    assert sensors["cycle"] == 1667 and len(sensors["sensors"]) == 17
    cp = next(s for s in sensors["sensors"] if s["sensor"] == "CP")
    assert cp["unit"] == "kW" and "Cooler" in cp["relatedComponents"] and cp["min"] <= cp["mean"] <= cp["max"]

    assert client.get("/api/dashboard/events").json() == {"events": client.get("/api/dashboard/events").json()["events"]}
    assert client.get("/api/work-orders").json() == {"workOrders": []}


def test_sensors_404_before_any_reading(client):
    assert client.get("/api/dashboard/sensors").status_code == 404
