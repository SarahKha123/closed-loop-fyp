"""In-process publish/subscribe: how the parts of the live pipeline hear about each other.

The replay publishes `cycle` events; later milestones add `prediction`,
`work_order` and `insight`. Subscribers are the SSE stream to the browser
(api/stream.py) and the backend workers (predictor, monitor, insight engine).

Event shapes (also exactly what the browser receives) are documented in
docs/API.md under GET /api/stream.

Each subscriber gets its own bounded queue. A slow subscriber never blocks a
publisher: when its queue is full, its oldest event is dropped. `publish()`
is safe to call from worker threads (e.g. work run with `asyncio.to_thread`).
"""

from __future__ import annotations

import asyncio
import threading
from typing import Any

QUEUE_SIZE = 256

_subscribers: set[asyncio.Queue[dict[str, Any]]] = set()
_lock = threading.Lock()
_loop: asyncio.AbstractEventLoop | None = None


def bind(loop: asyncio.AbstractEventLoop | None) -> None:
    """Remember the server's event loop (None on shutdown), so publishes from other threads can be handed to it."""
    global _loop
    _loop = loop


def subscribe() -> asyncio.Queue[dict[str, Any]]:
    q: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=QUEUE_SIZE)
    with _lock:
        _subscribers.add(q)
    return q


def unsubscribe(q: asyncio.Queue[dict[str, Any]]) -> None:
    with _lock:
        _subscribers.discard(q)


def subscriber_count() -> int:
    with _lock:
        return len(_subscribers)


def _deliver(event: dict[str, Any]) -> None:
    with _lock:
        queues = list(_subscribers)
    for q in queues:
        if q.full():
            try:
                q.get_nowait()  # drop the oldest, keep the newest
            except asyncio.QueueEmpty:
                pass
        q.put_nowait(event)


def publish(event: dict[str, Any]) -> None:
    """Send an event to every subscriber. Never blocks."""
    loop = _loop
    try:
        running = asyncio.get_running_loop()
    except RuntimeError:
        running = None
    if loop is not None and not loop.is_closed() and running is not loop:
        loop.call_soon_threadsafe(_deliver, event)  # called from a worker thread
    else:
        _deliver(event)
