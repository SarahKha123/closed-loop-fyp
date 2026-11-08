"""Target labels: the graded condition values → Optimal / Degraded / Critical.

Read from the summary CSV's condition columns (identical to profile.txt).

The grouping reproduces the class counts in the FYP1 interim report, Table 4.1:

    component     Optimal        Degraded       Critical
    cooler        100 % (741)    20 % (732)     3 % (732)
    valve         100 % (1,125)  90 % (360)     80 %, 73 % (720)
    pump          0 (1,221)      1 (492)        2 (492)
    accumulator   130 bar (599)  115 bar (399)  100, 90 bar (1,207)
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from .features import SUMMARY_CSV, load_summary

CLASSES: tuple[str, ...] = ("Optimal", "Degraded", "Critical")  # encoded 0, 1, 2
COMPONENTS: tuple[str, ...] = ("cooler", "valve", "pump", "accumulator")

# summary CSV condition column → {graded value: class index}
_GRADES: dict[str, dict[int, int]] = {
    "cooler": {100: 0, 20: 1, 3: 2},
    "valve": {100: 0, 90: 1, 80: 2, 73: 2},
    "pump": {0: 0, 1: 1, 2: 2},
    "accumulator": {130: 0, 115: 1, 100: 2, 90: 2},
}
_SOURCE_COLUMN = {
    "cooler": "cooler_condition_pct",
    "valve": "valve_condition_pct",
    "pump": "pump_leakage",
    "accumulator": "accumulator_bar",
}

EXPECTED_COUNTS: dict[str, tuple[int, int, int]] = {
    "cooler": (741, 732, 732),
    "valve": (1125, 360, 720),
    "pump": (1221, 492, 492),
    "accumulator": (599, 399, 1207),
}


def load_profile(path: Path = SUMMARY_CSV) -> pd.DataFrame:
    """The graded condition values (as in profile.txt), index = cycle; columns cooler, valve, pump, accumulator, stable.

    Note the stable flag's meaning (from the dataset documentation): 0 = conditions
    were stable, 1 = static conditions might not have been reached yet.
    """
    summary = load_summary(path)
    out = summary[[*_SOURCE_COLUMN.values(), "stable_flag"]].astype(int)
    out.columns = [*_SOURCE_COLUMN.keys(), "stable"]
    return out


def load_labels(path: Path = SUMMARY_CSV) -> pd.DataFrame:
    """One integer class column per component (0 Optimal, 1 Degraded, 2 Critical), plus `stable`."""
    profile = load_profile(path)
    out = pd.DataFrame(index=profile.index)
    for comp, grades in _GRADES.items():
        unknown = set(profile[comp]) - set(grades)
        if unknown:
            raise ValueError(f"{comp}: unexpected graded values {sorted(unknown)}")
        out[comp] = profile[comp].map(grades).astype(int)
    out["stable"] = profile["stable"]
    return out


def check_counts(labels: pd.DataFrame) -> None:
    """Raise if the class counts differ from FYP1 Table 4.1."""
    for comp, expected in EXPECTED_COUNTS.items():
        got = tuple(int((labels[comp] == k).sum()) for k in range(3))
        if got != expected:
            raise AssertionError(f"{comp}: class counts {got} != FYP1 Table 4.1 {expected}")


def condition_blocks(path: Path = SUMMARY_CSV) -> pd.Series:
    """Group id per cycle: runs of consecutive cycles with the same four graded conditions (194 blocks, ~11 cycles each).

    The rig was held at one condition combination for a run of cycles, so neighbouring cycles are near-duplicates.
    Grouped cross-validation keeps each run on one side of the split, so a fold can't be scored on cycles whose
    neighbours it trained on (the leakage random k-fold allows on this dataset).
    """
    profile = load_profile(path)[list(COMPONENTS)]
    changed = (profile != profile.shift()).any(axis=1)
    return changed.cumsum().rename("block")

