"""`/api/work-orders` — the maintenance queue, and what technicians found when closing it.

    GET  /api/work-orders?status=Open|Closed
    POST /api/work-orders              {"component": "valve", "note": "…"}   raised by a user
    POST /api/work-orders/{id}/close   {"finding", "action", "matchedPrediction", "notes"?}
    GET  /api/work-orders/history      closed work orders with their outcomes (survives replay resets)
    GET  /api/work-orders/outcome-stats   how often technicians confirmed the model
    GET  /api/work-orders/outcomes.csv the outcome log as CSV

Automatic work orders are raised by services/monitor.py, not through here.
"""

from __future__ import annotations

import csv
import io
from typing import Any, Literal

from fastapi import APIRouter, Body, Cookie, HTTPException, Query
from fastapi.responses import Response

from ..services import auth, repo, work_orders

router = APIRouter(prefix="/api/work-orders", tags=["work-orders"])


@router.get("")
def list_work_orders(status: Literal["Open", "Closed"] | None = Query(None)) -> dict[str, Any]:
    return {"workOrders": repo.list_work_orders(status)}


@router.post("")
def create(
    component: str = Body(..., embed=True, max_length=40),
    note: str | None = Body(default=None, embed=True, max_length=500),
) -> dict[str, Any]:
    try:
        return work_orders.open_manual(component, note)
    except work_orders.WorkOrderError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{wo_id}/close")
def close(
    wo_id: str,
    finding: str = Body(..., embed=True, max_length=1000),
    action: Literal["repaired", "replaced", "no_action", "escalated"] = Body(..., embed=True),
    matched_prediction: Literal["yes", "no", "partially"] = Body(..., embed=True, alias="matchedPrediction"),
    notes: str | None = Body(default=None, embed=True, max_length=1000),
    session: str | None = Cookie(default=None, alias=auth.COOKIE),
) -> dict[str, Any]:
    user = auth.user_for(session)
    try:
        return work_orders.close(
            wo_id, finding=finding, action=action, matched_prediction=matched_prediction, notes=notes,
            closed_by=user["displayName"] if user else "anonymous",
        )
    except work_orders.WorkOrderError as exc:
        missing = "doesn't exist" in str(exc)
        raise HTTPException(status_code=404 if missing else 400, detail=str(exc)) from exc


@router.get("/history")
def history(limit: int = Query(200, ge=1, le=5000)) -> dict[str, Any]:
    return {"outcomes": repo.list_outcomes(limit)}


@router.get("/outcome-stats")
def outcome_stats() -> dict[str, Any]:
    return work_orders.outcome_stats()


CSV_COLUMNS = [
    "id", "workOrderId", "component", "workOrderCreatedBy", "priority", "openedAt", "closedAt", "closedBy",
    "predictionCycle", "predictedCondition", "failureProbability", "topDriver", "predictionSource",
    "finding", "action", "matchedPrediction", "notes", "studyMode",
]


@router.get("/outcomes.csv")
def export_outcomes() -> Response:
    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=CSV_COLUMNS)
    writer.writeheader()
    for o in reversed(repo.list_outcomes()):
        p = o["prediction"] or {}
        writer.writerow({
            **{k: o[k] for k in CSV_COLUMNS if k in o},
            "predictionCycle": p.get("cycle"), "predictedCondition": p.get("condition"),
            "failureProbability": p.get("failureProbability"), "topDriver": p.get("topDriver"),
            "predictionSource": p.get("source"), "studyMode": int(o["studyMode"]),
        })
    return Response(out.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="work-order-outcomes.csv"'})
