# C1 simulation study: frozen protocol (pre-registration)

**Status: DRAFT.** Fill in the blanks after the dry run, then commit it before the first official run
(USER_STUDY_PLAN.md, rule 2). After that, any change is reported with its reason.

The subjects are **simulated participants (LLM agents)**, not people.

| Item | Value |
|---|---|
| Frozen on (date, commit) | ____ |
| Personas | `eval/sim/personas.json`: 24 = 4 types × 6, SHA-256 recorded in `runs/official/config.json` |
| Assignment | persona `planIndex` n → `study.plan(n)`; each type meets each of the 4 orders 1–2 times |
| Tasks and reference answers | `config/study_scenarios.json` (sets A, B; 4 tasks each), answers re-checked on ____ |
| Agent (vision) model | ____ (provider/model) |
| Advisor model | ____ (must differ from the agent model; the script checks this) |
| Judge / second scorer | ____ (a person or a third model, blind to condition) |
| Temperature, seed | 0.7; seed = 1000 + planIndex |
| Limits per task | 15 steps, 6 Advisor messages; reaching the limit = gave up = incorrect |
| Viewport | 1280 × 800 |
| Allowed routes | `/`, `/components/<c>`, `/work-orders`, `/sensors` (others are sent back to `/`) |
| What the agent sees | screenshots only, plus its own past actions; never the scenarios or answers |
| System prompt | `SYSTEM` in `eval/sim_users.py` (also saved in `config.json`) |
| Runs | 1 per persona (192 attempts); noise check: S____, S____, S____ re-run 3× as `--out noise-1/2/3` |

## Scoring (fixed before seeing results)

- Lookup (A1, A2, B1, B2): exact; every component or value right; probability may differ by ±1 point. Score 1/0.
- History (A3, B3): WO ID, component and reason all right. Score 1/0.
- Diagnosis (A4, B4): 2 = correct change, correct driver and sensible check; 1 = partly right; 0 = wrong. Correct only if 2.
- Gave up / empty answer = 0.
- Two scorers on the shuffled sheet (`analyse_study.py sheet`), blind to persona and condition; Cohen's kappa
  (McHugh's thresholds); disagreements resolved by discussion.
- Over-reliance: each wrong AI-condition answer is tagged yes or no from its `steps.jsonl`.

## Analysis (fixed before seeing results)

`eval/analyse_study.py report`: accuracy per condition and level; exact McNemar on paired attempts;
Wilcoxon signed-rank on mean steps per agent with effect size r; gave-up counts; per-type behaviour.
Steps, not seconds, are the effort measure.

## Deviations

| Date | Change | Reason |
|---|---|---|
| | | |
