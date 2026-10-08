"""The live replay: stepping, playing, seeking, resetting, finishing."""

from __future__ import annotations

import asyncio

import pytest

from app.services import events, repo
from app.services.ingest import CycleRecord, Dataset
from app.services.replay import Replay, ReplayError, resume_point

OK = {c: "Optimal" for c in ("cooler", "valve", "pump", "accumulator")}


def dataset(n: int = 5) -> Dataset:
    return Dataset({
        c: CycleRecord(cycle=c, features={"PS1_mean": float(c)}, sensor_means={"PS1": float(c)},
                       stable=0, true_conditions=OK)
        for c in range(1, n + 1)
    })


def drain(q) -> list[dict]:
    out = []
    while not q.empty():
        out.append(q.get_nowait())
    return out


def test_step_writes_one_reading_and_publishes_it(fresh_db):
    async def main():
        r = Replay(dataset(), start=2)
        q = events.subscribe()
        try:
            assert await r.step() == 2
            got = drain(q)
            assert [e["type"] for e in got] == ["cycle", "replay"]
            assert got[0]["cycle"] == 2 and got[0]["readingId"] > 0
            assert repo.reading(2)["features"] == {"PS1_mean": 2.0}
            assert r.state()["cycle"] == 2 and r.state()["nextCycle"] == 3
        finally:
            events.unsubscribe(q)

    asyncio.run(main())


def test_seek_back_erases_the_future(fresh_db):
    async def main():
        r = Replay(dataset(), start=1)
        for _ in range(4):
            await r.step()
        await r.seek(2)
        assert repo.latest_cycle() == 1
        assert await r.step() == 2

    asyncio.run(main())


def test_seek_forward_skips(fresh_db):
    async def main():
        r = Replay(dataset(), start=1)
        await r.step()
        await r.seek(4)
        assert await r.step() == 4
        assert repo.reading(2) is None

    asyncio.run(main())


def test_finishes_at_the_end(fresh_db):
    async def main():
        r = Replay(dataset(3), start=3)
        assert await r.step() == 3
        assert r.finished and r.state()["state"] == "finished"
        assert await r.step() is None
        with pytest.raises(ReplayError):
            r.play()

    asyncio.run(main())


def test_play_runs_the_loop_until_paused(fresh_db):
    async def main():
        r = Replay(dataset(50), start=1, seconds_per_cycle=0.05)
        task = asyncio.create_task(r.run())
        r.play()
        await asyncio.sleep(0.3)
        r.pause()
        written = repo.latest_cycle()
        await asyncio.sleep(0.15)
        assert written is not None and written >= 3
        # A cycle already being written when pause arrives may still land; nothing after that.
        settled = repo.latest_cycle()
        assert settled - written <= 1
        await asyncio.sleep(0.15)
        assert repo.latest_cycle() == settled
        task.cancel()

    asyncio.run(main())


def test_play_stops_by_itself_when_finished(fresh_db):
    async def main():
        r = Replay(dataset(3), start=1, seconds_per_cycle=0.05)
        task = asyncio.create_task(r.run())
        r.play()
        await asyncio.sleep(0.4)
        assert r.finished and not r.playing and repo.latest_cycle() == 3
        task.cancel()

    asyncio.run(main())


def test_reset_empties_and_rewinds(fresh_db):
    async def main():
        r = Replay(dataset(), start=1)
        await r.step()
        await r.step()
        await r.reset(1)
        assert repo.latest_cycle() is None and r.next_cycle == 1 and not r.playing

    asyncio.run(main())


def test_invalid_controls(fresh_db):
    r = Replay(dataset(), start=1)
    with pytest.raises(ReplayError):
        r.set_speed(0)
    with pytest.raises(ReplayError):
        asyncio.run(r.seek(99))
    with pytest.raises(ReplayError):
        Replay(dataset(), start=0)


def test_resume_point(fresh_db):
    d = dataset(5)
    assert resume_point(d) == 1665  # empty DB → the default start (the real dataset's first all-Optimal cycle)
    repo.insert_reading(3, {}, {})
    assert resume_point(d) == 4
    repo.insert_reading(5, {}, {})
    assert resume_point(d) == 6 and Replay(d, start=6).finished  # finished before a restart
