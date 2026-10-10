"""The insight engine: the Advisor speaks first when the data changes.

Listens to `prediction` and `work_order` events. A trigger is:
- a component changing condition;
- a failure probability crossing `insights.threshold` (either way);
- a work order opening or closing.

At most one insight is generated at a time. Triggers that arrive meanwhile are
coalesced into the next one, which describes the state *then* — so at a fast
replay speed the model is never queued behind stale cycles, and slow local
models throttle the engine by themselves.
After each one the engine rests `insights.cooldownSeconds` (still collecting
triggers), so on a slow machine the model isn't busy every second and chat
answers don't queue behind insights.

Each insight: snapshot → model → grounding check → (one retry with the
mismatches) → saved to tbl_Insight → published as an `insight` event. If no
model can answer, one `insight_notice` says so, not one per event.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from . import advisor, events, grounding, prompts, repo, settings, snapshot

log = logging.getLogger(__name__)


class NoData(RuntimeError):
    """Nothing has been scored yet, so there is nothing to talk about."""


def generate(trigger_type: str, trigger_events: list[str] | None = None) -> dict[str, Any]:
    """Write, check, store and publish one insight. Raises advisor.NoModel / advisor.ReplyError / NoData."""
    target = advisor.choose()
    snap = snapshot.build(trigger_events)
    if snap["cycle"] is None:
        raise NoData("no cycle has been scored yet — start the replay")

    no_think = bool(target.local_tag and target.local_tag.lower().startswith("qwen3"))
    messages = prompts.insight_messages(snap, no_think=no_think)
    text, first_ms, total_ms = advisor.complete(target, messages)
    attempts, check = 1, None

    conf = settings.get()
    if conf["grounding"]["enabled"]:
        check = grounding.validate(text, snap)
        if not check["grounded"]:
            messages += [{"role": "assistant", "content": text}, prompts.retry_message(check["mismatches"])]
            text, first_ms, retry_ms = advisor.complete(target, messages)
            total_ms += retry_ms
            attempts, check = 2, grounding.validate(text, snap)

    insight_id = repo.insert_insight(
        trigger_type=trigger_type, trigger_ref="; ".join(trigger_events or []) or None,
        model=target.label, mode="cloud" if target.cloud_provider else "local",
        prompt_version=prompts.INSIGHT_VERSION, snapshot=snap, text=text, cycle=snap["cycle"],
        grounded=None if check is None else check["grounded"], validation=check,
        attempts=attempts, latency_ms=total_ms, first_token_ms=first_ms,
    )
    insight = repo.insight(insight_id)
    assert insight is not None
    if not (check and not check["grounded"] and conf["grounding"]["hideUnverified"]):
        events.publish({"type": "insight", "insight": insight})
    return insight


class Engine:
    """Turns events into (coalesced) insight generations. One per server."""

    def __init__(self) -> None:
        self.pending: list[tuple[str, str]] = []  # (trigger type, one-line description)
        self.last_fp: dict[str, float] = {}       # component → last failure probability, for threshold crossings
        self.task: asyncio.Task[None] | None = None
        self.paused_notice_sent = False

    def triggers(self, event: dict[str, Any]) -> list[tuple[str, str]]:
        """What in this event is worth an insight."""
        found: list[tuple[str, str]] = []
        if event.get("type") == "prediction":
            threshold = settings.get()["insights"]["threshold"]
            for p in event.get("predictions", []):
                comp, fp = p["component"], p["failureProbability"]
                prev = self.last_fp.get(comp)
                self.last_fp[comp] = fp
                if p.get("changedFrom"):
                    found.append(("condition_change",
                                  f"{comp} changed from {p['changedFrom']} to {p['condition']} at cycle {event['cycle']}"))
                elif prev is not None and (prev < threshold) != (fp < threshold):
                    direction = "rose above" if fp >= threshold else "fell below"
                    found.append(("threshold",
                                  f"{comp} failure probability {direction} {threshold * 100:.0f}% at cycle {event['cycle']}"))
        elif event.get("type") == "work_order":
            wo = event["workOrder"]
            found.append(("work_order", f"Work order {wo['id']} {event['action']} for {wo['component']}"))
        elif event.get("type") == "replay":
            self.last_fp.clear()  # play/pause/seek/reset: a seek would otherwise compare across a jump in time
        return found

    def on_event(self, event: dict[str, Any]) -> None:
        found = self.triggers(event)
        if found and settings.get()["insights"]["enabled"]:
            self.pending += found
            self._kick()

    def _kick(self) -> None:
        if not self.pending or self.task is not None:
            return
        batch, self.pending = self.pending, []
        kinds = {kind for kind, _ in batch}
        kind = kinds.pop() if len(kinds) == 1 else "multiple"
        self.task = asyncio.create_task(self._run(kind, [text for _, text in batch]))

    async def _run(self, kind: str, lines: list[str]) -> None:
        try:
            await asyncio.to_thread(generate, kind, lines)
            self.paused_notice_sent = False
        except (advisor.NoModel, advisor.ReplyError, NoData) as exc:
            self._notice(f"Insights paused: {exc}")
        except Exception as exc:  # noqa: BLE001 — a bad generation must not stop the engine
            log.exception("insights: generation failed")
            self._notice(f"Insights paused: {exc.__class__.__name__}: {exc}")
        finally:
            try:
                await asyncio.sleep(settings.get()["insights"]["cooldownSeconds"])
            finally:
                self.task = None
            self._kick()

    def _notice(self, text: str) -> None:
        if not self.paused_notice_sent:
            self.paused_notice_sent = True
            events.publish({"type": "insight_notice", "text": text})


async def run() -> None:
    """React to events for the life of the server."""
    engine = Engine()
    q = events.subscribe()
    try:
        while True:
            event = await q.get()
            try:
                engine.on_event(event)
            except Exception:  # noqa: BLE001
                log.exception("insights: failed on event %s", event.get("type"))
    finally:
        events.unsubscribe(q)
        if engine.task:
            engine.task.cancel()
