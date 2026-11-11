# Synthetic data: not participant data

These files are the **synthetic validation set** for the Part C analysis pipeline (DISSERTATION.md, Sections 3.8.2 and 4.5).
They come from `eval/synthetic_study.py` (seed 20261111). The answers were drawn at random from a hand-written bank and are
identical in distribution across the two conditions, so the true effect is zero by construction. No person or agent produced any of them.

The persona and scorer names in these files are **placeholders**. They are not real participants or real scorers. Do not report
any of these numbers as user-study results.

| File | Contents |
|---|---|
| `equipment_assessment_responses.csv` | 160 scored synthetic attempts (20 profiles × 8 tasks) |
| `response_review_sheet.csv` | shuffled blind scoring sheet |
| `experiment_assignments.csv` | item → profile, task, condition (the key) |
| `reviewer_alpha.csv`, `reviewer_beta.csv` | the two synthetic scorer files |
