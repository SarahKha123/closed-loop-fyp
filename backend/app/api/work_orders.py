"""`/api/work-orders` — the maintenance queue.

    GET  /api/work-orders?status=Open|Closed
    POST /api/work-orders              {"component": "valve", "note": "…"}   raised by a user
    POST /api/work-orders/{id}/close   {"note": "…"}

Automatic work orders are raised by services/monitor.py, not through here.
"""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Body, HTTPException, Query

from ..services import repo, work_orders

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
def close(wo_id: str, note: str | None = Body(default=None, embed=True, max_length=500)) -> dict[str, Any]:
    try:
        return work_orders.close(wo_id, note)
    except work_orders.WorkOrderError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
