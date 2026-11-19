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
| Agent (vision) model | `groq/qwen/qwen3.8-27b`, run with `--no-reasoning` (`reasoning_effort: "none"`) |
| Advisor model | `groq/openai/gpt-oss-120b` (differs from the agent model; the script checks this) |
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
| 2026-11-12 | Agent runs with Qwen reasoning off (`--no-reasoning`) | Dry run `dry-2`: with reasoning on, each step cost ~20k tokens and exhausted the free-tier daily cap (200k) in ~9 steps; off, ~3k per step |
| 2026-11-12 | Study mode pins `monitor.autoCloseOnRecovery` on at every task start (`services/study.py`) | Dry run `dry-3`, task A3: the setting defaults to off, so WO-0001 never closed and the history tasks (A3, B3), whose reference answers say "closed automatically", were unanswerable. Affects real participants too |
| 2026-11-12 | Starting a study task makes the researcher the insight driver, as Play does (`api/study.py`) | Dry run `dry-3`: no live insights were generated in the AI condition (0 insights in B1–B3) because nobody had pressed a replay control since the server started; whether participants saw insights would have depended on that |
| 2026-11-12 | New agent action `click_text` (click a visible label) | Dry run `dry-3`, task A3: the agent's x/y clicks missed by 50–350 px (11 missed clicks on the History tab), so content behind tabs was unreachable; that measures the model's pointing, not the interface |
| 2026-11-12 | `dry-2` and `dry-3` are discarded; the dry run is repeated as `dry-4` | They ran before the changes above |
