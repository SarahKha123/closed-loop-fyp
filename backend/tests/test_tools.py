"""Chat tools (M9): shapes from a seeded DB, the confirm-before-create rule, the tool loop with a stub model."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.services import advisor, repo, tools, work_orders
from tests.test_monitor import _cycle


def test_status_and_history_shapes(fresh_db):
    _cycle(10, {})
    _cycle(11, {"pump": "Degraded"})
    _cycle(12, {"pump": "Critical"})
    s = tools.get_equipment_status({"component": "pump"})
    assert s["condition"] == "Critical" and s["failureProbabilityPct"] == 99.0 and s["conditionSinceCycle"] == 12
    assert s["topDrivers"] == [{"name": "Volume flow 2 (mean)", "value": 8.95, "unit": "l/min"}]
    assert s["openWorkOrder"] is None
    h = tools.get_history({"component": "Pump", "last_cycles": 50})
    assert [p["condition"] for p in h["periods"]] == ["Optimal", "Degraded", "Critical"]
    assert h["failureProbabilityPct"] == {"first": 2.0, "latest": 99.0, "min": 2.0, "max": 99.0}
    with pytest.raises(tools.ToolError):
        tools.get_history({"component": "turbine"})


def test_work_order_needs_confirmation(fresh_db):
    _cycle(10, {"cooler": "Critical"})
    _, action = tools.propose_work_order({"component": "cooler", "note": "Check the fan"})
    assert repo.list_work_orders() == []  # proposing creates nothing
    out = tools.confirm(action["id"], approve=True)
    assert out["status"] == "created" and out["workOrder"]["createdBy"] == work_orders.USER
    assert out["workOrder"]["note"] == "Check the fan"
    assert tools.confirm(action["id"], approve=True) is None  # answered once only
    _, action2 = tools.propose_work_order({"component": "cooler"})
    assert action2["alreadyOpen"] == out["workOrder"]["id"]
    assert tools.confirm(action2["id"], approve=False) == {"status": "cancelled"}
    assert len(repo.list_work_orders()) == 1


@pytest.fixture
def stub_rounds(monkeypatch):
    """advisor.tool_round returns the queued (text, calls) in order."""
    rounds: list[tuple[str, list[advisor.ToolCall]]] = []
    seen: list[list[dict]] = []
    monkeypatch.setattr(advisor, "choose", lambda: advisor.Target(label="stub", provider="openai"))

    def tool_round(target, messages, tool_defs):
        seen.append(list(messages))
        text, calls = rounds.pop(0)
        return text, calls, {"role": "assistant", "content": text}

    monkeypatch.setattr(advisor, "tool_round", tool_round)
    return rounds, seen


def test_loop_runs_tools_then_answers(fresh_db, stub_rounds):
    rounds, seen = stub_rounds
    _cycle(10, {"pump": "Critical"})
    rounds += [("", [advisor.ToolCall("1", "get_equipment_status", {"component": "Pump"}),
                     advisor.ToolCall("2", "create_work_order", {"component": "Pump", "note": "Replace seal"})]),
               ("The pump is Critical at 99.0%; a work order is waiting for your confirmation.", [])]
    results: list[dict] = []
    events = list(tools.converse(advisor.Target(label="stub", provider="openai"), [], results))
    assert [e["phase"] for e in events] == ["tool", "confirm", "answer"]
    assert events[1]["action"]["component"] == "Pump" and repo.list_work_orders() == []
    assert [r["tool"] for r in results] == ["get_equipment_status", "create_work_order"]
    assert json.loads(seen[1][-2]["content"])["condition"] == "Critical"  # the result went back to the model


def test_chat_endpoint_with_tools_and_confirm(fresh_db, stub_rounds):
    from app.main import app

    rounds, _ = stub_rounds
    _cycle(10, {"pump": "Critical"})
    rounds += [("", [advisor.ToolCall("1", "create_work_order", {"component": "Pump"})]),
               ("A work order for the pump is waiting for your confirmation.", [])]
    with TestClient(app) as c:
        body = c.post("/api/chat", json={"messages": [{"role": "user", "content": "Raise a work order for the pump"}]}).text
        frames = [json.loads(line[5:]) for line in body.splitlines() if line.startswith("data:")]
        assert [f["phase"] for f in frames] == ["confirm", "token", "done"]
        assert frames[-1]["tools"] is True and frames[-1]["grounded"] is True
        r = c.post("/api/chat/confirm", json={"id": frames[0]["action"]["id"], "approve": True}).json()
        assert r["workOrder"]["createdBy"] == "user"
        assert c.post("/api/chat/confirm", json={"id": "nope", "approve": True}).status_code == 404


def test_model_without_tools_falls_back_to_streaming(fresh_db, monkeypatch):
    from app.main import app

    monkeypatch.setattr(advisor, "choose", lambda: advisor.Target(label="tiny", provider="openai"))
    monkeypatch.setattr(advisor, "NO_TOOLS", set())

    def refuse(*_):
        advisor.NO_TOOLS.add("tiny")
        raise advisor.NoTools("tiny does not support tools")

    monkeypatch.setattr(advisor, "tool_round", refuse)
    monkeypatch.setattr(advisor, "stream_reply", lambda target, messages: iter(["All ", "fine."]))
    _cycle(10, {})
    with TestClient(app) as c:
        body = c.post("/api/chat", json={"messages": [{"role": "user", "content": "Status?"}]}).text
    frames = [json.loads(line[5:]) for line in body.splitlines() if line.startswith("data:")]
    assert [f["phase"] for f in frames] == ["token", "token", "done"] and frames[-1]["tools"] is False
    assert "tiny" in advisor.NO_TOOLS
