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

Whose key: the *driver's*, the user who last pressed a replay control
(api/replay.py calls drive()). Kept in memory only: after a restart the replay
is paused, so whoever presses Play next drives. There is no server key.
"Summarise now" (api/insights.py) runs on the clicker's own key instead.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from . import advisor, events, grounding, model_config, prompts, repo, settings, snapshot

log = logging.getLogger(__name__)


class NoData(RuntimeError):
    """Nothing has been scored yet, so there is nothing to talk about."""


_driver: dict[str, Any] | None = None  # {"id", "username"} of whoever last touched the replay controls


def drive(user: dict[str, Any]) -> None:
    global _driver
    _driver = {"id": user["id"], "username": user["username"]}


def status() -> dict[str, Any]:
    """Who pays for live insights now, and whether their model can answer: resolve() plus `driver`."""
    d = _driver
    if d is None:
        return {"driver": None, "provider": None, "label": None, "tag": None, "resolved": False,
                "reason": "Nobody is driving the replay yet. Whoever presses Play pays for live insights with their own key."}
    out = {"driver": d["username"], **model_config.resolve(d["id"])}
    if not out["resolved"]:
        out["reason"] = (f"{d['username']} is driving the replay and has no working API key. "
                         "Add yours on the AI model page, then press Play.")
    return out


def _driver_target() -> advisor.Target:
    d = _driver
    if d is not None:
        try:
            return advisor.choose(d["id"])
        except advisor.NoModel:
            pass
    raise advisor.NoModel(status()["reason"])


def generate(trigger_type: str, trigger_events: list[str] | None = None, *, user_id: int | None = None) -> dict[str, Any]:
    """Write, check, store and publish one insight, on `user_id`'s key or (None) the driver's.

    Raises advisor.NoModel / advisor.ReplyError / NoData.
    """
    target = advisor.choose(user_id) if user_id is not None else _driver_target()
    snap = snapshot.build(trigger_events)
    if snap["cycle"] is None:
        raise NoData("no cycle has been scored yet — start the replay")

    conf = settings.get()
    w = write(target, snap, check=conf["grounding"]["enabled"])
    text, first_ms, total_ms, attempts, check = w["text"], w["firstTokenMs"], w["totalMs"], w["attempts"], w["check"]

    insight_id = repo.insert_insight(
        trigger_type=trigger_type, trigger_ref="; ".join(trigger_events or []) or None,
        model=target.label, mode="cloud",
        prompt_version=prompts.INSIGHT_VERSION, snapshot=snap, text=text, cycle=snap["cycle"],
        grounded=None if check is None else check["grounded"], validation=check,
        attempts=attempts, latency_ms=total_ms, first_token_ms=first_ms,
    )
    insight = repo.insight(insight_id)
    assert insight is not None
    if not (check and not check["grounded"] and conf["grounding"]["hideUnverified"]):
        events.publish({"type": "insight", "insight": insight})
    return insight


def write(target: advisor.Target, snap: dict[str, Any], *, check: bool) -> dict[str, Any]:
    """Model → (grounding check → one retry with the mismatches). No storing, no events.

    The insight engine and the evaluation (eval/run.py) both call this, so the
    evaluation measures exactly what the app does. `firstCheck` is the verdict
    on the first attempt (None with the check off).
    """
    no_think = "qwen3" in target.label.lower()  # Qwen3 hosts (e.g. Groq) honour /no_think
    messages = prompts.insight_messages(snap, no_think=no_think)
    text, first_ms, total_ms = advisor.complete(target, messages)
    attempts, result, first_check = 1, None, None
    if check:
        result = first_check = grounding.validate(text, snap)
        if not result["grounded"]:
            messages += [{"role": "assistant", "content": text}, prompts.retry_message(result["mismatches"])]
            text, _, retry_ms = advisor.complete(target, messages)  # first token stays the first request's
            total_ms += retry_ms
            attempts, result = 2, grounding.validate(text, snap)
    return {"text": text, "firstTokenMs": first_ms, "totalMs": total_ms, "attempts": attempts,
            "check": result, "firstCheck": first_check}


class Engine:
    """Turns events into (coalesced) insight generations. One per server."""

    def __init__(self) -> None:
        self.pending: list[tuple[str, str]] = []  # (trigger type, one-line description)
        self.last_fp: dict[str, float] = {}       # component → last failure probability, for threshold crossings
        self.task: asyncio.Task[None] | None = None
        self.notice: str | None = None  # the last insight_notice sent; cleared by a success

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
            self.notice = None
        except advisor.NoModel as exc:
            self._notice(f"Insights paused: {exc}", needs_key=True)
        except (advisor.ReplyError, NoData) as exc:
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

    def _notice(self, text: str, *, needs_key: bool = False) -> None:
        """Once per distinct problem, so a new driver without a key is told too. `needsKey` adds the UI's link."""
        if text != self.notice:
            self.notice = text
            events.publish({"type": "insight_notice", "text": text, "needsKey": needs_key})


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
