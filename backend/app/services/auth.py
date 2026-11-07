"""Sign-in: users in tbl_User, sessions in tbl_Session, an audit row per event in tbl_AuthEvent.

Two ways in: a username + password, or Google (services/google_auth.py). Either
way the browser gets a random session token in an HttpOnly cookie, and the
database stores only its SHA-256, so a leaked database can't be replayed as
cookies. Sessions expire after SESSION_TTL_DAYS (default 7). Every signup,
login, failed login and logout is recorded with the client's IP and user agent.

Every API route except /api/auth and /api/health needs a signed-in session
(api/auth.py `current_user`). Failed sign-ins are rate-limited per IP
(MAX_FAILED_LOGINS in LOGIN_WINDOW).

Accounts (docs/ARCHITECTURE.md: Accounts): anyone may sign up, with a
password and an email or with Google. While the server has no active admin,
the next sign-up becomes one; everyone after waits as `pending` until an admin
approves them on the Admin page (api/admin.py). A pending user can sign in but
reaches nothing except /api/auth; a `disabled` one (rejected or switched off)
can't sign in at all. Roles: `admin` runs the place, `engineer` uses it.
There is no built-in account and no known password.

Passwords are stored as scrypt hashes (`scrypt$<salt hex>$<hash hex>`), never
in plain text.

From the command line (from backend/), e.g. when the only admin is locked out:

    .venv/bin/python -m app.services.auth add <username> <email> ["Display Name"]   an active engineer
    .venv/bin/python -m app.services.auth admin <username>                           make them an active admin
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

_SCRYPT = {"n": 2**14, "r": 8, "p": 1}

MAX_FAILED_LOGINS = 10
LOGIN_WINDOW = timedelta(minutes=15)


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


class AccountDisabled(AuthError):
    """Right password, but the account was rejected or switched off."""


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


def clean_email(email: str) -> str:
    """Trimmed; raises AuthError unless it looks like an address. Not verified: an admin's approval is the check."""
    email = email.strip()
    local, _, domain = email.partition("@")
    if not local or "." not in domain or " " in email:
        raise AuthError("Enter a valid email address")
    return email


def add_user(username: str, display_name: str, password: str, email: str,
             *, role: str | None = None, status: str | None = None) -> dict[str, Any]:
    """A new password account. Without role/status: the first admin if there is none, else pending."""
    username, display_name = username.strip(), display_name.strip() or username.strip()
    if not username or not password:
        raise AuthError("username and password are required")
    email = clean_email(email)
    try:
        return repo.insert_user(username, display_name, hash_password(password), email, role=role, status=status)
    except sqlite3.IntegrityError as exc:
        taken = "username" if repo.user_with_hash(username) else "email"
        raise AuthError(f"That {taken} is already taken") from exc


def login(username: str, password: str, client: repo.Client = (None, None)) -> tuple[str, dict[str, Any]] | None:
    """A new session token and the user, or None for a wrong username or password (audited either way).

    Raises TooManyAttempts after MAX_FAILED_LOGINS failures from this IP within LOGIN_WINDOW,
    AccountDisabled for a rejected or switched-off account (a pending one signs in, to see that it waits).
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
    if user["status"] == "disabled":
        repo.log_auth_event("login_failed", client, user_id=user["id"], email=user["email"] or user["username"],
                            reason="disabled")
        raise AccountDisabled("This account isn't active. Ask an administrator.")
    return _new_session(user, client, ("login",)), user


def register(username: str, display_name: str, password: str, email: str,
             client: repo.Client = (None, None)) -> tuple[str, dict[str, Any]]:
    """Sign up: a new account (pending, or the first admin), already signed in. Raises AuthError."""
    user = add_user(username, display_name, password, email)
    return _new_session(user, client, ("signup", "login")), user


def google_session(claims: dict[str, Any], client: repo.Client) -> tuple[str, dict[str, Any], bool]:
    """Sign in (or up) with a checked Google ID token's claims: (session token, user, created).

    Raises repo.AccountError ("exists" | "disabled").
    """
    token = random_token()
    user, created = repo.google_sign_in(
        claims["sub"], claims["email"], claims.get("name") or claims["email"].split("@")[0], claims.get("picture"),
        sha256(token), session_ttl(), client,
    )
    return token, user, created


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

    usage = ('usage: python -m app.services.auth add <username> <email> ["Display Name"]'
             ' | admin <username> | passwd <username>')
    if len(argv) < 2 or argv[0] not in ("add", "admin", "passwd") or (argv[0] == "add" and len(argv) < 3):
        print(usage)
        return 2
    db.init_db()
    if argv[0] == "admin":
        if not repo.make_admin(argv[1]):
            print(f"no user '{argv[1]}'")
            return 1
        print(f"{argv[1]} is now an active admin")
        return 0
    password = getpass.getpass(f"Password for {argv[1]}: ")
    if password != getpass.getpass("Again: "):
        print("passwords don't match")
        return 1
    try:
        if argv[0] == "add":
            user = add_user(argv[1], argv[3] if len(argv) > 3 else argv[1], password, argv[2],
                            role="engineer", status="active")
            print(f"added {user['username']} ({user['displayName']}), an active engineer")
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
