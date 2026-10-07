# Closed Loop — Project TODO

Spec: [`docs/FYP_NEW_SCOPE.md`](docs/FYP_NEW_SCOPE.md) · How it works: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · API: [`docs/API.md`](docs/API.md)

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` cut from FYP2 scope

> **Critical path:** M1 → M2 → M3 → M4 → M5 → M7 → M8 → M10.
> Nothing after M4 is real until the FYP1 models are scoring live cycles.
> Weeks assume a 14-week FYP2 semester; shift them to your calendar.

---

## Decisions needed from you

Blocking or scope-shaping — these change what gets built.

- [ ] **Supervisor approval for the new title and platform** *(blocks everything; see FYP_NEW_SCOPE §0 and §3.3)*
- [ ] **Where are the FYP1 notebook, feature code and trained models?** *(blocks M1 — none of it is in this repo yet)*
- [ ] **Which cloud provider for evaluation, and the budget** *(blocks M10's cloud runs)*
- [ ] **`tbl_SensorReading`: one row per cycle, or one per component per cycle?** *(M2; recommendation: per cycle, since the 17 sensors are shared)*
- [ ] **How "failure probability" is defined** — P(Degraded)+P(Critical), or P(Critical) only *(M4; it drives the KPIs, the trend chart and the monitor threshold)*
- [ ] **When a component recovers, does its work order close automatically or wait for a person?** *(M6)*
- [ ] **User study size: N≈20, or a lower minimum agreed with the supervisor** *(M11)*
- [ ] **Which model the user study uses (local or cloud)** — decide from M10's results *(M11)*

## Path to completion

Everything the final result depends on, in order. The rest is nice-to-have.

1. **Unblock:** supervisor approval, ethics submitted, FYP1 code and models found (M0, M1).
2. **Make the data real:** database → replay → live scoring with SHAP (M2–M4).
3. **Make the UI real:** dashboard on live data, then automatic work orders (M5, M6).
4. **The new contribution:** insight engine → grounding validator (M7, M8). Chat actions (M9) can slip if needed.
5. **Measure it:** Part B AI evaluation, local vs cloud (M10). Never cut this.
6. **User study** in parallel from week 9 (M11).
7. **Package, write, rehearse** (M12, M13).

---

## Already built

What exists in this repo at the start of FYP2.

- [x] Web app shell: sidebar, pages (The Loop, Work Orders, Sensor Feed), Advisor panel; page fixed to the viewport (no page scroll)
- [x] Models page: Installed / Download / Cloud APIs / Hardware tabs; embedding models hidden
- [x] Local models through Ollama: list, download with progress, delete, pin, auto-select by RAM
- [x] Cloud models through any OpenAI-compatible API (OpenAI, Anthropic, Gemini, Groq, OpenRouter, DeepSeek, custom); keys stored gitignored with 0600 permissions, never returned
- [x] Hardware detection: CPU, RAM, GPU/VRAM, disk, WSL limits, which models fit
- [x] Streaming Advisor chat answering from the active model (local or cloud)
- [x] Repo split into `frontend/` and `backend/`; docs (README, ARCHITECTURE, API, DEVELOPMENT); backend self-check (`backend/tests/check_models.py`)
- [x] `./closed-loop.sh dev --host` runs everything without Docker and starts Ollama if needed

## Known issues (current code)

- [ ] **The dashboard is demo data** (`frontend/src/domain/demo-data.ts`) — fixed by M5
- [ ] **The chat sends the whole transcript every time.** Small local models have short context windows, so long chats will eventually fail or slow down. Cap the history (e.g. the last 10 turns) — do this in M9
- [ ] A model download stops if you leave the Models page or open the Cloud/Hardware tab
- [ ] Embedding models are detected by name (`embed`, `bert`), because Ollama doesn't report capabilities
- [ ] "Fits in RAM/VRAM" is estimated from file size; long chats need more memory on top
- [ ] The Docker build hasn't been tested since the `frontend/` move (Docker isn't installed in this WSL) — check in M12
- [ ] The repo root still has the old `node_modules/` and `dist/` from before the move — safe to delete
- [ ] The API has no authentication — fine while it's bound to localhost; keep it that way (single-user scope)

## Deferred / cut from FYP2

- [-] Live connection to physical sensors (MQTT / OPC-UA) — replay stands in; future work
- [-] Ingesting and modelling arbitrary datasets — fixed schema only (a CSV upload in the same schema is an M3 stretch goal)
- [-] Multi-user accounts, roles, login
- [-] Teams / email notifications — in-app feed instead
- [-] Remaining-useful-life regression — condition classification only
- [-] Fine-tuning language models

---

## Overview

| # | Milestone | Weeks | Objective | Output |
|---|---|---|---|---|
| M0 | Alignment and admin | 1 | — | Supervisor approval, ethics submitted |
| M1 | Bring in the ML work | 1–2 | O1 | Dataset, pipeline and trained models in the repo, reproducible |
| M2 | Shared data layer | 2–3 | O2 | SQLite with the 4 FYP1 tables + `tbl_Insight` |
| M3 | Ingestion and live replay | 3–4 | O2 | Cycles stream into the database |
| M4 | Prediction service | 4–5 | O1, O2 | Every cycle scored, with SHAP drivers |
| M5 | Dashboard on real data | 5–6 | O2 | Demo data gone; UI updates live |
| M6 | Monitor and work orders | 6–7 | O2 | Critical → work order automatically, with audit trail |
| M7 | Insight engine | 7–8 | O2 | AI speaks first when the data changes |
| M8 | Grounding validator | 8–9 | O2, O3 | Every insight checked against the data |
| M9 | Advisor chat with actions | 9–10 | O2 | Chat answers from data and can create work orders |
| M10 | Part B: AI evaluation | 10–11 | O3 | Local vs cloud results, grounding metrics |
| M11 | Part C: user study | 9–13 | O3 | N≈20 study run and analysed |
| M12 | Hardening and packaging | 12–13 | — | Tests, docs, one-command run |
| M13 | Report, demo and viva | 13–14 | — | Final report, slides, demo video |

**Critical path:** M1 → M2 → M3 → M4 → M5 → M7 → M8 → M10. If you fall
behind, protect this path and trim M9/M11 extras first (never drop
M10 — it's the main new contribution).

---

## M0 — Alignment and admin (Week 1)

**Goal:** permission to proceed on the new topic, and nothing administrative blocking later milestones.

- [ ] Meet the supervisor with [FYP_NEW_SCOPE.md](docs/FYP_NEW_SCOPE.md) §0 and §3.3 (the mapping table)
- [ ] Get written approval (email is fine) for the new title and platform change
- [ ] Ask the FYP coordinator whether a title change needs a form and a deadline
- [ ] Agree the evaluation plan (Parts A–D) with the supervisor, especially the N for Part C
- [ ] Prepare and submit the ethics application for the user study (Part C) — it has the longest lead time
- [ ] Decide which cloud provider you'll use for evaluation and get an API key (budget: Part B uses roughly 50 scenarios × 2 conditions × 1–2 models, which costs little; check the provider's pricing)
- [ ] Commit the current restructure so FYP2 starts from a clean history

**Done when:** approval in writing, ethics submitted, clean `git status`.

---

## M1 — Bring in the ML work (Weeks 1–2) · O1

**Goal:** the FYP1 pipeline and models live in this repo and can be rebuilt from scratch with one command.

- [ ] Create `ml/` at the repo root:
  - `ml/README.md` — what's here and how to rerun it
  - `ml/features.py` — the 68-feature extraction (mean, std, min, max × 17 sensors), from your FYP1 notebook
  - `ml/train.py` — trains the baseline, LR, RF and XGBoost per component, with SMOTE inside CV folds, and saves the best model per component
  - `ml/evaluate.py` — repeated stratified 5-fold × 3 seeds; writes the Table 4.2 numbers to `ml/results/`
- [ ] Add a download script for the UCI dataset (`ml/get_data.sh`, from DOI 10.24432/C5CW21) into `data/raw/`; add `data/` to `.gitignore` (don't commit the dataset)
- [ ] Add `ml/requirements.txt`: numpy, pandas, scikit-learn, xgboost, imbalanced-learn, shap, joblib
- [ ] Save trained models to `ml/models/<component>.joblib`, plus a `ml/models/manifest.json` (model type, feature list in order, class labels, training date, CV scores)
- [ ] Reproduce the FYP1 numbers — macro-F1 should match Table 4.2 within the reported standard deviation
- [ ] **Finish O1:** compute SHAP for valve, pump and accumulator (FYP1 only did cooler); save summary plots to `ml/results/` for Chapter 4
- [ ] Note in `ml/README.md` which model won per component (FYP1: XGBoost for cooler and accumulator, RF for valve and pump)

**Done when:** `python ml/train.py` on a fresh clone recreates the four model files, and `ml/results/` has the metrics table and four SHAP plots.

---

## M2 — Shared data layer (Weeks 2–3) · O2

**Goal:** the hub of the architecture: one SQLite database with the FYP1 data contracts.

- [ ] `backend/app/services/db.py` — connection helper (SQLite file at `config/closed_loop.db`, path from `paths.py`), `init_db()` that creates tables if missing, WAL mode on for concurrent reads
- [ ] Schema — implement FYP1 Tables 3.1–3.3, plus the changes in FYP_NEW_SCOPE §3.4:
  - [ ] `tbl_Equipment` (EquipmentID, ComponentType, CircuitLocation, CriticalityLevel, CommissionDate) — seed the 4 components
  - [ ] `tbl_SensorReading` (ReadingID, EquipmentID, CycleNumber, Timestamp, 68 feature columns, StableFlag)
    - Decide: one row per cycle (features are cycle-level) with EquipmentID null, or one row per component per cycle. *Recommendation:* one row per cycle — the sensors are shared — and keep EquipmentID on predictions.
  - [ ] `tbl_Prediction` (PredictionID, ReadingID, EquipmentID, PredictedCondition, FailureProbability, ConfidenceBand, TopContributingFeature, **ShapTopFeatures JSON**, ModelVersion, PredictedAt, AlertRaised)
  - [ ] `tbl_WorkOrder` (WorkOrderID, EquipmentID, TriggeredByPredictionID, Priority, Status, **CreatedBy** `system:monitor`/`user`, AssignedTo, Note, CreatedAt, ClosedAt)
  - [ ] **`tbl_Insight`** (InsightID, CreatedAt, TriggerType, TriggerRef, Model, Mode, Text, Grounded, ValidationDetail JSON, LatencyMs)
- [ ] Call `init_db()` on app startup (`backend/app/main.py`, FastAPI lifespan)
- [ ] Add `config/closed_loop.db*` to `.gitignore`
- [ ] Write the ER diagram for Chapter 3 (draw.io or Mermaid in `docs/`)
- [ ] Add a reset command: `./closed-loop.sh reset-db` (delete and recreate)

**Done when:** starting the backend creates the database with all five tables; `sqlite3 config/closed_loop.db .schema` matches the report's tables.

---

## M3 — Ingestion and live replay (Weeks 3–4) · O2

**Goal:** recorded cycles arrive one by one, as if live, and land in `tbl_SensorReading`.

- [ ] `backend/app/services/ingest.py` — reads the UCI raw files once at startup, computes the 68 features per cycle using **the same code as `ml/features.py`** (import it, don't copy it), and keeps them in memory
- [ ] `backend/app/services/replay.py` — a background task that:
  - [ ] writes the next cycle to `tbl_SensorReading` every N seconds (default 2s, configurable)
  - [ ] supports **play / pause / step / set speed / jump to cycle / reset**
  - [ ] publishes a `cycle` event on an in-process event bus after each insert
- [ ] `backend/app/services/events.py` — a tiny pub/sub (asyncio queues) that the SSE endpoint, monitor and insight engine subscribe to
- [ ] `backend/app/api/replay.py`:
  - [ ] `GET /api/replay` → `{state, cycle, total, speed}`
  - [ ] `POST /api/replay/{play|pause|step|reset}`, `POST /api/replay/speed {seconds}`, `POST /api/replay/seek {cycle}`
- [ ] `backend/app/api/stream.py` — `GET /api/stream` (SSE): forwards bus events (`cycle`, `prediction`, `work_order`, `insight`) to the browser; reuse `api/sse.py`
- [ ] Optional stretch: `POST /api/ingest` accepting a CSV in the same 68-feature schema (only if time allows — see Scope)
- [ ] Docs: add the endpoints to `docs/API.md`

**Done when:** pressing play makes `SELECT COUNT(*) FROM tbl_SensorReading` grow every 2 seconds, and `curl -N localhost:8000/api/stream` shows a `cycle` event each time.

---

## M4 — Prediction service (Weeks 4–5) · O1, O2

**Goal:** each new cycle is scored by the FYP1 models within a fraction of a second, with explanations.

- [ ] `backend/app/services/predictor.py`:
  - [ ] load the four models and `manifest.json` once at startup; fail clearly if they're missing ("run `python ml/train.py` first")
  - [ ] `predict(reading) → [prediction per component]`: condition (Optimal/Degraded/Critical), probability of the predicted class, failure probability (P(Degraded)+P(Critical) — define and document this), confidence band
  - [ ] SHAP with `TreeExplainer` (created once per model); store the top 3 features with value and contribution in `ShapTopFeatures`
- [ ] Subscribe to `cycle` events → predict → insert 4 rows into `tbl_Prediction` → publish `prediction` events
- [ ] Add ML dependencies to `backend/requirements.txt` (the same versions as `ml/requirements.txt` — pin them so the saved models load)
- [ ] Measure scoring + SHAP time per cycle (target < 200 ms); record it for Part D
- [ ] Sanity check: replay a full run and compare predictions against the `profile.txt` labels — accuracy should be close to the CV results (this is your in-system validation for Chapter 4)

**Done when:** each replayed cycle produces 4 prediction rows with SHAP drivers, and the full-replay accuracy check is written to `ml/results/replay_check.md`.

---

## M5 — Dashboard on real data (Weeks 5–6) · O2

**Goal:** the demo data is gone; every number on screen comes from the database and updates live.

Backend:
- [ ] `backend/app/api/dashboard.py`:
  - [ ] `GET /api/dashboard/overview` → current cycle, KPIs (critical / degraded / optimal counts, open work orders, average failure probability — the FYP1 Power BI tiles), latest prediction per component
  - [ ] `GET /api/dashboard/components/{type}` → current state, SHAP drivers, recent history
  - [ ] `GET /api/dashboard/trend?last=200` → failure probability per component over recent cycles (the FYP1 "risk trend" chart)
  - [ ] `GET /api/dashboard/sensors?cycle=` → sensor means for a cycle (the Sensor Feed page)
  - [ ] Implement the FYP1 **Critical Asset Count** rule: count only the *latest* prediction per equipment (Section 3.2 of the interim report)

Frontend:
- [ ] `frontend/src/lib/stream.ts` — one `EventSource` on `/api/stream`, reconnects automatically
- [ ] Replace `AppState`'s demo data with API data: load the overview on start, refresh on `prediction`/`work_order` events
- [ ] Delete `frontend/src/domain/demo-data.ts` and the demo parts of `domain/maintenance.ts` once nothing imports them
- [ ] Replace the sidebar's CycleSelector with **replay controls** (play/pause, speed, current cycle / 2,205, jump)
- [ ] Overview page: KPI tiles + component cards from real data; probability gauge instead of the fixed values
- [ ] **New: risk trend chart** (failure probability per component over cycles). Use a small chart library (e.g. Recharts) or inline SVG; read the `dataviz` guidance for colours
- [ ] Component detail: SHAP drivers shown as a small bar list ("why this prediction")
- [ ] Sensor Feed: real sensor means for the current cycle
- [ ] Keep the layout rule: the page never scrolls (fixed to the viewport)

**Done when:** with replay running, the overview changes without refreshing, and `frontend/src/domain/demo-data.ts` no longer exists (nothing on screen is hard-coded).

---

## M6 — Monitor and work orders (Weeks 6–7) · O2

**Goal:** the autonomous half of the closed loop — Critical predictions turn into work orders with no human action.

- [ ] `backend/app/services/work_orders.py` — create, list, update status, close; every create records `CreatedBy` and `TriggeredByPredictionID`
- [ ] `backend/app/services/monitor.py` — subscribes to `prediction` events:
  - [ ] when a component becomes **Critical** (and has no open work order), create a work order with `CreatedBy = "system:monitor"`
  - [ ] when a component returns to Optimal, mark its open work order "resolved — condition recovered" (or leave it for the user to close; decide and document)
  - [ ] set `tbl_Prediction.AlertRaised = true` on the triggering row
  - [ ] publish `work_order` events
  - [ ] thresholds in one place (`config/` or constants), documented
- [ ] `backend/app/api/work_orders.py` — `GET /api/work-orders?status=`, `POST /api/work-orders` (manual, `CreatedBy = user`), `POST /api/work-orders/{id}/close`
- [ ] Frontend Work Orders page: real list; filter open/closed; a "close" button; show **who created it** (system vs user) and link to the triggering prediction (the FYP1 audit trail)
- [ ] Toasts on new/closed work orders (the existing `ToastStack`) from stream events

**Done when:** replaying past a known accumulator fault (e.g. the cycles where accumulator pressure drops to 90 bar) opens a work order automatically, which appears in the UI with `CreatedBy = system:monitor` and the prediction it came from.

---

## M7 — Insight engine (Weeks 7–8) · O2

**Goal:** the AI speaks first. When the data changes meaningfully, a short, grounded explanation appears in the Advisor panel.

- [ ] `backend/app/services/snapshot.py` — `build_snapshot(cycle)` → the JSON the AI sees (FYP_NEW_SCOPE §3.5.2): cycle, each component's condition, probability and change since the previous cycle, SHAP top drivers with the sensor values, open work orders. **Keep it small** (local models have short context)
- [ ] `backend/app/services/insights.py`:
  - [ ] subscribe to `prediction` and `work_order` events; detect triggers (condition change, new/closed work order, probability crossing a threshold)
  - [ ] **debounce**: at most one insight per N cycles, and never two in flight at once (important for slow local models)
  - [ ] prompt = fixed instructions + snapshot; instructions say "use only values from the snapshot, name the component, say what changed, give the top driver, suggest one action"
  - [ ] call the active model through the existing `services/advisor.py` (local or cloud), collect the full text, time it
  - [ ] save to `tbl_Insight` (model, mode, latency) and publish an `insight` event
- [ ] Keep prompts in one file (`backend/app/services/prompts.py`) so Part B can version them
- [ ] Frontend: the Advisor panel gets two sections — **Live insights** (newest first, with time, cycle and model badge) and **Chat**. Insights arrive from the stream
- [ ] Settings toggle: insights on/off (needed for the user study's dashboard-only condition)

**Done when:** replaying into a fault produces an insight within a few seconds that names the right component, condition and driver, and it's saved in `tbl_Insight`.

---

## M8 — Grounding validator (Weeks 8–9) · O2, O3

**Goal:** every insight is checked against the snapshot it was generated from; this is RQ3 and the core of Part B.

- [ ] `backend/app/services/grounding.py`:
  - [ ] extract claims from the text: numbers (with units: bar, °C, %, kW, l/min, mm/s), component names, condition words (optimal/degraded/critical), cycle numbers, work order IDs
  - [ ] match each against the snapshot: numbers within tolerance (e.g. ±1% or the displayed rounding), names and conditions exactly
  - [ ] return `{grounded: bool, checked: [...], mismatches: [...]}`
- [ ] Wire it into the insight engine: validate → if it fails, regenerate once with the mismatches listed in the prompt → validate again → save with `Grounded` and `ValidationDetail`
- [ ] A setting to switch the validator off (needed for the with/without comparison in Part B)
- [ ] UI: a small "verified" tick or "unverified" warning on each insight; clicking shows which values were checked
- [ ] **Tests** (`backend/tests/check_grounding.py`): correct text passes; a wrong number fails; a wrong component fails; rounding within tolerance passes; units are parsed

**Done when:** the grounding test script passes, and insights in the UI show their verification status.

---

## M9 — Advisor chat with actions (Weeks 9–10) · O2

**Goal:** the conversational path from FYP1 §3.2.2, built: ask about equipment, and create a work order by asking.

- [ ] Chat requests include the current snapshot (replace the frontend-built system prompt in `domain/advisor.ts` with the backend snapshot)
- [ ] Tool calling in `services/advisor.py`, for both Ollama and OpenAI-compatible APIs:
  - [ ] `get_equipment_status(component)` → latest prediction + SHAP (FYP1's FL_GetEquipmentStatus)
  - [ ] `get_history(component, cycles)` → recent trend
  - [ ] `create_work_order(component, note)` → `CreatedBy = "user"` (FYP1's Copilot-invoked FL_CreateWorkOrder)
  - [ ] **confirmation step:** the UI asks "Create work order for Cooler?" before the tool runs
- [ ] Check which local models support tool calling (Qwen3 does; record which don't and fall back to no tools for them)
- [ ] Run chat answers through the grounding validator too, and show the same verified/unverified badge
- [ ] Log chat turns to `tbl_Insight` with `TriggerType = chat` (so Part B can include them)

**Done when:** "What's the status of the accumulator?" answers with the right live values, and "Raise a work order for it" (after confirming) creates one with `CreatedBy = user` that appears on the Work Orders page.

---

## M10 — Part B: AI evaluation (Weeks 10–11) · O3

**Goal:** the numbers for RQ2 and RQ3: grounding accuracy, hallucination rate, latency, local vs cloud, validator effect.

- [ ] `eval/scenarios/` — 30–50 snapshots saved as JSON from real replayed cycles, covering:
  - [ ] each component Optimal → Degraded and → Critical
  - [ ] recovery back to Optimal
  - [ ] two components failing at once
  - [ ] all clear
  - [ ] a work order opened and closed
- [ ] `eval/run.py` — for each model × scenario × {validator on, off}: generate an insight, record text, latency (first token and total), validator result; write `eval/results/<date>.csv`
- [ ] Models: at least **2 local** (e.g. `qwen3:1.7b`, `qwen3:4b` — what fits your 4 GB GPU) and **1–2 cloud**
- [ ] Repeat each run 3× (LLM output varies) and report mean ± sd
- [ ] Manual usefulness rating: a 1–5 rubric (correct component, clear cause, sensible action, concise); two raters on a random sample of ~60; report agreement
- [ ] `eval/analyse.py` (or a notebook) → tables and charts for Chapter 4:
  - [ ] grounding accuracy and hallucination rate per model
  - [ ] latency per model
  - [ ] validator on vs off (RQ3)
  - [ ] quality vs latency trade-off chart (RQ2)
- [ ] Part D: end-to-end latency (cycle arrives → dashboard updated → insight shown) over a full replay; check memory stays stable

**Done when:** `eval/results/` has the CSVs, and Chapter 4.5's tables and charts are generated from them.

---

## M11 — Part C: user study (Weeks 9–13) · O3

**Goal:** RQ1 — does the AI layer help real users compared with the dashboard alone?

Preparation (start in week 9, in parallel with M9–M10):
- [ ] Ethics approval received (from M0)
- [ ] **Study mode** in the app: a fixed scenario (replay jumps to set cycles), dashboard-only vs dashboard+AI toggle, no model switching visible
- [ ] Task list (8–10 tasks), graded by complexity, each with one correct answer:
  - simple lookup: "Which component is critical right now?"
  - comparison: "Which component's risk rose most over the last 50 cycles?"
  - diagnosis: "Why did the cooler degrade? Which sensor shows it?"
  - action: "Raise a work order for the component that needs it"
- [ ] Two equivalent task sets (A/B) so participants don't repeat the same questions across conditions
- [ ] Optional: in-app task timer and answer capture → `tbl_StudyLog` / CSV (otherwise time with a stopwatch)
- [ ] Forms: consent, demographics (background in maintenance/analytics?), SUS ×2, NASA-TLX ×2, one trust question, a short open comment
- [ ] Pilot with 2–3 people; fix unclear tasks

Run:
- [ ] Recruit N≈20 (minimum 12 if recruitment is hard — agree with the supervisor)
- [ ] Counterbalance: half do dashboard-only first, half dashboard+AI first
- [ ] Use the same model for every participant (decide local or cloud from M10's results; record which)

Analysis:
- [ ] Per measure (accuracy, time, SUS, NASA-TLX): paired t-test or Wilcoxon signed-rank (check normality), effect size
- [ ] Break down by task complexity (does the AI help more on simple tasks, as Figliè et al. found?)
- [ ] Charts and tables for Chapter 4.6

**Done when:** the data is collected, analysed, and Chapter 4.6 is written.

---

## M12 — Hardening and packaging (Weeks 12–13)

**Goal:** it runs reliably for the demo and for an examiner.

- [ ] Tests: extend `backend/tests/` — predictor (known cycle → known class), monitor (Critical → one work order, no duplicates), grounding, replay controls
- [ ] Frontend: type-check, lint and build pass (`pnpm --dir frontend exec tsc -b`, `lint`, `build`)
- [ ] Error states: Ollama down, no model, models missing, cloud key wrong — each shows a clear message, never a blank screen
- [ ] Full 2,205-cycle replay at fast speed without errors or memory growth
- [ ] `./closed-loop.sh setup` also sets up `ml/` and downloads the data; a fresh clone → working demo in documented steps
- [ ] Docker: the image includes the trained models; test `./closed-loop.sh start` on a machine with Docker
- [ ] Update `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/DEVELOPMENT.md` and `README.md` for everything added
- [ ] Remove anything left over from the demo-data era

**Done when:** a fresh clone, following the README, reaches a running live demo, and all checks pass.

---

## M13 — Report, demo and viva (Weeks 13–14)

- [ ] Rewrite the report following [FYP_NEW_SCOPE.md](docs/FYP_NEW_SCOPE.md), chapter by chapter
- [ ] Fix the FYP1 report issues listed in FYP_NEW_SCOPE ("Fixes to carry over")
- [ ] Figures:
  - [ ] architecture diagram (new 3.2)
  - [ ] FYP1 → FYP2 mapping table (3.3)
  - [ ] ER diagram (3.4)
  - [ ] insight pipeline: trigger → snapshot → LLM → validator → feed (3.5)
  - [ ] dashboard screenshots (4.3), insight feed and chat (4.4)
  - [ ] Part B and Part C charts (4.5, 4.6)
- [ ] Verify every reference (especially the new ones on grounding and local LLMs)
- [ ] Demo script (5 minutes): start replay → accumulator fault → work order opens automatically → insight explains it (verified badge) → ask the Advisor a question → raise a work order by chat → switch local ↔ cloud on the Models page
- [ ] Record a backup demo video in case the live demo fails
- [ ] Slides: problem → what changed and why → architecture → demo → results (A, B, C) → limitations → future work
- [ ] Practice the likely viva questions:
  - Why change platform after FYP1? (licensing risk, agent now built, local deployment)
  - How do you know the AI isn't making things up? (snapshot + validator + Part B numbers)
  - Isn't replay cheating? (it's real recorded data; live sensors are explicitly out of scope)
  - Why would a plant use a local model? (data privacy; Part B shows the cost)
  - What happens when the model is wrong? (validator, verified badge, the human closes work orders)

**Done when:** report submitted, demo rehearsed, video recorded.

---

## Weekly habit

- [ ] Commit at least daily with clear messages
- [ ] Keep `docs/` in sync with what you build (API changes → `docs/API.md` in the same commit)
- [ ] Short weekly update to the supervisor: done / next / blocked
- [ ] Note decisions and their reasons as you go (e.g. one row per cycle in `tbl_SensorReading`) — Chapter 3 is much easier to write from notes

## Never

- [ ] Edit anything in `Daedalus/` (reference only)
- [ ] Commit API keys (`config/cloud.json` is gitignored — keep it that way)
- [ ] Commit the dataset or large model files without deciding to (use `ml/get_data.sh`; consider Git LFS for models if needed)
