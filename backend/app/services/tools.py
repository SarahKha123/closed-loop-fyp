"""The Advisor's chat tools (M9) — FYP1's FL_GetEquipmentStatus and friends.

    get_equipment_status(component)       latest prediction, drivers, open work order
    get_history(component, last_cycles)   how the condition and risk moved recently
    create_work_order(component, note)    NOT run: becomes a pending action the
                                          engineer confirms in the UI (POST /api/chat/confirm)

`converse()` runs the tool loop for one chat turn and yields the events
api/chat.py streams. Every tool result is also returned so the grounding
check can accept the values the model read from it.

Results are kept small on purpose (no raw rows): small local models have
short context windows, and every token is CPU time on a low-end machine.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from typing import Any

from . import advisor, db, repo, work_orders
from .snapshot import ui_round

MAX_ROUNDS = 3
HISTORY_MAX = 200

_COMPONENT = {"type": "string", "enum": ["Cooler", "Valve", "Pump", "Accumulator"]}

TOOLS: list[dict[str, Any]] = [
    {"type": "function", "function": {
        "name": "get_equipment_status",
        "description": "Latest condition, failure probability, confidence, top sensor drivers and open work order "
                       "for one component.",
        "parameters": {"type": "object", "properties": {"component": _COMPONENT}, "required": ["component"]},
    }},
    {"type": "function", "function": {
        "name": "get_history",
        "description": "How a component's condition and failure probability changed over the recent cycles.",
        "parameters": {"type": "object", "properties": {
            "component": _COMPONENT,
            "last_cycles": {"type": "integer", "description": f"how many recent cycles, 1–{HISTORY_MAX} (default 50)"},
        }, "required": ["component"]},
    }},
    {"type": "function", "function": {
        "name": "create_work_order",
        "description": "Propose a maintenance work order for a component. It is only created after the engineer "
                       "confirms it in the dashboard.",
        "parameters": {"type": "object", "properties": {
            "component": _COMPONENT,
            "note": {"type": "string", "description": "what to inspect or fix, one sentence"},
        }, "required": ["component"]},
    }},
]

# Proposed work orders awaiting the engineer's answer, by id.
# ponytail: in memory — a restart forgets unanswered proposals; persist them if that ever matters.
PENDING: dict[str, dict[str, str]] = {}


class ToolError(ValueError):
    """Bad arguments from the model; the message goes back to it as the tool result."""


def _equipment(args: dict[str, Any]) -> tuple[str, str]:
    """(equipment id, component type) for the model's `component` argument."""
    try:
        eid = work_orders.equipment_for(str(args.get("component") or ""))
    except work_orders.WorkOrderError as exc:
        raise ToolError(f"{exc}; use Cooler, Valve, Pump or Accumulator") from exc
    return eid, next(str(r["ComponentType"]) for r in db.EQUIPMENT.values() if r["EquipmentID"] == eid)


def get_equipment_status(args: dict[str, Any]) -> dict[str, Any]:
    eid, _ = _equipment(args)
    p = next((p for p in repo.latest_predictions() if p["equipmentId"] == eid), None)
    if p is None:
        return {"error": "no prediction yet — the replay hasn't scored a cycle"}
    wo = repo.open_work_order_for(eid)
    return {
        "component": p["component"],
        "cycle": p["cycle"],
        "condition": p["condition"],
        "conditionSinceCycle": repo.condition_since(eid),
        "failureProbabilityPct": round(p["failureProbability"] * 100, 1),
        "confidence": p["confidence"],
        "topDrivers": [{"name": d["label"], "value": ui_round(d["value"]), "unit": d["unit"]} for d in p["shap"]],
        "openWorkOrder": {"id": wo["id"], "priority": wo["priority"]} if wo else None,
    }


def get_history(args: dict[str, Any]) -> dict[str, Any]:
    _, component = _equipment(args)
    try:
        n = max(1, min(HISTORY_MAX, int(args.get("last_cycles") or 50)))
    except (TypeError, ValueError):
        n = 50
    rows = [r for r in repo.trend(n) if r["component"] == component]
    if not rows:
        return {"error": "no predictions yet"}
    # Runs of the same condition instead of one row per cycle: a few lines whatever n is.
    periods: list[dict[str, Any]] = []
    for r in rows:
        if periods and periods[-1]["condition"] == r["condition"]:
            periods[-1]["toCycle"] = r["cycle"]
        else:
            periods.append({"condition": r["condition"], "fromCycle": r["cycle"], "toCycle": r["cycle"]})
    fps = [r["failureProbability"] * 100 for r in rows]
    return {
        "component": component,
        "fromCycle": rows[0]["cycle"],
        "toCycle": rows[-1]["cycle"],
        "periods": periods,
        "failureProbabilityPct": {"first": round(fps[0], 1), "latest": round(fps[-1], 1),
                                  "min": round(min(fps), 1), "max": round(max(fps), 1)},
    }


def propose_work_order(args: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    """(result for the model, the action for the UI). Nothing is created here."""
    eid, component = _equipment(args)
    note = str(args.get("note") or "").strip()[:500]
    action_id = uuid.uuid4().hex[:12]
    PENDING[action_id] = {"component": component, "note": note}
    existing = repo.open_work_order_for(eid)
    result = {"status": "awaiting the engineer's confirmation in the dashboard — not created yet",
              "component": component, "note": note}
    if existing:
        result["alreadyOpen"] = existing["id"]
    action = {"id": action_id, "tool": "create_work_order", "component": component, "note": note,
              "alreadyOpen": existing["id"] if existing else None}
    return result, action


def confirm(action_id: str, approve: bool) -> dict[str, Any] | None:
    """Run (or drop) a proposed action. None if the id is unknown or already answered."""
    action = PENDING.pop(action_id, None)
    if action is None:
        return None
    if not approve:
        return {"status": "cancelled"}
    wo = work_orders.open_manual(action["component"], action["note"] or "Raised from the Advisor chat",
                                 created_by=work_orders.USER)
    return {"status": "created", "workOrder": wo}


_READ = {"get_equipment_status": get_equipment_status, "get_history": get_history}


def converse(target: advisor.Target, messages: list[dict[str, Any]], results: list[dict[str, Any]]) -> Iterator[dict[str, Any]]:
    """The tool loop for one chat turn. Yields chat events; the last is {"phase": "answer", "text": …}.

    Each tool result is appended to `results` (for the grounding check).
    Raises advisor.NoTools if the model can't take tools.
    """
    messages = list(messages)
    for _ in range(MAX_ROUNDS):
        text, calls, assistant = advisor.tool_round(target, messages, TOOLS)
        if not calls:
            yield {"phase": "answer", "text": text}
            return
        messages.append(assistant)
        for call in calls:
            try:
                if call.name == "create_work_order":
                    result, action = propose_work_order(call.args)
                    yield {"phase": "confirm", "action": action}
                elif call.name in _READ:
                    result = _READ[call.name](call.args)
                    yield {"phase": "tool", "name": call.name, "args": call.args}
                else:
                    result = {"error": f"unknown tool {call.name}"}
            except ToolError as exc:
                result = {"error": str(exc)}
            results.append({"tool": call.name, "args": call.args, "result": result})
            messages.append(advisor.tool_result(call, result))
    # Still calling tools after MAX_ROUNDS: one last reply, without tools, from what it has.
    messages.append({"role": "user", "content": "Answer now from the tool results above, without calling tools."})
    yield {"phase": "answer", "text": advisor.complete(target, messages)[0]}
