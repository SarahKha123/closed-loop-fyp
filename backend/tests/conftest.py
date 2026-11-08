"""Shared pytest fixtures: every test gets its own empty config dir and database."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))  # `import app…` without installing the backend

from app.services import db, migrate, paths  # noqa: E402


# TEST_DATABASE_URL=postgresql://… runs every test against that Postgres database instead of SQLite
# (CI does both). Each test starts from an empty public schema with the migrations applied. It drops
# everything in that database: never point it at Supabase.
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "").strip()
postgres_only = pytest.mark.skipif(not TEST_DATABASE_URL, reason="needs TEST_DATABASE_URL")
sqlite_only = pytest.mark.skipif(bool(TEST_DATABASE_URL), reason="SQLite file and migrations")


@pytest.fixture
def fresh_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point the data layer at a temp file (or the empty test Postgres) and create the schema."""
    monkeypatch.setattr(paths, "CONFIG_DIR", tmp_path)
    monkeypatch.setattr(paths, "DB_PATH", tmp_path / "closed_loop.db")
    if TEST_DATABASE_URL:
        monkeypatch.setenv("DATABASE_URL", TEST_DATABASE_URL)
        monkeypatch.setenv("KEY_ENCRYPTION_SECRET", "test-only-secret")
        with db.write() as conn:
            conn.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        assert migrate.main([]) == 0
    else:
        monkeypatch.delenv("DATABASE_URL", raising=False)
    db.init_db()
    return paths.DB_PATH


@pytest.fixture(autouse=True)
def no_local_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """The developer's .env must not change what tests see, or reach anything real: no admin list,
    no real database, no Gmail sender (a test would send real email) and no Google client."""
    for key in ("ADMIN_EMAILS", "DATABASE_URL", "SMTP_USER", "SMTP_APP_PASSWORD", "GOOGLE_CLIENT_ID",
                "GOOGLE_CLIENT_SECRET", "APP_URL"):
        monkeypatch.delenv(key, raising=False)


@pytest.fixture(autouse=True)
def signed_in():
    """Every API test runs as a signed-in, active admin (id 1); test_access.py and test_accounts.py check the guards."""
    from app.api.auth import current_user
    from app.main import app

    app.dependency_overrides[current_user] = lambda: {
        "id": 1, "username": "tester", "displayName": "Tester", "email": "tester@example.com", "avatarUrl": None,
        "role": "admin", "status": "active", "notifyWorkOrders": True,
    }
    yield
    app.dependency_overrides.pop(current_user, None)
