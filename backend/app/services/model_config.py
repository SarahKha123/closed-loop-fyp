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
"""

from __future__ import annotations

import json
import os
import tempfile
import threading
from datetime import datetime, timezone
from typing import Any

from . import cloud, paths

SCHEMA_VERSION = 1

_write_lock = threading.Lock()

_DEFAULT: dict[str, Any] = {
    "schema_version": SCHEMA_VERSION,
    "mode": "auto",
    "pinned": None,
    "provider": None,
    "updated_at": None,
    "updated_by": None,
}

# A model is "safe" to auto-select when it takes up no more than this fraction
# of total RAM — leaving room for the OS, the browser, and everything else
# running on the machine that also happens to be running this dashboard.
SAFE_RAM_FRACTION = 0.6

_MODES = {"auto", "pinned", "cloud"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def read() -> dict[str, Any]:
    """The config as written. Missing or malformed reads as the default — never raises."""
    try:
        with open(paths.MODEL_CONFIG, encoding="utf-8") as fh:
            data = json.load(fh)
        if not isinstance(data, dict):
            raise ValueError("not an object")
    except (OSError, ValueError):
        return dict(_DEFAULT)

    config = dict(_DEFAULT)
    config.update({k: v for k, v in data.items() if k in _DEFAULT})
    if config.get("mode") not in _MODES:
        config["mode"] = "auto"
    return config


def write(*, mode: str, tag: str | None = None, provider: str | None = None) -> dict[str, Any]:
    """Commit a choice, atomically. Returns the config as written."""
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
        "updated_at": _now(),
        "updated_by": "models-page",
    }

    with _write_lock:
        paths.ensure_dirs()
        fd, tmp_path = tempfile.mkstemp(dir=paths.CONFIG_DIR, prefix=".model_config-", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(config, fh, indent=2)
                fh.write("\n")
                fh.flush()
                os.fsync(fh.fileno())
            os.replace(tmp_path, paths.MODEL_CONFIG)
        except BaseException:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise

    return config


def resolve(installed: list[dict[str, Any]], hardware: dict[str, Any]) -> dict[str, Any]:
    """What to actually run right now, and why. Never raises."""
    config = read()
    mode = config["mode"]

    if mode == "cloud":
        pid = config.get("provider") or ""
        entry = next((p for p in cloud.public() if p["id"] == pid), None)
        ready = bool(entry and entry["ready"])
        return {
            "mode": "cloud",
            "tag": entry["model"] if entry and entry["model"] else None,
            "provider": pid,
            "resolved": ready,
            "reason": (
                f"cloud: {entry['label']}" if ready
                else f"cloud provider {pid or '(none)'} needs an API key and a model. Set them on the Models page."
            ),
            "config": config,
        }

    if mode == "pinned":
        tag = config.get("pinned")
        match = next((m for m in installed if m["name"] == tag), None)
        return {
            "mode": "pinned",
            "tag": tag,
            "resolved": match is not None,
            "reason": (
                f"pinned to {tag}"
                if match
                else f"pinned to {tag}, which is not installed. Pull it, or switch to auto."
            ),
            "config": config,
        }

    installed = [m for m in installed if not m.get("embedding")]
    if not installed:
        return {
            "mode": "auto",
            "tag": None,
            "resolved": False,
            "reason": "no models are installed. Run `ollama pull <model>` on the Ollama host.",
            "config": config,
        }

    ram_total = (hardware.get("ram") or {}).get("total_bytes")
    with_size = [m for m in installed if isinstance(m.get("size_bytes"), int)]

    if ram_total:
        budget = ram_total * SAFE_RAM_FRACTION
        safe = [m for m in with_size if m["size_bytes"] <= budget]
        if safe:
            best = max(safe, key=lambda m: m["size_bytes"])
            ram_gb = ram_total / (1024**3)
            return {
                "mode": "auto",
                "tag": best["name"],
                "resolved": True,
                "reason": f"largest installed model that fits comfortably in {ram_gb:.0f}GB RAM",
                "config": config,
            }
        if with_size:
            smallest = min(with_size, key=lambda m: m["size_bytes"])
            return {
                "mode": "auto",
                "tag": smallest["name"],
                "resolved": True,
                "reason": "smallest installed model — even that may be tight on this machine's RAM",
                "config": config,
            }

    # No RAM figure, or no model reported a size: fall back to whatever
    # Ollama listed first rather than refusing to answer.
    return {
        "mode": "auto",
        "tag": installed[0]["name"],
        "resolved": True,
        "reason": "first installed model (hardware or model size unavailable to compare)",
        "config": config,
    }
