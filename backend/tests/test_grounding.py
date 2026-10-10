"""The grounding check (M8): the cases from TODO.md."""

from __future__ import annotations

from app.services.grounding import validate

SNAP = {
    "cycle": 1700,
    "events": ["Cooler changed from Degraded to Critical at cycle 1700", "Work order WO-0003 opened for Cooler"],
    "components": [
        {"component": "Cooler", "condition": "Critical", "changedFrom": "Degraded", "failureProbabilityPct": 96.8,
         "confidence": "High", "conditionSinceCycle": 1700,
         "topDrivers": [{"name": "Cooling efficiency (mean)", "value": 18.42, "unit": "%"},
                        {"name": "Cooling power (minimum)", "value": 0.873, "unit": "kW"}]},
        {"component": "Accumulator", "condition": "Critical", "changedFrom": None, "failureProbabilityPct": 99.1,
         "confidence": "High", "conditionSinceCycle": 1665,
         "topDrivers": [{"name": "Volume flow 2 (mean)", "value": 8.95, "unit": "l/min"}]},
    ],
    "openWorkOrders": [{"id": "WO-0003", "component": "Cooler", "priority": "Medium", "raisedBy": "system"}],
}

GOOD = ("The cooler changed from Degraded to Critical at cycle 1,700, with a 96.8% failure probability. "
        "Its top driver is cooling efficiency at 18.42 % and cooling power at 0.873 kW. "
        "Work order WO-0003 is open; inspect the cooler fan and heat exchanger.")


def test_correct_text_passes():
    r = validate(GOOD, SNAP)
    assert r["grounded"], r["mismatches"]
    assert len(r["checked"]) >= 5


def test_changed_number_fails():
    r = validate(GOOD.replace("96.8%", "94.2%"), SNAP)
    assert not r["grounded"] and r["mismatches"] == ["94.2%"]


def test_rounding_within_written_precision_passes():
    assert validate("The cooler is at a 97% failure probability.", SNAP)["grounded"]
    assert not validate("The cooler is at a 97.5% failure probability.", SNAP)["grounded"]


def test_units_parsed():
    r = validate("Flow is 8.95 l/min and power 0.873 kW.", SNAP)
    assert [c["claim"] for c in r["checked"]] == ["8.95 l/min", "0.873 kW"] and r["grounded"]


def test_wrong_condition_for_component_fails():
    r = validate("The accumulator is optimal.", SNAP)
    assert r["mismatches"] == ["Accumulator: Optimal"]


def test_unknown_work_order_fails_and_list_numbering_is_ignored():
    r = validate("1. Open WO-0009 for the cooler.\n2. Check the fan.", SNAP)
    assert r["mismatches"] == ["WO-0009"]


def test_sensor_codes_and_small_counts_are_ignored():
    assert validate("Check PS2 and TS1; the top 3 drivers point to Pressure 2.", SNAP)["checked"] == []
