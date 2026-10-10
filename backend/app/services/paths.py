"""Where the committed model choice lives.

Everything the app writes lives in the repo's `config/` (or wherever
CLOSED_LOOP_CONFIG_DIR points), whichever directory the server is started
from: the model choice and settings (committable), the cloud keys and the
database (gitignored).
"""

from __future__ import annotations

import os
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
CONFIG_DIR = Path(os.environ.get("CLOSED_LOOP_CONFIG_DIR", REPO / "config"))
MODEL_CONFIG = CONFIG_DIR / "model_config.json"
# Cloud API keys. Gitignored — unlike model_config.json, never committed.
CLOUD_CONFIG = CONFIG_DIR / "cloud.json"
# The shared data layer (SQLite). Runtime data, gitignored.
DB_PATH = CONFIG_DIR / "closed_loop.db"


def ensure_dirs() -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
