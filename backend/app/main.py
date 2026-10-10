"""Closed Loop backend — the live pipeline, the model picker's and the Advisor's API.

Scoped-down sibling of Daedalus's `app/main.py`: one process serves the API,
and in the built container it serves the Vite bundle too (same origin, no
CORS, no separate web server). In development the static directory doesn't
exist, Vite owns the UI, and its dev-server proxy forwards `/api` here.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .api import chat, cloud, dashboard, hardware, health, insights, models, replay, settings, stream, work_orders
from .services import db, events, ingest, monitor, paths
from .services import insights as insight_service
from .services import replay as replay_service

log = logging.getLogger(__name__)

paths.ensure_dirs()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    db.init_db()  # create the shared data layer on first start; a no-op afterwards
    events.bind(asyncio.get_running_loop())

    # The live replay. If the dataset can't load, the rest of the API still runs
    # and /api/replay answers 503 with the reason.
    app.state.replay = None
    app.state.dataset_error = None
    tasks: list[asyncio.Task[None]] = []
    dataset: ingest.Dataset | None = None
    try:
        dataset = await asyncio.to_thread(ingest.load)
    except Exception as exc:  # noqa: BLE001 — any load failure is reported, not fatal
        app.state.dataset_error = f"{exc.__class__.__name__}: {exc}"
        log.warning("replay disabled — %s", app.state.dataset_error)
    else:
        app.state.replay = replay_service.Replay(dataset, start=replay_service.resume_point(dataset))
        tasks.append(asyncio.create_task(app.state.replay.run(), name="replay"))

    # The predictor scores each replayed cycle. Imported lazily: the ML libraries
    # are heavy, and without trained models the rest of the app still works.
    app.state.predictor = None
    app.state.predictor_error = None
    if dataset is not None:
        try:
            from .services import predictor as predictor_service  # noqa: PLC0415

            model = await asyncio.to_thread(predictor_service.Predictor)
        except Exception as exc:  # noqa: BLE001 — reported in /api/dashboard/overview, not fatal
            app.state.predictor_error = f"{exc.__class__.__name__}: {exc}"
            log.warning("predictions disabled — %s", app.state.predictor_error)
        else:
            app.state.predictor = model
            truth = {c: dataset.get(c).true_conditions for c in range(dataset.first, dataset.last + 1) if c in dataset}
            tasks.append(asyncio.create_task(predictor_service.run_worker(model, truth), name="predictor"))
            tasks.append(asyncio.create_task(monitor.run(), name="monitor"))
            tasks.append(asyncio.create_task(insight_service.run(), name="insights"))

    yield

    for task in tasks:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
    events.bind(None)


app = FastAPI(
    lifespan=lifespan,
    title="Closed Loop Backend",
    version="0.1.0",
    description="Local model picker + Advisor chat API for the Closed Loop dashboard.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type"],
)

app.include_router(health.router)
app.include_router(models.router)
app.include_router(hardware.router)
app.include_router(chat.router)
app.include_router(replay.router)
app.include_router(stream.router)
app.include_router(dashboard.router)
app.include_router(work_orders.router)
app.include_router(cloud.router)
app.include_router(insights.router)
app.include_router(settings.router)


_static_dir = Path(os.environ.get("CLOSED_LOOP_STATIC_DIR", "static"))

if _static_dir.is_dir():
    app.mount("/assets", StaticFiles(directory=_static_dir / "assets"), name="assets")

    _index = _static_dir / "index.html"

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str) -> FileResponse:
        """Serve a real file when there is one, else hand back index.html for the client router."""
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail=f"no such endpoint: /{full_path}")

        candidate = (_static_dir / full_path).resolve()
        if full_path and _static_dir.resolve() in candidate.parents and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_index)
