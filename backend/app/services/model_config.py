"""Which cloud model a user answers on: their chat, and the live insights while they drive the replay.

    resolve(user_id)        the provider they chose (tbl_UserModel) with their own key
    select(user_id, pid)    a user picks one of their providers

There is no server key and no fallback: a user without a key of their own
gets no answers. resolve() says what's missing. Never raises.
"""

from __future__ import annotations

from typing import Any

from . import cloud, repo


def select(user_id: int, provider: str) -> None:
    """Raises ValueError for an unknown provider."""
    if provider not in cloud.PROVIDERS:
        raise ValueError(f"unknown provider {provider!r}")
    repo.set_user_model(user_id, provider)


def resolve(user_id: int) -> dict[str, Any]:
    """`{provider, label, tag, resolved, reason}`, where `tag` is the provider's model id."""
    pid = repo.user_model(user_id)
    if pid not in cloud.PROVIDERS:
        return {"provider": None, "label": None, "tag": None, "resolved": False,
                "reason": "Add your own API key on the AI model page, then press Use."}
    cfg = cloud.get(user_id, pid)
    label = cloud.PROVIDERS[pid][0]
    out = {"provider": pid, "label": label, "tag": cfg["model"] or None}
    if cfg["api_key"] and cfg["model"] and cfg["base_url"]:
        return {**out, "resolved": True, "reason": f"Answering from {label}."}
    missing = " and ".join(w for w, ok in (("an API key", cfg["api_key"]), ("a model", cfg["model"])) if not ok)
    return {**out, "resolved": False, "reason": f"{label} needs {missing or 'a base URL'}. Set it on the AI model page."}
