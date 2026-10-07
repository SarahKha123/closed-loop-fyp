"""Local LLM model listing and selection — the model picker's backend.

`GET /api/models` never raises just because Ollama is down: the picker needs
to render a "no local models" state, not a 500. The listing and hardware calls
are what `model_config.resolve()` needs, which `active` and `select` reuse so
the endpoints agree about what "auto" currently means. `catalogue`, `pull` and
`delete` back the Models page's local tab.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any

from fastapi import APIRouter, Body, HTTPException
from fastapi.responses import StreamingResponse

from ..services import catalogue, hardware, model_config, ollama_client

router = APIRouter(prefix="/api/models", tags=["models"])


def _safe_list_models() -> tuple[list[dict[str, Any]], str | None]:
    try:
        return ollama_client.list_models(), None
    except ollama_client.OllamaUnavailable as exc:
        return [], str(exc)
    except ollama_client.OllamaError as exc:
        return [], str(exc)


@router.get("")
def list_models() -> dict[str, Any]:
    models, error = _safe_list_models()
    return {"models": models, "error": error}


@router.get("/active")
def active_model() -> dict[str, Any]:
    """Which model would answer right now, and why — resolved fresh each call."""
    models, error = _safe_list_models()
    resolved = model_config.resolve(models, hardware.snapshot())
    resolved["ollama_error"] = error
    return resolved


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

    models, error = _safe_list_models()
    resolved = model_config.resolve(models, hardware.snapshot())
    resolved["ollama_error"] = error
    return resolved


@router.get("/catalogue")
def model_catalogue() -> dict[str, Any]:
    """Suggested local models, marked installed / fits-this-machine."""
    models, error = _safe_list_models()
    hw = hardware.snapshot()
    ram_total = (hw.get("ram") or {}).get("total_bytes")
    return {
        "models": catalogue.local({m["name"] for m in models}, ram_total, model_config.SAFE_RAM_FRACTION),
        "hardware": hw,
        "error": error,
    }


@router.post("/pull")
def pull_model(tag: str = Body(..., embed=True, min_length=1, max_length=200)) -> StreamingResponse:
    """Download a model, streamed as SSE progress frames. Closing the request stops the read."""

    def events() -> Iterator[str]:
        try:
            for event in ollama_client.pull(tag.strip()):
                yield f"data: {json.dumps(event)}\n\n"
        except (ollama_client.OllamaError, ollama_client.OllamaUnavailable) as exc:
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/delete")
def delete_model(tag: str = Body(..., embed=True, min_length=1)) -> dict[str, Any]:
    try:
        ollama_client.delete(tag)
    except ollama_client.OllamaUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ollama_client.OllamaError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True}
