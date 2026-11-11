> **SYNTHETIC RANDOM DATA, NOT RESULTS.** Sample answers picked at random by eval/synthetic_study.py, used to test the analysis pipeline. Do not report.

# Simulation study C1: results (SIMULATED participants, LLM agents)

| Measure | Dashboard only | Dashboard + AI |
|---|---|---|
| Accuracy, all | 54 % (43/80) | 61 % (49/80) |
| Accuracy, lookup | 65 % (26/40) | 65 % (26/40) |
| Accuracy, history | 35 % (7/20) | 65 % (13/20) |
| Accuracy, diagnosis | 50 % (10/20) | 50 % (10/20) |
| Steps | median 9 (IQR 5–13) | median 8 (IQR 5–12) |
| Advisor messages | median 0 (IQR 0–0) | median 3.5 (IQR 2–5) |
| Gave up | 5 | 6 |

McNemar (exact), 80 paired attempts: only dashboard-only correct = 15, only AI correct = 21, p = 0.405
Wilcoxon signed-rank on mean steps per agent (n = 20): p = 0.279, r = 0.24

## By persona type (validity check 1.7)

| Type | Accuracy, dashboard only | Accuracy, AI | Advisor messages per AI task |
|---|---|---|---|
| engineer | 45 % (9/20) | 75 % (15/20) | 3.2 |
| experienced | 55 % (11/20) | 40 % (8/20) | 2.5 |
| novice | 45 % (9/20) | 65 % (13/20) | 3.5 |
| sceptic | 70 % (14/20) | 65 % (13/20) | 3.9 |

Inter-rater agreement: Cohen's kappa = 0.987

Over-reliance: for each wrong AI-condition answer, check its steps.jsonl and tag by hand whether the wrong content came from an AI statement.
