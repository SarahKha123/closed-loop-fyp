"""`/api/auth` — sign-in (services/auth.py, services/google_auth.py).

    GET  /api/auth/me              {user, googleSignIn} — user is null when nobody is signed in
    POST /api/auth/login           {username, password} → {user}, sets the session cookie; 401 if wrong
    POST /api/auth/register        {username, displayName?, password} → {user}, signed in; 400 if the username is taken
    POST /api/auth/logout          ends the session, clears the cookie
    GET  /api/auth/google          → 302 to Google (a real browser navigation, not fetch); 404 if not configured
    GET  /api/auth/google/callback → 302 to / signed in, or to /?authError=<cancelled|state|exchange|token|signup>

`current_user` is the dependency main.py puts on every other router: no valid
session cookie, no access (401).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Cookie, HTTPException, Request, Response
from fastapi.responses import RedirectResponse

from ..services import auth, google_auth, repo

router = APIRouter(prefix="/api/auth", tags=["auth"])


def current_user(session: str | None = Cookie(default=None, alias=auth.COOKIE)) -> dict[str, Any]:
    """The signed-in user, or 401. FastAPI caches it per request, so routes that also need the user pay nothing extra."""
    user = auth.user_for(session)
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in first")
    return user


def _client(request: Request) -> repo.Client:
    # Behind the Vite dev proxy, uvicorn takes the real IP from X-Forwarded-For (it trusts 127.0.0.1).
    return (request.client.host if request.client else None), (request.headers.get("user-agent") or "")[:500] or None


def _set_session(response: Response, token: str) -> None:
    # HttpOnly: page scripts can't read it. Same origin in both start and dev (Vite proxies /api).
    response.set_cookie(auth.COOKIE, token, httponly=True, secure=auth.cookie_secure(), samesite="lax",
                        max_age=int(auth.session_ttl().total_seconds()), path="/")


@router.get("/me")
def me(session: str | None = Cookie(default=None, alias=auth.COOKIE)) -> dict[str, Any]:
    return {"user": auth.user_for(session), "googleSignIn": google_auth.enabled(), "signupAllowed": auth.signup_allowed()}


@router.post("/login")
def login(
    request: Request,
    response: Response,
    username: str = Body(..., embed=True, max_length=100),
    password: str = Body(..., embed=True, max_length=200),
) -> dict[str, Any]:
    try:
        result = auth.login(username, password, _client(request))
    except auth.TooManyAttempts as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    if result is None:
        raise HTTPException(status_code=401, detail="Wrong username or password")
    token, user = result
    _set_session(response, token)
    return {"user": user}


@router.post("/register")
def register(
    request: Request,
    response: Response,
    username: str = Body(..., embed=True, min_length=1, max_length=100),
    display_name: str = Body("", embed=True, alias="displayName", max_length=100),
    password: str = Body(..., embed=True, min_length=4, max_length=200),
) -> dict[str, Any]:
    if not auth.signup_allowed():
        raise HTTPException(status_code=403, detail="Sign-up is closed. Ask the administrator for an account.")
    try:
        token, user = auth.register(username, display_name, password, _client(request))
    except auth.AuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _set_session(response, token)
    return {"user": user}


@router.post("/logout")
def logout(request: Request, response: Response,
           session: str | None = Cookie(default=None, alias=auth.COOKIE)) -> dict[str, Any]:
    auth.logout(session, _client(request))
    response.delete_cookie(auth.COOKIE, path="/")
    return {"user": None}


@router.get("/google")
def google_start(request: Request) -> RedirectResponse:
    if not google_auth.enabled():
        raise HTTPException(status_code=404, detail="Google sign-in isn't configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)")
    flow, url = google_auth.start(google_auth.redirect_uri(_origin(request)))
    res = RedirectResponse(url, status_code=302)
    res.set_cookie(google_auth.FLOW_COOKIE, flow, httponly=True, secure=auth.cookie_secure(), samesite="lax",
                   max_age=google_auth.FLOW_MAX_AGE, path=google_auth.FLOW_PATH)
    return res


@router.get("/google/callback")
def google_callback(request: Request) -> RedirectResponse:
    client = _client(request)
    try:
        claims = google_auth.finish(request.cookies.get(google_auth.FLOW_COOKIE), dict(request.query_params),
                                    google_auth.redirect_uri(_origin(request)))
        if not auth.signup_allowed() and not repo.google_user_exists(claims["sub"]):
            raise google_auth.GoogleSignInError("signup", claims.get("email"))  # no new accounts while sign-up is closed
        res = RedirectResponse("/", status_code=302)
        _set_session(res, auth.google_session(claims, client))  # cookie only after the transaction committed
    except google_auth.GoogleSignInError as exc:
        repo.log_auth_event("login_failed", client, email=exc.email, reason=exc.reason)
        res = RedirectResponse(f"/?authError={exc.reason}", status_code=302)
    res.delete_cookie(google_auth.FLOW_COOKIE, path=google_auth.FLOW_PATH)
    return res


def _origin(request: Request) -> str:
    return f"{request.url.scheme}://{request.url.netloc}"
