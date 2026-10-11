"""Export a blind sample of insights for human usefulness ratings (M10, Part B).

    backend/.venv/bin/python eval/rate.py eval/results/<name>.csv [--n 60]

Writes eval/results/<name>-ratings.csv — one row per sampled insight with what
happened (the scenario's events and the dashboard state in one line each) and
the text, but NOT the model — plus <name>-ratings-key.csv mapping each sample
to its model (don't open it until rating is done).

Two raters fill `rater_a` and `rater_b` independently, 1–5:
    5  correct, specific (component, change, driver with value) and a sensible action
    4  correct and useful, missing one of those
    3  correct but vague, or useful with a minor slip
    2  partly wrong or not actionable
    1  wrong or misleading
Then: eval/analyse.py <name>.csv --ratings eval/results/<name>-ratings.csv
Only validator-on, first-repeat insights are sampled (what an engineer would see), evenly per model.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

SCENARIOS = Path(__file__).resolve().parent / "scenarios"


def state_line(snap: dict) -> str:
    return "; ".join(f"{c['component']} {c['condition']} ({c['failureProbabilityPct']}%)" for c in snap["components"])


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("csv", type=Path)
    ap.add_argument("--n", type=int, default=60)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    df = pd.read_csv(args.csv)
    df = df[(df["error"].isna() | (df["error"] == "")) & (df["repeat"] == 1)]
    df = df[df["validator"] == "on"] if (df["validator"] == "on").any() else df
    per_model = max(1, args.n // df["model"].nunique())
    sample = (df.groupby("model", group_keys=False)
                .apply(lambda g: g.sample(min(per_model, len(g)), random_state=args.seed))
                .sample(frac=1, random_state=args.seed).reset_index(drop=True))
    sample["sample"] = [f"S{i + 1:03d}" for i in range(len(sample))]
    snaps = {p.stem: json.loads(p.read_text()) for p in SCENARIOS.glob("*.json")}
    sheet = pd.DataFrame({
        "sample": sample["sample"],
        "what_happened": [" | ".join(snaps[s]["events"]) for s in sample["scenario"]],
        "dashboard": [state_line(snaps[s]["snapshot"]) for s in sample["scenario"]],
        "insight": sample["text"],
        "rater_a": "", "rater_b": "",
    })
    base = args.csv.with_suffix("")
    sheet.to_csv(base.parent / f"{base.name}-ratings.csv", index=False)
    sample[["sample", "model", "scenario", "validator"]].to_csv(base.parent / f"{base.name}-ratings-key.csv", index=False)
    print(f"→ {base.name}-ratings.csv ({len(sheet)} insights) and {base.name}-ratings-key.csv (keep closed until rated)")


if __name__ == "__main__":
    main()
