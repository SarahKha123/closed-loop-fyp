"""Server-sent events: the one response shape for anything streamed (chat, pulls)."""

from __future__ import annotations

import json
from collections.abc import Iterable
from typing import Any

from fastapi.responses import StreamingResponse


def sse_response(events: Iterable[dict[str, Any]]) -> StreamingResponse:
    """Each dict becomes one `data: {...}` frame. Closing the request stops the iterator."""
    return StreamingResponse(
        (f"data: {json.dumps(event)}\n\n" for event in events),
        media_type="text/event-stream",
        # no-buffering header: so a reverse proxy passes tokens through as they come
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
