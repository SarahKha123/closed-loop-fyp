"""Study mode: counterbalancing, the condition switch, and one task through the real app."""

from __future__ import annotations

import csv
import io
import json

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import paths, settings, study
from app.services import predictor as predictor_mod


def test_plan_rotates_all_four_orders():
    orders = {tuple((b["condition"], b["taskSet"]) for b in study.plan(n)["blocks"]) for n in range(1, 5)}
    assert len(orders) == 4
    assert study.plan(5) == {**study.plan(1), "participant": "P05"}
    for n in range(1, 5):  # each participant sees both conditions and both sets
        blocks = study.plan(n)["blocks"]
        assert {b["condition"] for b in blocks} == set(study.CONDITIONS) and {b["taskSet"] for b in blocks} == {"A", "B"}


def test_condition_switches_insights(fresh_db):
    assert study.set_condition("dashboard_only")["insights"]["enabled"] is False
    assert study.set_condition("dashboard_ai")["insights"]["enabled"] is True
    with pytest.raises(settings.SettingsError):
        settings.update({"study": {"condition": "neither"}})


def test_task_start_end_export(fresh_db):
    if not (predictor_mod.MODELS_DIR / "cooler.joblib").exists():
        pytest.skip("models not trained")
    (paths.CONFIG_DIR / "study_scenarios.json").write_text(json.dumps(
        {"taskSets": {"A": [{"id": "A1", "from": 200, "to": 203, "prompt": "?", "answer": "!"}]}}))
    with TestClient(app) as client:
        start = {"participant": "P01", "condition": "dashboard_only", "taskSet": "A", "taskId": "A1"}
        assert client.post("/api/study/tasks/start", json={**start, "taskId": "A9"}).status_code == 400
        row = client.post("/api/study/tasks/start", json=start).json()
        assert row["endedAt"] is None and client.get("/api/study").json()["active"]["logId"] == row["logId"]
        assert client.get("/api/replay").json()["cycle"] == 203
        assert client.post("/api/study/tasks/start", json=start).status_code == 400  # one task at a time

        done = client.post("/api/study/tasks/end", json={"answer": "cooler", "correct": True}).json()
        assert done["durationMs"] >= 0 and done["correct"] == 1 and done["chatTurns"] == 0
        assert client.get("/api/study").json()["active"] is None

        rows = list(csv.DictReader(io.StringIO(client.get("/api/study/export").text)))
        assert [(r["ParticipantID"], r["Condition"], r["TaskID"], r["Answer"]) for r in rows] == [
            ("P01", "dashboard_only", "A1", "cooler")]
