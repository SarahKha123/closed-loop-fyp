"""The shared data layer: one SQLite database, the hub every module reads and writes.

The tables are the FYP1 interim report's four data contracts (Tables 3.1–3.3),
plus `tbl_Insight` for the AI layer (docs/FYP_NEW_SCOPE.md §3.4). Design notes:

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
"""

from __future__ import annotations

import sqlite3
import threading
from collections.abc import Iterator
from contextlib import contextmanager

from . import paths

SCHEMA_VERSION = 1

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
"""

_write_lock = threading.Lock()


def _open() -> sqlite3.Connection:
    paths.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(paths.DB_PATH, timeout=10, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def read() -> Iterator[sqlite3.Connection]:
    conn = _open()
    try:
        yield conn
    finally:
        conn.close()


@contextmanager
def write() -> Iterator[sqlite3.Connection]:
    """A connection inside one transaction: committed on success, rolled back on error."""
    with _write_lock:
        conn = _open()
        try:
            with conn:  # commit / rollback
                yield conn
        finally:
            conn.close()


def init_db() -> None:
    """Create the tables if missing, seed the equipment, and turn on WAL. Safe to call every start."""
    with _write_lock:
        conn = _open()
        try:
            conn.execute("PRAGMA journal_mode = WAL")
            conn.executescript(SCHEMA)
            conn.executemany(
                "INSERT OR IGNORE INTO tbl_Equipment (EquipmentID, ComponentType, CircuitLocation, CriticalityLevel)"
                " VALUES (:EquipmentID, :ComponentType, :CircuitLocation, :CriticalityLevel)",
                list(EQUIPMENT.values()),
            )
            conn.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
            conn.commit()
        finally:
            conn.close()


def equipment_id(component: str) -> str:
    """'cooler' → 'COOLER-1'."""
    return str(EQUIPMENT[component]["EquipmentID"])
