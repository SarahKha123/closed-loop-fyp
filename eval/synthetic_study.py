"""SYNTHETIC RANDOM DATA, not a study. A pipeline test for eval/analyse_study.py and a random baseline.

Nothing here comes from a person or an agent: answers are drawn at random from a hand-written bank, identical across
conditions (a null effect by construction). IDs are SYNTH-NN, every row has synthetic=true, and
report.md opens with a warning banner. Never report these numbers as results.

    backend/.venv/bin/python eval/synthetic_study.py
        → eval/sim/runs/synthetic/: tasks.csv, scoring sheet/key, two random scorer files,
          tasks_scored.csv, kappa.json, report.md
"""

from __future__ import annotations

import csv
import json
import random

import analyse_study as an

N, SEED = 20, 20261111
TYPES = ["novice", "experienced", "engineer", "sceptic"]
NAMES = ["Aisyah Rahman", "Daniel Tan", "Priya Nair", "Hafiz Ismail", "Mei Ling Wong", "Arjun Pillai"]
# Answer bank per task: (quality, text). quality → score: good=full, partial=1 (diagnosis) / ambiguous, wrong/unsure=0.
BANK = {
    "A1": [("good", "Cooler, pump and valve are Critical. Accumulator looks fine (Optimal)."),
           ("good", "3 components critical - cooler, valve, pump"),
           ("partial", "Pump and valve are critical I think"),
           ("wrong", "Only the valve is critical, the rest are degraded"),
           ("unsure", "Not sure, the cards were all red/orange so maybe all of them?")],
    "A2": [("good", "98.3%, it's been Degraded since cycle 232"),
           ("good", "Around 98 % failure prob. Degraded from cycle 232 (was Critical before)"),
           ("partial", "98% but I couldn't find the cycle"),
           ("wrong", "96.7%, Degraded since 1445"),
           ("unsure", "very high, maybe 90-something %? don't know the cycle")],
    "A3": [("good", "WO-0001 on the valve, auto-closed at cycle 1148 because the valve went back to Optimal"),
           ("good", "Valve work order WO-0001 closed at 1148, valve recovered"),
           ("partial", "The valve work order was closed because it recovered, didn't see the cycle"),
           ("wrong", "WO-0002 for the pump, closed by the technician"),
           ("unsure", "I couldn't find the work order history")],
    "A4": [("good", "Cooler went Critical → Degraded around cycle 733. Cooling efficiency is about 28 %, still low, so check the cooler/heat exchanger"),
           ("good", "Driven by cooling efficiency (~28%). Team should inspect the heat exchanger and cooling performance"),
           ("partial", "It improved to Degraded but efficiency still low, check the cooler"),
           ("partial", "Something with temperature, check the cooler fan"),
           ("wrong", "The pump pressure dropped so check the pump"),
           ("unsure", "No idea why it changed, maybe sensor noise?")],
    "B1": [("good", "Pump and valve. Cooler and accumulator are only Degraded"),
           ("good", "pump + valve critical"),
           ("partial", "Pump, valve and cooler"),
           ("wrong", "Cooler and accumulator"),
           ("unsure", "Hard to tell from the dashboard, maybe the pump")],
    "B2": [("good", "96.7%, Degraded since cycle 1445 (improved from Critical)"),
           ("good", "about 97 % - degraded since 1445"),
           ("partial", "97% but not sure since when"),
           ("wrong", "98.3% since cycle 232"),
           ("unsure", "couldn't find the probability")],
    "B3": [("good", "WO-0001 for the valve, closed automatically at cycle 1322 since the valve recovered to Optimal"),
           ("good", "Valve WO-0001, auto closed at 1322 - recovered"),
           ("partial", "A valve work order closed, valve got better"),
           ("wrong", "Pump work order closed because it was repaired"),
           ("unsure", "Didn't see any closed work orders")],
    "B4": [("good", "Pump went Critical → Degraded at cycle 1982. Volume flow 1 is about 6.5 l/min, below normal, so check for internal leakage / reduced delivery"),
           ("good", "Flow rate is low (~6.5 l/min). Check the pump for leaks"),
           ("partial", "Flow is below normal, check the pump"),
           ("partial", "It got a bit better but still degraded, check pump"),
           ("wrong", "Cooler efficiency dropped, check the cooler"),
           ("unsure", "The AI said something about flow but I'm not sure what to check")],
}
QUALITY_W = {"good": 5, "partial": 3, "wrong": 2, "unsure": 1}
BANNER = ("> **SYNTHETIC RANDOM DATA, NOT RESULTS.** Sample answers picked at random by eval/synthetic_study.py, "
          "used to test the analysis pipeline. Do not report.\n\n")


def main() -> None:
    rng = random.Random(SEED)
    sets = json.loads(an.SCENARIOS.read_text())["taskSets"]
    run = an.RUNS / "synthetic"
    run.mkdir(parents=True, exist_ok=True)

    rows = []
    for i in range(1, N + 1):
        first, second = ("dashboard_only", "dashboard_ai") if i % 2 else ("dashboard_ai", "dashboard_only")
        for cond, set_id in ((first, "A"), (second, "B")):
            for t in sets[set_id]:
                gave_up = rng.random() < 0.07
                q, text = rng.choices(BANK[t["id"]], [QUALITY_W[q] for q, _ in BANK[t["id"]]])[0]
                ai = cond == "dashboard_ai"
                rows.append({
                    "persona": f"SYNTH-{i:02d}", "type": TYPES[(i - 1) % 4], "condition": cond, "taskSet": set_id,
                    "taskId": t["id"], "level": t["level"], "seed": SEED, "steps": 15 if gave_up else rng.randint(1, 15),
                    "advisorMessages": rng.randint(0, 6) if ai else 0, "routes": "",
                    "gaveUp": gave_up, "answer": "" if gave_up else text,
                    "insightsShown": rng.randint(1, 4) if ai else 0, "chatTurns": rng.randint(0, 4) if ai else 0,
                    "wallMs": rng.randint(25_000, 240_000), "logId": "", "error": "",
                    "at": f"2026-11-{3 + i // 4:02d}T{9 + rng.randint(0, 7):02d}:{rng.randint(0, 59):02d}:00+08:00",
                    "synthetic": "true",
                })
    an.write(run / "tasks.csv", rows)
    an.sheet(run)

    # Two random scorers: scorer B copies A ~85 % of the time; disagreements get A's score as `final`.
    sheet = an.read(run / "scoring_sheet.csv")
    hi = lambda r: 2 if r["level"] == "diagnosis" else 1  # noqa: E731
    qual = {(t, a): q for t, bank in BANK.items() for q, a in bank}
    key = {k["item"]: k["taskId"] for k in an.read(run / "scoring_key.csv")}

    def mark(r: dict, strict: bool) -> str:
        if r["score"]:
            return r["score"]
        q, h = qual[(key[r["item"]], r["answer"])], hi(r)
        if q == "good":
            return str(h)
        if q == "partial":
            return str(1 if h == 2 else (0 if strict else int(rng.random() < 0.5)))
        return "0"

    a = [r | {"score": mark(r, False)} for r in sheet]
    b = [r | {"score": x["score"] if rng.random() < 0.8 else mark(r, True)} for r, x in zip(sheet, a)]
    for x, y in zip(a, b):
        if an.correct(x["score"], x["level"]) != an.correct(y["score"], y["level"]):
            x["final"] = x["score"]
    name_a, name_b = rng.sample(NAMES, 2)
    a = [{"scorer": name_a} | r for r in a]
    b = [{"scorer": name_b} | r for r in b]
    an.write(run / "scorer_a.csv", a)
    an.write(run / "scorer_b.csv", b)
    an.score(run, run / "scorer_a.csv", run / "scorer_b.csv")

    an.report(run)
    report = run / "report.md"
    report.write_text(BANNER + report.read_text())

    with (run / "tasks_scored.csv").open(newline="") as f:
        scored = list(csv.DictReader(f))
    assert len(scored) == N * 8 and all(r["synthetic"] == "true" and r["correct"] in ("0", "1") for r in scored)
    assert report.read_text().startswith(BANNER)
    print(f"{len(scored)} synthetic attempts → {report}")


if __name__ == "__main__":
    main()
