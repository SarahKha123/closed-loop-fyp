"""Live replay: the recorded cycles arrive one at a time, as if from the rig.

A background asyncio task. While playing, every `seconds_per_cycle` it writes
the next cycle to `tbl_SensorReading` and publishes a `cycle` event; the
predictor (M4) and the browser (via /api/stream) react to that event. The
cycle number is the time axis everywhere — the dataset has no timestamps.

Controls: play, pause, step, set speed, seek, reset. Seeking *back* deletes
the readings (and, by cascade, the predictions) from that cycle on, so the
history never contains a future the replay has rewound past. Seeking forward
just skips ahead.

Default start is cycle 1,665: the first cycle where all four components are
Optimal (docs/DATASET.md §6). From cycle 1 the cooler starts out Critical.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from . import events, repo
from .ingest import Dataset

log = logging.getLogger(__name__)

DEFAULT_START = 1665
DEFAULT_SECONDS_PER_CYCLE = 2.0
MIN_SECONDS_PER_CYCLE = 0.05
MAX_SECONDS_PER_CYCLE = 60.0


class ReplayError(ValueError):
    """A control was given an invalid value (e.g. a cycle outside 1..2205)."""


class Replay:
    def __init__(self, dataset: Dataset, *, start: int = DEFAULT_START,
                 seconds_per_cycle: float = DEFAULT_SECONDS_PER_CYCLE) -> None:
        self.dataset = dataset
        # One past the end is allowed: a replay that already finished before a restart.
        self.next_cycle = start if start == dataset.last + 1 else self._check_cycle(start)
        self.seconds_per_cycle = self._check_speed(seconds_per_cycle)
        self.playing = False
        self._wake = asyncio.Event()  # set when anything changes, to cut a sleep short
        self._lock = asyncio.Lock()   # one emit / control at a time

    # ── state ────────────────────────────────────────────────────────────────

    @property
    def finished(self) -> bool:
        return self.next_cycle > self.dataset.last

    @property
    def current_cycle(self) -> int | None:
        """The last cycle written, or None before the first."""
        return repo.latest_cycle()

    def state(self) -> dict[str, Any]:
        return {
            "state": "finished" if self.finished else "playing" if self.playing else "paused",
            "cycle": self.current_cycle,
            "nextCycle": None if self.finished else self.next_cycle,
            "first": self.dataset.first,
            "total": self.dataset.total,
            "secondsPerCycle": self.seconds_per_cycle,
        }

    def _publish_state(self) -> None:
        events.publish({"type": "replay", **self.state()})

    # ── the loop ─────────────────────────────────────────────────────────────

    async def run(self) -> None:
        """Runs for the life of the server (started in main.py's lifespan)."""
        while True:
            if self.playing and not self.finished:
                try:
                    await self.step(publish_state=False)
                except Exception:  # noqa: BLE001 — a bad cycle must not kill the replay
                    log.exception("replay: failed to emit cycle %s; pausing", self.next_cycle)
                    self.playing = False
                    self._publish_state()
                    continue
                if self.finished:
                    self.playing = False
                    self._publish_state()
                    continue
                await self._sleep(self.seconds_per_cycle)
            else:
                await self._sleep(None)

    async def _sleep(self, seconds: float | None) -> None:
        """Wait `seconds` (or until woken by a control); None waits until woken."""
        self._wake.clear()
        try:
            await asyncio.wait_for(self._wake.wait(), timeout=seconds)
        except TimeoutError:
            pass

    # ── controls ─────────────────────────────────────────────────────────────

    async def step(self, *, publish_state: bool = True) -> int | None:
        """Write the next cycle and publish it. Returns the cycle, or None if the replay has finished."""
        async with self._lock:
            if self.finished:
                return None
            record = self.dataset.get(self.next_cycle)
            reading_id = await asyncio.to_thread(
                repo.insert_reading, record.cycle, record.features, record.sensor_means, record.stable,
            )
            events.publish({"type": "cycle", "cycle": record.cycle, "readingId": reading_id})
            self.next_cycle = self._following(record.cycle)
        if publish_state:
            self._publish_state()
        return record.cycle

    def play(self) -> None:
        if self.finished:
            raise ReplayError("the replay has finished — seek back or reset to play again")
        self.playing = True
        self._wake.set()
        self._publish_state()

    def pause(self) -> None:
        self.playing = False
        self._wake.set()
        self._publish_state()

    def set_speed(self, seconds_per_cycle: float) -> None:
        self.seconds_per_cycle = self._check_speed(seconds_per_cycle)
        self._wake.set()
        self._publish_state()

    async def seek(self, cycle: int) -> None:
        """Continue from `cycle`. Going back erases that cycle and everything after it."""
        cycle = self._check_cycle(cycle)
        async with self._lock:
            latest = repo.latest_cycle()
            if latest is not None and cycle <= latest:
                await asyncio.to_thread(repo.delete_from_cycle, cycle)
            self.next_cycle = cycle
        self._wake.set()
        self._publish_state()

    async def reset(self, start: int = DEFAULT_START) -> None:
        """Pause, empty the data layer (except equipment), and go back to `start`."""
        start = self._check_cycle(start)
        async with self._lock:
            self.playing = False
            await asyncio.to_thread(repo.reset)
            self.next_cycle = start
        self._wake.set()
        self._publish_state()

    # ── helpers ──────────────────────────────────────────────────────────────

    def _following(self, cycle: int) -> int:
        nxt = cycle + 1
        while nxt <= self.dataset.last and nxt not in self.dataset:
            nxt += 1
        return nxt

    def _check_cycle(self, cycle: int) -> int:
        if cycle not in self.dataset:
            raise ReplayError(f"cycle must be between {self.dataset.first} and {self.dataset.last}, not {cycle}")
        return cycle

    @staticmethod
    def _check_speed(seconds: float) -> float:
        if not MIN_SECONDS_PER_CYCLE <= seconds <= MAX_SECONDS_PER_CYCLE:
            raise ReplayError(
                f"seconds per cycle must be between {MIN_SECONDS_PER_CYCLE} and {MAX_SECONDS_PER_CYCLE}, not {seconds}"
            )
        return float(seconds)


def resume_point(dataset: Dataset) -> int:
    """Where to continue after a restart: just after the last stored cycle, or the default start."""
    latest = repo.latest_cycle()
    return DEFAULT_START if latest is None else min(latest + 1, dataset.last + 1)
