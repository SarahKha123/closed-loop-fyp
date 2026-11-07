"""`/api/settings` — the runtime toggles (services/settings.py).

    GET /api/settings   every setting, defaults filled in
    PUT /api/settings   (admins) a partial patch, e.g. {"insights": {"enabled": false}}; returns the result,
                        and publishes it as a `settings` event (other open tabs follow, e.g. into study mode)
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException

from ..services import events, settings
from .auth import admin_user

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("")
def get_settings() -> dict[str, Any]:
    return settings.get()


@router.put("", dependencies=[Depends(admin_user)])  # everyone reads them; only an admin changes them
def put_settings(patch: dict[str, Any] = Body(...)) -> dict[str, Any]:
    try:
        out = settings.update(patch)
    except settings.SettingsError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    events.publish({"type": "settings", "settings": out})
    return out
