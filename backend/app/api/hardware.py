from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from ..services import hardware

router = APIRouter(prefix="/api/hardware", tags=["hardware"])


@router.get("")
def get_hardware() -> dict[str, Any]:
    return hardware.snapshot()
