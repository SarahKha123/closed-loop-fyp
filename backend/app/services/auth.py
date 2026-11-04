"""The demo login: users in tbl_User, sessions in tbl_Session, a session cookie.

Good enough to show who is signed in, not production-grade: no rate limiting,
no password rules, sessions don't expire (logging out ends one). Nothing in
the API requires a login yet — it identifies the person, it doesn't guard data.

Passwords are stored as scrypt hashes (`scrypt$<salt hex>$<hash hex>`), never
in plain text. On first start a demo account is created (DEMO_USERNAME /
DEMO_PASSWORD) so there is always someone to log in as.

Add or reset accounts from the command line (from backend/):

    .venv/bin/python -m app.services.auth add <username> "<Display Name>"
    .venv/bin/python -m app.services.auth passwd <username>
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import sqlite3
from typing import Any

from . import repo

COOKIE = "closed_loop_session"
DEMO_USERNAME = "demo"
DEMO_PASSWORD = "demo"
DEMO_NAME = "Demo Engineer"

_SCRYPT = {"n": 2**14, "r": 8, "p": 1}


class AuthError(ValueError):
    """A request the auth layer refuses (taken username, empty password, …)."""


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
    """Create the demo account if there are no users at all. Safe to call every start."""
    if repo.user_count() == 0:
        add_user(DEMO_USERNAME, DEMO_NAME, DEMO_PASSWORD)


def login(username: str, password: str) -> tuple[str, dict[str, Any]] | None:
    """A new session token and the user, or None for a wrong username or password."""
    found = repo.user_with_hash(username.strip())
    if found is None:
        # Hash anyway, so a wrong username takes as long as a wrong password.
        check_password(password, hash_password("x"))
        return None
    user, stored = found
    if not check_password(password, stored):
        return None
    return _new_session(user), user


def register(username: str, display_name: str, password: str) -> tuple[str, dict[str, Any]]:
    """Sign up: a new account, already signed in. Raises AuthError for a taken username."""
    user = add_user(username, display_name, password)
    return _new_session(user), user


def _new_session(user: dict[str, Any]) -> str:
    token = secrets.token_urlsafe(32)
    repo.insert_session(token, user["id"])
    return token


def user_for(token: str | None) -> dict[str, Any] | None:
    return repo.session_user(token) if token else None


def logout(token: str | None) -> None:
    if token:
        repo.delete_session(token)


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
