# Closed Loop — Technical TODO

The full technical build of the project, milestone by milestone. Only things
that get implemented in code are here — no report, admin or viva items.

Spec: [`docs/FYP_NEW_SCOPE.md`](docs/FYP_NEW_SCOPE.md) · How it works now: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · API: [`docs/API.md`](docs/API.md)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` cut

> **Critical path:** M1 → M2 → M3 → M4 → M5 → M7 → M8 → M10.
> Nothing after M4 is real until the FYP1 models score live cycles.
> Each milestone ends with **Done when**: a check you can run.

---

## Status at a glance (updated 2026-10-07)

| Area | Built | Partial | Not started |
|---|---|---|---|
| Model management (local + cloud + hardware) | ✅ all | | |
| App shell and UI layout | ✅ all | | |
| Dashboard (M5) | ✅ real data, live, redesigned (light/dark), trend chart, SHAP bars, component pages | | |
| ML pipeline (M1) | ✅ rebuilt, matches FYP1 | | |
| Data layer (M2) | ✅ schema, queries, tests | | |
| Replay + live stream (M3) | ✅ | | |
| Prediction (M4) | ✅ 4 models + SHAP, ~60 ms/cycle | | |
| Work orders (M6) | ✅ automatic open/close, manual raise/close, audit trail | | |
| AI chat | ✅ streaming, local/cloud, history cap | 🟡 grounded only in demo values | tools, actions |
| AI live insights + validator (M7–M8) | | 🟡 canned demo announcements only | ⬜ the real engine |
| Evaluation + study mode (M10–M11) | | | ⬜ |
| Tests, packaging, docs (M12) | ✅ docs for what exists; pytest (23 tests) | 🟡 Docker untested since the move | settings, fresh-clone setup |

**Milestones:** 6 of 12 complete (M1–M6). Next: M7 (insight engine — the AI speaks first).

## Feature map

Every feature of the finished system, its status now, and the milestone that delivers it.
Status: **Built** · **Partial** (exists but not on real data, or missing pieces) · **—** not started.

**Data and ML**

| Feature | Status | Milestone |
|---|---|---|
| Dataset: summary CSV committed, verified, documented (`docs/DATASET.md`) | Built | M1 |
| 68-feature extraction, shared by training and the backend | Built | M1 |
| Label mapping matching FYP1 Table 4.1 | Built (exact match) | M1 |
| Training: baseline, LR, RF, XGBoost with SMOTE in folds | Built | M1 |
| Evaluation reproducing FYP1 Table 4.2 | Built (±0.005) | M1 |
| SHAP for all four components | Built | M1 |
| Saved models + manifest | Built | M1 |

**Live pipeline**

| Feature | Status | Milestone |
|---|---|---|
| SQLite data layer (5 tables) + query module | Built | M2 |
| Cycle replay with play / pause / step / speed / seek | Built | M3 |
| Event bus + live SSE stream to the browser | Built | M3 |
| CSV ingest in the same schema (stretch) | — | M3 |
| Live scoring of each cycle with SHAP drivers | — | M4 |
| Whole-replay accuracy check | — | M4 |

**Dashboard**

| Feature | Status | Milestone |
|---|---|---|
| Fixed-viewport layout (no page scroll) | Built | — |
| Overview: KPI tiles + component cards | Partial — demo data | M5 |
| Replay controls in the sidebar | Partial — a demo cycle picker stands in | M5 |
| Risk trend chart | — | M5 |
| SHAP "why" bars per component | — | M5 |
| Sensor Feed page | Partial — demo data | M5 |
| Alert banner and toasts | Partial — demo data | M5, M6 |

**Work orders**

| Feature | Status | Milestone |
|---|---|---|
| Work Orders page | Partial — demo data | M6 |
| Automatic work order when Critical (system) | Partial — simulated by demo data | M6 |
| Manual create / close, System vs User badge, audit link | — | M6 |

**AI layer**

| Feature | Status | Milestone |
|---|---|---|
| Local models: list, download, delete, pin, auto-select | Built | — |
| Cloud models: providers, keys, test, use | Built | — |
| Hardware report and "what fits" | Built | — |
| Streaming Advisor chat (local or cloud) | Built | — |
| Chat grounded in live data (backend snapshot) | Partial — prompt built in the browser from demo data | M9 |
| Chat history cap | Built (last 10 turns) | M9 |
| Chat tools: status, history, create work order with confirm | — | M9 |
| Live insights when data changes | Partial — canned demo announcements | M7 |
| Grounding validator + verified badge | — | M8 |

**Evaluation and study**

| Feature | Status | Milestone |
|---|---|---|
| Scenario set, runner, metrics, charts (Part B) | — | M10 |
| System performance run (Part D) | — | M10 |
| Study mode: conditions, presets, task log, export (Part C) | — | M11 |

**Platform**

| Feature | Status | Milestone |
|---|---|---|
| `./closed-loop.sh dev --host` (no Docker, starts Ollama) | Built | — |
| Docker / compose | Partial — untested since the `frontend/` move | M12 |
| Docs (README, ARCHITECTURE, API, DEVELOPMENT) | Built for what exists | updated each milestone |
| Tests | Partial — pytest, 23 tests (repo, events, replay, history cap); `check_models.py` not yet converted | M12 |
| Runtime settings file + API | — | Cross-cutting |

## Start here

**Done so far:** M1 (ML pipeline, matching FYP1; trained from your summary CSV),
M2 (shared data layer), M3 (live replay + event stream), plus the chat history
cap and clean-ups.

**Next, in order:**

1. **M4 — prediction service:** score each replayed cycle with the four saved
   models; per-prediction SHAP; `changedFrom`; publish `prediction` events;
   the full-replay accuracy check. First task: list the ML packages in
   `backend/requirements.txt` (unpinned).
2. **M5 — dashboard on real data:** replay controls in the sidebar, live
   overview, trend chart, SHAP bars — the demo data disappears.
3. **M6 — monitor and work orders.**

---

## Target end state

```
closed-loop-fyp/
├── backend/ml/                 M1  features, labels, training, evaluation, saved models (inside the backend)
│   ├── features.py               the 68-feature extraction (shared with the backend)
│   ├── labels.py                 graded conditions → Optimal/Degraded/Critical
│   ├── train.py · evaluate.py · dataset_report.py
│   ├── models/<component>.joblib + manifest.json
│   └── results/                  metrics, SHAP plots, replay check
├── backend/data/               M1  hydraulic_condition_monitoring_summary.csv (committed)
├── backend/app/
│   ├── api/                      dashboard, replay, stream, work_orders, insights, study (+ existing)
│   └── services/
│       ├── db.py                 M2  SQLite connection + schema
│       ├── repo.py               M2  all SQL queries in one place
│       ├── events.py             M3  in-process pub/sub
│       ├── ingest.py · replay.py M3
│       ├── predictor.py          M4
│       ├── monitor.py · work_orders.py   M6
│       ├── snapshot.py · insights.py · prompts.py   M7
│       ├── grounding.py          M8
│       ├── tools.py              M9  chat tools
│       └── settings.py           cross-cutting runtime settings
├── eval/                       M10 scenarios, runner, analysis
├── frontend/src/
│   ├── lib/stream.ts             M5  one EventSource for live events
│   ├── features/dashboard/       M5  ReplayControls, TrendChart, ShapBars
│   ├── features/insights/        M7  InsightFeed, InsightCard
│   ├── features/work-orders/     M6
│   └── features/study/           M11
└── config/                     settings.json, model_config.json, cloud.json, closed_loop.db (last two gitignored)
```

## Technical decisions to make

Each one changes code. Decide before starting the milestone it's tagged with.

- [x] **Granularity of `tbl_SensorReading`** — **decided: one row per cycle** (the 17 sensors are shared by all components) *(M2)*
- [x] **Definition of `FailureProbability`** — **decided: `P(Degraded) + P(Critical)`**, the chance the component is not optimal *(M4; drives the KPIs, trend chart and monitor)*
- [x] **Work order on recovery** — **decided: auto-close** when the component returns to Optimal (`monitor.AUTO_CLOSE_ON_RECOVERY`, one line to turn off); user-raised orders are never auto-closed *(M6)*
- [ ] **Insight frequency** — only on events (recommended for small local models), or also a periodic summary every N cycles *(M7)*
- [ ] **Validator v1 or v2** — v1: every number must exist somewhere in the snapshot; v2: each number must match the component named in the same sentence *(M8; start with v1, add v2 if time allows)*
- [ ] **Models for evaluation** — which 2 local tags fit the GPU (e.g. `qwen3:1.7b`, `qwen3:4b`) and which 1–2 cloud models *(M10)*

---

## Already built

- [x] App shell: sidebar, pages (The Loop, Work Orders, Sensor Feed), Advisor panel; layout fixed to the viewport
- [x] Models page: Installed / Download / Cloud APIs / Hardware tabs; embedding models hidden
- [x] Ollama client: list, version, streamed chat, streamed pull, delete; URL fallback (`services/ollama_client.py`)
- [x] Cloud client: OpenAI-compatible streamed chat, `/models` test, masked keys, 0600 key file (`services/cloud.py`)
- [x] Model selection policy: auto / pinned / cloud, `resolve_now()` (`services/model_config.py`)
- [x] Advisor routing local vs cloud (`services/advisor.py`), SSE helper (`api/sse.py`)
- [x] Hardware probes: CPU, RAM, GPU/VRAM, disk, WSL, container (`services/hardware.py`)
- [x] Frontend split into routes / components / features / context / domain / lib
- [x] `./closed-loop.sh dev --host` (no Docker; starts Ollama if needed); self-check `backend/tests/check_models.py`

## Known issues in the current code

- [ ] The dashboard runs on demo data (`frontend/src/domain/demo-data.ts`) → **M5**
- [x] Chat sends the whole transcript every request → **capped early**: `advisor.trim_history()` keeps system messages + the last 10 turns (tested); M9 moves it into settings
- [ ] A model download stops when leaving the Models page or opening the Cloud/Hardware tab → move pulls server-side in **M12** (optional)
- [ ] Embedding models are detected by name/family (`embed`, `bert`) because Ollama reports no capabilities → use `/api/show` capabilities if the Ollama version provides them (**M12**, optional)
- [ ] Docker build untested since the `frontend/` move → **M12**
- [x] Old `node_modules/` and `dist/` left at the repo root from before the move → deleted
- [~] Only one test script, no test runner → pytest added with M2 (`backend/requirements-dev.txt`, 11 tests); `check_models.py` still to convert in **M12**

---

## M1 — ML pipeline in the repo · O1

**Goal:** the FYP1 feature extraction, training and evaluation run from this repo and recreate the models deterministically.

**Dataset**
- [x] **Primary data source: `backend/data/hydraulic_condition_monitoring_summary.csv`** (your dataset; committed, 1 MB): cycle + 68 features + the 5 profile columns. Verified against the raw UCI files — matches to within its 4-decimal rounding; labels identical. Documented in `docs/DATASET.md`
- [-] Raw-file download and rebuild scripts — removed after the one-off verification; the CSV is the only data the project uses
- [x] The raw layout (17 sensor matrices at 100/10/1 Hz + `profile.txt`) is documented in `docs/DATASET.md` §3–4 for the report

**Features** — `backend/ml/features.py`
- [x] `load_summary()` / `load_features()` read the CSV and check its shape and column order
- [x] Per-cycle features: for each of the 17 sensors, `mean`, `std` (population), `min`, `max` → 68 values named `<SENSOR>_<stat>` (e.g. `CP_max`); one CSV row is one cycle (the backend reads rows)
- [x] Column order fixed by a `FEATURE_NAMES` constant (2,205 × 68)
- [x] **Pure and importable**: the backend imports this module, so no notebook code, no plotting, no file writes

**Labels** — `backend/ml/labels.py` (must reproduce FYP1 Table 4.1 exactly)
- [x] Cooler: 100 → Optimal, 20 → Degraded, 3 → Critical (741 / 732 / 732)
- [x] Valve: 100 → Optimal, 90 → Degraded, 80 and 73 → Critical (1,125 / 360 / 720)
- [x] Pump: 0 → Optimal, 1 → Degraded, 2 → Critical (1,221 / 492 / 492)
- [x] Accumulator: 130 → Optimal, 115 → Degraded, 100 and 90 → Critical (599 / 399 / 1,207)
- [x] Assert the class counts — `labels.check_counts()` runs on every evaluate/train; **counts match Table 4.1 exactly**

**Training** — `backend/ml/train.py`
- [x] Pipeline per component: `StandardScaler → SMOTE (imblearn, inside the pipeline so it only fits on training folds) → classifier` — **the baseline has no SMOTE**: that reproduces FYP1's baseline row exactly (with SMOTE the accumulator stump drops to 0.282 vs FYP1's 0.419)
- [x] Models: rule-based baseline (`DecisionTreeClassifier(max_depth=1)`), `LogisticRegression`, `RandomForestClassifier`, `XGBClassifier`; fixed `random_state`
- [x] Pick the best per component by mean CV macro-F1 (FYP1: XGBoost for cooler and accumulator, RF for valve and pump); refit on all data; save with `joblib`
- [x] `backend/ml/models/manifest.json`: per component → model type, file, `FEATURE_NAMES`, class labels in order, CV macro-F1 and PR-AUC, library versions, trained-at timestamp

**Evaluation** — `backend/ml/evaluate.py`
- [x] Repeated stratified 5-fold × 3 repeats (15 folds); macro-F1, macro PR-AUC; mean ± sd (per-class recall is reported on the held-out split)
- [x] Paired t-test and Cohen's d, best model vs baseline, per component
- [x] Held-out 20 % stratified split confusion matrices (FYP1 Table 4.3)
- [x] Write `backend/ml/results/metrics.csv` and `backend/ml/results/metrics.md`

**SHAP** — finish O1
- [x] `shap.TreeExplainer` for RF/XGBoost; summary plots for **all four** components → `backend/ml/results/shap_<component>.png`
- [x] Multi-class: the global plots average |SHAP| over all classes (documented in `train.py`); per-prediction SHAP for the predicted class is M4's job

**Environment**
- [x] ML packages listed in `backend/requirements.txt` — **unpinned** (project rule: package names only); models are rebuilt after upgrades and `manifest.json` records the versions used. Uses **`xgboost-cpu`**: the default wheel is CUDA-built and fails on this WSL GPU driver
- [x] `docs/DATASET.md` + `backend/ml/dataset_report.py` (statistics and figures in `docs/img/`)

**Done when:** on a fresh clone, `cd backend && python -m ml.evaluate && python -m ml.train` recreates `backend/ml/models/` and `backend/ml/results/metrics.md`, and the macro-F1 values match FYP1 Table 4.2 within the reported sd.

✅ **Done (2026-10-07).** Every model within ±0.005 of Table 4.2; the baseline row exact; best models match FYP1 (XGBoost: cooler, accumulator; RF: valve, pump); SHAP for all four. Cooler's top SHAP feature is CP_min here vs CP_max in FYP1 (near-duplicate cooling-power features — same physical story). Trained from your summary CSV (re-run after switching from raw files: results unchanged within ±0.002). Details: `backend/ml/README.md`, `backend/ml/results/metrics.md`, `docs/DATASET.md`.

---

## M2 — Shared data layer · O2

**Goal:** one SQLite database with the FYP1 data contracts; all SQL in one module.

**Connection** — `backend/app/services/db.py`
- [x] Path `config/closed_loop.db` via `paths.py` (`DB_PATH`); add `config/closed_loop.db*` to `.gitignore`
- [x] `connect()`: `sqlite3.connect(check_same_thread=False)`, `row_factory = sqlite3.Row`, `PRAGMA journal_mode=WAL`, `PRAGMA foreign_keys=ON`
- [x] One writer at a time: a module-level `threading.Lock` around writes (SQLite allows one writer)
- [x] `init_db()`: run the schema (`CREATE TABLE IF NOT EXISTS`), seed `tbl_Equipment`, set `PRAGMA user_version = 1`
- [x] Call `init_db()` in a FastAPI `lifespan` handler in `main.py`

**Schema** (FYP1 Tables 3.1–3.3 plus the additions in FYP_NEW_SCOPE §3.4)
```sql
CREATE TABLE tbl_Equipment (
  EquipmentID      TEXT PRIMARY KEY,          -- 'COOLER-1', 'VALVE-1', 'PUMP-1', 'ACCUM-1'
  ComponentType    TEXT NOT NULL,             -- Cooler | Valve | Pump | Accumulator
  CircuitLocation  TEXT,
  CriticalityLevel TEXT,                      -- High | Medium | Low
  CommissionDate   TEXT
);
CREATE TABLE tbl_SensorReading (
  ReadingID   INTEGER PRIMARY KEY,
  CycleNumber INTEGER NOT NULL UNIQUE,        -- 1..2205
  Timestamp   TEXT NOT NULL,                  -- when it was replayed (ISO 8601)
  Features    TEXT NOT NULL,                  -- JSON: the 68 features (keeps the table narrow)
  SensorMeans TEXT NOT NULL,                  -- JSON: 17 means, for the Sensor Feed page
  StableFlag  INTEGER
);
CREATE TABLE tbl_Prediction (
  PredictionID           INTEGER PRIMARY KEY,
  ReadingID              INTEGER NOT NULL REFERENCES tbl_SensorReading,
  EquipmentID            TEXT NOT NULL REFERENCES tbl_Equipment,
  PredictedCondition     TEXT NOT NULL,       -- Optimal | Degraded | Critical
  ClassProbabilities     TEXT NOT NULL,       -- JSON {"Optimal":..,"Degraded":..,"Critical":..}
  FailureProbability     REAL NOT NULL,
  ConfidenceBand         TEXT,                -- High | Medium | Low (from max class probability)
  TopContributingFeature TEXT,
  ShapTopFeatures        TEXT,                -- JSON [{"feature","value","contribution"} ×3]
  ModelVersion           TEXT NOT NULL,
  PredictedAt            TEXT NOT NULL,
  AlertRaised            INTEGER NOT NULL DEFAULT 0,
  TrueCondition          TEXT                 -- from the CSV's condition columns; evaluation only, never shown to the AI
);
CREATE INDEX ix_pred_equipment ON tbl_Prediction(EquipmentID, PredictionID DESC);
CREATE TABLE tbl_WorkOrder (
  WorkOrderID             TEXT PRIMARY KEY,   -- 'WO-0001'
  EquipmentID             TEXT NOT NULL REFERENCES tbl_Equipment,
  TriggeredByPredictionID INTEGER REFERENCES tbl_Prediction,
  Priority                TEXT NOT NULL,      -- High | Medium | Low
  Status                  TEXT NOT NULL,      -- Open | Closed
  CreatedBy               TEXT NOT NULL,      -- 'system:monitor' | 'user'
  AssignedTo              TEXT,
  Note                    TEXT,
  CreatedAt               TEXT NOT NULL,
  ClosedAt                TEXT,
  ClosedNote              TEXT
);
CREATE TABLE tbl_Insight (
  InsightID        INTEGER PRIMARY KEY,
  CreatedAt        TEXT NOT NULL,
  CycleNumber      INTEGER,
  TriggerType      TEXT NOT NULL,             -- condition_change | work_order | threshold | summary | chat | eval
  TriggerRef       TEXT,                      -- PredictionID or WorkOrderID
  Model            TEXT NOT NULL,             -- 'qwen3:4b' | 'openai/<model>'
  Mode             TEXT NOT NULL,             -- local | cloud
  PromptVersion    TEXT NOT NULL,
  Snapshot         TEXT NOT NULL,             -- JSON the model was given (needed to re-check later)
  Text             TEXT NOT NULL,
  Grounded         INTEGER,                   -- 1 | 0 | NULL (validator off)
  ValidationDetail TEXT,                      -- JSON from grounding.validate()
  Attempts         INTEGER NOT NULL DEFAULT 1,
  LatencyMs        INTEGER,
  FirstTokenMs     INTEGER
);
```
- [-] If you chose one row per component per cycle in the decision above, add `EquipmentID` to `tbl_SensorReading` and adjust — n/a: one row per cycle was chosen

**Queries** — `backend/app/services/repo.py` (the only module that writes SQL)
- [x] `insert_reading`, `insert_predictions`, `latest_predictions()` (latest per equipment — the FYP1 Critical Asset Count rule), `trend(last_n)`, `reading(cycle)`
- [x] `create_work_order`, `close_work_order`, `open_work_order_for(equipment)`, `list_work_orders(status)`, `next_work_order_id()`
- [x] `insert_insight`, `list_insights(limit)`
- [x] `reset()` — truncate everything except `tbl_Equipment`

**Tooling**
- [x] `./closed-loop.sh reset-db` → deletes and recreates the database
- [x] `backend/tests/test_repo.py` — on a temp DB: insert a reading + 4 predictions; `latest_predictions()` returns 4 rows; work order IDs increment

**Done when:** starting the backend creates `config/closed_loop.db`, `sqlite3 config/closed_loop.db .schema` shows all five tables, and the repo tests pass.

✅ **Done (2026-10-07).** `services/db.py` (schema, WAL, write lock, seed) + `services/repo.py` (all queries) + 9 tests in `backend/tests/test_repo.py`; the live backend created the database on start. Seeded criticality is an assumption (pump, valve High; cooler, accumulator Medium) — change it in `db.EQUIPMENT` if your FYP1 tbl_Equipment differed.

---

## M3 — Ingestion, replay and live events · O2

**Goal:** recorded cycles arrive one at a time as if live, and every part of the system hears about it.

**Ingestion** — `backend/app/services/ingest.py`
- [x] At startup, `ml.features.load_summary()` → keep the 2,205-row frame in memory (~1 MB): the 68 features, the 17 `<SENSOR>_mean` columns for the Sensor Feed, the condition columns (for `TrueCondition`) and the stable flag
- [x] `ml` importable from the backend — it lives in `backend/ml/`, so a plain `from ml import features` works; **one feature implementation, not two**. If it can't load, the API still runs and `/api/replay` answers 503 with the reason
- [x] Clear error if the CSV is missing (`load_summary` already raises with the fix)
- [x] Default replay start: **cycle 1,665** (the first cycle where all four components are Optimal — see `docs/DATASET.md` §6); cycle 1 opens with the cooler Critical

**Event bus** — `backend/app/services/events.py`
- [x] `subscribe() -> asyncio.Queue`, `unsubscribe(q)`, `publish(event: dict)` (non-blocking; drop the oldest event for a slow subscriber rather than block)
- [x] Event shapes (also the SSE payloads):
  ```json
  {"type": "cycle",      "cycle": 1465, "readingId": 1465}
  {"type": "prediction", "cycle": 1465, "predictions": [{"equipment": "ACCUM-1", "condition": "Critical", "failureProbability": 0.97, "changedFrom": "Degraded"}]}
  {"type": "work_order", "action": "opened" | "closed", "workOrder": {...}}
  {"type": "insight",    "insight": {...}}
  {"type": "replay",     "state": "playing" | "paused", "cycle": 1465, "speed": 2.0}
  ```

**Replay** — `backend/app/services/replay.py`
- [x] State: `cycle` (next to emit), `playing`, `seconds_per_cycle` (default 2.0, min 0.05)
- [x] An `asyncio` task started in `lifespan`: while playing → write the reading (`repo.insert_reading`) → `publish(cycle)` → sleep
- [x] Controls: `play()`, `pause()`, `step()`, `set_speed(s)`, `seek(cycle)`, `reset()` (seek/reset also clear later predictions so the timeline stays consistent)
- [x] Start paused at cycle 1,665 (constant `DEFAULT_START`; moves into settings later); after a restart, resume after the last stored cycle
- [x] Use `CycleNumber` as the time axis everywhere; `Timestamp` is only when it was replayed

**API** — `backend/app/api/replay.py` and `backend/app/api/stream.py`
- [x] `GET /api/replay` → `{state, cycle, total: 2205, secondsPerCycle}`
- [x] `POST /api/replay/play | pause | step | reset`
- [x] `POST /api/replay/speed {secondsPerCycle}` · `POST /api/replay/seek {cycle}` (validate 1..2205)
- [x] `GET /api/stream` (SSE): subscribe → forward each event → unsubscribe on disconnect; send a `: ping` comment every 15 s so proxies keep the connection open
- [ ] Optional stretch `POST /api/ingest` — CSV with the 68 `FEATURE_NAMES` columns + `CycleNumber`; validate the header; reject anything else

**Tests**
- [x] `test_events.py`: two subscribers both receive a published event; a full queue drops the oldest, not the newest; publishing from a worker thread works
- [x] `test_replay.py`: step, seek back (erases the future) and forward, play/pause loop, auto-stop at the end, reset, invalid controls, resume point — 9 tests

**Done when:** `POST /api/replay/play` makes `SELECT COUNT(*) FROM tbl_SensorReading` grow every 2 s, and `curl -N localhost:8000/api/stream` prints a `cycle` event each time.

✅ **Done (2026-10-07)** — except the optional CSV-upload stretch. Checked live: at 0.5 s/cycle, 8 cycles streamed in 4 s through both the backend and the Vite proxy; pause stops writes; bad input → 400; reset leaves the DB empty. Documented in `docs/API.md` (Replay, Live stream) and `docs/ARCHITECTURE.md`.

---

## M4 — Prediction service · O1, O2

**Goal:** each new cycle is scored by the four FYP1 models, with SHAP explanations, in well under a second.

**Predictor** — `backend/app/services/predictor.py`
- [x] Load `backend/ml/models/manifest.json` and the four `.joblib` files once at startup; fail clearly if missing ("run `cd backend && python -m ml.train`")
- [x] Check that the manifest's `FEATURE_NAMES` equals `ml.features.FEATURE_NAMES` (catches a stale model)
- [x] `predict(features: dict) -> list[Prediction]` per component:
  - `predict_proba` → `ClassProbabilities`; `PredictedCondition` = argmax
  - `FailureProbability` as decided above
  - `ConfidenceBand`: max probability ≥ 0.9 High, ≥ 0.7 Medium, else Low
  - SHAP: one `TreeExplainer` per model, created at load; values for the predicted class; top 3 by |contribution| → `ShapTopFeatures` with the **feature's actual value** (e.g. `CP_max = 1.62`)
  - `TopContributingFeature` = the first of those
  - `ModelVersion` = manifest's trained-at + model type
- [x] The pipeline's scaler means SHAP should explain the classifier on scaled input; map back to feature names (document this)
- [x] Copy `TrueCondition` from the profile labels (evaluation only)

**Wiring**
- [x] Subscribe to `cycle` events; run `predict` in `asyncio.to_thread` (CPU-bound; don't block the event loop)
- [x] `repo.insert_predictions` → compute `changedFrom` against the previous prediction per equipment → `publish(prediction)`

**Dependencies**
- [x] Add the ML packages to `backend/requirements.txt` (unpinned) — done when `backend/ml/` moved into the backend
- [x] At load, compare the installed library versions with `manifest.json["libraries"]`; on a mismatch log a warning: "models were trained with scikit-learn X; installed Y — run `python -m ml.train`"

**Checks**
- [x] Time `predict` per cycle (target < 200 ms for all four + SHAP); log it; save the number for Part D
- [x] `backend/ml/replay_check.py`: score all 2,205 cycles through `predictor.predict` and compare with `TrueCondition` → accuracy and macro-F1 per component → `backend/ml/results/replay_check.md`. Expect it to be **higher** than CV (the final models saw all data) — note that honestly
- [x] `test_predictor.py`: a known cycle (pick one per class from the CSV's condition columns) gets the expected condition; output has 3 SHAP features with numeric values

**Done when:** with replay running, each cycle adds 4 rows to `tbl_Prediction` with SHAP drivers, and `backend/ml/results/replay_check.md` exists.


✅ **Done (2026-10-07).** `services/predictor.py` + scoring worker (catches up on unscored readings); `ml/replay_check.py`: 2,205/2,205 correct through the live path (training-set check), 59 ms/cycle; 5 new tests.
---

## M5 — Dashboard on real data · O2

**Goal:** every number on screen comes from the database and updates live; the demo data is deleted.

**API** — `backend/app/api/dashboard.py`
- [x] `GET /api/dashboard/overview` →
  ```json
  {"cycle": 1465, "total": 2205,
   "kpis": {"critical": 1, "degraded": 0, "optimal": 3, "openWorkOrders": 1, "avgFailureProbability": 0.25},
   "components": [{"equipment": "ACCUM-1", "type": "Accumulator", "condition": "Critical",
                   "failureProbability": 0.97, "confidence": "High", "changedFrom": "Degraded",
                   "shap": [{"feature": "PS2_mean", "value": 107.9, "contribution": 0.41}], "predictionId": 5860}]}
  ```
  KPIs count the **latest prediction per equipment** only (FYP1 Critical Asset Count rule)
- [x] `GET /api/dashboard/trend?last=200` → `{cycles: [...], series: {Cooler: [...], Valve: [...], Pump: [...], Accumulator: [...]}}` (failure probability)
- [x] `GET /api/dashboard/sensors?cycle=1465` → 17 sensor means with units and which components each relates to
- [x] Document all three in `docs/API.md`

**Frontend plumbing**
- [x] `frontend/src/lib/stream.ts`: one shared `EventSource('/api/stream')`, typed events, `subscribe(type, handler)`, auto-reconnect with backoff; on reconnect, refetch the overview (events may have been missed)
- [x] Replace `AppState`'s demo-driven state with: `overview`, `trend`, `replay` loaded on start and refreshed on `prediction` / `work_order` / `replay` events (throttle to at most ~4 refreshes per second at fast replay speeds)
- [x] Delete `domain/demo-data.ts`, the demo parts of `domain/maintenance.ts`, the canned `explanationFor` in `domain/advisor.ts`, and the cycle-based reducer actions that only existed for the demo

**UI**
- [x] `features/dashboard/ReplayControls.tsx` (replaces `CycleSelector` in the sidebar): play/pause, step, speed (0.5 s / 1 s / 2 s / 5 s), "cycle 1,465 / 2,205", seek input
- [x] Overview (`routes/index.tsx`): KPI tiles (Critical, Degraded, Optimal, Open work orders, Avg failure probability — the FYP1 Power BI tiles); component cards with condition pill, failure probability gauge, "changed from" marker
- [x] `features/dashboard/TrendChart.tsx`: failure probability per component over the last N cycles, Critical threshold line. Use Recharts (one dependency) or inline SVG; colours per the `dataviz` skill; works at the fixed viewport height
- [x] `features/dashboard/ShapBars.tsx`: top 3 drivers as small horizontal bars with feature name and value — on each component card or a component detail view
- [x] Sensor Feed (`routes/sensors.tsx`): real means for the current cycle; `?component=` highlighting kept
- [x] Notification banner and toasts driven by real conditions and `work_order` events
- [x] Empty state before the first cycle: "Press play to start the replay"
- [~] Keep the no-page-scroll rule (holds at 1916×994 today); re-check at 1366×768 once real data is in

**Done when:** pressing play updates the overview, trend and sensor feed with no page refresh, and `frontend/src/domain/demo-data.ts` no longer exists.


✅ **Done (2026-10-07), with a full professional redesign:** sidebar + top bar with replay controls, KPI tiles, component cards (meter, sparkline, top SHAP driver), risk-trend chart with legend/end labels/hover/table view, activity feed, component detail pages, sensors table, work-orders table, light/dark themes, container-query layouts. Demo data deleted. Recharts not used — charts are plain SVG.
---

## M6 — Monitor and work orders · O2

**Goal:** the autonomous half of the closed loop — a Critical prediction becomes a work order with no human action, with an audit trail.

**Service** — `backend/app/services/work_orders.py`
- [x] `open_for_prediction(prediction, created_by)`, `open_manual(equipment, note, created_by="user")`, `close(id, note)`, `list(status)`
- [x] Priority from the component's `CriticalityLevel` and condition (e.g. Critical + High → High)
- [x] Every create records `CreatedBy` and, if automatic, `TriggeredByPredictionID`; publishes `work_order` events

**Monitor** — `backend/app/services/monitor.py`
- [x] Subscribes to `prediction` events
- [x] Rule: condition is Critical **and** no open work order for that equipment → open one (`CreatedBy = "system:monitor"`), set `AlertRaised = 1` on the prediction
- [x] Optional hysteresis: require Critical for K consecutive cycles (`settings.monitor.confirm_cycles`, default 1) to avoid flapping
- [x] Recovery behaviour as decided above (auto-close with `ClosedNote = "condition recovered"`, or leave open)
- [x] Thresholds in `config/settings.json` (see Cross-cutting), not in code

**API** — `backend/app/api/work_orders.py`
- [x] `GET /api/work-orders?status=Open|Closed` (with the triggering prediction's cycle and condition joined in)
- [x] `POST /api/work-orders {equipment, note}` → `CreatedBy = user`
- [x] `POST /api/work-orders/{id}/close {note}`

**UI** — `features/work-orders/` + `routes/work-orders.tsx`
- [x] Real list, Open/Closed filter, close button with a note
- [x] Badge: **System** vs **User** (`CreatedBy`); link "triggered by cycle 1,465 prediction" (the audit trail)
- [x] Manual "New work order" form
- [x] Toasts on `work_order` events

**Tests** — `test_monitor.py`
- [x] Critical with no open order → exactly one order; a second Critical cycle → still one (no duplicates)
- [x] Optimal → no order; recovery behaviour matches the decision

**Done when:** replaying into a known accumulator fault opens a work order automatically, shown in the UI with a System badge and its triggering cycle, and the monitor tests pass.


✅ **Done (2026-10-07).** `services/monitor.py` + `services/work_orders.py`; POST create/close endpoints; Work orders page with New / Close, System/User badges, trigger cycle, closure notes; "Raise work order" on component pages. Live check: replaying cycles 420–567 opened 7 automatic work orders and auto-closed 4 on recovery. 8 new tests (36 total). Thresholds are constants in `monitor.py` until the settings file (Cross-cutting).
---

## M7 — Insight engine · O2

**Goal:** the AI speaks first: when the data changes meaningfully, a short explanation grounded in the dashboard's values appears in the Advisor panel.

**Snapshot** — `backend/app/services/snapshot.py`
- [ ] `build_snapshot(cycle) -> dict` — exactly what the dashboard shows, nothing else (never `TrueCondition`):
  ```json
  {"cycle": 1465, "totalCycles": 2205,
   "components": [{"name": "Accumulator", "condition": "Critical", "previousCondition": "Degraded",
                   "failureProbability": 0.97, "confidence": "High",
                   "drivers": [{"feature": "PS2_mean", "label": "Pump outlet pressure (mean)", "value": 107.9, "unit": "bar"}]}],
   "openWorkOrders": [{"id": "WO-0004", "component": "Accumulator", "createdBy": "system:monitor"}],
   "event": {"type": "condition_change", "component": "Accumulator", "from": "Degraded", "to": "Critical"}}
  ```
- [ ] `backend/ml/feature_labels.py` (or a dict in `snapshot.py`): human labels and units for the 68 features (`PS2_mean` → "Pump outlet pressure (mean)", bar) so the AI and UI say readable names
- [ ] Round values to the precision shown in the UI (the validator uses the same rounding)
- [ ] Keep it under ~1,500 tokens; include only components that changed plus a one-line status for the rest

**Prompts** — `backend/app/services/prompts.py`
- [ ] `PROMPT_VERSION = "insight-v1"` (bump on any change; stored with each insight)
- [ ] System instructions: you are the maintenance Advisor; use **only** values in the snapshot; name the component; say what changed and from/to; give the top driver with its value and unit; suggest one action; 2–4 sentences; no values that aren't in the snapshot
- [ ] User message: the snapshot JSON
- [ ] For reasoning models (Qwen3), disable thinking for insights (`/no_think` or the API option) — faster and shorter

**Engine** — `backend/app/services/insights.py`
- [ ] Subscribe to `prediction` and `work_order` events; triggers: condition change, work order opened/closed, failure probability crossing `settings.insights.threshold`
- [ ] Debounce: at most one insight in flight; coalesce events that arrive meanwhile into the next one; minimum `settings.insights.min_cycles_between` cycles apart
- [ ] Generate through `advisor.choose()` + a non-chat call: add `advisor.complete(target, messages) -> (text, first_token_ms, total_ms)` collecting the stream
- [ ] Save to `tbl_Insight` (snapshot, model, mode, prompt version, timings) → `publish(insight)`
- [ ] If no model is available (`NoModel`), publish a single "insights paused: <reason>" notice, not one per event
- [ ] `settings.insights.enabled` on/off (needed for M11's dashboard-only condition)

**API** — `backend/app/api/insights.py`
- [ ] `GET /api/insights?limit=50` · `POST /api/insights/generate` (manual "summarise now", useful for testing)

**UI** — `features/insights/`
- [ ] Advisor panel split: **Live insights** feed (newest first) above **Chat**
- [ ] `InsightCard`: text, cycle, time, model badge (local/cloud), latency; verification badge added in M8
- [ ] New insight arrives via the stream; a subtle highlight, not a modal

**Done when:** replaying into a fault produces an insight within a few seconds naming the right component, condition change and driver, saved in `tbl_Insight` with its snapshot and timings.

---

## M8 — Grounding validator · O2, O3

**Goal:** every AI statement is checked against the snapshot it came from. This is RQ3 and the core of Part B.

**Validator** — `backend/app/services/grounding.py`
- [ ] `extract_claims(text) -> list[Claim]`:
  - numbers with optional units: regex for `-?\d+(\.\d+)?\s*(bar|°C|C|%|kW|W|l/min|L/min|mm/s)?`
  - percentages vs probabilities: "97%" and "0.97" both map to 0.97 when compared with a probability
  - component names (Cooler, Valve, Pump, Accumulator, and plurals/lowercase)
  - conditions (optimal, degraded, critical)
  - cycle numbers ("cycle 1,465") and work order IDs (`WO-\d+`)
  - sentence index for each claim (for v2)
- [ ] `snapshot_values(snapshot) -> list[Value]` — every number with its unit and the component it belongs to
- [ ] `validate(text, snapshot) -> {"grounded": bool, "checked": [...], "mismatches": [...]}`
  - v1: each number must match **some** snapshot value of a compatible unit within tolerance (`abs ≤ 0.5 × last displayed digit` or ≤ 1 % relative, whichever is larger)
  - component + condition pairs ("accumulator … critical") must agree with the snapshot
  - cycle numbers and WO IDs must exist in the snapshot
  - numbers that are clearly not data (e.g. "2–4 sentences", list numbering) are ignored by rule; log what was ignored
  - v2 (optional): a number in a sentence that names one component must match **that** component's values
- [ ] Return enough detail for the UI and for Part B

**Wiring**
- [ ] In the insight engine: generate → validate → if it fails, regenerate **once** with a message listing the mismatches ("these values are not in the data: …") → validate again → save `Grounded`, `ValidationDetail`, `Attempts`
- [ ] Still failing: save with `Grounded = 0` and show it with a warning (`settings.insights.hide_unverified` decides show vs hide)
- [ ] `settings.grounding.enabled` off → skip validation, `Grounded = NULL` (needed for the with/without comparison in M10)

**UI**
- [ ] `InsightCard`: ✓ Verified / ⚠ Unverified badge; click → list of checked values with ✓/✗

**Tests** — `backend/tests/test_grounding.py`
- [ ] Correct text passes; a changed number fails; the wrong component's value in v2 fails
- [ ] Rounding within tolerance passes ("97%" vs 0.968)
- [ ] Units parsed (bar, °C, kW, l/min, mm/s, %)
- [ ] "Accumulator is optimal" fails when the snapshot says Critical
- [ ] Unknown WO ID fails; list numbering is ignored

**Done when:** the grounding tests pass and insights in the UI show their verification status with the checked values.

---

## M9 — Advisor chat with data and actions · O2

**Goal:** chat answers from live data and can create work orders on request — the FYP1 conversational path, built.

**Context**
- [ ] Chat requests no longer carry a frontend-built system prompt: `POST /api/chat {messages}` → the backend prepends the instructions + `build_snapshot(current cycle)`
- [ ] Remove `buildSystemPrompt` from `frontend/src/domain/advisor.ts`
- [ ] **Cap history**: last 10 turns (`settings.chat.max_turns`) plus the snapshot; drop older turns server-side

**Tools** — `backend/app/services/tools.py`
- [ ] Definitions (JSON schema, same for Ollama and OpenAI-compatible):
  - `get_equipment_status(component)` → latest prediction + SHAP drivers + open work order (FYP1 `FL_GetEquipmentStatus`)
  - `get_history(component, last_cycles)` → condition and failure probability over recent cycles
  - `create_work_order(component, note)` → **does not run immediately**; returns a pending action
- [ ] Tool loop in `advisor.py`: non-streamed calls while the model requests tools (max 3 rounds) → execute → append results → then stream the final answer
  - Ollama: `tools` in `/api/chat`, read `message.tool_calls`
  - OpenAI-compatible: `tools` + `tool_choice: "auto"`, read `choices[0].message.tool_calls`, reply with `role: "tool"` messages
- [ ] Models without tool support: detect once (an error or a missing `tool_calls` field) → fall back to snapshot-only chat; show "this model can't take actions" in the UI
- [ ] **Confirmation for actions**: the stream emits `{"phase": "confirm", "action": {"tool": "create_work_order", "component": "Cooler", "note": "…"}, "id": "…"}`; the UI asks; `POST /api/chat/confirm {id, approve}` runs it with `CreatedBy = "user"` and the model writes the final message

**Grounding and logging**
- [ ] Validate chat answers with `grounding.validate` against the snapshot + tool results; show the same badge
- [ ] Log each answer to `tbl_Insight` with `TriggerType = "chat"`

**UI**
- [ ] Confirmation card in the chat ("Create a work order for Cooler? [Create] [Cancel]")
- [ ] Created work orders appear on the Work Orders page with a User badge (via the stream)
- [ ] Remove the canned "Why is X flagged?" answer; keep the shortcut button, now sending a real question

**Tests**
- [ ] `test_tools.py`: each tool returns the right shape from a seeded DB; `create_work_order` without confirmation creates nothing; with confirmation creates one with `CreatedBy = user`
- [ ] History cap: 30 turns in → 10 sent to the model

**Done when:** "What's the status of the accumulator?" answers with the live values (verified badge), and "Raise a work order for it" → confirm → a User work order appears.

---

## M10 — Evaluation harness (Part B + Part D) · O3

**Goal:** reproducible measurements for RQ2 (local vs cloud) and RQ3 (validator effect), plus system latency.

**Scenarios** — `eval/scenarios/`
- [ ] `eval/make_scenarios.py`: replay through the dataset and save snapshots at chosen events → `eval/scenarios/<id>.json` (snapshot + the expected component and condition)
- [ ] 30–50 scenarios covering: each component → Degraded, → Critical; recovery to Optimal; two components changing at once; all clear; work order opened; work order closed
- [ ] Freeze the set (commit it); never change it after the first official run

**Runner** — `eval/run.py`
- [ ] Inputs: model list, `--repeats 3`, `--validator on|off|both`, prompt version
- [ ] For each model × scenario × validator setting × repeat: run the insight generation path (same code as M7/M8, called directly — not through the UI); record text, first-token ms, total ms, attempts, validation detail
- [ ] Write one row per run to `eval/results/<timestamp>.csv`; save the exact config next to it (`config.json`: models, versions, prompt version, Ollama version, hardware snapshot)
- [ ] Resume support (skip rows already done) — local runs are slow
- [ ] Unload/warm-up: one discarded warm-up call per model so load time doesn't count as latency

**Metrics** — `eval/analyse.py` (or a notebook) → `eval/results/report.md` + PNG charts
- [ ] **Grounding accuracy** = matched values / checked values (per insight, then mean ± sd per model)
- [ ] **Hallucination rate** = share of insights with ≥ 1 mismatch
- [ ] **Coverage** = names the expected component and condition (automatic)
- [ ] **Latency**: first token and total, median and p90 per model
- [ ] **Validator effect** (RQ3): accuracy and hallucination rate with vs without; regeneration rate
- [ ] **Trade-off chart** (RQ2): hallucination rate vs median latency, one point per model, local vs cloud marked
- [ ] Usefulness rating support: `eval/rate.py` exports a random sample of ~60 insights (model hidden) to CSV with rubric columns; `analyse.py` reads the filled ratings and reports mean score and inter-rater agreement (Cohen's κ)

**Part D — system performance**
- [ ] `eval/system_perf.py`: full 2,205-cycle replay at a fixed speed; log per cycle: replay → prediction stored (ms), prediction → event delivered to an SSE client (ms), insight latency when triggered; process memory every 100 cycles
- [ ] Report median/p90 per stage and the memory curve (should be flat)

**Done when:** `python eval/run.py --models qwen3:1.7b,qwen3:4b,<cloud> --validator both` produces a CSV, and `python eval/analyse.py` turns it into `report.md` with the tables and charts.

---

## M11 — Study mode (technical support for Part C) · O3

**Goal:** the app can run the within-subjects study: two conditions, fixed scenarios, logged tasks. (Recruitment, ethics and forms are outside this file.)

- [ ] `settings.study.enabled` and `?study=1` → **study mode**:
  - hides the Models page, replay controls and the model card (participants can't change the setup)
  - fixed model (from settings)
- [ ] **Condition toggle**: `dashboard_only` (Advisor panel hidden entirely, insights off) vs `dashboard_ai` (insights + chat)
- [ ] **Scenario presets**: `config/study_scenarios.json` — named states (cycle to seek to, replay paused or playing at a set speed); the researcher picks one per task
- [ ] Task runner panel (researcher-only, behind a key or a separate URL `/study/admin`): participant ID, condition, task set A/B, start/stop task, record the participant's answer and correctness
- [ ] `tbl_StudyLog` (ParticipantID, Condition, TaskSet, TaskID, StartedAt, EndedAt, DurationMs, Answer, Correct, ChatTurns, InsightsShown) and `GET /api/study/export` → CSV
- [ ] Reset between participants: one button → `reset-db` + seek to the scenario + clear the chat
- [ ] Counterbalancing helper: given a participant number, returns the condition order and task set order
- [ ] Optional: SUS and NASA-TLX as in-app forms saved to `tbl_StudyLog` (otherwise paper/Google Forms)
- [ ] Dry run: a full session end to end with yourself as the participant; export works

**Done when:** a full mock session in both conditions produces a correct CSV export with durations and answers.

---

## M12 — Hardening, testing and packaging

**Goal:** reliable for the demo, reproducible for an examiner.

**Tests**
- [ ] Add `pytest` to a `backend/requirements-dev.txt`; move `check_models.py` into pytest style; `backend/tests/` covers repo, events, replay, predictor, monitor, grounding, tools, model selection
- [ ] One end-to-end test: temp DB → seek to a known fault → step → assert prediction, work order and (with a stub model) an insight row
- [ ] A stub LLM (`services/advisor.py` test double returning fixed text) so tests never need Ollama or a key
- [ ] Frontend: `tsc -b`, `oxlint`, `vite build` clean; optional Vitest for `lib/stream.ts` and the reducer

**Robustness**
- [ ] Clear UI states for: Ollama down, no model, models missing (`backend/ml/models/`), dataset missing, cloud key rejected, SSE disconnected ("reconnecting…")
- [ ] Insight engine survives model errors (logs, publishes a notice, keeps running)
- [ ] Full 2,205-cycle replay at 0.05 s/cycle: no errors, memory flat, UI stays responsive (throttled refreshes)
- [ ] DB writes never block the event loop (writes in `to_thread` or kept tiny)

**Optional improvements from Known issues**
- [ ] Server-side model downloads (pull runs in the backend, progress via `/api/stream`) so leaving the page doesn't cancel them
- [ ] Embedding detection via `/api/show` capabilities

**Packaging**
- [ ] `./closed-loop.sh setup` also runs `ml.evaluate` + `ml.train` (from `backend/`) if `backend/ml/models/` has no `.joblib` files (no download needed — the CSV is committed)
- [ ] Dockerfile: copy `backend/ml/` and `backend/data/`, train the models during the image build; test `./closed-loop.sh start` on a machine with Docker
- [ ] `.dockerignore` (node_modules, .venv, data, Daedalus, dist)
- [ ] Keep every `requirements*.txt` unpinned (project rule); commit `pnpm-lock.yaml` changes
- [ ] Delete the old root `node_modules/` and `dist/`

**Docs**
- [ ] `docs/ARCHITECTURE.md`: new data flow (replay → predictor → bus → monitor / insights / SSE), the five tables, the AI layer
- [ ] `docs/API.md`: dashboard, replay, stream (event shapes), work orders, insights, study, chat confirm
- [ ] `docs/DEVELOPMENT.md`: ML setup, data download, `reset-db`, running tests, running the evaluation
- [ ] `README.md`: quick start from a fresh clone to a running live demo

**Done when:** a fresh clone, following only the README, reaches a running live replay with insights; `pytest` and the frontend checks pass.

---

## Cross-cutting

**Runtime settings** — `backend/app/services/settings.py` + `config/settings.json`
- [ ] One validated settings object (defaults in code, overrides from the file), read at startup and editable via `GET/PUT /api/settings`:
  ```json
  {"replay":    {"seconds_per_cycle": 2.0, "start_cycle": 1},
   "monitor":   {"confirm_cycles": 1, "auto_close_on_recovery": false},
   "insights":  {"enabled": true, "threshold": 0.7, "min_cycles_between": 5, "hide_unverified": false},
   "grounding": {"enabled": true, "version": "v1"},
   "chat":      {"max_turns": 10},
   "study":     {"enabled": false, "condition": "dashboard_ai", "model": null}}
  ```
- [ ] A small Settings section (on the Models page or its own page) for the toggles you'll flip during evaluation

**Logging**
- [ ] Python `logging` with one format; INFO for replay/monitor/insight events, DEBUG for prompts; no API keys ever logged

**Conventions** (from `docs/DEVELOPMENT.md`)
- [x] Services own logic and raise their own errors; routers only translate to HTTP (true of all current code)
- [ ] All SQL in `repo.py`; all prompts in `prompts.py`; all events through `events.py`
- [ ] Update `docs/API.md` in the same commit as any endpoint change
- [ ] Never edit `Daedalus/`; never commit `config/cloud.json`, the raw dataset (`data/raw/`), the trained models, or the database
- [ ] Never pin versions in `requirements*.txt` — rebuild version-sensitive artefacts (the models) instead

---

## Cut from scope

- [-] Live connection to physical sensors (MQTT / OPC-UA) — replay stands in
- [-] Ingesting and modelling arbitrary datasets (a same-schema CSV upload is the M3 stretch only)
- [-] Multi-user accounts, roles, login
- [-] Teams / email notifications — in-app feed instead
- [-] Remaining-useful-life regression
- [-] Fine-tuning language models
