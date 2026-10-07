from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from ..services import hardware, model_config, ollama_client

router = APIRouter(prefix="/api/hardware", tags=["hardware"])


@router.get("")
def get_hardware() -> dict[str, Any]:
    """Everything the Hardware tab shows, plus the RAM budget `auto` picks against."""
    snap = hardware.snapshot(detailed=True)
    try:
        version = ollama_client.version()
    except ollama_client.OllamaUnavailable:
        version = None
    snap["ollama"] = {"reachable": version is not None, "version": version}
    snap["safe_ram_fraction"] = model_config.SAFE_RAM_FRACTION
    return snap
