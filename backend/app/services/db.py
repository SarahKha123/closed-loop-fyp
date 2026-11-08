"""The shared data layer: one database, the hub every module reads and writes.

SQLite by default (config/closed_loop.db: local runs and tests). With DATABASE_URL set to a
postgres:// address (Supabase in production) it is Postgres instead; repo.py's SQL is written
to run on both, and Postgres connections are wrapped to look like sqlite3's (`?` placeholders,
rows readable by column name in any case, or by position).

The tables are the FYP1 interim report's four data contracts (Tables 3.1–3.3),
plus `tbl_Insight` for the AI layer (docs/FYP_NEW_SCOPE.md §3.4),
`tbl_StudyLog` for the user study, `tbl_WorkOrderOutcome` for what technicians
found when closing work orders, and `tbl_User` / `tbl_Session` / `tbl_AuthEvent`
for sign-in (services/auth.py), `tbl_UserCloud` / `tbl_UserModel` for each
user's own cloud keys (services/cloud.py). Design notes:

- One `tbl_SensorReading` row per *cycle*: the 17 sensors are shared by all
  four components, so the reading belongs to the cycle and the per-component
  part lives in `tbl_Prediction`.
- The 68 features are stored as JSON rather than 68 columns: they're always
  read and written together, and the table stays readable.
- `FailureProbability` = P(Degraded) + P(Critical): the chance the component
  is not optimal.

Connections are cheap in SQLite, so each operation opens its own. WAL mode
lets the dashboard read while the replay writes; writes are still serialised
through one lock, because SQLite allows a single writer.

All SQL that *uses* these tables lives in `repo.py`.

Schema changes, one file per database (the SQL differs):
- SQLite: `SCHEMA` below is the v3 baseline. Each later version is a file in
  `app/migrations/sqlite/` (`NNNN_<name>.sql`, one transaction that ends by setting
  `PRAGMA user_version`), applied here at start-up to any database below that number.
- Postgres: `app/migrations/postgres/`, applied by `python -m app.services.migrate`
  (the Database workflow) and tracked with checksums in schema_migrations. The server
  never changes the Postgres schema; it refuses to start while a migration is pending.
"""

from __future__ import annotations

import os
import sqlite3
import threading
from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from functools import lru_cache
from pathlib import Path
from typing import Any

import psycopg

from . import paths

# 2: Google sign-in, hashed + expiring sessions, tbl_AuthEvent; 3: per-user cloud keys (see _migrate);
# 4: roles and account approval (migrations/0004_accounts_and_roles.sql)
SCHEMA_VERSION = 4
MIGRATIONS = Path(__file__).resolve().parent.parent / "migrations" / "sqlite"

# A unique or foreign-key constraint refused the write, on either database.
IntegrityError = (sqlite3.IntegrityError, psycopg.errors.IntegrityError)


def database_url() -> str | None:
    """DATABASE_URL when it is a Postgres address, else None (SQLite)."""
    url = os.environ.get("DATABASE_URL", "").strip()
    return url if url.startswith(("postgres://", "postgresql://")) else None

# component key (as in ml.labels.COMPONENTS) → seeded tbl_Equipment row.
# Criticality is an assumption for the demo rig: the pump and valve sit on the
# main flow path, so a failure there stops the circuit; cooler and accumulator
# degrade it.
EQUIPMENT: dict[str, dict[str, str | None]] = {
    "cooler": {"EquipmentID": "COOLER-1", "ComponentType": "Cooler",
               "CircuitLocation": "Cooling circuit", "CriticalityLevel": "Medium"},
    "valve": {"EquipmentID": "VALVE-1", "ComponentType": "Valve",
              "CircuitLocation": "Main circuit, switching", "CriticalityLevel": "High"},
    "pump": {"EquipmentID": "PUMP-1", "ComponentType": "Pump",
             "CircuitLocation": "Main circuit, supply", "CriticalityLevel": "High"},
    "accumulator": {"EquipmentID": "ACCUM-1", "ComponentType": "Accumulator",
                    "CircuitLocation": "Main circuit, pressure storage", "CriticalityLevel": "Medium"},
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS tbl_Equipment (
  EquipmentID      TEXT PRIMARY KEY,
  ComponentType    TEXT NOT NULL UNIQUE,
  CircuitLocation  TEXT,
  CriticalityLevel TEXT,
  CommissionDate   TEXT
);

CREATE TABLE IF NOT EXISTS tbl_SensorReading (
  ReadingID   INTEGER PRIMARY KEY,
  CycleNumber INTEGER NOT NULL UNIQUE,
  Timestamp   TEXT NOT NULL,
  Features    TEXT NOT NULL,
  SensorMeans TEXT NOT NULL,
  StableFlag  INTEGER
);

CREATE TABLE IF NOT EXISTS tbl_Prediction (
  PredictionID           INTEGER PRIMARY KEY,
  ReadingID              INTEGER NOT NULL REFERENCES tbl_SensorReading(ReadingID) ON DELETE CASCADE,
  EquipmentID            TEXT NOT NULL REFERENCES tbl_Equipment(EquipmentID),
  PredictedCondition     TEXT NOT NULL CHECK (PredictedCondition IN ('Optimal', 'Degraded', 'Critical')),
  ClassProbabilities     TEXT NOT NULL,
  FailureProbability     REAL NOT NULL CHECK (FailureProbability BETWEEN 0 AND 1),
  ConfidenceBand         TEXT CHECK (ConfidenceBand IN ('High', 'Medium', 'Low')),
  TopContributingFeature TEXT,
  ShapTopFeatures        TEXT,
  ModelVersion           TEXT NOT NULL,
  PredictedAt            TEXT NOT NULL,
  AlertRaised            INTEGER NOT NULL DEFAULT 0,
  TrueCondition          TEXT
);
CREATE INDEX IF NOT EXISTS ix_prediction_equipment ON tbl_Prediction(EquipmentID, PredictionID DESC);
CREATE INDEX IF NOT EXISTS ix_prediction_reading ON tbl_Prediction(ReadingID);

CREATE TABLE IF NOT EXISTS tbl_WorkOrder (
  WorkOrderID             TEXT PRIMARY KEY,
  EquipmentID             TEXT NOT NULL REFERENCES tbl_Equipment(EquipmentID),
  TriggeredByPredictionID INTEGER REFERENCES tbl_Prediction(PredictionID) ON DELETE SET NULL,
  Priority                TEXT NOT NULL CHECK (Priority IN ('High', 'Medium', 'Low')),
  Status                  TEXT NOT NULL CHECK (Status IN ('Open', 'Closed')),
  CreatedBy               TEXT NOT NULL,
  AssignedTo              TEXT,
  Note                    TEXT,
  CreatedAt               TEXT NOT NULL,
  ClosedAt                TEXT,
  ClosedNote              TEXT
);
CREATE INDEX IF NOT EXISTS ix_workorder_equipment_status ON tbl_WorkOrder(EquipmentID, Status);

CREATE TABLE IF NOT EXISTS tbl_Insight (
  InsightID        INTEGER PRIMARY KEY,
  CreatedAt        TEXT NOT NULL,
  CycleNumber      INTEGER,
  TriggerType      TEXT NOT NULL,
  TriggerRef       TEXT,
  Model            TEXT NOT NULL,
  Mode             TEXT NOT NULL CHECK (Mode IN ('local', 'cloud')),
  PromptVersion    TEXT NOT NULL,
  Snapshot         TEXT NOT NULL,
  Text             TEXT NOT NULL,
  Grounded         INTEGER,
  ValidationDetail TEXT,
  Attempts         INTEGER NOT NULL DEFAULT 1,
  LatencyMs        INTEGER,
  FirstTokenMs     INTEGER
);

-- The user study's task log (M11). Survives a replay reset, which empties the tables above.
CREATE TABLE IF NOT EXISTS tbl_StudyLog (
  LogID         INTEGER PRIMARY KEY,
  ParticipantID TEXT NOT NULL,
  Condition     TEXT NOT NULL CHECK (Condition IN ('dashboard_only', 'dashboard_ai')),
  TaskSet       TEXT NOT NULL,
  TaskID        TEXT NOT NULL,
  StartedAt     TEXT NOT NULL,
  EndedAt       TEXT,
  DurationMs    INTEGER,
  Answer        TEXT,
  Correct       INTEGER,
  ChatTurns     INTEGER,
  InsightsShown INTEGER
);

-- What the technician found when closing a work order: the record that closes the loop
-- (prediction → work order → verified outcome). Self-contained — it copies the work order
-- and the prediction behind it — because a replay reset empties those tables and this log
-- must survive it, like tbl_StudyLog. So WorkOrderID isn't unique: IDs restart after a reset.
-- Action / MatchedPrediction are NULL only for a work order the monitor closed by itself
-- (monitor.autoCloseOnRecovery); those aren't counted as verified.
CREATE TABLE IF NOT EXISTS tbl_WorkOrderOutcome (
  OutcomeID          INTEGER PRIMARY KEY,
  WorkOrderID        TEXT NOT NULL,
  EquipmentID        TEXT NOT NULL,
  Component          TEXT NOT NULL,
  WorkOrderCreatedBy TEXT NOT NULL,
  WorkOrderNote      TEXT,
  Priority           TEXT,
  OpenedAt           TEXT NOT NULL,
  ClosedAt           TEXT NOT NULL,
  ClosedBy           TEXT NOT NULL,
  Finding            TEXT NOT NULL,
  Action             TEXT CHECK (Action IN ('repaired', 'replaced', 'no_action', 'escalated')),
  MatchedPrediction  TEXT CHECK (MatchedPrediction IN ('yes', 'no', 'partially')),
  Notes              TEXT,
  PredictionID       INTEGER,
  PredictionSource   TEXT CHECK (PredictionSource IN ('trigger', 'latest_at_open')),
  CycleNumber        INTEGER,
  PredictedCondition TEXT,
  FailureProbability REAL,
  TopDriver          TEXT,
  StudyMode          INTEGER NOT NULL DEFAULT 0
);

-- Sign-in (services/auth.py). Like tbl_StudyLog, these survive a replay reset.
-- A Google account has GoogleSub (its stable id: accounts are matched on it, never on email),
-- Username = its email, and an empty PasswordHash (no password sign-in).
-- v4 adds Role, Status and NotifyWorkOrders (migrations/0004_accounts_and_roles.sql).
CREATE TABLE IF NOT EXISTS tbl_User (
  UserID       INTEGER PRIMARY KEY,
  Username     TEXT NOT NULL UNIQUE COLLATE NOCASE,
  DisplayName  TEXT NOT NULL,
  PasswordHash TEXT NOT NULL,
  CreatedAt    TEXT NOT NULL,
  GoogleSub    TEXT,
  Email        TEXT,
  AvatarURL    TEXT,
  LastLoginAt  TEXT
);

-- Token holds sha256 of the cookie value, never the cookie value itself.
CREATE TABLE IF NOT EXISTS tbl_Session (
  Token     TEXT PRIMARY KEY,
  UserID    INTEGER NOT NULL REFERENCES tbl_User(UserID) ON DELETE CASCADE,
  CreatedAt TEXT NOT NULL,
  ExpiresAt TEXT,
  IP        TEXT,
  UserAgent TEXT
);

-- Audit trail, insert-only. UserID becomes NULL if the user is deleted, so history survives.
CREATE TABLE IF NOT EXISTS tbl_AuthEvent (
  EventID   INTEGER PRIMARY KEY,
  Event     TEXT NOT NULL CHECK (Event IN ('signup', 'login', 'login_failed', 'logout')),
  UserID    INTEGER REFERENCES tbl_User(UserID) ON DELETE SET NULL,
  Email     TEXT,
  Reason    TEXT,  -- login_failed only: password | cancelled | state | exchange | token
  IP        TEXT,
  UserAgent TEXT,
  CreatedAt TEXT NOT NULL
);

-- Each user's cloud providers (services/cloud.py). ApiKeyEnc is Fernet-encrypted with the server's
-- KEY_ENCRYPTION_SECRET; the plain key is never stored and never returned to a browser.
CREATE TABLE IF NOT EXISTS tbl_UserCloud (
  UserID    INTEGER NOT NULL REFERENCES tbl_User(UserID) ON DELETE CASCADE,
  Provider  TEXT NOT NULL,
  ApiKeyEnc TEXT,
  Model     TEXT,
  BaseURL   TEXT,
  UpdatedAt TEXT NOT NULL,
  PRIMARY KEY (UserID, Provider)
);

-- Which of those providers answers that user's chat.
CREATE TABLE IF NOT EXISTS tbl_UserModel (
  UserID    INTEGER PRIMARY KEY REFERENCES tbl_User(UserID) ON DELETE CASCADE,
  Provider  TEXT NOT NULL,
  UpdatedAt TEXT NOT NULL
);
"""

_write_lock = threading.Lock()


# ── Postgres, made to look like sqlite3 for repo.py ─────────────────────────


class Row:
    """A result row like sqlite3.Row: row["Name"] (any case, since Postgres folds unquoted names to
    lower case), row[0], unpacking, and dict(row) with the names as the query wrote them."""

    __slots__ = ("_names", "_index", "_values")

    def __init__(self, names: list[str], index: dict[str, int], values: Sequence[Any]) -> None:
        self._names, self._index, self._values = names, index, values

    def __getitem__(self, key: int | str) -> Any:
        return self._values[key] if isinstance(key, int) else self._values[self._index[key.lower()]]

    def __iter__(self) -> Iterator[Any]:
        return iter(self._values)

    def __len__(self) -> int:
        return len(self._values)

    def keys(self) -> list[str]:
        return self._names


def _row_factory(cursor: Any) -> Any:
    names = [c.name for c in cursor.description or ()]
    index = {n.lower(): i for i, n in enumerate(names)}
    return lambda values: Row(names, index, values)


@lru_cache(maxsize=256)
def _pg_sql(sql: str) -> str:
    """sqlite3's `?` placeholders → psycopg's `%s` (a literal % doubled first)."""
    return sql.replace("%", "%%").replace("?", "%s")


class _PgConnection:
    """The slice of sqlite3.Connection that repo.py uses."""

    def __init__(self, conn: psycopg.Connection) -> None:
        self._conn = conn

    def execute(self, sql: str, params: Sequence[Any] = ()) -> psycopg.Cursor:
        # Without parameters the SQL goes as written, and may hold several statements (a migration file).
        return self._conn.execute(_pg_sql(sql), params) if params else self._conn.execute(sql)  # type: ignore[arg-type]

    def executemany(self, sql: str, params: Sequence[Sequence[Any]]) -> None:
        with self._conn.cursor() as cur:
            cur.executemany(_pg_sql(sql), params)


@lru_cache(maxsize=4)
def _pool(url: str) -> Any:
    from psycopg_pool import ConnectionPool

    def configure(conn: psycopg.Connection) -> None:
        conn.row_factory = _row_factory

    # prepare_threshold=None: no server-side prepared statements, so Supabase's transaction pooler works too.
    # ponytail: 5 connections and one writer at a time (the lock below), plenty for one Render instance.
    return ConnectionPool(url, min_size=1, max_size=5, open=True, configure=configure,
                          kwargs={"prepare_threshold": None, "connect_timeout": 10})


@contextmanager
def _pg() -> Iterator[_PgConnection]:
    """One transaction: committed on success, rolled back on error."""
    with _pool(database_url()).connection() as conn:  # type: ignore[arg-type]
        yield _PgConnection(conn)


# ── the interface repo.py uses ──────────────────────────────────────────────


def _open() -> sqlite3.Connection:
    paths.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(paths.DB_PATH, timeout=10, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def read() -> Iterator[Any]:
    if database_url():
        with _pg() as conn:
            yield conn
        return
    conn = _open()
    try:
        yield conn
    finally:
        conn.close()


@contextmanager
def write() -> Iterator[Any]:
    """A connection inside one transaction: committed on success, rolled back on error.

    Writes go one at a time on both databases, so a check-then-write (the first admin, the next
    work-order number) can't race another request."""
    with _write_lock:
        if database_url():
            with _pg() as conn:
                yield conn
            return
        conn = _open()
        try:
            with conn:  # commit / rollback
                yield conn
        finally:
            conn.close()


def init_db() -> None:
    """Create or upgrade the SQLite schema and seed the equipment; on Postgres, only check that every
    migration has been applied (the Database workflow applies them). Safe to call every start."""
    if database_url():
        from . import migrate

        if not os.environ.get("KEY_ENCRYPTION_SECRET", "").strip():
            # Without it the key that encrypts users' API keys lives in config/secret.key, on a disk that a
            # hosted server (Render) wipes on every deploy: every saved key would become unreadable.
            raise RuntimeError("KEY_ENCRYPTION_SECRET must be set when DATABASE_URL is: see docs/DEPLOY.md")
        with _pg() as conn:
            pending, edited = migrate.status(conn)
        if pending or edited:
            raise RuntimeError(
                f"the Postgres schema isn't up to date (pending: {[p.name for p in pending]}, edited after"
                f" running: {edited}). Run `python -m app.services.migrate` from backend/."
            )
        return
    with _write_lock:
        conn = _open()
        try:
            conn.execute("PRAGMA journal_mode = WAL")
            conn.executescript(SCHEMA)
            _migrate(conn)
            conn.executemany(
                "INSERT INTO tbl_Equipment (EquipmentID, ComponentType, CircuitLocation, CriticalityLevel)"
                " VALUES (:EquipmentID, :ComponentType, :CircuitLocation, :CriticalityLevel) ON CONFLICT DO NOTHING",
                list(EQUIPMENT.values()),
            )
            conn.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
            conn.commit()
        finally:
            conn.close()


def _migrate(conn: sqlite3.Connection) -> None:
    """Bring a database from an older SCHEMA_VERSION up to date. CREATE TABLE IF NOT EXISTS never
    changes a table that already exists, so new columns are added here (a no-op on a fresh database)."""
    if conn.execute("PRAGMA user_version").fetchone()[0] < 2:
        for table, columns in {
            "tbl_User": ("GoogleSub", "Email", "AvatarURL", "LastLoginAt"),
            "tbl_Session": ("ExpiresAt", "IP", "UserAgent"),
        }.items():
            have = {r["name"] for r in conn.execute(f"PRAGMA table_info({table})")}  # noqa: S608 — fixed names
            for col in columns:
                if col not in have:
                    conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} TEXT")  # noqa: S608 — fixed names
        conn.execute("DELETE FROM tbl_Session")  # v1 stored raw tokens; v2 stores only their hash
    conn.commit()
    for path in migration_files():
        if int(path.name[:4]) > conn.execute("PRAGMA user_version").fetchone()[0]:
            try:
                conn.executescript(path.read_text())
            except sqlite3.Error as exc:
                conn.rollback()
                raise RuntimeError(f"database migration {path.name} failed, nothing was changed: {exc}") from exc
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_User_GoogleSub ON tbl_User(GoogleSub)")
    conn.execute("CREATE INDEX IF NOT EXISTS ix_Session_UserID ON tbl_Session(UserID)")
    conn.execute("CREATE INDEX IF NOT EXISTS ix_AuthEvent_CreatedAt ON tbl_AuthEvent(CreatedAt DESC)")
    conn.execute("CREATE INDEX IF NOT EXISTS ix_AuthEvent_IP ON tbl_AuthEvent(IP, Event, CreatedAt)")


def migration_files() -> list[Path]:
    """app/migrations/sqlite/NNNN_*.sql, in order."""
    return sorted(MIGRATIONS.glob("[0-9][0-9][0-9][0-9]_*.sql"))


def equipment_id(component: str) -> str:
    """'cooler' → 'COOLER-1'."""
    return str(EQUIPMENT[component]["EquipmentID"])
