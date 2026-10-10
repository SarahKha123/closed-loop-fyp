"""`/api/settings` — the runtime toggles (services/settings.py).

    GET /api/settings   every setting, defaults filled in
    PUT /api/settings   a partial patch, e.g. {"insights": {"enabled": false}}; returns the result
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, HTTPException

from ..services import settings

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("")
def get_settings() -> dict[str, Any]:
    return settings.get()


@router.put("")
def put_settings(patch: dict[str, Any] = Body(...)) -> dict[str, Any]:
    try:
        return settings.update(patch)
    except settings.SettingsError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
