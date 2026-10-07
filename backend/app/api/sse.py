"""Server-sent events: the one response shape for anything streamed (chat, pulls, the live stream)."""

from __future__ import annotations

import json
from collections.abc import AsyncIterable, AsyncIterator, Iterable
from typing import Any

from fastapi.responses import StreamingResponse

HEADERS = {
    "Cache-Control": "no-cache",
    # so a reverse proxy passes frames through as they come instead of buffering them
    "X-Accel-Buffering": "no",
}


def _frame(event: dict[str, Any] | None) -> str:
    # None is a keep-alive: an SSE comment line, ignored by clients, that stops
    # proxies and browsers from closing an idle connection.
    return ": ping\n\n" if event is None else f"data: {json.dumps(event)}\n\n"


def sse_response(events: Iterable[dict[str, Any] | None] | AsyncIterable[dict[str, Any] | None]) -> StreamingResponse:
    """Each dict becomes one `data: {...}` frame; `None` becomes a keep-alive comment.

    Accepts a plain or an async iterator. Closing the request stops it.
    """
    if isinstance(events, AsyncIterable):
        async def frames() -> AsyncIterator[str]:
            async for event in events:
                yield _frame(event)

        return StreamingResponse(frames(), media_type="text/event-stream", headers=HEADERS)
    return StreamingResponse((_frame(e) for e in events), media_type="text/event-stream", headers=HEADERS)
