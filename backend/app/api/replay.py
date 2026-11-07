"""`/api/replay` — play the recorded cycles as a live feed, and control it.

    GET  /api/replay                     state: playing / paused / finished, cycle, speed
    POST /api/replay/play | pause | step | reset
    POST /api/replay/speed  {"secondsPerCycle": 2.0}
    POST /api/replay/seek   {"cycle": 1665}

Every control returns the new state, and also publishes it on /api/stream.
Whoever presses a control becomes the replay's driver: the live insights run
on their own API key from then on (services/insights.py).
503 if the dataset couldn't be loaded (the reason is in the message).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Request

from ..services import insights
from ..services.replay import DEFAULT_START, Replay, ReplayError
from .auth import current_user

router = APIRouter(prefix="/api/replay", tags=["replay"])


def _replay(request: Request) -> Replay:
    replay: Replay | None = getattr(request.app.state, "replay", None)
    if replay is None:
        reason = getattr(request.app.state, "dataset_error", None) or "the replay is not running"
        raise HTTPException(status_code=503, detail=f"replay unavailable: {reason}")
    return replay


def _control(request: Request, user: dict[str, Any] = Depends(current_user)) -> Replay:
    """The replay, for a control: its presser drives (pays for) the live insights from now on."""
    replay = _replay(request)
    insights.drive(user)
    return replay


def _bad(exc: ReplayError) -> HTTPException:
    return HTTPException(status_code=400, detail=str(exc))


@router.get("")
def get_state(request: Request) -> dict[str, Any]:
    return _replay(request).state()


@router.post("/play")
def play(replay: Replay = Depends(_control)) -> dict[str, Any]:
    try:
        replay.play()
    except ReplayError as exc:
        raise _bad(exc) from exc
    return replay.state()


@router.post("/pause")
def pause(replay: Replay = Depends(_control)) -> dict[str, Any]:
    replay.pause()
    return replay.state()


@router.post("/step")
async def step(replay: Replay = Depends(_control)) -> dict[str, Any]:
    if await replay.step() is None:
        raise HTTPException(status_code=400, detail="the replay has finished — seek back or reset")
    return replay.state()


@router.post("/reset")
async def reset(replay: Replay = Depends(_control), cycle: int = Body(default=DEFAULT_START, embed=True)) -> dict[str, Any]:
    try:
        await replay.reset(cycle)
    except ReplayError as exc:
        raise _bad(exc) from exc
    return replay.state()


@router.post("/speed")
def speed(replay: Replay = Depends(_control), seconds_per_cycle: float = Body(..., embed=True, alias="secondsPerCycle")) -> dict[str, Any]:
    try:
        replay.set_speed(seconds_per_cycle)
    except ReplayError as exc:
        raise _bad(exc) from exc
    return replay.state()


@router.post("/seek")
async def seek(replay: Replay = Depends(_control), cycle: int = Body(..., embed=True)) -> dict[str, Any]:
    try:
        await replay.seek(cycle)
    except ReplayError as exc:
        raise _bad(exc) from exc
    return replay.state()
