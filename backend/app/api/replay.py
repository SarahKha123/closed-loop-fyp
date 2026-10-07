"""`/api/replay` — play the recorded cycles as a live feed, and control it.

    GET  /api/replay                     state: playing / paused / finished, cycle, speed
    POST /api/replay/play | pause | step | reset
    POST /api/replay/speed  {"secondsPerCycle": 2.0}
    POST /api/replay/seek   {"cycle": 1665}

Every control returns the new state, and also publishes it on /api/stream.
503 if the dataset couldn't be loaded (the reason is in the message).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, HTTPException, Request

from ..services.replay import DEFAULT_START, Replay, ReplayError

router = APIRouter(prefix="/api/replay", tags=["replay"])


def _replay(request: Request) -> Replay:
    replay: Replay | None = getattr(request.app.state, "replay", None)
    if replay is None:
        reason = getattr(request.app.state, "dataset_error", None) or "the replay is not running"
        raise HTTPException(status_code=503, detail=f"replay unavailable: {reason}")
    return replay


def _bad(exc: ReplayError) -> HTTPException:
    return HTTPException(status_code=400, detail=str(exc))


@router.get("")
def get_state(request: Request) -> dict[str, Any]:
    return _replay(request).state()


@router.post("/play")
def play(request: Request) -> dict[str, Any]:
    replay = _replay(request)
    try:
        replay.play()
    except ReplayError as exc:
        raise _bad(exc) from exc
    return replay.state()


@router.post("/pause")
def pause(request: Request) -> dict[str, Any]:
    replay = _replay(request)
    replay.pause()
    return replay.state()


@router.post("/step")
async def step(request: Request) -> dict[str, Any]:
    replay = _replay(request)
    if await replay.step() is None:
        raise HTTPException(status_code=400, detail="the replay has finished — seek back or reset")
    return replay.state()


@router.post("/reset")
async def reset(request: Request, cycle: int = Body(default=DEFAULT_START, embed=True)) -> dict[str, Any]:
    replay = _replay(request)
    try:
        await replay.reset(cycle)
    except ReplayError as exc:
        raise _bad(exc) from exc
    return replay.state()


@router.post("/speed")
def speed(request: Request, seconds_per_cycle: float = Body(..., embed=True, alias="secondsPerCycle")) -> dict[str, Any]:
    replay = _replay(request)
    try:
        replay.set_speed(seconds_per_cycle)
    except ReplayError as exc:
        raise _bad(exc) from exc
    return replay.state()


@router.post("/seek")
async def seek(request: Request, cycle: int = Body(..., embed=True)) -> dict[str, Any]:
    replay = _replay(request)
    try:
        await replay.seek(cycle)
    except ReplayError as exc:
        raise _bad(exc) from exc
    return replay.state()
