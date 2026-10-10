"""The snapshot: exactly what the dashboard shows right now, as the AI sees it.

Both the insight engine and (M9) the chat send this, and the grounding check
compares every number the model writes against it — so it holds what the
operator can see and nothing else. In particular never `TrueCondition`
(repo leaves it out of every prediction).

Numbers are rounded the way the UI rounds them (frontend `lib/format.ts`
`reading()`), so a value the model copies from here is the value on screen.
"""

from __future__ import annotations

from typing import Any

from . import repo


def ui_round(v: float) -> float:
    """1234.5 → 1235, 123.45 → 123.5, 12.345 → 12.35, 0.12345 → 0.123 (same rule as the UI)."""
    a = abs(v)
    if a >= 1000:
        return float(round(v))
    return round(v, 1 if a >= 100 else 2 if a >= 1 else 3)


def build(events: list[str] | None = None) -> dict[str, Any]:
    """The current state; `events` are one-line descriptions of what just happened (the insight's trigger)."""
    latest = repo.latest_predictions()
    components = []
    for p in latest:
        prev = repo.previous_prediction(p["equipmentId"], p["predictionId"])
        components.append({
            "component": p["component"],
            "condition": p["condition"],
            "changedFrom": prev["condition"] if prev and prev["condition"] != p["condition"] else None,
            "failureProbabilityPct": round(p["failureProbability"] * 100, 1),
            "confidence": p["confidence"],
            "conditionSinceCycle": repo.condition_since(p["equipmentId"]),
            "topDrivers": [{"name": d["label"], "value": ui_round(d["value"]), "unit": d["unit"]} for d in p["shap"]],
        })
    return {
        "cycle": latest[0]["cycle"] if latest else None,
        "events": events or [],
        "components": components,
        "openWorkOrders": [
            {"id": w["id"], "component": w["component"], "priority": w["priority"],
             "raisedBy": "system" if w["createdBy"].startswith("system") else "user"}
            for w in repo.list_work_orders("Open")
        ],
    }
