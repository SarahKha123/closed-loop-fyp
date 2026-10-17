"""`/api/study` — study mode for the user study (services/study.py).

    GET  /api/study                     the study settings, the task sets, the running task (or null)
    GET  /api/study/plan/{n}            participant n's counterbalanced order of conditions and task sets
    POST /api/study/condition           {"condition": "dashboard_only" | "dashboard_ai"}
    POST /api/study/tasks/start         {"participant", "condition", "taskSet", "taskId"} → loads the preset, starts the clock
    POST /api/study/tasks/end           {"answer", "correct": true | false | null} → the finished log row
    GET  /api/study/log?participant=    logged tasks (all, or one participant's)
    GET  /api/study/export?participant= the same as CSV

Study mode itself is `study.enabled` in /api/settings.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, HTTPException, Request
from fastapi.responses import Response

from ..services import repo, settings, study
from .replay import _replay

router = APIRouter(prefix="/api/study", tags=["study"])


def _bad(exc: study.StudyError) -> HTTPException:
    return HTTPException(status_code=400, detail=str(exc))


@router.get("")
def get_study() -> dict[str, Any]:
    return {"settings": settings.get()["study"], "taskSets": study.tasks(), "active": repo.active_study_task()}


@router.get("/plan/{participant}")
def get_plan(participant: int) -> dict[str, Any]:
    try:
        return study.plan(participant)
    except study.StudyError as exc:
        raise _bad(exc) from exc


@router.post("/condition")
def condition(value: str = Body(..., embed=True, alias="condition")) -> dict[str, Any]:
    try:
        return study.set_condition(value)
    except study.StudyError as exc:
        raise _bad(exc) from exc


@router.post("/tasks/start")
async def start_task(
    request: Request,
    participant: str = Body(...),
    condition: str = Body(...),
    task_set: str = Body(..., alias="taskSet"),
    task_id: str = Body(..., alias="taskId"),
) -> dict[str, Any]:
    if not participant.strip():
        raise HTTPException(status_code=400, detail="participant is required")
    try:
        return await study.start_task(_replay(request), participant.strip(), condition, task_set, task_id)
    except study.StudyError as exc:
        raise _bad(exc) from exc


@router.post("/tasks/end")
def end_task(answer: str = Body("", embed=True), correct: bool | None = Body(None, embed=True)) -> dict[str, Any]:
    try:
        return study.end_task(answer, correct)
    except study.StudyError as exc:
        raise _bad(exc) from exc


@router.get("/log")
def log(participant: str | None = None) -> dict[str, Any]:
    return {"log": repo.study_log(participant)}


@router.get("/export")
def export(participant: str | None = None) -> Response:
    name = f"study-log{'-' + participant if participant else ''}.csv"
    return Response(study.export_csv(participant), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})
