"""Local LLM model listing and selection — the model picker's backend.

`GET /api/models` never raises just because Ollama is down: the picker needs
to render a "no local models" state, not a 500. The listing and hardware calls
are what `model_config.resolve()` needs, which `active` and `select` reuse so
the three endpoints agree about what "auto" currently means.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, HTTPException

from ..services import hardware, model_config, ollama_client

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
) -> dict[str, Any]:
    try:
        model_config.write(mode=mode, tag=tag)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    models, error = _safe_list_models()
    resolved = model_config.resolve(models, hardware.snapshot())
    resolved["ollama_error"] = error
    return resolved
