"""`/api/admin` — what only an admin may do: accounts, and a look at the email and Google sign-in setup.

    GET    /api/admin/users                    {users, pendingCount} — pending first
    POST   /api/admin/users/{id}/approve       pending → active   } {user, notice}: `notice` says when the
    POST   /api/admin/users/{id}/reject        pending → disabled } applicant couldn't be emailed
    POST   /api/admin/users/{id}/disable       active → disabled (signed out at once)
    POST   /api/admin/users/{id}/enable        disabled → active
    PUT    /api/admin/users/{id}/role          {"role": "admin" | "engineer"}
    GET    /api/admin/server                   {email: {sender, configured}, google: {configured, clientId, redirectUri}}
    POST   /api/admin/email/test               a test email to the signed-in admin's own address

Every route needs an active admin (main.py). 400 with the reason for a refused change, e.g. leaving
the server without an admin. Every change is audited in tbl_AuthEvent with the acting admin.
The Gmail sender and the Google client are static secrets in .env (SMTP_*, GOOGLE_CLIENT_*): this API
only says whether they're set, never their values beyond the sender address and the public client id.
"""

from __future__ import annotations

import asyncio
import os
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Request

from ..services import google_auth, insights, notify, repo
from .auth import accounts_changed, admin_user, client_info, request_origin

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/users")
def users() -> dict[str, Any]:
    return {"users": repo.users(), "pendingCount": repo.pending_count()}


@router.post("/users/{user_id}/{action}")
def change(user_id: int, action: str, request: Request, admin: dict[str, Any] = Depends(admin_user)) -> dict[str, Any]:
    if action not in ("approve", "reject", "disable", "enable"):
        raise HTTPException(status_code=404, detail=f"no action {action!r}")
    try:
        user = repo.change_account(user_id, admin, client_info(request), action=action)
    except repo.AccountError as exc:
        raise HTTPException(status_code=404 if exc.reason == "missing" else 400, detail=str(exc)) from exc
    if user["status"] == "disabled":
        insights.forget(user_id)  # a switched-off driver stops paying for insights
    notice = notify.decided(user, approved=action == "approve") if action in ("approve", "reject") else None
    accounts_changed()
    return {"user": user, "notice": notice}


@router.put("/users/{user_id}/role")
def role(user_id: int, request: Request, value: str = Body(..., embed=True, alias="role"),
         admin: dict[str, Any] = Depends(admin_user)) -> dict[str, Any]:
    try:
        return {"user": repo.change_account(user_id, admin, client_info(request), role=value)}
    except repo.AccountError as exc:
        raise HTTPException(status_code=404 if exc.reason == "missing" else 400, detail=str(exc)) from exc


@router.get("/server")
def server(request: Request) -> dict[str, Any]:
    sender = os.environ.get("SMTP_USER", "").strip()
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
    return {
        "email": {"sender": sender or None, "configured": notify.configured()},
        "google": {"configured": google_auth.enabled(), "clientId": client_id or None,
                   "redirectUri": google_auth.redirect_uri(request_origin(request))},
    }


@router.post("/email/test")
async def test_email(admin: dict[str, Any] = Depends(admin_user)) -> dict[str, Any]:
    if not admin["email"]:
        raise HTTPException(status_code=400, detail="Your account has no email address. Add one in your profile menu.")
    try:
        await asyncio.to_thread(notify.send_test, admin["email"])
    except notify.NotifyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"sent": True, "to": admin["email"]}
