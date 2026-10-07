"""The 68 per-cycle features: mean, std, min and max of each of the 17 sensors.

The project's dataset is `data/hydraulic_condition_monitoring_summary.csv`:
one row per cycle with these 68 features (4 decimals) and the five
`profile.txt` condition columns — see docs/DATASET.md. Everything (training,
evaluation, the live replay) reads that file through `load_features()`.

The CSV was verified once (2026-10-07) against the original UCI raw files:
features recomputed from them match it to within its 4-decimal rounding
(docs/DATASET.md §5).

Importable by the backend; no plotting, no side effects.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

REPO = Path(__file__).resolve().parents[1]
DATA_DIR = REPO / "data"
SUMMARY_CSV = DATA_DIR / "hydraulic_condition_monitoring_summary.csv"

# Order matters: it fixes the column order of the feature matrix and the models.
SENSORS: tuple[str, ...] = (
    "PS1", "PS2", "PS3", "PS4", "PS5", "PS6",  # pressure, bar, 100 Hz
    "EPS1",                                    # motor power, W, 100 Hz
    "FS1", "FS2",                              # volume flow, l/min, 10 Hz
    "TS1", "TS2", "TS3", "TS4",                # temperature, °C, 1 Hz
    "VS1",                                     # vibration, mm/s, 1 Hz
    "CE", "CP", "SE",                          # cooling efficiency %, cooling power kW, efficiency factor % (virtual)
)
STATS: tuple[str, ...] = ("mean", "std", "min", "max")
FEATURE_NAMES: tuple[str, ...] = tuple(f"{s}_{stat}" for s in SENSORS for stat in STATS)

# The summary CSV's condition columns, in profile.txt's column order.
LABEL_COLUMNS: tuple[str, ...] = (
    "cooler_condition_pct", "valve_condition_pct", "pump_leakage", "accumulator_bar", "stable_flag",
)
N_CYCLES = 2205


def load_summary(path: Path = SUMMARY_CSV) -> pd.DataFrame:
    """The whole dataset: index = cycle (1..2205), the 68 features, then the 5 condition columns.

    Raises with the fix if the file is missing or doesn't have the expected shape.
    """
    if not path.exists():
        raise FileNotFoundError(f"{path} is missing — it's committed to the repo; restore it with "
                                "`git checkout -- data/`")
    df = pd.read_csv(path, index_col="cycle")
    expected = list(FEATURE_NAMES) + list(LABEL_COLUMNS)
    if list(df.columns) != expected or len(df) != N_CYCLES:
        raise ValueError(f"{path}: expected {N_CYCLES} rows and columns cycle + {len(expected)} "
                         f"(68 features + 5 conditions), got {len(df)} × {len(df.columns)}")
    return df


def load_features(path: Path = SUMMARY_CSV) -> pd.DataFrame:
    """The 2,205 × 68 feature matrix, columns in FEATURE_NAMES order, index = cycle."""
    return load_summary(path)[list(FEATURE_NAMES)]

