"""Runtime settings: defaults in code, overrides in `config/settings.json`.

The toggles flipped during evaluation and the study (insights on/off, the
grounding check on/off, the monitor's rules, the chat history cap) live here
instead of as constants, so changing one never needs a restart or a code edit.
`GET/PUT /api/settings` reads and patches them; the file holds only overrides.

Read on every use: the file is tiny, and a value changed through the API (or
by hand) applies to the very next event.
"""

from __future__ import annotations

import copy
from pathlib import Path
from typing import Any

from . import jsonfile, paths

DEFAULTS: dict[str, dict[str, Any]] = {
    "insights": {
        "enabled": True,
        "threshold": 0.5,          # a failure probability crossing this (either way) triggers an insight
        "cooldownSeconds": 10,     # rest after each insight (triggers meanwhile are merged), so a slow local model leaves room for chat
    },
    "grounding": {
        "enabled": True,           # off → insights are saved unchecked (Grounded = NULL), for the with/without comparison
        "hideUnverified": False,   # still saved for evaluation, just not shown
    },
    "monitor": {
        "confirmCycles": 1,        # Critical on this many consecutive cycles before a work order opens (anti-flapping)
        "autoCloseOnRecovery": True,  # automatic work orders close when the component is Optimal again
    },
    "chat": {
        "maxTurns": 10,            # user/assistant exchanges sent to the model; small local models have short contexts
        "tools": True,             # status/history lookups and work-order proposals; off = streamed, snapshot-only answers (faster on a slow CPU)
    },
    "study": {
        "enabled": False,          # study mode (M11): participants can't change the setup; the researcher works at /study/admin
        "condition": "dashboard_ai",  # dashboard_only hides the Advisor (and turns insights off); dashboard_ai shows it
    },
}

# Numeric bounds, inclusive.
LIMITS: dict[tuple[str, str], tuple[float, float]] = {
    ("insights", "threshold"): (0.05, 0.95),
    ("insights", "cooldownSeconds"): (0, 600),
    ("monitor", "confirmCycles"): (1, 20),
    ("chat", "maxTurns"): (1, 50),
}

# Allowed values of the text settings.
CHOICES: dict[tuple[str, str], tuple[str, ...]] = {
    ("study", "condition"): ("dashboard_only", "dashboard_ai"),
}


class SettingsError(ValueError):
    """An unknown key or a value of the wrong type or out of range."""


def _path() -> Path:
    return paths.CONFIG_DIR / "settings.json"  # resolved per call so tests can point CONFIG_DIR elsewhere


def _check(section: str, key: str, value: Any) -> Any:
    if section not in DEFAULTS or key not in DEFAULTS[section]:
        raise SettingsError(f"unknown setting {section}.{key}")
    default = DEFAULTS[section][key]
    if isinstance(default, bool):
        if not isinstance(value, bool):
            raise SettingsError(f"{section}.{key} must be true or false")
    elif isinstance(default, str):
        if value not in CHOICES[(section, key)]:
            raise SettingsError(f"{section}.{key} must be one of {', '.join(CHOICES[(section, key)])}")
        return value
    elif isinstance(value, bool) or not isinstance(value, (int, float)):
        raise SettingsError(f"{section}.{key} must be a number")
    elif isinstance(default, int) and value != int(value):
        raise SettingsError(f"{section}.{key} must be a whole number")
    if (section, key) in LIMITS:
        lo, hi = LIMITS[(section, key)]
        if not lo <= value <= hi:
            raise SettingsError(f"{section}.{key} must be between {lo} and {hi}")
    return int(value) if isinstance(default, int) and not isinstance(default, bool) else value


def _apply(base: dict[str, dict[str, Any]], patch: dict[str, Any], *, strict: bool) -> None:
    for section, values in patch.items():
        if not isinstance(values, dict):
            if strict:
                raise SettingsError(f"{section} must be an object")
            continue
        for key, value in values.items():
            try:
                base.setdefault(section, {})[key] = _check(section, key, value)
            except SettingsError:
                if strict:
                    raise
                # A hand-edited file with a bad value falls back to the default rather than breaking the server.


def get() -> dict[str, dict[str, Any]]:
    out = copy.deepcopy(DEFAULTS)
    _apply(out, jsonfile.read(_path()) or {}, strict=False)
    return out


def update(patch: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Validate and merge `patch` (e.g. {"insights": {"enabled": false}}) into the saved overrides."""
    _apply(copy.deepcopy(DEFAULTS), patch, strict=True)  # all or nothing: validate before writing anything
    saved = jsonfile.read(_path()) or {}
    _apply(saved, patch, strict=True)
    jsonfile.write_atomic(_path(), saved)
    return get()
