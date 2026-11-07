"""Which cloud model answers: a user's own choice for their chat, the server's for live insights.

    resolve(user_id)        that user's chat: the provider they chose (tbl_UserModel) with their own key
    resolve(None)           live insights: CLOUD_PROVIDER / CLOUD_API_KEY / CLOUD_MODEL from the environment
    select(user_id, pid)    a user picks one of their providers

There is no fallback between the two: a user without a key of their own can't
chat on the server's key, and insights never use a user's key.
Both resolve() results say what's missing when nothing can answer. Never raises.
"""

from __future__ import annotations

from typing import Any

from . import cloud, repo


def select(user_id: int, provider: str) -> None:
    """Raises ValueError for an unknown provider."""
    if provider not in cloud.PROVIDERS:
        raise ValueError(f"unknown provider {provider!r}")
    repo.set_user_model(user_id, provider)


def resolve(user_id: int | None) -> dict[str, Any]:
    """`{provider, label, tag, resolved, reason}`, where `tag` is the provider's model id."""
    pid = cloud.env_provider() if user_id is None else repo.user_model(user_id)
    if pid not in cloud.PROVIDERS:
        reason = ("Live insights need the server's key: set CLOUD_PROVIDER, CLOUD_API_KEY and CLOUD_MODEL."
                  if user_id is None else "Add your own API key on the AI model page, then press Use.")
        return {"provider": None, "label": None, "tag": None, "resolved": False, "reason": reason}
    cfg = cloud.get(user_id, pid)
    label = cloud.PROVIDERS[pid][0]
    out = {"provider": pid, "label": label, "tag": cfg["model"] or None}
    if cfg["api_key"] and cfg["model"] and cfg["base_url"]:
        return {**out, "resolved": True, "reason": f"Answering from {label}."}
    missing = " and ".join(w for w, ok in (("an API key", cfg["api_key"]), ("a model", cfg["model"])) if not ok)
    where = "CLOUD_API_KEY / CLOUD_MODEL on the server" if user_id is None else "it on the AI model page"
    return {**out, "resolved": False, "reason": f"{label} needs {missing or 'a base URL'}. Set {where}."}
