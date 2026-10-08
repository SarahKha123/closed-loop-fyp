"""Scores each replayed cycle with the four FYP1 models, with SHAP explanations.

Loads `ml/models/<component>.joblib` + `manifest.json` once. For one cycle's
68 features it returns, per component:

- the predicted condition (Optimal / Degraded / Critical) and the class probabilities
- `failureProbability` = P(Degraded) + P(Critical): the chance it is not optimal
- a confidence band from the top class probability (≥ 0.9 High, ≥ 0.7 Medium, else Low)
- the top 3 SHAP drivers *toward the predicted class*, with the feature's real value and unit

SHAP explains the classifier on the scaled input (the pipeline's only
transform; SMOTE acts only during training), so each contribution maps back
to its feature by position. About 60 ms per cycle for all four components.

The worker at the bottom scores every stored reading that has no prediction
yet, so a burst of fast replay or a restart never leaves gaps.
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from importlib.metadata import PackageNotFoundError, version
from typing import Any

import joblib
import numpy as np
import pandas as pd
import shap
from ml import features as ml_features
from ml import labels as ml_labels

from . import db, events, repo

log = logging.getLogger(__name__)

TOP_DRIVERS = 3
MODELS_DIR = ml_features.BACKEND / "ml" / "models"


class PredictorUnavailable(RuntimeError):
    """The models are missing or don't match the code — the message says how to fix it."""


@dataclass
class _Model:
    component: str
    name: str
    pipe: Any
    explainer: Any


class Predictor:
    def __init__(self, models_dir=MODELS_DIR) -> None:
        manifest_path = models_dir / "manifest.json"
        if not manifest_path.exists():
            raise PredictorUnavailable("no trained models — run `cd backend && python -m ml.train`")
        self.manifest = json.loads(manifest_path.read_text())
        if self.manifest.get("feature_names") != list(ml_features.FEATURE_NAMES):
            raise PredictorUnavailable("models were trained on different features — run `python -m ml.train` again")
        self.classes: list[str] = self.manifest["classes"]
        self.version_warnings = self._check_versions()
        for w in self.version_warnings:
            log.warning("predictor: %s", w)

        self.models: list[_Model] = []
        for comp in ml_labels.COMPONENTS:
            info = self.manifest["components"][comp]
            path = models_dir / info["file"]
            if not path.exists():
                raise PredictorUnavailable(f"{path.name} is missing — run `cd backend && python -m ml.train`")
            pipe = joblib.load(path)
            self.models.append(_Model(comp, info["model"], pipe, shap.TreeExplainer(pipe.named_steps["clf"])))
        self.model_version = f"{self.manifest['trained_at']}"

    def _check_versions(self) -> list[str]:
        out = []
        for package, trained in self.manifest.get("libraries", {}).items():
            try:
                installed = version(package)
            except PackageNotFoundError:
                installed = None
            if installed != trained:
                out.append(f"models were trained with {package} {trained}, installed is {installed} — "
                           "re-run `python -m ml.train` if predictions look wrong")
        return out

    def info(self) -> dict[str, Any]:
        return {
            "trainedAt": self.manifest["trained_at"],
            "models": {m.component: m.name for m in self.models},
            "versionWarnings": self.version_warnings,
        }

    def predict(self, feats: dict[str, float]) -> list[dict[str, Any]]:
        """One prediction per component, in the shape `repo.insert_predictions` takes."""
        names = list(ml_features.FEATURE_NAMES)
        x = pd.DataFrame([[feats[n] for n in names]], columns=names)
        out = []
        for m in self.models:
            proba = m.pipe.predict_proba(x)[0]
            k = int(np.argmax(proba))
            values = m.explainer(m.pipe.named_steps["scale"].transform(x)).values[0]  # (features, classes)
            contrib = values[:, k] if values.ndim == 2 else values
            order = np.argsort(contrib)[::-1][:TOP_DRIVERS]
            drivers = []
            for i in order:
                feat = names[i]
                d = ml_features.describe_feature(feat)
                drivers.append({
                    "feature": feat, "label": d["label"], "unit": d["unit"],
                    "value": round(float(feats[feat]), 4), "contribution": round(float(contrib[i]), 4),
                })
            top = float(proba[k])
            out.append({
                "equipmentId": db.equipment_id(m.component),
                "condition": self.classes[k],
                "classProbabilities": {c: round(float(p), 4) for c, p in zip(self.classes, proba)},
                "failureProbability": round(float(proba[1] + proba[2]), 4),
                "confidence": "High" if top >= 0.9 else "Medium" if top >= 0.7 else "Low",
                "topFeature": drivers[0]["feature"] if drivers else None,
                "shap": drivers,
                "modelVersion": f"{m.name}@{self.model_version}",
            })
        return out


# ── the worker ───────────────────────────────────────────────────────────────


def score_pending(predictor: Predictor, true_conditions: dict[int, dict[str, str]] | None = None) -> list[dict[str, Any]]:
    """Score every stored reading without predictions, oldest first. Returns one event per scored cycle."""
    scored = []
    for reading_id, cycle in repo.unscored_readings():
        reading = repo.reading(cycle)
        if reading is None or reading["readingId"] != reading_id:
            continue  # rewound or replaced meanwhile
        rows = predictor.predict(reading["features"])
        truth = (true_conditions or {}).get(cycle, {})
        for row, comp in zip(rows, ml_labels.COMPONENTS):
            row["trueCondition"] = truth.get(comp)
        try:
            ids = repo.insert_predictions(reading_id, rows)
        except Exception:  # noqa: BLE001 — the reading was deleted by a seek between read and write
            log.info("predictor: cycle %s vanished before its predictions were stored", cycle)
            continue
        summary = []
        for pid, row in zip(ids, rows):
            prev = repo.previous_prediction(row["equipmentId"], pid)
            summary.append({
                "predictionId": pid,
                "equipmentId": row["equipmentId"],
                "component": db.EQUIPMENT[_component_of(row["equipmentId"])]["ComponentType"],
                "condition": row["condition"],
                "failureProbability": row["failureProbability"],
                "changedFrom": prev["condition"] if prev and prev["condition"] != row["condition"] else None,
            })
        scored.append({"type": "prediction", "cycle": cycle, "predictions": summary})
    return scored


def _component_of(equipment_id: str) -> str:
    return next(k for k, v in db.EQUIPMENT.items() if v["EquipmentID"] == equipment_id)


async def run_worker(predictor: Predictor, true_conditions: dict[int, dict[str, str]]) -> None:
    """Score new readings whenever the replay writes one. Runs for the life of the server."""
    q = events.subscribe()
    try:
        # Catch up on anything stored but unscored (e.g. before a restart).
        for event in await asyncio.to_thread(score_pending, predictor, true_conditions):
            events.publish(event)
        while True:
            event = await q.get()
            if event.get("type") != "cycle":
                continue
            try:
                for scored in await asyncio.to_thread(score_pending, predictor, true_conditions):
                    events.publish(scored)
            except Exception:  # noqa: BLE001 — never let one bad cycle stop scoring
                log.exception("predictor: scoring failed after cycle %s", event.get("cycle"))
    finally:
        events.unsubscribe(q)
