"""What an admin sets on the Admin page instead of .env: the Gmail sender and Google sign-in.

    smtp.user              the Gmail address that sends (services/notify.py)
    smtp.password          its App Password            — encrypted
    google.client_id       the OAuth client (services/google_auth.py)
    google.client_secret   its secret                  — encrypted

Stored in tbl_ServerSetting. Secrets are Fernet-encrypted with the same server
secret as users' API keys (services/cloud.py) and never leave the server: the
page gets only their last four characters. Read fresh on every use, so a save
applies at once, without a restart.
"""

from __future__ import annotations

from typing import Any

from . import cloud, repo

_SECRET = {"smtp.password", "google.client_secret"}


def get(key: str) -> str:
    value = repo.server_settings().get(key) or ""
    return cloud.decrypt(value) if key in _SECRET else value


def _hint(secret: str) -> str | None:
    return f"…{secret[-4:]}" if len(secret) >= 8 else ("set" if secret else None)


def public() -> dict[str, Any]:
    """Safe to send to an admin's browser: no secret, only whether one is saved and its last four characters."""
    return {
        "email": {"sender": get("smtp.user") or None, "passwordHint": _hint(get("smtp.password"))},
        "google": {"clientId": get("google.client_id") or None, "secretHint": _hint(get("google.client_secret"))},
    }


def save(values: dict[str, str | None], actor: dict[str, Any], client: repo.Client, section: str) -> None:
    """Save the given keys. A secret given as None or "" is left as it was (the form sends one only to replace it)."""
    out: dict[str, str | None] = {}
    for key, value in values.items():
        value = (value or "").strip()
        if key in _SECRET:
            if value:
                out[key] = cloud.encrypt(value)
        else:
            out[key] = value or None
    repo.save_server_settings(out, actor, client, section)


def clear(keys: tuple[str, ...], actor: dict[str, Any], client: repo.Client, section: str) -> None:
    """Forget a whole section (e.g. the Gmail sender), secrets included."""
    repo.save_server_settings(dict.fromkeys(keys), actor, client, section)
