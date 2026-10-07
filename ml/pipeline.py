"""The model ladder and how it's scored — shared by evaluate.py and train.py.

FYP1 interim report, Sections 3.1 and 4.2: StandardScaler → SMOTE → classifier,
with SMOTE inside the pipeline so it is only ever fitted on a training fold;
scored by repeated stratified 5-fold cross-validation over 3 repeats (15 folds).

The rule-based baseline gets no SMOTE: a fixed threshold rule isn't resampled.
That reproduces FYP1 Table 4.2's baseline row exactly (0.555 / 0.460 / 0.550 /
0.419); with SMOTE the accumulator stump drops to 0.282.
"""

from __future__ import annotations

from typing import Any

import numpy as np
from imblearn.over_sampling import SMOTE
from imblearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score
from sklearn.model_selection import RepeatedStratifiedKFold
from sklearn.preprocessing import StandardScaler, label_binarize
from sklearn.tree import DecisionTreeClassifier
from xgboost import XGBClassifier

SEED = 42
N_SPLITS, N_REPEATS = 5, 3

# Rule-based baseline first; the rest is the model ladder.
MODELS: tuple[str, ...] = ("baseline", "logreg", "random_forest", "xgboost")


def make_classifier(name: str) -> Any:
    if name == "baseline":
        # A single-split decision stump: the FYP1 rule-based baseline.
        return DecisionTreeClassifier(max_depth=1, random_state=SEED)
    if name == "logreg":
        return LogisticRegression(max_iter=5000, random_state=SEED)
    if name == "random_forest":
        return RandomForestClassifier(n_estimators=300, random_state=SEED, n_jobs=1)
    if name == "xgboost":
        return XGBClassifier(
            n_estimators=300, max_depth=6, learning_rate=0.1,
            tree_method="hist", eval_metric="mlogloss", random_state=SEED, n_jobs=1,
            # CPU on purpose: the dataset is tiny, and the CUDA build fails on older drivers (e.g. under WSL).
            device="cpu",
        )
    raise ValueError(f"unknown model {name!r}")


def make_pipeline(name: str) -> Pipeline:
    steps: list[tuple[str, Any]] = [("scale", StandardScaler())]
    if name != "baseline":
        steps.append(("smote", SMOTE(random_state=SEED)))
    steps.append(("clf", make_classifier(name)))
    return Pipeline(steps)


def cv_splitter() -> RepeatedStratifiedKFold:
    return RepeatedStratifiedKFold(n_splits=N_SPLITS, n_repeats=N_REPEATS, random_state=SEED)


def macro_pr_auc(estimator: Any, X: Any, y: np.ndarray) -> float:
    """Macro-averaged PR-AUC (average precision) over the three classes, one-vs-rest."""
    proba = estimator.predict_proba(X)
    return float(average_precision_score(label_binarize(y, classes=[0, 1, 2]), proba, average="macro"))


SCORING = {"macro_f1": "f1_macro", "macro_pr_auc": macro_pr_auc}
