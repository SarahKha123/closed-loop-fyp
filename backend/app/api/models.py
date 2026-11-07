"""`/api/models` — which cloud model answers, for the signed-in user and for live insights.

    GET  /api/models/active   the user's chat model, plus `insights`: who drives the replay and so pays for live insights
    POST /api/models/select   the user picks one of their providers ({"provider": "groq"})

Each user's keys and models are managed under `/api/cloud`.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException

from ..services import insights, model_config
from .auth import current_user

router = APIRouter(prefix="/api/models", tags=["models"])


def _active(user_id: int) -> dict[str, Any]:
    return {**model_config.resolve(user_id), "insights": insights.status()}


@router.get("/active")
def active_model(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return _active(user["id"])


@router.post("/select")
def select_model(provider: str = Body(..., embed=True), user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    try:
        model_config.select(user["id"], provider)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _active(user["id"])
