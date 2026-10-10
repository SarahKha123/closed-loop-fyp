"""The monitor: turns predictions into actions with no human in the loop.

Replaces FYP1's FL_MonitorRisk (which polled every 15 minutes): it reacts to
every `prediction` event as it happens.

Rules (per component):
- Critical for `monitor.confirmCycles` consecutive cycles, and no open work order
  → open one (CreatedBy = system:monitor, linked to the triggering prediction).
- Back to Optimal while an automatic work order is open, and
  `monitor.autoCloseOnRecovery` → close it with the note "condition recovered".
  Manual (user) work orders are never closed automatically.

Both rules are runtime settings (services/settings.py).
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from . import events, repo, settings, work_orders

log = logging.getLogger(__name__)


def handle(event: dict[str, Any]) -> list[dict[str, Any]]:
    """Apply the rules to one `prediction` event. Returns the work orders opened or closed."""
    changed: list[dict[str, Any]] = []
    rules = settings.get()["monitor"]
    confirm = rules["confirmCycles"]
    for p in event.get("predictions", []):
        equipment_id = p["equipmentId"]
        if p["condition"] == "Critical":
            if confirm > 1 and not _critical_streak(equipment_id, confirm):
                continue
            full = _with_details(p, event["cycle"])
            wo = work_orders.open_for_prediction(full)
            if wo:
                changed.append(wo)
        elif p["condition"] == "Optimal" and rules["autoCloseOnRecovery"]:
            for wo in repo.list_work_orders("Open"):
                if wo["equipmentId"] == equipment_id and wo["createdBy"] == work_orders.SYSTEM:
                    changed.append(work_orders.close(wo["id"], f"Condition recovered: Optimal at cycle {event['cycle']}"))
    return changed


def _with_details(p: dict[str, Any], cycle: int) -> dict[str, Any]:
    """The event carries a summary; add the SHAP drivers from the stored prediction for the note."""
    stored = next((x for x in repo.predictions_for_cycle(cycle) if x["predictionId"] == p["predictionId"]), None)
    return {**p, "cycle": cycle, "shap": stored["shap"] if stored else []}


def _critical_streak(equipment_id: str, n: int) -> bool:
    rows = repo.recent_conditions(equipment_id, n)
    return len(rows) == n and all(c == "Critical" for c in rows)


async def run() -> None:
    """React to predictions for the life of the server."""
    q = events.subscribe()
    try:
        while True:
            event = await q.get()
            if event.get("type") != "prediction":
                continue
            try:
                await asyncio.to_thread(handle, event)
            except Exception:  # noqa: BLE001 — one bad event must not stop the monitor
                log.exception("monitor: failed on cycle %s", event.get("cycle"))
    finally:
        events.unsubscribe(q)
