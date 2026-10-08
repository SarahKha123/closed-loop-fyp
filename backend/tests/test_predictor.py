"""The predictor, on the real trained models (skipped if they haven't been trained yet)."""

from __future__ import annotations

import pytest
from ml import features, labels

from app.services import repo

predictor_mod = pytest.importorskip("app.services.predictor")

if not (predictor_mod.MODELS_DIR / "cooler.joblib").exists():
    pytest.skip("models not trained — run `cd backend && python -m ml.train`", allow_module_level=True)


@pytest.fixture(scope="module")
def model():
    return predictor_mod.Predictor()


@pytest.fixture(scope="module")
def data():
    return features.load_features(), labels.load_labels()


def test_known_cycles_get_their_condition(model, data):
    X, y = data
    for comp_index, comp in enumerate(labels.COMPONENTS):
        for k, cls in enumerate(labels.CLASSES):
            cycle = int(y.index[y[comp] == k][0])
            pred = model.predict(X.loc[cycle].to_dict())[comp_index]
            assert pred["condition"] == cls, (comp, cycle)


def test_prediction_shape(model, data):
    X, _ = data
    preds = model.predict(X.loc[1665].to_dict())
    assert [p["equipmentId"] for p in preds] == ["COOLER-1", "VALVE-1", "PUMP-1", "ACCUM-1"]
    for p in preds:
        assert abs(sum(p["classProbabilities"].values()) - 1) < 1e-3
        assert p["failureProbability"] == pytest.approx(p["classProbabilities"]["Degraded"] + p["classProbabilities"]["Critical"], abs=1e-3)
        assert p["confidence"] in {"High", "Medium", "Low"}
        assert len(p["shap"]) == 3 and p["topFeature"] == p["shap"][0]["feature"]
        d = p["shap"][0]
        assert {"feature", "label", "unit", "value", "contribution"} <= set(d)
        assert d["value"] == pytest.approx(X.loc[1665, d["feature"]], abs=1e-3)


def test_score_pending_reports_condition_changes(fresh_db, model, data):
    """Cycle 732 → 733 is where the cooler goes from 3 % (Critical) to 20 % (Degraded)."""
    X, _ = data
    for c in (732, 733):
        repo.insert_reading(c, X.loc[c].to_dict(), {})
    events = predictor_mod.score_pending(model, {732: {"cooler": "Critical"}, 733: {"cooler": "Degraded"}})
    assert [e["cycle"] for e in events] == [732, 733]
    cooler_733 = events[1]["predictions"][0]
    assert cooler_733["component"] == "Cooler" and cooler_733["condition"] == "Degraded"
    assert cooler_733["changedFrom"] == "Critical"
    assert events[0]["predictions"][0]["changedFrom"] is None
    assert repo.unscored_readings() == []
    assert repo.counts()["tbl_Prediction"] == 8
    assert repo.condition_changes()[0] == {
        "cycle": 733, "component": "Cooler", "fromCondition": "Critical", "toCondition": "Degraded",
        "failureProbability": cooler_733["failureProbability"],
    }
    assert repo.condition_since("COOLER-1") == 733
