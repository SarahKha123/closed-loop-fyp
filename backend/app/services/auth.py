"""Sign-in: users in tbl_User, sessions in tbl_Session, an audit row per event in tbl_AuthEvent.

Two ways in: a username + password, or Google (services/google_auth.py). Either
way the browser gets a random session token in an HttpOnly cookie, and the
database stores only its SHA-256, so a leaked database can't be replayed as
cookies. Sessions expire after SESSION_TTL_DAYS (default 7). Every signup,
login, failed login and logout is recorded with the client's IP and user agent.

Every API route except /api/auth and /api/health needs a signed-in session
(api/auth.py `current_user`). Failed sign-ins are rate-limited per IP
(MAX_FAILED_LOGINS in LOGIN_WINDOW).

`ALLOW_SIGNUP` (default true) controls new accounts: set it to false on a
deployed server and both the sign-up form and first-time Google sign-ins are
refused; add people with the CLI below. Existing accounts still sign in.

Passwords are stored as scrypt hashes (`scrypt$<salt hex>$<hash hex>`), never
in plain text. While sign-up is open, the first start creates a demo account
(DEMO_USERNAME / DEMO_PASSWORD) so there is someone to log in as; with sign-up
closed it never exists, so a deployed server has no known password.

Add or reset accounts from the command line (from backend/):

    .venv/bin/python -m app.services.auth add <username> "<Display Name>"
    .venv/bin/python -m app.services.auth passwd <username>
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any

from . import repo

COOKIE = "closed_loop_session"
DEMO_USERNAME = "demo"
DEMO_PASSWORD = "demo"
DEMO_NAME = "Demo Engineer"

_SCRYPT = {"n": 2**14, "r": 8, "p": 1}

MAX_FAILED_LOGINS = 10
LOGIN_WINDOW = timedelta(minutes=15)


def signup_allowed() -> bool:
    """ALLOW_SIGNUP, default true. False on a deployed server: no new accounts except from the CLI."""
    return os.environ.get("ALLOW_SIGNUP", "true").strip().lower() not in ("0", "false", "no")


def session_ttl() -> timedelta:
    return timedelta(days=float(os.environ.get("SESSION_TTL_DAYS") or 7))


def cookie_secure() -> bool:
    """Set COOKIE_SECURE=true when served over HTTPS, so the cookie is never sent over plain http."""
    return os.environ.get("COOKIE_SECURE", "").strip().lower() in ("1", "true", "yes")


def random_token() -> str:
    return secrets.token_urlsafe(32)


def sha256(value: str) -> str:
    """base64url SHA-256 without padding: session token hashes, and the PKCE code challenge."""
    return base64.urlsafe_b64encode(hashlib.sha256(value.encode()).digest()).rstrip(b"=").decode()


class AuthError(ValueError):
    """A request the auth layer refuses (taken username, empty password, …)."""


class TooManyAttempts(AuthError):
    """Too many failed sign-ins from this IP; wait for the window to pass."""


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, **_SCRYPT)
    return f"scrypt${salt.hex()}${digest.hex()}"


def check_password(password: str, stored: str) -> bool:
    try:
        scheme, salt, digest = stored.split("$")
    except ValueError:
        return False
    if scheme != "scrypt":
        return False
    candidate = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), **_SCRYPT)
    return hmac.compare_digest(candidate, bytes.fromhex(digest))


def add_user(username: str, display_name: str, password: str) -> dict[str, Any]:
    username, display_name = username.strip(), display_name.strip() or username.strip()
    if not username or not password:
        raise AuthError("username and password are required")
    try:
        return repo.insert_user(username, display_name, hash_password(password))
    except sqlite3.IntegrityError as exc:
        raise AuthError(f"username '{username}' is taken") from exc


def ensure_demo_user() -> None:
    """Create the demo account if sign-up is open and there are no users at all. Safe to call every start."""
    if signup_allowed() and repo.user_count() == 0:
        add_user(DEMO_USERNAME, DEMO_NAME, DEMO_PASSWORD)


def login(username: str, password: str, client: repo.Client = (None, None)) -> tuple[str, dict[str, Any]] | None:
    """A new session token and the user, or None for a wrong username or password (audited either way).

    Raises TooManyAttempts after MAX_FAILED_LOGINS failures from this IP within LOGIN_WINDOW.
    """
    since = (datetime.now(timezone.utc) - LOGIN_WINDOW).isoformat(timespec="seconds")
    if repo.failed_logins_since(client[0], since) >= MAX_FAILED_LOGINS:
        raise TooManyAttempts(f"Too many failed sign-ins. Try again in {int(LOGIN_WINDOW.total_seconds() // 60)} minutes.")
    found = repo.user_with_hash(username.strip())
    if found is None:
        # Hash anyway, so a wrong username takes as long as a wrong password.
        check_password(password, hash_password("x"))
    if found is None or not check_password(password, found[1]):
        repo.log_auth_event("login_failed", client, email=username.strip()[:100], reason="password")
        return None
    user = found[0]
    return _new_session(user, client, ("login",)), user


def register(username: str, display_name: str, password: str,
             client: repo.Client = (None, None)) -> tuple[str, dict[str, Any]]:
    """Sign up: a new account, already signed in. Raises AuthError for a taken username."""
    user = add_user(username, display_name, password)
    return _new_session(user, client, ("signup", "login")), user


def google_session(claims: dict[str, Any], client: repo.Client) -> str:
    """Sign in (or up) with a checked Google ID token's claims; returns the new session token."""
    token = random_token()
    repo.google_sign_in(
        claims["sub"], claims["email"], claims.get("name") or claims["email"].split("@")[0], claims.get("picture"),
        sha256(token), session_ttl(), client,
    )
    return token


def _new_session(user: dict[str, Any], client: repo.Client, events: tuple[str, ...]) -> str:
    token = random_token()
    repo.start_session(user, sha256(token), session_ttl(), client, events)
    return token


def user_for(token: str | None) -> dict[str, Any] | None:
    return repo.session_user(sha256(token)) if token else None


def logout(token: str | None, client: repo.Client = (None, None)) -> None:
    if token:
        repo.end_session(sha256(token), client)


def _main(argv: list[str]) -> int:
    import getpass  # noqa: PLC0415 — CLI only

    from . import db  # noqa: PLC0415

    usage = 'usage: python -m app.services.auth add <username> ["Display Name"] | passwd <username>'
    if len(argv) < 2 or argv[0] not in ("add", "passwd"):
        print(usage)
        return 2
    db.init_db()
    password = getpass.getpass(f"Password for {argv[1]}: ")
    if password != getpass.getpass("Again: "):
        print("passwords don't match")
        return 1
    try:
        if argv[0] == "add":
            user = add_user(argv[1], argv[2] if len(argv) > 2 else argv[1], password)
            print(f"added {user['username']} ({user['displayName']})")
        elif repo.set_password(argv[1], hash_password(password)):
            print(f"password changed for {argv[1]}; their sessions were signed out")
        else:
            print(f"no user '{argv[1]}'")
            return 1
    except AuthError as exc:
        print(exc)
        return 1
    return 0


if __name__ == "__main__":
    import sys

    raise SystemExit(_main(sys.argv[1:]))
