"""Study mode (M11): the technical side of the within-subjects user study (Part C).

Two conditions — `dashboard_only` (no Advisor, insights off) and `dashboard_ai`
— and two parallel task sets, A and B, in `config/study_scenarios.json`. Each
task names a preset: the replay is reset to `from` and stepped to `to`, then
left paused, so every participant sees the same state, history included
(condition changes, work orders, and in the AI condition the insights about
them). The timer starts once the preset's last cycle is scored.

Every task starts from an emptied data layer, so the counts logged when it
ends (chat turns, insights shown) are what happened during that task.
`tbl_StudyLog` survives the reset; `GET /api/study/export` returns it as CSV.
"""

from __future__ import annotations

import asyncio
import csv
import io
import time
from typing import Any

from . import events, jsonfile, paths, repo, settings
from .replay import Replay, ReplayError

CONDITIONS = ("dashboard_only", "dashboard_ai")


class StudyError(ValueError):
    """A study request that can't be carried out (unknown task, a task already running, …)."""


def tasks() -> dict[str, list[dict[str, Any]]]:
    """Task set id → its tasks, from config/study_scenarios.json."""
    data = jsonfile.read(paths.CONFIG_DIR / "study_scenarios.json") or {}
    return data.get("taskSets", {})


def plan(participant: int) -> dict[str, Any]:
    """Counterbalancing: participant n gets one of the 4 orders of (condition, task set), in rotation."""
    if participant < 1:
        raise StudyError("participant number must be 1 or more")
    k = (participant - 1) % 4
    conditions = CONDITIONS if k < 2 else CONDITIONS[::-1]
    sets = ("A", "B") if k % 2 == 0 else ("B", "A")
    return {
        "participant": f"P{participant:02d}",
        "blocks": [{"condition": c, "taskSet": s} for c, s in zip(conditions, sets, strict=True)],
    }


def set_condition(condition: str) -> dict[str, Any]:
    """Switch the condition: the Advisor's visibility and the insight engine together."""
    if condition not in CONDITIONS:
        raise StudyError(f"condition must be one of {', '.join(CONDITIONS)}")
    out = settings.update({"study": {"condition": condition}, "insights": {"enabled": condition == "dashboard_ai"}})
    events.publish({"type": "settings", "settings": out})
    return out


async def start_task(replay: Replay, participant: str, condition: str, task_set: str, task_id: str) -> dict[str, Any]:
    if repo.active_study_task():
        raise StudyError("a task is still running — end it first")
    task = next((t for t in tasks().get(task_set, []) if t["id"] == task_id), None)
    if task is None:
        raise StudyError(f"no task {task_id!r} in set {task_set!r}")
    set_condition(condition)
    events.publish({"type": "study", "action": "task_loading"})  # the participant's screen clears its chat
    try:
        await replay.reset(task["from"])
        while (replay.current_cycle or 0) < task["to"]:
            if await replay.step() is None:
                break
    except ReplayError as exc:
        raise StudyError(f"task {task_id}: {exc}") from exc
    await _scored(task["to"])
    row = await asyncio.to_thread(repo.start_study_task, participant, condition, task_set, task_id)
    events.publish({"type": "study", "action": "task_started", "taskId": task_id})
    return row


async def _scored(cycle: int, timeout: float = 20.0) -> None:
    """Wait until the predictor has scored `cycle`, so the clock starts on a complete dashboard."""
    end = time.monotonic() + timeout
    while not await asyncio.to_thread(repo.predictions_for_cycle, cycle):
        if time.monotonic() > end:
            raise StudyError(f"cycle {cycle} was not scored in {timeout:.0f} s — is the predictor running?")
        await asyncio.sleep(0.1)


def end_task(answer: str, correct: bool | None) -> dict[str, Any]:
    active = repo.active_study_task()
    if active is None:
        raise StudyError("no task is running")
    row = repo.end_study_task(active["logId"], answer, None if correct is None else int(correct))
    events.publish({"type": "study", "action": "task_ended", "taskId": active["taskId"]})
    return row  # type: ignore[return-value]


def export_csv(participant: str | None = None) -> str:
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(repo.STUDY_FIELDS)
    for row in repo.study_log(participant):
        writer.writerow(row.values())
    return out.getvalue()
