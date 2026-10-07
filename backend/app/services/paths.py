"""Where the committed model choice lives.

Mirrors Daedalus's `db/paths.py`: one env var picks the directory, so the same
code resolves `/config` in the container and `./config` on the host, and the
file is a bind-mounted, version-controllable choice rather than state hidden
in a volume.
"""

from __future__ import annotations

import os
from pathlib import Path

CONFIG_DIR = Path(os.environ.get("CLOSED_LOOP_CONFIG_DIR", "config"))
MODEL_CONFIG = CONFIG_DIR / "model_config.json"
# Cloud API keys. Gitignored — unlike model_config.json, never committed.
CLOUD_CONFIG = CONFIG_DIR / "cloud.json"
# The shared data layer (SQLite). Runtime data, gitignored.
DB_PATH = CONFIG_DIR / "closed_loop.db"


def ensure_dirs() -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
