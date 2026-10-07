"""Closed Loop backend — the model picker's and Advisor's API.

Scoped-down sibling of Daedalus's `app/main.py`: one process serves the API,
and in the built container it serves the Vite bundle too (same origin, no
CORS, no separate web server). In development the static directory doesn't
exist, Vite owns the UI, and its dev-server proxy forwards `/api` here.
"""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .api import chat, cloud, hardware, health, models
from .services import paths

paths.ensure_dirs()

app = FastAPI(
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
app.include_router(cloud.router)


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
