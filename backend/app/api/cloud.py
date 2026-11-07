"""The signed-in user's own cloud providers. Keys go in, never come out (only `key_hint`).

    GET    /api/cloud                     this user's providers
    PUT    /api/cloud/{provider}          save key / model / base URL (the key is stored encrypted)
    DELETE /api/cloud/{provider}          forget them
    POST   /api/cloud/{provider}/test     list the models the key can use
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException

from ..services import cloud
from .auth import current_user

router = APIRouter(prefix="/api/cloud", tags=["cloud"])


@router.get("")
def list_providers(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return {"providers": cloud.public(user["id"])}


@router.put("/{provider}")
def save_provider(
    provider: str,
    api_key: str | None = Body(default=None, embed=True, max_length=400),
    model: str | None = Body(default=None, embed=True, max_length=200),
    base_url: str | None = Body(default=None, embed=True, max_length=500),
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    try:
        cloud.save(user["id"], provider, api_key=api_key, model=model, base_url=base_url)
    except cloud.CloudError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"providers": cloud.public(user["id"])}


@router.delete("/{provider}")
def clear_provider(provider: str, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    try:
        cloud.clear(user["id"], provider)
    except cloud.CloudError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"providers": cloud.public(user["id"])}


@router.post("/{provider}/test")
def test_provider(provider: str, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    try:
        models = cloud.test(user["id"], provider)
    except cloud.CloudError as exc:
        return {"ok": False, "detail": str(exc), "models": []}
    return {"ok": True, "detail": f"connected — {len(models)} models offered", "models": models}
