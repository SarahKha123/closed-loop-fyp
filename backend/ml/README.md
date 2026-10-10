# ml/ — the FYP1 machine-learning pipeline

Rebuilt from the FYP1 interim report (Sections 3.1, 3.3, 4.1–4.2) so the
models the live system uses can be recreated from scratch. Reproduces Table
4.1 exactly and Table 4.2 to within ±0.005 macro-F1 (the baseline row exactly).

**Data:** `backend/data/hydraulic_condition_monitoring_summary.csv` (committed,
1 MB) — the 68 features per cycle plus the condition labels. See
[`docs/DATASET.md`](../../docs/DATASET.md) for what's in it and how it was verified.

This package lives inside `backend/` because the backend is its user: the
live replay reads the dataset through `features.py`, and the predictor (M4)
loads the models this pipeline trains.

## Run it

From `backend/` (the ML libraries are in `backend/requirements.txt`):

```bash
cd backend
.venv/bin/python -m ml.evaluate         # Part A: 15-fold CV, stats, confusion matrices (~1 min)
.venv/bin/python -m ml.train            # best model per component, refit, SHAP (~20 s)
.venv/bin/python -m ml.dataset_report   # dataset statistics + the figures in docs/img/
```

## Files

| File | What it does |
|---|---|
| `features.py` | Reads the summary CSV (`load_summary`, `load_features`); defines the 68 features (mean, population std, min, max × 17 sensors). **The backend imports this** for the live replay |
| `labels.py` | Graded values → Optimal / Degraded / Critical; asserts the FYP1 Table 4.1 class counts |
| `pipeline.py` | The model ladder and scoring: StandardScaler → SMOTE (in-fold) → classifier; the baseline stump has no SMOTE |
| `evaluate.py` | Repeated stratified 5-fold × 3 (15 folds), macro-F1, macro PR-AUC, paired t-test, Cohen's d, held-out confusion matrices |
| `train.py` | Picks the best model per component, refits on all data, saves it, computes SHAP |
| `dataset_report.py` | The statistics and figures quoted in `docs/DATASET.md` |
| `models/` | `<component>.joblib` (gitignored — rebuilt with `train`; `./closed-loop.sh setup` does it when missing) + `manifest.json` (committed; records the library versions used) |
| `results/` | `metrics.md` (the Table 4.2/4.3 equivalents), `metrics.csv`, `cv_scores.csv` (every fold), `shap_<component>.png` |

## Dependencies are unpinned

`backend/requirements.txt` lists package names only, so the project keeps
installing as libraries move on. The trained models are the part that's
version-sensitive, so they're never committed: **after upgrading any ML
library, run `python -m ml.train` again.** `models/manifest.json` records the
versions the current models were built with.

`xgboost-cpu` is used instead of `xgboost`: the default wheel is CUDA-built and
fails on older GPU drivers (e.g. under WSL). The dataset is small, so the CPU is plenty.

## Results (current run)

| Component | Best model | CV macro-F1 | Baseline macro-F1 | Top SHAP features |
|---|---|---|---|---|
| Cooler | XGBoost | 0.999 ± 0.002 | 0.555 | CP_min, CP_mean, CE_mean |
| Valve | Random Forest | 0.984 ± 0.006 | 0.460 | PS2_std, FS1_mean, PS1_std |
| Pump | Random Forest | 0.995 ± 0.003 | 0.550 | FS1_mean, SE_mean, SE_std |
| Accumulator | XGBoost | 0.990 ± 0.007 | 0.419 | FS2_mean, SE_max, TS1_min |

All improvements over the baseline: paired t-test p < 1e-23. See `results/metrics.md`.

## Notes for the report

- **Baseline:** a depth-1 decision tree on scaled features, *without* SMOTE.
  With SMOTE the accumulator baseline falls to 0.282; without it, every
  baseline matches FYP1 Table 4.2 exactly, so that's what FYP1 used.
- **Cooler SHAP:** FYP1 reported CP_max as the top feature; this run ranks
  CP_min, CP_mean and CE_mean highest. The cooling-power and cooling-efficiency
  features are near-duplicates (all |ρ| ≈ 0.94 with cooler condition), so the
  model can lean on any of them; the physical reading — cooling power drives
  cooler condition — is the same.
- **Held-out split (Table 4.3):** the same result (baseline 0 % Critical
  recall, XGBoost 100 %); per-class row counts differ by one because of the
  random split.
- **Rounded features:** training on the CSV's 4-decimal features gives the same
  results as on unrounded raw-file features (within ±0.002 macro-F1).
