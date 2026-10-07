"""Fit the final model per component, save it, and explain it with SHAP.

Picks the best model per component from evaluate.py's cross-validation
(backend/ml/results/metrics.csv; runs the evaluation first if it's missing), refits
it on all 2,205 cycles, and writes:

    backend/ml/models/<component>.joblib   the fitted pipeline (scaler → SMOTE → classifier)
    backend/ml/models/manifest.json        what the backend needs to load and trust them
    backend/ml/results/shap_<component>.png  global SHAP importance (top 15 features)

Run (from backend/):  python -m ml.train
"""

from __future__ import annotations

import json
import platform
from datetime import datetime, timezone
from importlib.metadata import version

import joblib
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import shap  # noqa: E402

from . import evaluate, features, labels  # noqa: E402
from .pipeline import SEED, make_pipeline  # noqa: E402

MODELS_DIR = features.BACKEND / "ml" / "models"
SHAP_SAMPLE = 600  # rows used for the global SHAP summary; plenty for a stable ranking


def explain(pipe, X: pd.DataFrame) -> np.ndarray:
    """Mean |SHAP| per feature, averaged over samples and classes.

    SHAP explains the classifier on the scaled input (the scaler is the only
    transform; SMOTE only acts during fit). Feature order is unchanged, so the
    values map straight back to FEATURE_NAMES.
    """
    Xs = pipe.named_steps["scale"].transform(X)
    sample = Xs[np.random.default_rng(SEED).choice(len(Xs), size=min(SHAP_SAMPLE, len(Xs)), replace=False)]
    values = shap.TreeExplainer(pipe.named_steps["clf"])(sample).values  # (n, features, classes)
    return np.abs(values).mean(axis=(0, 2)) if values.ndim == 3 else np.abs(values).mean(axis=0)


def plot_importance(component: str, model: str, importance: pd.Series) -> None:
    top = importance.sort_values().tail(15)
    fig, ax = plt.subplots(figsize=(7, 5))
    ax.barh(top.index, top.values, color="#2a78d6")
    ax.set_xlabel("mean |SHAP value| (all classes)")
    ax.set_title(f"{component.capitalize()} — {model.replace('_', ' ')}: top 15 features")
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    fig.savefig(evaluate.RESULTS / f"shap_{component}.png", dpi=150)
    plt.close(fig)


def main() -> None:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    metrics_path = evaluate.RESULTS / "metrics.csv"
    if not metrics_path.exists():
        print("no cross-validation results yet — running ml.evaluate first")
        evaluate.main()
    metrics = pd.read_csv(metrics_path)

    X = features.load_features()
    y_all = labels.load_labels()
    labels.check_counts(y_all)

    manifest: dict = {
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "classes": list(labels.CLASSES),
        "feature_names": list(features.FEATURE_NAMES),
        "seed": SEED,
        "python": platform.python_version(),
        "libraries": {p: version(p) for p in ("scikit-learn", "imbalanced-learn", "xgboost-cpu", "shap", "numpy", "pandas")},
        "components": {},
    }

    for comp in labels.COMPONENTS:
        row = metrics[(metrics.component == comp) & metrics.best].iloc[0]
        name = row.model
        pipe = make_pipeline(name).fit(X, y_all[comp].to_numpy())
        joblib.dump(pipe, MODELS_DIR / f"{comp}.joblib")

        importance = pd.Series(explain(pipe, X), index=features.FEATURE_NAMES)
        plot_importance(comp, name, importance)
        top = importance.sort_values(ascending=False).head(5)

        manifest["components"][comp] = {
            "model": name,
            "file": f"{comp}.joblib",
            "cv_macro_f1": round(float(row.macro_f1_mean), 4),
            "cv_macro_f1_sd": round(float(row.macro_f1_sd), 4),
            "cv_macro_pr_auc": round(float(row.macro_pr_auc_mean), 4),
            "top_shap_features": [{"feature": f, "mean_abs_shap": round(float(v), 4)} for f, v in top.items()],
        }
        print(f"  {comp:<12} {name:<14} CV macro-F1 {row.macro_f1_mean:.3f}   top SHAP: {', '.join(top.index[:3])}")

    (MODELS_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"wrote {MODELS_DIR}/ and SHAP plots in {evaluate.RESULTS}/")


if __name__ == "__main__":
    main()
