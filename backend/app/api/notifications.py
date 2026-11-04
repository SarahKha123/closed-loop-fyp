"""`/api/notifications` — email on new work orders (services/notify.py).

    GET  /api/notifications       {configured, sender, recipients} — never the password
    POST /api/notifications/test  sends a test email → {"sent": true}; 400 with the reason if it can't
"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, HTTPException

from ..services import notify

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
def status() -> dict[str, Any]:
    return notify.status()


@router.post("/test")
async def test() -> dict[str, Any]:
    try:
        await asyncio.to_thread(notify.send_test)
    except notify.NotifyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"sent": True}
