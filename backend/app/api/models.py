"""`/api/models` — which cloud provider the Advisor answers from.

    GET  /api/models/active   what would answer right now, and why
    POST /api/models/select   choose a provider ({"provider": "groq"})

Provider keys and models are managed under `/api/cloud`.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, HTTPException

from ..services import model_config

router = APIRouter(prefix="/api/models", tags=["models"])


@router.get("/active")
def active_model() -> dict[str, Any]:
    return model_config.resolve()


@router.post("/select")
def select_model(provider: str = Body(..., embed=True)) -> dict[str, Any]:
    try:
        model_config.write(provider)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return model_config.resolve()
