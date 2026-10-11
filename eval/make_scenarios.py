"""Build the frozen scenario set for the evaluation (M10, Part B).

Replays all 2,205 cycles through the live pipeline's own code — predictor,
monitor, the insight engine's trigger rules, the snapshot builder — into a
throwaway database (default settings), and at chosen moments saves exactly
the snapshot the insight engine would have sent to the model:

    eval/scenarios/<id>.json   {"id", "category", "cycle", "triggerType", "events",
                                "snapshot", "expected": [{"component", "condition"}]}

Categories: a component turning Degraded / Critical, recovering to Optimal,
two or more changing in the same cycle, a risk-threshold crossing without a
condition change, "steady" (nothing changing while a fault persists — the
engineer asks for a summary) and "all clear" (nothing changing, everything
Optimal — a summary). Work-order events ride along inside them (the monitor
opens and closes work orders on the same cycles as Critical / recovery). Up
to --per-category scenarios per category, spread evenly over the replay.

In this dataset one component changes at a time, and a crossing of the 50 %
risk threshold always comes with a condition change, so "two_changes" and
"threshold" come out empty; they stay in the code for other data.

`expected` is what the dashboard showed (the predicted condition), never the
dataset's true label: the question is whether the AI reports the dashboard
faithfully.

The set is frozen once committed — don't re-run it after the first official
evaluation run (it refuses to overwrite unless --force).

Run from the repo root (~3 min):  backend/.venv/bin/python eval/make_scenarios.py
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.services import db, ingest, insights, monitor, paths, repo, snapshot  # noqa: E402
from app.services import predictor as predictor_mod  # noqa: E402

OUT = ROOT / "eval" / "scenarios"


def category(changes: list[dict], kinds: set[str]) -> str | None:
    if len(changes) >= 2:
        return "two_changes"
    if changes:
        return "to_" + changes[0]["condition"].lower()  # to_degraded / to_critical / to_optimal
    if "threshold" in kinds:
        return "threshold"
    return None


def spread(items: list, k: int) -> list:
    """k items evenly spaced through the list (all of them if there are fewer)."""
    if len(items) <= k:
        return items
    return [items[round(i * (len(items) - 1) / (k - 1))] for i in range(k)] if k > 1 else items[:1]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--per-category", type=int, default=10)
    ap.add_argument("--force", action="store_true", help="overwrite an existing scenario set")
    args = ap.parse_args()
    if any(OUT.glob("*.json")) and not args.force:
        sys.exit(f"{OUT} already has scenarios — the set is frozen. Use --force to rebuild it anyway.")

    tmp = Path(tempfile.mkdtemp(prefix="closed-loop-scenarios-"))  # a throwaway database, default settings
    paths.CONFIG_DIR, paths.DB_PATH = tmp, tmp / "closed_loop.db"
    db.init_db()
    data = ingest.load()
    model = predictor_mod.Predictor()
    engine = insights.Engine()
    candidates: dict[str, list[dict]] = defaultdict(list)
    quiet = 0

    for cycle in range(data.first, data.last + 1):
        rec = data.get(cycle)
        repo.insert_reading(cycle, rec.features, rec.sensor_means, stable=rec.stable)
        for event in predictor_mod.score_pending(model):
            wos = monitor.handle(event)
            wo_events = [{"type": "work_order", "action": "opened" if w["status"] == "Open" else "closed", "workOrder": w}
                         for w in wos]
            found = engine.triggers(event) + [t for e in wo_events for t in engine.triggers(e)]
            changes = [p for p in event["predictions"] if p.get("changedFrom")]
            kinds = {k for k, _ in found}
            cat = category(changes, kinds)
            if cat is None:
                if found:
                    continue
                if all(p["condition"] == "Optimal" for p in event["predictions"]):
                    cat = "all_clear"
                else:
                    quiet += 1
                    if quiet % 10:  # every 10th quiet faulty cycle is a candidate (keeps snapshot building cheap)
                        continue
                    cat = "steady"
            lines = [text for _, text in found] or ["The engineer asked for a summary of the current state"]
            if cat == "steady":  # a summary should name every component that isn't Optimal
                expected = [{"component": p["component"], "condition": p["condition"]}
                            for p in event["predictions"] if p["condition"] != "Optimal"]
            else:
                expected = ([{"component": p["component"], "condition": p["condition"]} for p in changes]
                            or [{"component": p["component"], "condition": p["condition"]}
                                for p in event["predictions"] if cat == "threshold" and any(p["component"] in t for t in lines)])
            candidates[cat].append({
                "id": f"{cat}-{cycle:04d}",
                "category": cat,
                "cycle": cycle,
                "triggerType": (kinds.pop() if len(kinds) == 1 else "multiple") if kinds else "manual",
                "events": lines,
                "snapshot": snapshot.build(lines),
                "expected": expected,
            })
        if cycle % 250 == 0:
            print(f"  cycle {cycle}/{data.last}", flush=True)

    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.json"):
        old.unlink()
    total = 0
    for cat in sorted(candidates):
        chosen = spread(candidates[cat], args.per_category)
        for sc in chosen:
            (OUT / f"{sc['id']}.json").write_text(json.dumps(sc, indent=1, ensure_ascii=False) + "\n")
        total += len(chosen)
        print(f"{cat:12} {len(chosen):3} of {len(candidates[cat])} candidates")
    print(f"{total} scenarios → {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
