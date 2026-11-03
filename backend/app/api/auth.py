"""`/api/auth` — the demo login (services/auth.py).

    GET  /api/auth/me       {user} — null when nobody is logged in
    POST /api/auth/login    {username, password} → {user}, sets the session cookie; 401 if wrong
    POST /api/auth/logout   ends the session, clears the cookie
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Cookie, HTTPException, Response

from ..services import auth

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/me")
def me(session: str | None = Cookie(default=None, alias=auth.COOKIE)) -> dict[str, Any]:
    return {"user": auth.user_for(session)}


@router.post("/login")
def login(
    response: Response,
    username: str = Body(..., embed=True, max_length=100),
    password: str = Body(..., embed=True, max_length=200),
) -> dict[str, Any]:
    result = auth.login(username, password)
    if result is None:
        raise HTTPException(status_code=401, detail="Wrong username or password")
    token, user = result
    # HttpOnly: page scripts can't read it. Same origin in both start and dev (Vite proxies /api).
    response.set_cookie(auth.COOKIE, token, httponly=True, samesite="lax", max_age=60 * 60 * 24 * 30, path="/")
    return {"user": user}


@router.post("/logout")
def logout(response: Response, session: str | None = Cookie(default=None, alias=auth.COOKIE)) -> dict[str, Any]:
    auth.logout(session)
    response.delete_cookie(auth.COOKIE, path="/")
    return {"user": None}
