"""Postgres migrations (services/migrate.py): pending files are applied once, an edited one is refused,
and the server won't start on an out-of-date schema. Runs only with TEST_DATABASE_URL."""

from __future__ import annotations

import shutil

import pytest
from conftest import postgres_only

from app.services import db, migrate

pytestmark = postgres_only


@pytest.fixture
def folder(tmp_path, monkeypatch, fresh_db):
    """A copy of the real migrations folder that a test can add to or edit."""
    copy = tmp_path / "postgres"
    shutil.copytree(migrate.FOLDER, copy)
    monkeypatch.setattr(migrate, "FOLDER", copy)
    return copy


def test_pending_then_applied_once(folder, tmp_path, monkeypatch):
    out = tmp_path / "github_output"
    monkeypatch.setenv("GITHUB_OUTPUT", str(out))
    (folder / "0002_note.sql").write_text("ALTER TABLE tbl_WorkOrder ADD COLUMN Extra TEXT;")
    with pytest.raises(RuntimeError, match="0002_note.sql"):
        db.init_db()  # the server refuses an out-of-date schema

    assert migrate.main(["--check"]) == 0 and out.read_text().endswith("pending=1\n")
    assert migrate.main([]) == 0 and migrate.main([]) == 0  # the second run has nothing to do
    with db.read() as conn:
        assert [r[0] for r in conn.execute("SELECT Name FROM schema_migrations ORDER BY Name")] == [
            "0001_baseline.sql", "0002_note.sql"]
    db.init_db()


def test_editing_an_applied_migration_is_refused(folder):
    baseline = folder / "0001_baseline.sql"
    baseline.write_text(baseline.read_text() + "\n-- edited\n")
    assert migrate.main(["--check"]) == 1
    assert migrate.main([]) == 1
    with pytest.raises(RuntimeError, match="0001_baseline.sql"):
        db.init_db()
