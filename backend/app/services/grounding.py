"""The grounding check: is every fact in a model's text in the snapshot it was given?

v1 (docs/FYP_NEW_SCOPE.md, M8):
- every number must equal some number in the snapshot, to the precision the
  text writes it ("97%" matches 97.3; "97.5%" does not);
- every work order ID (WO-0003) must be in the snapshot;
- a sentence about exactly one component may only call it the condition it is
  in, or the one it changed from ("the accumulator is optimal" fails when the
  snapshot says Critical).

Deliberately ignored: list numbering ("1."), sensor codes (PS2, TS1), and bare
whole numbers up to 10 with no unit ("top 3 drivers", "Pressure 2").
ponytail: v1 doesn't check that a number belongs to the component the sentence
names (v2 in TODO.md M8) — a value copied from the wrong component passes.
"""

from __future__ import annotations

import re
from typing import Any

UNITS = ("%", "°C", "bar", "kW", "W", "l/min", "mm/s")
CONDITIONS = ("optimal", "degraded", "critical")

_WO = re.compile(r"\bWO-\d+\b", re.IGNORECASE)
_LIST_MARK = re.compile(r"^\s*\d+[.)]\s", re.MULTILINE)
# A number not glued to a word (PS2, qwen3) or an ID (WO-0003), with an optional unit right after it.
_NUMBER = re.compile(
    r"(?<![\w.\-])(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(?:\s*(" + "|".join(re.escape(u) for u in UNITS) + r"))?(?![\w])"
)
_SENTENCE = re.compile(r"(?<=[.!?])\s+|\n+")


def _numbers(text: str) -> list[tuple[str, float, int, str | None]]:
    """(as written, value, decimals, unit) for each number in `text`."""
    text = _LIST_MARK.sub(" ", _WO.sub(" ", text))
    out = []
    for m in _NUMBER.finditer(text):
        whole, frac, unit = m.group(1), m.group(2), m.group(3)
        value = float(whole.replace(",", "") + (f".{frac}" if frac else ""))
        out.append((m.group(0).strip(), value, len(frac or ""), unit))
    return out


def _snapshot_values(node: Any, nums: list[float], ids: set[str]) -> None:
    """Every number in the snapshot, including those inside its strings (event lines), and every WO ID."""
    if isinstance(node, bool) or node is None:
        return
    if isinstance(node, (int, float)):
        nums.append(float(node))
    elif isinstance(node, str):
        ids.update(i.upper() for i in _WO.findall(node))
        nums.extend(v for _, v, _, _ in _numbers(node))
    elif isinstance(node, dict):
        for v in node.values():
            _snapshot_values(v, nums, ids)
    elif isinstance(node, list):
        for v in node:
            _snapshot_values(v, nums, ids)


def validate(text: str, snapshot: dict[str, Any]) -> dict[str, Any]:
    """{"grounded": bool, "checked": [{"claim", "ok"}], "mismatches": [claim, …]}."""
    nums: list[float] = []
    ids: set[str] = set()
    _snapshot_values(snapshot, nums, ids)
    checked: list[dict[str, Any]] = []

    for wo in _WO.findall(text):
        checked.append({"claim": wo, "ok": wo.upper() in ids})

    for written, value, decimals, unit in _numbers(text):
        if decimals == 0 and unit is None and value <= 10:
            continue
        tolerance = 0.5 * 10 ** -decimals + 1e-9
        checked.append({"claim": written, "ok": any(abs(value - n) <= tolerance for n in nums)})

    states = {c["component"].lower(): c for c in snapshot.get("components", [])}
    for sentence in _SENTENCE.split(text):
        low = sentence.lower()
        named = [name for name in states if re.search(rf"\b{name}\b", low)]
        if len(named) != 1:
            continue
        c = states[named[0]]
        allowed = {c["condition"].lower(), (c.get("changedFrom") or "").lower()}
        for cond in CONDITIONS:
            if re.search(rf"\b{cond}\b", low):
                checked.append({"claim": f"{c['component']}: {cond.capitalize()}", "ok": cond in allowed})

    mismatches = [c["claim"] for c in checked if not c["ok"]]
    return {"grounded": not mismatches, "checked": checked, "mismatches": mismatches}
