"""Postgres migrations: apply or check app/migrations/postgres/NNNN_*.sql against DATABASE_URL.

    python -m app.services.migrate           apply what is pending, each file in its own transaction
    python -m app.services.migrate --check   change nothing; report what is pending

Every applied file is recorded in schema_migrations with its sha256. A file edited after it ran is
an error in both modes (exit 1): the database already has the old version, so the change must go
in a new file. In GitHub Actions the pending count is written to $GITHUB_OUTPUT as `pending=N`.
(SQLite migrates itself at start-up: services/db.py.)
"""

from __future__ import annotations

import argparse
import hashlib
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import db

FOLDER = Path(__file__).resolve().parent.parent / "migrations" / "postgres"

TRACKING = """
CREATE TABLE IF NOT EXISTS schema_migrations (
  Name      TEXT PRIMARY KEY,
  Checksum  TEXT NOT NULL,
  AppliedAt TEXT NOT NULL
);
ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
"""


def files() -> list[Path]:
    return sorted(FOLDER.glob("[0-9][0-9][0-9][0-9]_*.sql"))


def checksum(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def status(conn: Any) -> tuple[list[Path], list[str]]:
    """(files not applied yet, names of applied files whose content has changed since)."""
    exists = conn.execute("SELECT to_regclass('schema_migrations') IS NOT NULL").fetchone()[0]
    applied = dict(conn.execute("SELECT Name, Checksum FROM schema_migrations").fetchall()) if exists else {}
    pending = [p for p in files() if p.name not in applied]
    edited = [p.name for p in files() if p.name in applied and applied[p.name] != checksum(p)]
    return pending, edited


def _output(pending: int) -> None:
    if out := os.environ.get("GITHUB_OUTPUT"):
        with open(out, "a") as f:
            f.write(f"pending={pending}\n")


def main(argv: list[str] | None = None) -> int:
    args = argparse.ArgumentParser(description=__doc__.splitlines()[0]).parse_known_args(argv)[1]
    check = "--check" in args
    if not db.database_url():
        print("DATABASE_URL is missing or isn't a postgres:// address.", file=sys.stderr)
        return 1

    with db.write() as conn:  # reachable? (the error says why not)
        conn.execute(TRACKING)
    with db.read() as conn:
        pending, edited = status(conn)
    if edited:
        print(f"Edited after it was applied: {', '.join(edited)}. Put the change in a new migration file.", file=sys.stderr)
        _output(len(pending))
        return 1
    print(f"Database reachable. Pending: {', '.join(p.name for p in pending) or 'none'}.")
    _output(len(pending))
    if check:
        return 0

    for path in pending:
        with db.write() as conn:  # one transaction per file: a failure leaves the earlier ones applied
            conn.execute(path.read_text())
            conn.execute("INSERT INTO schema_migrations (Name, Checksum, AppliedAt) VALUES (?, ?, ?)",
                         (path.name, checksum(path), datetime.now(timezone.utc).isoformat(timespec="seconds")))
        print(f"Applied {path.name}.")
    _output(0)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
