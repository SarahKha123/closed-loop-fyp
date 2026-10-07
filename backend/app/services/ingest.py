"""The dataset, held in memory for the replay: one record per cycle.

Reads `backend/data/hydraulic_condition_monitoring_summary.csv` through the
ML pipeline's own loader (`backend/ml/features.py`), so the live system and
the trained models see identical features. 2,205 rows; well under 10 MB.

If it can't load, the dataset reports itself unavailable with the reason,
and the rest of the API keeps working.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class CycleRecord:
    cycle: int
    features: dict[str, float]       # the 68 model inputs
    sensor_means: dict[str, float]   # the 17 `<SENSOR>_mean` values, for the Sensor Feed
    stable: int                      # 0 = stable, 1 = might not have settled yet (dataset convention)
    true_conditions: dict[str, str]  # component → Optimal / Degraded / Critical; evaluation only


class Dataset:
    """All cycles, loaded once. `get(cycle)` is O(1)."""

    def __init__(self, records: dict[int, CycleRecord]) -> None:
        self._records = records
        self.first = min(records)
        self.last = max(records)

    @property
    def total(self) -> int:
        return len(self._records)

    def get(self, cycle: int) -> CycleRecord:
        return self._records[cycle]

    def __contains__(self, cycle: object) -> bool:
        return cycle in self._records


def load() -> Dataset:
    """Load the summary CSV. Raises ImportError / FileNotFoundError / ValueError with a readable reason."""
    from ml import features, labels  # noqa: PLC0415 — deferred: pandas loads only when the replay starts

    summary = features.load_summary()
    y = labels.load_labels()
    names = list(features.FEATURE_NAMES)
    means = [f"{s}_mean" for s in features.SENSORS]

    records: dict[int, CycleRecord] = {}
    for cycle, row in summary.iterrows():
        c = int(cycle)  # type: ignore[arg-type]
        records[c] = CycleRecord(
            cycle=c,
            features={k: float(row[k]) for k in names},
            sensor_means={k.removesuffix("_mean"): float(row[k]) for k in means},
            stable=int(row["stable_flag"]),
            true_conditions={comp: labels.CLASSES[int(y.at[c, comp])] for comp in labels.COMPONENTS},
        )
    return Dataset(records)


def describe(dataset: Dataset | None, error: str | None) -> dict[str, Any]:
    if dataset is None:
        return {"available": False, "error": error}
    return {"available": True, "cycles": dataset.total, "first": dataset.first, "last": dataset.last}
