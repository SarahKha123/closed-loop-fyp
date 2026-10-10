"""`/api/insights` — what the Advisor said on its own when the data changed.

    GET  /api/insights?limit=50   newest first (unverified ones left out when grounding.hideUnverified)
    GET  /api/insights/{id}       one insight with the snapshot it was written from
    POST /api/insights/generate   "summarise now": one insight about the current state, outside the triggers

New insights also arrive live as `insight` events on /api/stream.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query

from ..services import advisor, insights, repo, settings

router = APIRouter(prefix="/api/insights", tags=["insights"])


@router.get("")
def list_insights(limit: int = Query(50, ge=1, le=200)) -> dict[str, Any]:
    hide = settings.get()["grounding"]["hideUnverified"]
    return {"insights": repo.list_insights(limit, include_unverified=not hide)}


@router.get("/{insight_id}")
def get_insight(insight_id: int) -> dict[str, Any]:
    found = repo.insight(insight_id, snapshot=True)
    if found is None:
        raise HTTPException(status_code=404, detail=f"no insight {insight_id}")
    return found


@router.post("/generate")
def generate() -> dict[str, Any]:
    try:
        return insights.generate("manual", ["The engineer asked for a summary of the current state"])
    except advisor.NoModel as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except insights.NoData as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except advisor.ReplyError as exc:
        raise HTTPException(status_code=502, detail=f"the model failed: {exc}") from exc
