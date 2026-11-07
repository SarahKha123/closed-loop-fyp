"""The insight engine (M7) with a stub model, and the settings it reads."""

from __future__ import annotations

import pytest

from app.services import advisor, insights, repo, settings
from tests.test_monitor import _cycle

GROUNDED = "The accumulator turned Critical at cycle 11 with a 99.0% failure probability."
INVENTED = "The accumulator turned Critical at cycle 11 with a 42.0% failure probability."


@pytest.fixture
def stub_model(monkeypatch):
    """advisor.complete returns the queued replies in order; records the messages it got."""
    replies: list[str] = []
    calls: list[list[dict]] = []
    monkeypatch.setattr(advisor, "choose", lambda user_id=None: advisor.Target(label="stub", provider="openai"))

    def complete(target, messages):
        calls.append(list(messages))
        return replies.pop(0), 5, 20

    monkeypatch.setattr(advisor, "complete", complete)
    return replies, calls


def test_grounded_insight_is_stored_once(fresh_db, stub_model):
    replies, calls = stub_model
    _cycle(10, {})
    _cycle(11, {"accumulator": "Critical"})
    replies.append(GROUNDED)
    ins = insights.generate("condition_change", ["Accumulator changed from Optimal to Critical at cycle 11"])
    assert ins["grounded"] is True and ins["attempts"] == 1 and ins["cycle"] == 11
    assert ins["mode"] == "cloud" and ins["promptVersion"] == "insight-v1" and ins["latencyMs"] == 20
    assert len(calls) == 1
    snap = repo.insight(ins["id"], snapshot=True)["snapshot"]
    assert next(c for c in snap["components"] if c["component"] == "Accumulator")["changedFrom"] == "Optimal"


def test_failed_check_retries_once_with_the_mismatches(fresh_db, stub_model):
    replies, calls = stub_model
    _cycle(11, {"accumulator": "Critical"})
    replies += [INVENTED, GROUNDED]
    ins = insights.generate("condition_change")
    assert ins["grounded"] is True and ins["attempts"] == 2 and ins["latencyMs"] == 40
    assert "42.0%" in calls[1][-1]["content"]


def test_still_wrong_after_retry_is_saved_unverified(fresh_db, stub_model):
    replies, _ = stub_model
    _cycle(11, {"accumulator": "Critical"})
    replies += [INVENTED, INVENTED]
    ins = insights.generate("manual")
    assert ins["grounded"] is False and ins["validation"]["mismatches"] == ["42.0%"]
    settings.update({"grounding": {"hideUnverified": True}})
    assert repo.list_insights(include_unverified=False) == []


def test_grounding_off_saves_unchecked(fresh_db, stub_model):
    replies, calls = stub_model
    settings.update({"grounding": {"enabled": False}})
    _cycle(11, {})
    replies.append(INVENTED)
    assert insights.generate("manual")["grounded"] is None and len(calls) == 1


def test_no_data_yet(fresh_db, stub_model):
    with pytest.raises(insights.NoData):
        insights.generate("manual")


def test_triggers():
    e = insights.Engine()
    pred = lambda cycle, fp, changed=None: {"type": "prediction", "cycle": cycle, "predictions": [  # noqa: E731
        {"component": "Pump", "condition": "Degraded", "failureProbability": fp, "changedFrom": changed}]}
    assert e.triggers(pred(1, 0.2)) == []                       # first sight: nothing to compare
    assert e.triggers(pred(2, 0.3)) == []                       # still below 50%
    assert e.triggers(pred(3, 0.6)) == [("threshold", "Pump failure probability rose above 50% at cycle 3")]
    assert e.triggers(pred(4, 0.7, "Optimal"))[0][0] == "condition_change"
    wo = {"type": "work_order", "action": "opened", "workOrder": {"id": "WO-0001", "component": "Pump"}}
    assert e.triggers(wo) == [("work_order", "Work order WO-0001 opened for Pump")]


def test_settings_validation(fresh_db):
    assert settings.get()["insights"]["enabled"] is True
    assert settings.update({"insights": {"threshold": 0.7}})["insights"]["threshold"] == 0.7
    for bad in ({"insights": {"nope": 1}}, {"insights": {"enabled": "yes"}}, {"chat": {"maxTurns": 0}},
                {"monitor": {"confirmCycles": 1.5}}, {"insights": 3}):
        with pytest.raises(settings.SettingsError):
            settings.update(bad)
    assert settings.get()["insights"]["threshold"] == 0.7  # a rejected patch changes nothing
