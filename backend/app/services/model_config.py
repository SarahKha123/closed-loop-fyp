"""Which cloud provider answers the Advisor: `config/model_config.json`.

The file only names a provider. Its key, model and base URL live in
`config/cloud.json` (gitignored), see `services/cloud`. On a deployed server
`CLOUD_PROVIDER` (with `CLOUD_API_KEY` / `CLOUD_MODEL`) overrides both files,
and the choice can't be changed from the Models page.

    read() / write()   the file itself
    resolve()          what will answer right now, and why. Never raises.
"""

from __future__ import annotations

import os
import threading
from datetime import datetime, timezone
from typing import Any

from . import cloud, jsonfile, paths

SCHEMA_VERSION = 2

_DEFAULT: dict[str, Any] = {
    "schema_version": SCHEMA_VERSION,
    "provider": None,
    "updated_at": None,
    "updated_by": None,
}

_write_lock = threading.Lock()


def read() -> dict[str, Any]:
    """The config as written, or as the environment overrides it. Missing or malformed reads as the default.

    Older files (schema 1) also carry `mode` / `pinned`; those keys are ignored, so a
    file left in local `auto` / `pinned` mode reads as "no provider chosen".
    """
    config = dict(_DEFAULT)
    config.update({k: v for k, v in (jsonfile.read(paths.MODEL_CONFIG) or {}).items() if k in _DEFAULT})
    if cloud.env_provider():
        config.update(provider=cloud.env_provider(), updated_by="env")
    if config["provider"] not in cloud.PROVIDERS:
        config["provider"] = None
    return config


def write(provider: str) -> dict[str, Any]:
    """Commit a choice, atomically. Raises ValueError on an unknown provider or when the environment sets it."""
    if cloud.env_provider():
        raise ValueError("the provider is set by the server's CLOUD_PROVIDER environment variable")
    if provider not in cloud.PROVIDERS:
        raise ValueError(f"unknown provider {provider!r}")
    config = {
        "schema_version": SCHEMA_VERSION,
        "provider": provider,
        "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "updated_by": "models-page",
    }
    with _write_lock:
        jsonfile.write_atomic(paths.MODEL_CONFIG, config)
    return config


def resolve() -> dict[str, Any]:
    """`{provider, label, tag, resolved, reason, managed}`, where `tag` is the provider's model id."""
    config = read()
    pid = config["provider"]
    entry = next((p for p in cloud.public() if p["id"] == pid), None)
    out = {"provider": pid, "label": entry["label"] if entry else None, "tag": entry["model"] or None if entry else None,
           "managed": config["updated_by"] == "env"}
    if entry is None:
        return {**out, "resolved": False, "reason": "No provider chosen yet. Add an API key on the AI model page."}
    if entry["ready"]:
        return {**out, "resolved": True, "reason": f"Answering from {entry['label']}."}
    missing = " and ".join(w for w, ok in (("an API key", entry["has_key"]), ("a model", entry["model"])) if not ok)
    return {**out, "resolved": False, "reason": f"{entry['label']} needs {missing or 'a base URL'}."}
