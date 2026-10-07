"""Shared pytest fixtures: every test gets its own empty config dir and database."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))  # `import app…` without installing the backend

from app.services import db, paths  # noqa: E402


@pytest.fixture
def fresh_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point the data layer at a temp file and create the schema."""
    monkeypatch.setattr(paths, "CONFIG_DIR", tmp_path)
    monkeypatch.setattr(paths, "DB_PATH", tmp_path / "closed_loop.db")
    db.init_db()
    return paths.DB_PATH
