"""`/api/dashboard` — everything the dashboard pages show, from the shared data layer.

    GET /api/dashboard/overview          replay + predictor status, KPIs, latest state of each component
    GET /api/dashboard/trend?last=200    failure probability and condition per component over recent cycles
    GET /api/dashboard/events?limit=30   recent condition changes (the activity feed)
    GET /api/dashboard/sensors?cycle=    the 17 sensors for one cycle (default: latest): stats, units, related components

KPIs count only the *latest* prediction per component — the FYP1 "Critical
Asset Count" rule — never the history.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from ml import features as ml_features
from ml import labels as ml_labels

from ..services import db, repo, settings

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

_COMPONENT_KEY = {v["ComponentType"]: k for k, v in db.EQUIPMENT.items()}  # 'Cooler' → 'cooler'
_RECORDED_UNIT = {"cooler": "%", "valve": "%", "pump": "leakage", "accumulator": "bar"}


@lru_cache(maxsize=1)
def _recorded() -> tuple[Any, Any]:
    """The dataset's own condition per cycle: graded values and their classes (what the models were trained on)."""
    return ml_labels.load_profile(), ml_labels.load_labels()


def _recorded_for(key: str, cycle: int) -> dict[str, Any] | None:
    try:
        profile, classes = _recorded()
        return {
            "condition": ml_labels.CLASSES[int(classes.at[cycle, key])],
            "value": int(profile.at[cycle, key]),
            "unit": _RECORDED_UNIT[key],
        }
    except (KeyError, OSError, ValueError):
        return None


def _measured(key: str, means: dict[str, float]) -> list[dict[str, Any]]:
    """The first three sensors associated with this component, as measured this cycle (raw means, no model)."""
    out = []
    for s in ml_features.COMPONENT_SENSORS[key][:3]:
        if s in means:
            name, _, unit, _ = ml_features.SENSOR_INFO[s]
            out.append({"sensor": s, "name": name, "unit": unit, "value": means[s]})
    return out


def _status(request: Request) -> dict[str, Any]:
    replay = getattr(request.app.state, "replay", None)
    predictor = getattr(request.app.state, "predictor", None)
    return {
        "replay": replay.state() if replay else None,
        "replayError": getattr(request.app.state, "dataset_error", None),
        "predictor": predictor.info() if predictor else None,
        "predictorError": getattr(request.app.state, "predictor_error", None),
    }


@router.get("/overview")
def overview(request: Request) -> dict[str, Any]:
    latest = repo.latest_predictions()
    open_orders = repo.list_work_orders("Open")
    reading = repo.reading(latest[0]["cycle"]) if latest else None
    means = (reading or {}).get("sensorMeans") or {}
    # The recorded answer would give the study task away, so participants never see it.
    show_truth = not settings.get()["study"]["enabled"]
    components = []
    for p in latest:
        prev = repo.previous_prediction(p["equipmentId"], p["predictionId"])
        key = _COMPONENT_KEY[p["component"]]
        components.append({
            **p,
            "key": key,
            "measured": _measured(key, means),
            "recorded": _recorded_for(key, p["cycle"]) if show_truth else None,
            "changedFrom": prev["condition"] if prev and prev["condition"] != p["condition"] else None,
            "previousFailureProbability": prev["failureProbability"] if prev else None,
            "since": repo.condition_since(p["equipmentId"]),
            "openWorkOrder": next((w["id"] for w in open_orders if w["equipmentId"] == p["equipmentId"]), None),
        })
    count = lambda c: sum(1 for p in latest if p["condition"] == c)  # noqa: E731
    return {
        **_status(request),
        "cycle": latest[0]["cycle"] if latest else None,
        "stable": reading["stable"] if reading else None,
        "kpis": {
            "critical": count("Critical"),
            "degraded": count("Degraded"),
            "optimal": count("Optimal"),
            "monitored": len(db.EQUIPMENT),
            "openWorkOrders": len(open_orders),
            "avgFailureProbability": round(sum(p["failureProbability"] for p in latest) / len(latest), 4) if latest else None,
        },
        "components": components,
    }


@router.get("/trend")
def trend(last: int = Query(200, ge=10, le=2205)) -> dict[str, Any]:
    rows = repo.trend(last)
    cycles = sorted({r["cycle"] for r in rows})
    index = {c: i for i, c in enumerate(cycles)}
    series: dict[str, dict[str, list[Any]]] = {}
    for comp in (v["ComponentType"] for v in db.EQUIPMENT.values()):
        series[comp] = {"failureProbability": [None] * len(cycles), "condition": [None] * len(cycles)}
    for r in rows:
        i = index[r["cycle"]]
        series[r["component"]]["failureProbability"][i] = r["failureProbability"]
        series[r["component"]]["condition"][i] = r["condition"]
    return {"cycles": cycles, "series": series}


@router.get("/events")
def condition_events(limit: int = Query(30, ge=1, le=200)) -> dict[str, Any]:
    return {"events": repo.condition_changes(limit)}


@router.get("/sensors")
def sensors(cycle: int | None = Query(None, ge=1, le=2205)) -> dict[str, Any]:
    cycle = cycle or repo.latest_cycle()
    reading = repo.reading(cycle) if cycle else None
    if reading is None:
        raise HTTPException(status_code=404, detail="no reading for that cycle yet — start the replay")
    feats = reading["features"]
    related: dict[str, list[str]] = {}
    for comp, sensor_list in ml_features.COMPONENT_SENSORS.items():
        for s in sensor_list:
            related.setdefault(s, []).append(db.EQUIPMENT[comp]["ComponentType"])  # type: ignore[arg-type]
    out = []
    for s in ml_features.SENSORS:
        name, quantity, unit, rate = ml_features.SENSOR_INFO[s]
        out.append({
            "sensor": s, "name": name, "quantity": quantity, "unit": unit, "rateHz": rate,
            "mean": feats[f"{s}_mean"], "std": feats[f"{s}_std"], "min": feats[f"{s}_min"], "max": feats[f"{s}_max"],
            "relatedComponents": related.get(s, []),
        })
    return {"cycle": cycle, "stable": reading["stable"], "sensors": out}
