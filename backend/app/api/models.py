"""`/api/models` — local models (Ollama) and which model the Advisor uses.

    GET  /api/models             installed models (never 500s just because Ollama is down)
    GET  /api/models/active      what would answer right now, and why
    POST /api/models/select      set auto / pinned / cloud
    GET  /api/models/catalogue   suggested downloads, marked installed / fits
    POST /api/models/pull        download a model (SSE progress)
    POST /api/models/delete      remove a model
    GET  /api/models/runtime     is Ollama installed / running
    POST /api/models/runtime/install   install Ollama into config/ollama/ and start it (SSE progress)
    POST /api/models/runtime/start     start an installed Ollama
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

from fastapi import APIRouter, Body, HTTPException
from fastapi.responses import StreamingResponse

from ..services import catalogue, hardware, model_config, ollama_client, ollama_runtime
from .sse import sse_response

router = APIRouter(prefix="/api/models", tags=["models"])


def _installed() -> tuple[list[dict[str, Any]], str | None]:
    try:
        return ollama_client.list_models(), None
    except (ollama_client.OllamaUnavailable, ollama_client.OllamaError) as exc:
        return [], str(exc)


@router.get("")
def list_models() -> dict[str, Any]:
    models, error = _installed()
    return {"models": models, "error": error}


@router.get("/active")
def active_model() -> dict[str, Any]:
    return model_config.resolve_now()


@router.post("/select")
def select_model(
    mode: str = Body(..., embed=True),
    tag: str | None = Body(default=None, embed=True),
    provider: str | None = Body(default=None, embed=True),
) -> dict[str, Any]:
    try:
        model_config.write(mode=mode, tag=tag, provider=provider)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return model_config.resolve_now()


@router.get("/catalogue")
def model_catalogue() -> dict[str, Any]:
    models, error = _installed()
    ram_total = (hardware.snapshot().get("ram") or {}).get("total_bytes")
    return {
        "models": catalogue.local({m["name"] for m in models}, ram_total, model_config.SAFE_RAM_FRACTION),
        "error": error,
    }


@router.post("/pull")
def pull_model(tag: str = Body(..., embed=True, min_length=1, max_length=200)) -> StreamingResponse:
    """Frames are `{status, percent, done}`, or a final `{error}`."""

    def events() -> Iterator[dict[str, Any]]:
        try:
            yield from ollama_client.pull(tag.strip())
        except (ollama_client.OllamaError, ollama_client.OllamaUnavailable) as exc:
            yield {"error": str(exc)}

    return sse_response(events())


@router.post("/delete")
def delete_model(tag: str = Body(..., embed=True, min_length=1)) -> dict[str, Any]:
    try:
        ollama_client.delete(tag)
    except ollama_client.OllamaUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ollama_client.OllamaError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True}


@router.get("/runtime")
def runtime_status() -> dict[str, Any]:
    return ollama_runtime.status()


@router.post("/runtime/install")
def install_runtime() -> StreamingResponse:
    """Frames are `{status, percent, done}`, or a final `{error}` — the same shape as a pull."""

    def events() -> Iterator[dict[str, Any]]:
        try:
            yield from ollama_runtime.install()
        except ollama_runtime.RuntimeSetupError as exc:
            yield {"error": str(exc)}

    return sse_response(events())


@router.post("/runtime/start")
def start_runtime() -> dict[str, Any]:
    try:
        return ollama_runtime.start()
    except ollama_runtime.RuntimeSetupError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
