"""Scoring and analysis for simulation study C1 (USER_STUDY_PLAN.md 1.5–1.6). SIMULATED participants.

    python eval/analyse_study.py sheet  --run official
        → runs/official/scoring_sheet.csv (shuffled, no persona or condition: give a copy to each scorer)
          and scoring_key.csv (item → persona/condition; scorers must not see it)
    python eval/analyse_study.py score  --run official --scorers me.csv mate.csv
        → Cohen's kappa between the two scorers, and runs/official/tasks_scored.csv
    python eval/analyse_study.py report --run official
        → runs/official/report.md (Table 4.8 material)

Scorers fill `score`: 1/0 for lookup and history tasks, 0/1/2 for diagnosis (correct only if 2).
Disagreements: discuss, then put the agreed value in the first scorer's `final` column.
"""

from __future__ import annotations

import argparse
import csv
import json
import random
import statistics as st
from math import sqrt
from pathlib import Path

from scipy.stats import binomtest, norm, wilcoxon

ROOT = Path(__file__).resolve().parents[1]
RUNS = ROOT / "eval" / "sim" / "runs"
SCENARIOS = ROOT / "config" / "study_scenarios.json"


def read(path: Path) -> list[dict]:
    with path.open(newline="") as f:
        return list(csv.DictReader(f))


def write(path: Path, rows: list[dict]) -> None:
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)


def correct(score: str, level: str) -> int:
    return int(int(score) >= (2 if level == "diagnosis" else 1))


def kappa(a: list[int], b: list[int]) -> float:
    n = len(a)
    po = sum(x == y for x, y in zip(a, b)) / n
    pa, pb = sum(a) / n, sum(b) / n
    pe = pa * pb + (1 - pa) * (1 - pb)
    return 1.0 if pe == 1 else (po - pe) / (1 - pe)


def mcnemar(pairs: list[tuple[int, int]]) -> tuple[int, int, float]:
    """Exact McNemar: (only dashboard-only right, only AI right, p)."""
    b = sum(1 for d, a in pairs if d and not a)
    c = sum(1 for d, a in pairs if a and not d)
    return b, c, (binomtest(b, b + c).pvalue if b + c else 1.0)


def sheet(run: Path) -> None:
    ref = {t["id"]: t for ts in json.loads(SCENARIOS.read_text())["taskSets"].values() for t in ts}
    rows = [r for r in read(run / "tasks.csv") if not r["error"]]
    random.Random(7).shuffle(rows)
    items, key = [], []
    for i, r in enumerate(rows, 1):
        t = ref[r["taskId"]]
        items.append({"item": f"I{i:03d}", "level": t["level"], "question": t["prompt"],
                      "reference": t["answer"], "answer": r["answer"] or "(no answer: gave up)",
                      "score": "0" if not r["answer"] else "", "final": ""})
        key.append({"item": f"I{i:03d}", "persona": r["persona"], "taskId": r["taskId"], "condition": r["condition"]})
    write(run / "scoring_sheet.csv", items)
    write(run / "scoring_key.csv", key)
    print(f"{len(items)} items → {run / 'scoring_sheet.csv'}")


def score(run: Path, s1: Path, s2: Path) -> None:
    one, two = {r["item"]: r for r in read(s1)}, {r["item"]: r for r in read(s2)}
    missing = [i for i in one if not one[i]["score"] or not two.get(i, {}).get("score")]
    if missing:
        raise SystemExit(f"unscored items: {', '.join(missing[:10])}…")
    items = sorted(one)
    a = [correct(one[i]["score"], one[i]["level"]) for i in items]
    b = [correct(two[i]["score"], two[i]["level"]) for i in items]
    k = kappa(a, b)
    disagree = [i for i, x, y in zip(items, a, b) if x != y and not one[i]["final"]]
    print(f"Cohen's kappa = {k:.3f} over {len(items)} items; {len(disagree)} unresolved disagreements")
    if disagree:
        raise SystemExit(f"resolve these in {s1.name}'s `final` column first: {', '.join(disagree)}")
    final = {i: correct(one[i]["final"] or one[i]["score"], one[i]["level"]) for i in items}
    by_attempt = {(k_["persona"], k_["taskId"]): final[k_["item"]] for k_ in read(run / "scoring_key.csv")}
    rows = [r | {"correct": by_attempt.get((r["persona"], r["taskId"]), "")}
            for r in read(run / "tasks.csv") if not r["error"]]
    write(run / "tasks_scored.csv", rows)
    (run / "kappa.json").write_text(json.dumps({"kappa": round(k, 3), "items": len(items)}, indent=2))


def report(run: Path) -> str:
    rows = read(run / "tasks_scored.csv")
    conds = ("dashboard_only", "dashboard_ai")
    pct = lambda xs: f"{100 * sum(xs) / len(xs):.0f} % ({sum(xs)}/{len(xs)})" if xs else "–"  # noqa: E731
    out = ["# Simulation study C1: results (SIMULATED participants, LLM agents)", "",
           "| Measure | Dashboard only | Dashboard + AI |", "|---|---|---|"]
    for level in ("all", "lookup", "history", "diagnosis"):
        cells = [pct([int(r["correct"]) for r in rows if r["condition"] == c and level in ("all", r["level"])])
                 for c in conds]
        out.append(f"| Accuracy, {level} | {cells[0]} | {cells[1]} |")
    for c_name, field in (("Steps", "steps"), ("Advisor messages", "advisorMessages")):
        cells = []
        for c in conds:
            v = [int(r[field]) for r in rows if r["condition"] == c]
            q = st.quantiles(v, n=4) if len(v) > 1 else [v[0], v[0], v[0]]
            cells.append(f"median {st.median(v):g} (IQR {q[0]:g}–{q[2]:g})")
        out.append(f"| {c_name} | {cells[0]} | {cells[1]} |")
    for c_name, test in (("Gave up", lambda r: r["gaveUp"] == "True"),):
        out.append(f"| {c_name} | " + " | ".join(str(sum(test(r) for r in rows if r["condition"] == c)) for c in conds) + " |")

    # Paired tests: each agent did task k (1–4) once per condition (A_k in one, B_k in the other).
    cell = {(r["persona"], r["condition"], r["taskId"][1]): r for r in rows}
    personas = sorted({r["persona"] for r in rows})
    pairs = [(int(cell[p, conds[0], k]["correct"]), int(cell[p, conds[1], k]["correct"]))
             for p in personas for k in "1234" if (p, conds[0], k) in cell and (p, conds[1], k) in cell]
    b, c, p_mc = mcnemar(pairs)
    steps = [(st.mean(int(r["steps"]) for r in rows if r["persona"] == p and r["condition"] == conds[0]),
              st.mean(int(r["steps"]) for r in rows if r["persona"] == p and r["condition"] == conds[1]))
             for p in personas]
    diffs = [d - a for d, a in steps if d != a]
    out += ["", f"McNemar (exact), {len(pairs)} paired attempts: only dashboard-only correct = {b}, "
            f"only AI correct = {c}, p = {p_mc:.3f}"]
    if len(diffs) >= 2:
        p_w = wilcoxon([d for d, _ in steps], [a for _, a in steps]).pvalue
        r_eff = norm.isf(p_w / 2) / sqrt(len(diffs))
        out.append(f"Wilcoxon signed-rank on mean steps per agent (n = {len(personas)}): p = {p_w:.3f}, r = {r_eff:.2f}")

    out += ["", "## By persona type (validity check 1.7)", "",
            "| Type | Accuracy, dashboard only | Accuracy, AI | Advisor messages per AI task |", "|---|---|---|---|"]
    for t in sorted({r["type"] for r in rows}):
        rt = [r for r in rows if r["type"] == t]
        ai = [int(r["advisorMessages"]) for r in rt if r["condition"] == conds[1]]
        out.append(f"| {t} | {pct([int(r['correct']) for r in rt if r['condition'] == conds[0]])} | "
                   f"{pct([int(r['correct']) for r in rt if r['condition'] == conds[1]])} | "
                   f"{st.mean(ai):.1f} |" if ai else f"| {t} | – | – | – |")
    k = run / "kappa.json"
    if k.exists():
        out += ["", f"Inter-rater agreement: Cohen's kappa = {json.loads(k.read_text())['kappa']}"]
    out += ["", "Over-reliance: for each wrong AI-condition answer, check its steps.jsonl and tag by hand "
            "whether the wrong content came from an AI statement."]
    text = "\n".join(out) + "\n"
    (run / "report.md").write_text(text)
    return text


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=["sheet", "score", "report"])
    ap.add_argument("--run", required=True)
    ap.add_argument("--scorers", nargs=2, type=Path)
    args = ap.parse_args()
    run = RUNS / args.run
    if args.command == "sheet":
        sheet(run)
    elif args.command == "score":
        if not args.scorers:
            raise SystemExit("--scorers first.csv second.csv")
        score(run, *args.scorers)
    else:
        print(report(run))


if __name__ == "__main__":
    main()
