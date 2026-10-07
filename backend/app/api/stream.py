"""`GET /api/stream` — every live event, pushed to the browser as server-sent events.

One connection per open dashboard. Event shapes are listed in docs/API.md.
The first frame is always the current replay state, so a client that has just
(re)connected knows where things stand without a separate request.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from ..services import events
from .sse import sse_response

router = APIRouter(prefix="/api/stream", tags=["stream"])

KEEPALIVE_SECONDS = 15.0


@router.get("")
async def stream(request: Request) -> StreamingResponse:
    queue = events.subscribe()
    replay = getattr(request.app.state, "replay", None)

    async def gen() -> AsyncIterator[dict[str, Any] | None]:
        try:
            if replay is not None:
                yield {"type": "replay", **replay.state()}
            while True:
                try:
                    yield await asyncio.wait_for(queue.get(), timeout=KEEPALIVE_SECONDS)
                except TimeoutError:
                    if await request.is_disconnected():
                        return
                    yield None  # keep-alive
        finally:
            events.unsubscribe(queue)

    return sse_response(gen())
