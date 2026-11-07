"""Sign in with Google, built directly on OpenID Connect (authorization code flow + PKCE). No auth library.

The flow (docs/GOOGLE_AUTH_PORTABLE.md):

1. `start()`: a fresh `state` (CSRF), PKCE verifier and `nonce` (replay). The API keeps all three in a
   10-minute HttpOnly cookie scoped to /api/auth/google and sends the browser to Google.
2. Google sends the browser back to the callback with a one-time `code`.
3. `finish()`: checks the state, exchanges the code for an ID token server to server (with the client
   secret, which never reaches the browser), and checks the token's claims.

The ID token's signature isn't verified: it came straight from Google's token endpoint over TLS, which
OIDC Core §3.1.3.7 allows in place of it. Never accept an ID token from the browser with this code —
that would need a signature check against Google's JWKS.

Configured by GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (.env); without them `enabled()` is False and the
dashboard shows only the password form. APP_URL is the origin the browser uses (it builds the redirect URI,
which must match the Google Cloud console exactly); unset, it's taken from the request.
"""

from __future__ import annotations

import base64
import json
import logging
import os
import time
from typing import Any
from urllib.parse import urlencode

import httpx

from .auth import random_token, sha256

log = logging.getLogger(__name__)

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"  # noqa: S105 — a URL, not a secret
ISSUERS = ("accounts.google.com", "https://accounts.google.com")

FLOW_COOKIE = "google_flow"
FLOW_PATH = "/api/auth/google"
FLOW_MAX_AGE = 10 * 60


class GoogleSignInError(Exception):
    """A failed sign-in. `reason` is what the sign-in page shows: cancelled | state | exchange | token | signup."""

    def __init__(self, reason: str, email: str | None = None) -> None:
        super().__init__(reason)
        self.reason, self.email = reason, email


def _client_id() -> str:
    return os.environ.get("GOOGLE_CLIENT_ID", "").strip()


def _client_secret() -> str:
    return os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()


def enabled() -> bool:
    return bool(_client_id() and _client_secret())


def redirect_uri(request_origin: str) -> str:
    return (os.environ.get("APP_URL", "").strip() or request_origin).rstrip("/") + "/api/auth/google/callback"


def start(redirect: str) -> tuple[str, str]:
    """(flow cookie value, the Google URL to send the browser to)."""
    state, verifier, nonce = random_token(), random_token(), random_token()
    url = AUTH_URL + "?" + urlencode({
        "client_id": _client_id(),
        "redirect_uri": redirect,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "nonce": nonce,
        "code_challenge": sha256(verifier),
        "code_challenge_method": "S256",
        "prompt": "select_account",
    })
    return f"{state}.{verifier}.{nonce}", url


def finish(flow_cookie: str | None, query: dict[str, str], redirect: str) -> dict[str, Any]:
    """The checked ID-token claims for the callback's query string, or GoogleSignInError."""
    state, verifier, nonce = ((flow_cookie or "").split(".") + ["", "", ""])[:3]
    if query.get("error"):
        raise GoogleSignInError("cancelled")
    code = query.get("code")
    if not code or not state or query.get("state") != state:
        raise GoogleSignInError("state")

    try:
        res = httpx.post(TOKEN_URL, timeout=10, data={
            "code": code,
            "client_id": _client_id(),
            "client_secret": _client_secret(),
            "redirect_uri": redirect,
            "grant_type": "authorization_code",
            "code_verifier": verifier,
        })
        res.raise_for_status()
        id_token = res.json()["id_token"]
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        detail = exc.response.text[:300] if isinstance(exc, httpx.HTTPStatusError) else exc
        log.warning("google token exchange failed: %s", detail)  # wrong secret / redirect URI mismatch shows here
        raise GoogleSignInError("exchange") from exc

    claims = decode_claims(id_token)
    if not valid_claims(claims, nonce):
        raise GoogleSignInError("token", claims.get("email"))
    return claims


def decode_claims(id_token: str) -> dict[str, Any]:
    try:
        payload = id_token.split(".")[1]
        return dict(json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4))))
    except (IndexError, ValueError):
        return {}


def valid_claims(claims: dict[str, Any], nonce: str) -> bool:
    return (
        claims.get("iss") in ISSUERS
        and claims.get("aud") == _client_id()
        and isinstance(claims.get("exp"), (int, float)) and claims["exp"] > time.time()
        and bool(nonce) and claims.get("nonce") == nonce
        and claims.get("email_verified") is True
        and bool(claims.get("sub")) and bool(claims.get("email"))
    )
