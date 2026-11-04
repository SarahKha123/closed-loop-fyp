# Architecture

## The big picture

```
 Browser ──────────────► frontend (built: served by the backend on :8000 · dev: Vite on :5173)
    │                         │  /api/* same origin (start) or proxied by Vite (dev)
    │                         ▼
    │                    backend (FastAPI :8000, one process)
    │                      ├── api/        HTTP only: validate, call a service, shape the response
    │                      └── services/   all the logic; each module owns one thing
    │                              │                    │
    │                              ▼                    ▼
    │                       Ollama :11434        cloud provider APIs
    │                       (local models)       (OpenAI-compatible /chat/completions)
    │
    └── config/   model_config.json   which model the Advisor uses (committed)
                  study_scenarios.json the user-study task sets A and B (committed)
                  settings.json       runtime toggles (insights, grounding, monitor, chat, study)
                  cloud.json          cloud API keys (gitignored, 0600)
                  closed_loop.db      SQLite: readings, predictions, work orders, insights, study log (gitignored)
                  ollama/             Ollama installed by the dashboard, no sudo (gitignored; + ollama.pid, ollama.log)
```

Everything runs directly on the machine — no containers. `./closed-loop.sh
start` builds the frontend once and the backend serves it from
`frontend/dist` (one port, one origin, no Node process at run time — the
lightest way to run it). `./closed-loop.sh dev` runs Vite with hot reload
next to a reloading backend, and Vite proxies `/api` (`frontend/vite.config.ts`);
it waits for `GET /api/health` before starting Vite, so the first page load
never hits a backend that is still loading the models. Both start `ollama
serve` if Ollama is installed but not running, and Ctrl-C stops everything
they started (the backend, and an Ollama the script or the dashboard started).

### The closed loop

```
backend/data/hydraulic_condition_monitoring_summary.csv
   │ loaded once at startup (services/ingest.py, via backend/ml/features.py)
   ▼
replay (services/replay.py) ── every N s ──► tbl_SensorReading
   │ publishes "cycle"
   ▼
event bus (services/events.py) ──────────────► /api/stream (SSE) ──► browser (every event below)
   │
   └──► predictor (services/predictor.py: 4 models + SHAP, ~60 ms/cycle) ──► tbl_Prediction
          │ publishes "prediction"
          ├──► monitor (services/monitor.py)
          │      Critical (× confirmCycles) → open a work order (system:monitor, linked to the prediction)
          │      Optimal again              → close it (only with autoCloseOnRecovery, off by default)
          │      └──► services/work_orders.py ──► tbl_WorkOrder, publishes "work_order"
          │                 ▲
          │   technician closes it: finding · action · matched the prediction?
          │                 └──► tbl_WorkOrderOutcome (+ a copy of the prediction) ──► confirmation rate
          │
          ├──► insight engine (services/insights.py) ◄── also "work_order" events
          │
          └ "work_order" opened ──► notifier (services/notify.py) ──► email to NOTIFY_EMAIL_TO (Gmail SMTP)
                 trigger: condition change · risk threshold crossed · work order opened/closed
                 snapshot.build() → prompts → advisor.complete() → grounding.validate()
                 → one rewrite if it fails → tbl_Insight, publishes "insight"
```

The Advisor chat closes the other half of the loop: the engineer asks, the
model reads the same snapshot (and, with tools, live status and history), and
can propose a work order that the engineer confirms.

---

## Backend (`backend/app/`)

Two layers, with dependencies pointing one way: `api → services`, and
services never import from `api`.

| File | Responsibility |
|---|---|
| `main.py` | Creates the app, starts the live-pipeline tasks in `lifespan`, mounts routers, serves `frontend/dist` when `CLOSED_LOOP_STATIC_DIR` is set |
| **api/** | |
| `api/health.py` | `GET /api/health` liveness check |
| `api/models.py` | Local models: list, active, select, catalogue, pull, delete; the Ollama runtime: status, install, start |
| `api/cloud.py` | Cloud provider settings: list, save, clear, test |
| `api/hardware.py` | Hardware report for the Hardware tab |
| `api/replay.py` | Replay controls |
| `api/stream.py` | `GET /api/stream` — all live events to the browser (SSE) |
| `api/dashboard.py` | Overview (KPIs + latest per component), trend, activity, sensors |
| `api/work_orders.py` | List, raise by hand, close |
| `api/insights.py` | List insights, one with its snapshot, "summarise now" |
| `api/chat.py` | The Advisor chat (SSE) and `POST /api/chat/confirm` for proposed work orders |
| `api/settings.py` | `GET/PUT /api/settings` (publishes a `settings` event) |
| `api/study.py` | Study mode: task sets, counterbalanced plan, condition, start/end a task, log, CSV export |
| `api/sse.py` | `sse_response()` — the single way anything is streamed |
| **services/ — the live pipeline** | |
| `services/paths.py` | Where config and the database live (repo `config/`, or `CLOSED_LOOP_CONFIG_DIR`) |
| `services/db.py` | SQLite schema (6 tables), connections, the write lock |
| `services/repo.py` | Every SQL query, in one place |
| `services/ingest.py` | The dataset in memory, one record per cycle |
| `services/replay.py` | Plays the cycles as a live feed; play / pause / step / speed / seek / reset |
| `services/events.py` | In-process publish/subscribe between the live-pipeline parts |
| `services/predictor.py` | Loads the four trained models; scores each new reading with SHAP drivers; the scoring worker |
| `services/monitor.py` | Reacts to each prediction: opens a work order on Critical (and closes it on recovery, if `autoCloseOnRecovery` is on) |
| `services/work_orders.py` | Opening and closing work orders, with who raised them and why |
| `services/notify.py` | Emails each new work order to a fixed list (Gmail SMTP, stdlib `smtplib`); muted by a setting and in study mode |
| `services/settings.py` | Runtime settings: defaults in code, overrides in `config/settings.json`, validated |
| `services/study.py` | The user study: conditions, task presets (reset + step the replay), counterbalancing, the task clock, CSV export |
| **services/ — the AI layer** | |
| `services/advisor.py` | The only code that knows local vs cloud: picks the model, streams, `complete()`, tool rounds |
| `services/snapshot.py` | What the dashboard shows right now, as the AI sees it (never the true labels) |
| `services/prompts.py` | Every prompt, each with a version stored next to what it produced |
| `services/insights.py` | The insight engine: triggers, coalescing, cooldown, generate → check → retry → store |
| `services/grounding.py` | The grounding check: every number, WO ID and condition must be in what the model was given |
| `services/tools.py` | Chat tools (status, history, propose a work order), the tool loop, pending confirmations |
| `services/model_config.py` | The model choice: read/write the file, and the policy that resolves it |
| `services/ollama_client.py` | Everything that talks to Ollama (URL fallback, low-resource request options) |
| `services/ollama_runtime.py` | Ollama itself: is it installed / running, install it into `config/ollama/` without sudo (Linux), start it |
| `services/cloud.py` | Cloud providers: stored settings, key masking, test, streamed and tool-calling chat |
| `services/catalogue.py` | The short list of suggested local models |
| `services/hardware.py` | CPU / RAM / GPU / disk probes, each independently guarded |
| `services/jsonfile.py` | Safe read + atomic write for the config files |

The ML code lives next to it in `backend/ml/` (features, labels, training,
evaluation, SHAP) and is imported by the predictor, so training and live
scoring share one feature implementation. See [`backend/ml/README.md`](../backend/ml/README.md).

### Data (SQLite, `config/closed_loop.db`)

| Table | One row per | Written by |
|---|---|---|
| `tbl_Equipment` | component (seeded: COOLER-1, VALVE-1, PUMP-1, ACCUM-1) | `db.init_db()` |
| `tbl_SensorReading` | replayed cycle: 68 features + 17 sensor means (JSON) | replay |
| `tbl_Prediction` | component per cycle: condition, class probabilities, failure probability, SHAP top 3, `TrueCondition` (evaluation only) | predictor |
| `tbl_WorkOrder` | work order: who raised it (`system:monitor` / `user`), triggering prediction, open/closed | work_orders |
| `tbl_Insight` | AI text: trigger, model, mode, prompt version, the exact snapshot, grounding result, attempts, latency | insight engine, chat |
| `tbl_WorkOrderOutcome` | closed work order: what the technician found, the action, whether it matched the prediction, and a copy of that prediction (cycle, condition, failure probability, top driver). Survives replay resets | work_orders |
| `tbl_StudyLog` | study task: participant, condition, task set and id, start/end, duration, answer, correct, chat turns, insights shown. Survives replay resets | study |
| `tbl_User`, `tbl_Session`, `tbl_AuthEvent` | accounts (scrypt password hashes, or a Google `sub`), sessions (only the token's SHA-256, with an expiry) and the sign-in audit log | auth, google_auth |

Seeking the replay back deletes later readings (predictions cascade) and
insights, so the timeline stays consistent. A replay reset empties every
table except `tbl_Equipment` and `tbl_StudyLog`; `./closed-loop.sh reset-db`
refuses to delete a database that holds study log rows unless given `--force`.

### Model selection

`config/model_config.json` stores a **policy**, not just a name, so the same
file means something on another machine:

| mode | meaning |
|---|---|
| `auto` | the largest installed chat model that fits in 60% of RAM (embedding models are skipped) |
| `pinned` | exactly this Ollama tag; unresolved if it isn't installed |
| `cloud` | the configured model of this cloud provider; unresolved until it has a key and a model |

`model_config.resolve(installed, hardware)` is the pure policy (easy to test
with fake inputs). `model_config.resolve_now()` gathers the live inputs and
calls it. `/api/models/active`, `/api/models/select`, the chat and the
insight engine all go through it, so they can never disagree about what
"auto" means.

### Flow: an insight

```
"prediction" / "work_order" event
   │ insights.Engine.triggers(): condition change? threshold crossed? work order?
   ▼
pending triggers ── one generation at a time; triggers arriving meanwhile (or during the
   │                cooldown after it) are merged into the next one
   ▼
snapshot.build(events)      the dashboard's current state + one line per trigger
prompts.insight_messages()  insight-v1; `/no_think` for Qwen3
advisor.complete()          full text, first-token and total time
grounding.validate()        fails → one retry listing the mismatches → validate again
   ▼
repo.insert_insight() ──► publish "insight"   (no model → one "insight_notice", not one per event)
```

### Flow: a chat message

```
AdvisorPanel ── POST /api/chat {messages: user/assistant turns}
                   │ needs a user message last, else 400
                   ▼
          advisor.choose()            nothing available → 503 with the reason
          snapshot.build()            the live state, in the system prompt (chat-v2)
          trim_history(chat.maxTurns)
                   │
     ┌─────────────┴──────────────── chat.tools on, and the model takes tools?
     ▼ yes                                        ▼ no (setting off, or the model refused once)
tools.converse(): up to 3 non-streamed rounds     advisor.stream_reply(): streamed tokens
  get_equipment_status / get_history → results back to the model
  create_work_order → "confirm" event, nothing created
  → the answer as one "token"
     └─────────────┬──────────────────────────────┘
                   ▼
          grounding.validate(answer, snapshot + tool results) → tbl_Insight (TriggerType "chat")
          "done" {model, tools, grounded, validation}

Confirm card [Create] ── POST /api/chat/confirm {id, approve} ──► work_orders.open_manual(created_by="user")
                                                                  → "work_order" event → toast, Work Orders page
```

Tool calls are hidden behind `advisor.tool_round()`: Ollama returns
arguments as objects and matches results by tool name, OpenAI-compatible APIs
return JSON strings and match by call id. A model that refuses tools (Ollama:
"does not support tools") is remembered for the rest of the run and answered
from the snapshot only; `done.tools = false` makes the UI say so.

### The grounding check (v1)

Every number in the text must equal a number in what the model was given, to
the precision the text writes it ("97%" matches 96.8; "97.5%" does not); every
`WO-…` ID must be in it; a sentence naming exactly one component may only call
it a condition it is in, changed from, or a tool reported for it. List
numbering, sensor codes (PS2) and small bare counts (≤ 10) are ignored. Not
checked (v2, optional): that a number belongs to the component its sentence
names.

### Flow: a study task

```
/study/admin  ── POST /api/study/tasks/start {participant, condition, taskSet, taskId}
                   │ a task already running → 400
                   ▼
          study.set_condition()        study.condition + insights on/off → "settings" event
                                       (participant's screen shows or hides the Advisor)
          publish "study" task_loading (participant's chat clears)
          replay.reset(from) → step() … until `to`   (the same replay, predictor, monitor and
                                                      insight engine as normal: history included)
          wait until cycle `to` is scored
          repo.start_study_task() → publish "study" task_started   ← the clock starts here
                   ▼
           participant answers (on paper / aloud); the researcher types it in
                   ▼
/study/admin  ── POST /api/study/tasks/end {answer, correct}
          repo.end_study_task(): duration, chat turns and insights shown (counted from tbl_Insight,
          which the task's reset emptied) → publish "study" task_ended
```

Study mode (`study.enabled`) only changes what the participant's shell
offers: no Models page, no replay controls, no model card, no first-run model
dialog; in the `dashboard_ai` condition the Advisor is pinned open, in
`dashboard_only` it isn't rendered at all.

### Flow: first run without a model

`NoModelDialog` opens when `/api/models/active` can't resolve a model and the
mode isn't cloud. It reads `GET /api/models/runtime` and offers the next step:
install Ollama (`POST /api/models/runtime/install`, streamed progress — the
same release archive as Ollama's own installer, unpacked into
`config/ollama/`), start it (`/runtime/start`), or go to **Models → Download**
to pull a model; or switch to a cloud API instead. Dismissed per browser
session. `./closed-loop.sh setup` offers the same install from the terminal.

### Request flow: downloading a model

`POST /api/models/pull {tag}` streams Ollama's pull progress, normalised to
`{status, percent, done}` frames. Closing the request (the Cancel button)
stops it, and Ollama resumes from the layers it already has next time.

### Secrets

Cloud keys are written to `config/cloud.json`, which is gitignored and saved
with owner-only permissions (0600). No response ever contains a key, only
`key_hint` (the last four characters). Cloud models receive the Advisor's
prompt, including the current readings, and the Cloud APIs tab says so.

---

## Running on limited hardware

The design target is a 4-core, 8 GB laptop with no GPU (measured: `qwen3:1.7b`
on CPU writes a verified insight in ~30 s, answers a tool-using chat question
in ~12 s). What keeps it within that:

| Where | What | Knob |
|---|---|---|
| Ollama, per request | context window, reply length, how long the model stays loaded, CPU threads | `OLLAMA_CONTEXT_LENGTH`, `OLLAMA_NUM_PREDICT`, `OLLAMA_KEEP_ALIVE`, `OLLAMA_NUM_THREAD` (`.env`; sent by `ollama_client._chat_options()`) |
| Ollama server (when the script starts it) | one request at a time, one model in RAM, smaller KV cache | `OLLAMA_NUM_PARALLEL=1`, `OLLAMA_MAX_LOADED_MODELS=1`, `OLLAMA_FLASH_ATTENTION=1`, `OLLAMA_KV_CACHE_TYPE=q8_0` |
| Predictor | models fixed to `n_jobs=1`; BLAS/OpenMP threads capped | `OMP_NUM_THREADS` etc. (`.env`) |
| Insight engine | one generation at a time, triggers merged, then a rest | `insights.cooldownSeconds` (Settings tab) |
| Chat | history capped; tools optional (off = streamed, one model call) | `chat.maxTurns`, `chat.tools` (Settings tab) |
| Prompts and tool results | rounded values, run-length history instead of rows, Qwen3 thinking off for insights | — |
| Running | `start` serves the built UI from the backend: no Vite / Node process | `./closed-loop.sh start` |

A cloud model removes the language model from the machine entirely.

---

## Frontend (`frontend/src/`)

A monitoring layout: a left sidebar (pages + each component's live
condition), a top bar (live status, replay controls, theme, Advisor toggle),
the page column, and the Advisor on the right (live insights above the chat).
Light and dark themes share one set of design tokens; charts follow the
data-viz method (validated categorical colours per component in fixed order,
reserved status colours with icon + label, legends, table views, hover
tooltips).

```
main.tsx              router setup + mount
index.css             design tokens for light + dark (surfaces, ink, status, chart series)
routes/               one file per page (TanStack file-based routing)
  __root.tsx            the shell: providers, Sidebar, TopBar, page column (@container), Advisor, toasts
  index.tsx             "/" — KPIs, the four component cards, risk trend, activity feed
  components.$component.tsx  "/components/cooler" … — state, class probabilities, SHAP drivers,
                        related sensors, risk history, condition changes, raise a work order
  work-orders.tsx       "/work-orders" — the maintenance queue (System / User badges, trigger cycle)
  sensors.tsx           "/sensors" — all 17 channels for the current cycle (?component= highlights)
  models.tsx            "/models" — AI models and settings (?tab=download|cloud|hardware|settings)
  study.admin.tsx       "/study/admin" — the researcher's study console (not in the nav; open in a second window)
components/
  ui/                   primitives: Card, Button, ConditionBadge, Meter, EmptyState, Icon
  charts/               LineChart (multi-series, crosshair tooltip, legend, end labels), Sparkline
  shell/                Sidebar, TopBar (replay controls), AdvisorPanel (insights feed, chat,
                        grounding badges, work-order confirmation cards), ModelCard, ToastStack
                        (bottom-right of the page column, never over the Advisor), ProfileMenu
                        (name, role, theme), NoModelDialog (first-run Ollama / model setup)
  PageHeader.tsx
features/
  dashboard/            KpiTiles, ComponentCard, TrendPanel (chart + table), ActivityFeed, StatusBanner, NewWorkOrder
  models/               ActiveModelBanner, LocalModelsTab, CloudTab, HardwareTab, SettingsTab, types.ts
context/              React state shared across pages
  LiveContext.tsx       replay state, overview, trend, activity, insights, runtime settings; refreshed from /api/stream; toasts; replay controls
  ChatContext.tsx       the Advisor conversation, tool lookups, proposed actions (respond); panel open/closed
  ModelsContext.tsx     installed models + the active model
lib/
  api.ts                typed calls + response types
  stream.ts             the one shared EventSource to /api/stream
  http.ts               request() for JSON, streamEvents() for SSE POSTs
  format.ts, status.ts, theme.ts, ui.ts
```

**Rules of thumb that keep it understandable:**

- **Routes are thin.** A route file picks data from context and lays it out;
  anything bigger lives in `features/<page>/`.
- **The backend is the source of truth.** No dashboard numbers are computed
  or stored in the browser, and no prompts are built there; `LiveContext`
  mirrors `/api/dashboard/*` and `/api/insights` and re-fetches when the
  stream says something changed (throttled).
- **One place per concern.** JSON calls go through `lib/api.ts` → `lib/http.ts`,
  live events through `lib/stream.ts`, and every model choice is decided by
  the backend's `resolve_now()`.
- **Tokens, not colours.** Components use `bg-surface`, `text-ink-muted`,
  `text-critical-text`…, never hex, so dark mode needs no per-component work.
- **The layout is fixed to the viewport.** The page never scrolls; a tall
  view scrolls inside its own column. Page grids use container queries, so
  they reflow when the Advisor narrows the column.

### State

- `LiveContext` holds what the dashboard shows. It loads overview, trend,
  activity and insights on start, then refreshes on `prediction`, `replay`
  and `work_order` events and after a reconnect; `insight` events are
  prepended to the feed, `insight_notice` shows "insights paused". Condition
  changes and work orders become toasts (worse = warning/critical, better =
  good), at most four at a time, each gone after 5 s. It also holds the
  runtime settings (updated by `settings` events), which is how the shell
  knows it is in study mode and which condition is running.
- `ChatContext` keeps the transcript and sends only the user/assistant turns;
  the backend adds the snapshot. A `study`/`task_loading` event clears it. It records each answer's grounding verdict,
  the tools the model used, and proposed work orders with their state
  (pending → created / cancelled).
- `ModelsContext` caches `/api/models` and `/api/models/active` so the
  sidebar card and the AI models page agree.
- Per-browser conveniences live in `localStorage` / `sessionStorage`, never
  on the server: the theme (`lib/theme.ts`), the role label (`ProfileMenu`)
  and the dismissed first-run dialog.
- `AuthContext` holds who is signed in. The root route shows `AuthScreen`
  (password sign-in / sign-up, and "Continue with Google" when configured)
  until someone is, and only then mounts the dashboard and its providers.

---

## Design decisions

- **KISS over frameworks.** No state library, no component library (Tailwind
  classes), no ORM (SQLite through one `repo.py`), no containers, no class
  hierarchies for one implementation.
- **The OpenAI-compatible API is the only cloud protocol.** Every listed
  provider speaks it (Anthropic and Gemini through their compatibility
  endpoints), so one client covers all of them, and adding a provider is one
  line (see DEVELOPMENT.md).
- **The Advisor is the only code that knows about both local and cloud.**
  `services/advisor.py` dispatches (streaming, complete, tool rounds); the two
  clients each know only their own backend.
- **The AI only sees what the operator sees.** The snapshot is built from
  the same queries as the dashboard and never includes `TrueCondition`; it is
  stored with each insight, so any text can be re-checked later.
- **Actions need a person.** The monitor may open work orders by rule; the
  language model may only *propose* one, and nothing is created until the
  engineer confirms.
- **Every prompt is versioned.** `prompts.INSIGHT_VERSION` / `CHAT_VERSION`
  are stored with every output, so the evaluation can tell prompt changes apart.
- **Fail soft, explain why.** Listing models never 500s because Ollama is
  down; it returns an empty list plus the reason. Without trained models or
  the dataset the API still runs and says what to do. The insight engine
  survives model errors and says once that it's paused.
- **Daedalus is a reference only.** Several modules are scaled-down versions
  of Daedalus patterns (noted in their docstrings), but nothing imports from,
  runs, or modifies `Daedalus/`.

## Known limits (deliberate)

- One model download at a time, and it stops if you leave the Models page.
- "Fits in RAM" is estimated from file size; long conversations need extra
  memory on top.
- Embedding models are recognised by name/family (`embed`, `bert`), because
  Ollama's model list has no capability field.
- Proposed work orders are held in memory: a backend restart forgets
  unanswered proposals.
- The in-app Ollama install is Linux only (x86-64 / arm64); on macOS and
  Windows install Ollama's own app.
- The profile is per browser, not an account: it isn't sent to the backend
  or written to any log.
- With tools on, chat answers arrive whole rather than word by word (the tool
  rounds are non-streamed); turn tools off for streaming.
- The grounding check is v1: it doesn't check that a number belongs to the
  component its sentence names.
