"""The committed model choice — a scaled-down `config/model_config.json`.

Same idea as Daedalus's version (docs on `PROJECT.md` §8.1 there): the choice
is a **policy**, not just a name, so a config written on one machine still
means something on another.

| mode     | meaning                                                          |
|----------|-------------------------------------------------------------------|
| `pinned` | Run this exact model. Reported unresolved if it isn't installed.  |
| `auto`   | Run the biggest installed model that comfortably fits in RAM.     |
| `cloud`  | Answer from a cloud provider (`provider`), via `services/cloud`.  |

`auto`'s fit rule is a simple heuristic (model's on-disk size against total
RAM) rather than Daedalus's measured-architecture fit scorer — it ranks what
is installed, and needs no catalogue to make a reasonable default.

Two layers:
    read() / write()   the file itself (persistence)
    resolve(...)       pure policy: config + installed models + hardware → what runs
    resolve_now()      gathers the inputs (Ollama, hardware) and calls resolve();
                       what the API and the Advisor use
"""

from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import Any

from . import cloud, hardware, jsonfile, ollama_client, paths

SCHEMA_VERSION = 1

# A model is "safe" to auto-select when it takes up no more than this fraction
# of total RAM — leaving room for the OS, the browser, and everything else
# running on the machine that also happens to be running this dashboard.
SAFE_RAM_FRACTION = 0.6

_MODES = {"auto", "pinned", "cloud"}

_DEFAULT: dict[str, Any] = {
    "schema_version": SCHEMA_VERSION,
    "mode": "auto",
    "pinned": None,
    "provider": None,
    "updated_at": None,
    "updated_by": None,
}

_write_lock = threading.Lock()


# ── persistence ──────────────────────────────────────────────────────────────


def read() -> dict[str, Any]:
    """The config as written. Missing or malformed reads as the default — never raises."""
    config = dict(_DEFAULT)
    config.update({k: v for k, v in (jsonfile.read(paths.MODEL_CONFIG) or {}).items() if k in _DEFAULT})
    if config["mode"] not in _MODES:
        config["mode"] = "auto"
    return config


def write(*, mode: str, tag: str | None = None, provider: str | None = None) -> dict[str, Any]:
    """Commit a choice, atomically. Raises ValueError on an invalid one. Returns the config as written."""
    if mode not in _MODES:
        raise ValueError(f"mode must be one of {sorted(_MODES)}, not {mode!r}")
    if mode == "pinned" and not tag:
        raise ValueError("pinned mode needs a tag")
    if mode == "cloud" and provider not in cloud.PROVIDERS:
        raise ValueError(f"cloud mode needs a known provider, not {provider!r}")

    config = {
        "schema_version": SCHEMA_VERSION,
        "mode": mode,
        "pinned": tag if mode == "pinned" else None,
        "provider": provider if mode == "cloud" else None,
        "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "updated_by": "models-page",
    }
    with _write_lock:
        jsonfile.write_atomic(paths.MODEL_CONFIG, config)
    return config


# ── policy ───────────────────────────────────────────────────────────────────


def _result(config: dict[str, Any], tag: str | None, resolved: bool, reason: str) -> dict[str, Any]:
    return {
        "mode": config["mode"],
        "tag": tag,
        "provider": config.get("provider"),
        "resolved": resolved,
        "reason": reason,
        "config": config,
    }


def resolve(installed: list[dict[str, Any]], hw: dict[str, Any]) -> dict[str, Any]:
    """What to actually run right now, and why. Pure apart from reading the config; never raises."""
    config = read()

    if config["mode"] == "cloud":
        pid = config.get("provider") or ""
        entry = next((p for p in cloud.public() if p["id"] == pid), None)
        if entry and entry["ready"]:
            return _result(config, entry["model"], True, f"cloud: {entry['label']}")
        return _result(
            config,
            entry["model"] if entry and entry["model"] else None,
            False,
            f"cloud provider {pid or '(none)'} needs an API key and a model. Set them on the Models page.",
        )

    if config["mode"] == "pinned":
        tag = config.get("pinned")
        if any(m["name"] == tag for m in installed):
            return _result(config, tag, True, f"pinned to {tag}")
        return _result(config, tag, False, f"pinned to {tag}, which is not installed. Pull it, or switch to auto.")

    chat_models = [m for m in installed if not m.get("embedding")]
    if not chat_models:
        return _result(config, None, False, "no chat models are installed. Download one on the Models page.")

    ram_total = (hw.get("ram") or {}).get("total_bytes")
    with_size = [m for m in chat_models if isinstance(m.get("size_bytes"), int)]
    if ram_total and with_size:
        safe = [m for m in with_size if m["size_bytes"] <= ram_total * SAFE_RAM_FRACTION]
        if safe:
            best = max(safe, key=lambda m: m["size_bytes"])
            return _result(
                config, best["name"], True,
                f"largest installed model that fits comfortably in {ram_total / 1024**3:.0f}GB RAM",
            )
        smallest = min(with_size, key=lambda m: m["size_bytes"])
        return _result(
            config, smallest["name"], True, "smallest installed model — even that may be tight on this machine's RAM"
        )

    # No RAM figure, or no model reported a size: take the first rather than refuse to answer.
    return _result(config, chat_models[0]["name"], True, "first installed model (no size or RAM figure to compare)")


def resolve_now() -> dict[str, Any]:
    """`resolve()` with live inputs, plus `ollama_error` if Ollama could not be listed."""
    if read()["mode"] == "cloud":
        # Cloud doesn't depend on Ollama or the hardware; don't wait on either.
        return {**resolve([], {}), "ollama_error": None}
    try:
        installed, error = ollama_client.list_models(), None
    except (ollama_client.OllamaUnavailable, ollama_client.OllamaError) as exc:
        installed, error = [], str(exc)
    return {**resolve(installed, hardware.snapshot()), "ollama_error": error}
