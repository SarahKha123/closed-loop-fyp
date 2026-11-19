from __future__ import annotations

import os

from fastapi import APIRouter

router = APIRouter(prefix="/api/health", tags=["health"])


@router.get("")
def health() -> dict[str, str]:
    # version: the commit the image was built from (backend/Dockerfile); the deploy waits until it shows up here
    return {"status": "ok", "version": os.environ.get("GIT_SHA", "dev")}
