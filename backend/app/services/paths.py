"""Where config and runtime data live.

Everything the app writes lives in the repo's `config/` (or wherever
CLOSED_LOOP_CONFIG_DIR points), whichever directory the server is started
from: settings and study scenarios (committable), the database (which holds
each user's encrypted cloud keys) and secret.key, the key-encryption secret
when KEY_ENCRYPTION_SECRET isn't set (both gitignored).
"""

from __future__ import annotations

import os
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
CONFIG_DIR = Path(os.environ.get("CLOSED_LOOP_CONFIG_DIR", REPO / "config"))
# The shared data layer (SQLite). Runtime data, gitignored.
DB_PATH = CONFIG_DIR / "closed_loop.db"


def ensure_dirs() -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
