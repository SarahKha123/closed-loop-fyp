"""The 68 per-cycle features: mean, std, min and max of each of the 17 sensors.

The project's dataset is `data/hydraulic_condition_monitoring_summary.csv`:
one row per cycle with these 68 features (4 decimals) and the five
`profile.txt` condition columns — see docs/DATASET.md. Everything (training,
evaluation, the live replay) reads that file through `load_features()`.

The raw UCI files are optional. `build_summary()` recomputes the CSV from them
(`python -m ml.rebuild_summary`), which is how the CSV was verified: it
matches the raw-file features to within its 4-decimal rounding.

Importable by the backend; no plotting, no side effects.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

REPO = Path(__file__).resolve().parents[1]
DATA_DIR = REPO / "data"
SUMMARY_CSV = DATA_DIR / "hydraulic_condition_monitoring_summary.csv"
RAW_DIR = DATA_DIR / "raw"

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
DECIMALS = 4


def load_summary(path: Path = SUMMARY_CSV) -> pd.DataFrame:
    """The whole dataset: index = cycle (1..2205), the 68 features, then the 5 condition columns.

    Raises with the fix if the file is missing or doesn't have the expected shape.
    """
    if not path.exists():
        raise FileNotFoundError(f"{path} is missing — it's committed to the repo; restore it, or rebuild it "
                                "from the raw UCI files with `bash ml/get_data.sh && python -m ml.rebuild_summary`")
    df = pd.read_csv(path, index_col="cycle")
    expected = list(FEATURE_NAMES) + list(LABEL_COLUMNS)
    if list(df.columns) != expected or len(df) != N_CYCLES:
        raise ValueError(f"{path}: expected {N_CYCLES} rows and columns cycle + {len(expected)} "
                         f"(68 features + 5 conditions), got {len(df)} × {len(df.columns)}")
    return df


def load_features(path: Path = SUMMARY_CSV) -> pd.DataFrame:
    """The 2,205 × 68 feature matrix, columns in FEATURE_NAMES order, index = cycle."""
    return load_summary(path)[list(FEATURE_NAMES)]


# ── optional: rebuilding the summary from the raw UCI files ──────────────────


def load_raw(raw_dir: Path = RAW_DIR) -> dict[str, np.ndarray]:
    """Each raw sensor file as a (cycles × samples) array."""
    missing = [s for s in SENSORS if not (raw_dir / f"{s}.txt").exists()]
    if missing:
        raise FileNotFoundError(f"missing {', '.join(missing)} in {raw_dir} — run `bash ml/get_data.sh`")
    return {
        s: pd.read_csv(raw_dir / f"{s}.txt", sep="\t", header=None, dtype=np.float64).to_numpy()
        for s in SENSORS
    }


def feature_matrix(raw: dict[str, np.ndarray]) -> pd.DataFrame:
    """The 68 features from raw arrays (unrounded). `std` is the population standard deviation (ddof=0)."""
    cols: dict[str, np.ndarray] = {}
    for s in SENSORS:
        a = raw[s]
        cols[f"{s}_mean"] = a.mean(axis=1)
        cols[f"{s}_std"] = a.std(axis=1)
        cols[f"{s}_min"] = a.min(axis=1)
        cols[f"{s}_max"] = a.max(axis=1)
    df = pd.DataFrame(cols)[list(FEATURE_NAMES)]
    df.index = pd.RangeIndex(1, len(df) + 1, name="cycle")
    return df


def build_summary(raw_dir: Path = RAW_DIR) -> pd.DataFrame:
    """The summary CSV's content, recomputed from the raw files: features rounded to 4 decimals + profile.txt."""
    features = feature_matrix(load_raw(raw_dir)).round(DECIMALS)
    profile = pd.read_csv(raw_dir / "profile.txt", sep="\t", header=None, names=list(LABEL_COLUMNS), dtype=float)
    profile.index = features.index
    return pd.concat([features, profile], axis=1)
