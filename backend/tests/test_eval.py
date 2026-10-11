"""The evaluation harness's own logic (M10): scenario categories, coverage, the metrics."""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "eval"))

import analyse  # noqa: E402
import run  # noqa: E402
from make_scenarios import category, spread  # noqa: E402


def test_categories_and_spread():
    assert category([{"condition": "Critical"}], set()) == "to_critical"
    assert category([{"condition": "Optimal"}, {"condition": "Degraded"}], set()) == "two_changes"
    assert category([], {"threshold"}) == "threshold"
    assert category([], {"work_order"}) is None
    assert spread(list(range(10)), 3) == [0, 4, 9] and spread([1, 2], 5) == [1, 2]


def test_coverage():
    exp = [{"component": "Pump", "condition": "Critical"}]
    assert run.coverage("The pump turned Critical.", exp) == (True, True)
    assert run.coverage("The valve turned critical.", exp) == (False, True)
    assert run.coverage("All components are optimal.", []) == (True, True)


def test_summary_metrics():
    rows = [  # model A: validator off hallucinates once in two; on fixes it with one retry
        dict(model="A", mode="local", validator="off", grounded=1, firstGrounded=1, checked=4, matched=4, totalMs=1000),
        dict(model="A", mode="local", validator="off", grounded=0, firstGrounded=0, checked=4, matched=3, totalMs=3000),
        dict(model="A", mode="local", validator="on", grounded=1, firstGrounded=0, checked=4, matched=4, totalMs=5000),
        dict(model="A", mode="local", validator="on", grounded=1, firstGrounded=1, checked=0, matched=0, totalMs=1000),
        dict(model="A", mode="local", validator="on", error="timeout"),
    ]
    df = pd.DataFrame(rows).assign(coversComponent=1, coversCondition=1, firstTokenMs=100)
    s = analyse.summarise(df).set_index("validator")
    assert s.loc["off", "hallucination"] == 0.5 and s.loc["off", "accuracy_mean"] == 0.875
    assert s.loc["on", "hallucination"] == 0 and s.loc["on", "first_attempt_hallucination"] == 0.5
    assert s.loc["on", "accuracy_mean"] == 1.0  # the insight with nothing to check is left out
    assert s.loc["on", "runs"] == 2 and s.loc["on", "errors"] == 1
    assert s.loc["off", "total_median"] == 2000
