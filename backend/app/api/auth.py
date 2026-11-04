"""`/api/auth` — the demo login (services/auth.py).

    GET  /api/auth/me       {user} — null when nobody is logged in
    POST /api/auth/login    {username, password} → {user}, sets the session cookie; 401 if wrong
    POST /api/auth/register {username, displayName?, password} → {user}, signed in; 400 if the username is taken
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
    return _signed_in(response, *result)


@router.post("/register")
def register(
    response: Response,
    username: str = Body(..., embed=True, min_length=1, max_length=100),
    display_name: str = Body("", embed=True, alias="displayName", max_length=100),
    password: str = Body(..., embed=True, min_length=4, max_length=200),
) -> dict[str, Any]:
    try:
        return _signed_in(response, *auth.register(username, display_name, password))
    except auth.AuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _signed_in(response: Response, token: str, user: dict[str, Any]) -> dict[str, Any]:
    # HttpOnly: page scripts can't read it. Same origin in both start and dev (Vite proxies /api).
    response.set_cookie(auth.COOKIE, token, httponly=True, samesite="lax", max_age=60 * 60 * 24 * 30, path="/")
    return {"user": user}


@router.post("/logout")
def logout(response: Response, session: str | None = Cookie(default=None, alias=auth.COOKIE)) -> dict[str, Any]:
    auth.logout(session)
    response.delete_cookie(auth.COOKIE, path="/")
    return {"user": None}
