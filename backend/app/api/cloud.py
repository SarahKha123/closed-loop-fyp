"""Cloud provider settings for the AI model page. Keys go in, never come out."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, HTTPException

from ..services import cloud

router = APIRouter(prefix="/api/cloud", tags=["cloud"])


@router.get("")
def list_providers() -> dict[str, Any]:
    return {"providers": cloud.public()}


@router.put("/{provider}")
def save_provider(
    provider: str,
    api_key: str | None = Body(default=None, embed=True, max_length=400),
    model: str | None = Body(default=None, embed=True, max_length=200),
    base_url: str | None = Body(default=None, embed=True, max_length=500),
) -> dict[str, Any]:
    try:
        cloud.save(provider, api_key=api_key, model=model, base_url=base_url)
    except cloud.CloudError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"providers": cloud.public()}


@router.delete("/{provider}")
def clear_provider(provider: str) -> dict[str, Any]:
    cloud.clear(provider)
    return {"providers": cloud.public()}


@router.post("/{provider}/test")
def test_provider(provider: str) -> dict[str, Any]:
    try:
        models = cloud.test(provider)
    except cloud.CloudError as exc:
        return {"ok": False, "detail": str(exc), "models": []}
    return {"ok": True, "detail": f"connected — {len(models)} models offered", "models": models}
