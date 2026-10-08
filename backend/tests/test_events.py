"""The in-process event bus."""

from __future__ import annotations

import asyncio
import threading

from app.services import events


def test_every_subscriber_gets_each_event():
    async def main():
        a, b = events.subscribe(), events.subscribe()
        try:
            events.publish({"type": "cycle", "cycle": 1})
            assert a.get_nowait() == b.get_nowait() == {"type": "cycle", "cycle": 1}
        finally:
            events.unsubscribe(a)
            events.unsubscribe(b)
        assert events.subscriber_count() == 0

    asyncio.run(main())


def test_full_queue_drops_oldest_not_newest(monkeypatch):
    monkeypatch.setattr(events, "QUEUE_SIZE", 3)

    async def main():
        q = events.subscribe()
        try:
            for i in range(5):
                events.publish({"n": i})
            assert [q.get_nowait()["n"] for _ in range(q.qsize())] == [2, 3, 4]
        finally:
            events.unsubscribe(q)

    asyncio.run(main())


def test_publish_from_a_worker_thread():
    async def main():
        events.bind(asyncio.get_running_loop())
        q = events.subscribe()
        try:
            t = threading.Thread(target=events.publish, args=({"from": "thread"},))
            t.start()
            t.join()
            assert await asyncio.wait_for(q.get(), timeout=1) == {"from": "thread"}
        finally:
            events.unsubscribe(q)
            events.bind(None)

    asyncio.run(main())
