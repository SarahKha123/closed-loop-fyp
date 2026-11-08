"""`/api/auth` — sign-in (services/auth.py, services/google_auth.py).

    GET   /api/auth/me              {user, googleSignIn, emailSetUp} — user is null when nobody is signed in;
                                    user.status pending → the dashboard shows "Waiting for approval"
    PATCH /api/auth/me              {email?, notifyWorkOrders?} → {user}: your own settings (active accounts)
    POST  /api/auth/login           {username, password} → {user}, sets the session cookie; 401 wrong, 403 disabled
    POST  /api/auth/register        {username, email, displayName?, password} → {user}, signed in (pending, or the
                                    first admin); 400 if the username or email is taken
    POST  /api/auth/logout          ends the session, clears the cookie
    GET   /api/auth/google          → 302 to Google (a real browser navigation, not fetch); 404 if not configured
    GET   /api/auth/google/callback → 302 to / signed in, or to /?authError=<cancelled|state|exchange|token|exists|disabled>

Dependencies the other routers use (main.py):
    current_user   an *active* account: 401 without a session, 403 while pending
    admin_user     an active admin: 403 for engineers
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Cookie, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse

from ..services import auth, events, google_auth, notify, repo

router = APIRouter(prefix="/api/auth", tags=["auth"])


def current_user(session: str | None = Cookie(default=None, alias=auth.COOKIE)) -> dict[str, Any]:
    """The signed-in, active user: 401 without a session, 403 while waiting for approval.

    FastAPI caches it per request, so routes that also need the user pay nothing extra. A disabled
    account has no sessions (switching it off deletes them), so it never gets this far.
    """
    user = auth.user_for(session)
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in first")
    if user["status"] != "active":
        raise HTTPException(status_code=403, detail="Your account is waiting for an administrator's approval")
    return user


def admin_user(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    """An active admin, or 403. The UI hides admin pages too, but this is the guard."""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only an admin can do that")
    return user


def client_info(request: Request) -> repo.Client:
    # Behind the Vite dev proxy, uvicorn takes the real IP from X-Forwarded-For (it trusts 127.0.0.1).
    return (request.client.host if request.client else None), (request.headers.get("user-agent") or "")[:500] or None


def _set_session(response: Response, token: str) -> None:
    # HttpOnly: page scripts can't read it. Same origin in both start and dev (Vite proxies /api).
    response.set_cookie(auth.COOKIE, token, httponly=True, secure=auth.cookie_secure(), samesite="lax",
                        max_age=int(auth.session_ttl().total_seconds()), path="/")


@router.get("/me")
def me(session: str | None = Cookie(default=None, alias=auth.COOKIE)) -> dict[str, Any]:
    return {"user": auth.user_for(session), "googleSignIn": google_auth.enabled(), "emailSetUp": notify.configured()}


@router.patch("/me")
def update_me(
    email: str | None = Body(None, embed=True, max_length=200),
    notify_work_orders: bool | None = Body(None, embed=True, alias="notifyWorkOrders"),
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    try:
        return {"user": repo.update_profile(user["id"], email=email and auth.clean_email(email),
                                            notify_work_orders=notify_work_orders)}
    except auth.AuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except repo.db.IntegrityError as exc:
        raise HTTPException(status_code=400, detail="That email belongs to another account") from exc


@router.post("/login")
def login(
    request: Request,
    response: Response,
    username: str = Body(..., embed=True, max_length=100),
    password: str = Body(..., embed=True, max_length=200),
) -> dict[str, Any]:
    try:
        result = auth.login(username, password, client_info(request))
    except auth.TooManyAttempts as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except auth.AccountDisabled as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
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
    email: str = Body(..., embed=True, min_length=3, max_length=200),
    display_name: str = Body("", embed=True, alias="displayName", max_length=100),
    password: str = Body(..., embed=True, min_length=4, max_length=200),
) -> dict[str, Any]:
    try:
        token, user = auth.register(username, display_name, password, email, client_info(request))
    except auth.AuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _set_session(response, token)
    if user["status"] == "pending":
        notify.signed_up(user)
        accounts_changed()
    return {"user": user}


@router.post("/logout")
def logout(request: Request, response: Response,
           session: str | None = Cookie(default=None, alias=auth.COOKIE)) -> dict[str, Any]:
    auth.logout(session, client_info(request))
    response.delete_cookie(auth.COOKIE, path="/")
    return {"user": None}


@router.get("/google")
def google_start(request: Request) -> RedirectResponse:
    if not google_auth.enabled():
        raise HTTPException(status_code=404, detail="Google sign-in isn't set up (an admin adds it on the Admin page)")
    flow, url = google_auth.start(google_auth.redirect_uri(request_origin(request)))
    res = RedirectResponse(url, status_code=302)
    res.set_cookie(google_auth.FLOW_COOKIE, flow, httponly=True, secure=auth.cookie_secure(), samesite="lax",
                   max_age=google_auth.FLOW_MAX_AGE, path=google_auth.FLOW_PATH)
    return res


@router.get("/google/callback")
def google_callback(request: Request) -> RedirectResponse:
    client = client_info(request)
    try:
        claims = google_auth.finish(request.cookies.get(google_auth.FLOW_COOKIE), dict(request.query_params),
                                    google_auth.redirect_uri(request_origin(request)))
        try:
            token, user, created = auth.google_session(claims, client)
        except repo.AccountError as exc:
            raise google_auth.GoogleSignInError(exc.reason, claims.get("email")) from exc
        res = RedirectResponse("/", status_code=302)
        _set_session(res, token)  # cookie only after the transaction committed
        if created and user["status"] == "pending":
            notify.signed_up(user)
            accounts_changed()
    except google_auth.GoogleSignInError as exc:
        repo.log_auth_event("login_failed", client, email=exc.email, reason=exc.reason)
        res = RedirectResponse(f"/?authError={exc.reason}", status_code=302)
    res.delete_cookie(google_auth.FLOW_COOKIE, path=google_auth.FLOW_PATH)
    return res


def accounts_changed() -> None:
    """Tell open dashboards the pending count changed (the admin's sidebar badge)."""
    events.publish({"type": "accounts", "pending": repo.pending_count()})


def request_origin(request: Request) -> str:
    return f"{request.url.scheme}://{request.url.netloc}"
