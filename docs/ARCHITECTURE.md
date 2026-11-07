# Architecture

## The big picture

```
 Browser ──────────────► frontend (built: served by the backend on :8000 · dev: Vite on :5173)
    │                         │  /api/* same origin (start) or proxied by Vite (dev)
    │                         ▼
    │                    backend (FastAPI :8000, one process)
    │                      ├── api/        HTTP only: validate, call a service, shape the response
    │                      └── services/   all the logic; each module owns one thing
    │                              │
    │                              ▼
    │                       cloud provider API (OpenAI-compatible /chat/completions)
    │
    └── config/   study_scenarios.json the user-study task sets A and B (committed)
                  settings.json       runtime toggles (insights, grounding, monitor, chat, study)
                  closed_loop.db      SQLite: readings, predictions, work orders, insights, study log,
                                      users and their encrypted cloud keys (gitignored)
                  secret.key          encrypts those keys when KEY_ENCRYPTION_SECRET isn't set (gitignored, 0600)
```

Everything runs directly on the machine — no containers. `./closed-loop.sh
start` builds the frontend once and the backend serves it from
`frontend/dist` (one port, one origin, no Node process at run time — the
lightest way to run it). `./closed-loop.sh dev` runs Vite with hot reload
next to a reloading backend, and Vite proxies `/api` (`frontend/vite.config.ts`);
it waits for `GET /api/health` before starting Vite, so the first page load
never hits a backend that is still loading the models. Ctrl-C stops
everything they started.

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
          └ "work_order" opened ──► notifier (services/notify.py) ──► email to who asked (Gmail SMTP)
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
| `api/models.py` | The active model and choosing a provider |
| `api/cloud.py` | Cloud provider settings: list, save, clear, test |
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
| `services/advisor.py` | Picks the model, streams, `complete()`, tool rounds; turns provider errors into `NoModel` / `ReplyError` / `NoTools` |
| `services/snapshot.py` | What the dashboard shows right now, as the AI sees it (never the true labels) |
| `services/prompts.py` | Every prompt, each with a version stored next to what it produced |
| `services/insights.py` | The insight engine: triggers, coalescing, cooldown, generate → check → retry → store |
| `services/grounding.py` | The grounding check: every number, WO ID and condition must be in what the model was given |
| `services/tools.py` | Chat tools (status, history, propose a work order), the tool loop, pending confirmations |
| `services/model_config.py` | Which of a user's providers answers, and why it can or can't |
| `services/cloud.py` | Cloud providers: each user's encrypted settings, key masking, test, streamed and tool-calling chat |
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
| `tbl_UserCloud`, `tbl_UserModel` | each user's cloud providers (key encrypted, model, base URL) and which one answers their chat | cloud, model_config |

Seeking the replay back deletes later readings (predictions cascade) and
insights, so the timeline stays consistent. A replay reset empties every
table except `tbl_Equipment` and `tbl_StudyLog`; `./closed-loop.sh reset-db`
refuses to delete a database that holds study log rows unless given `--force`.

### Model selection

Every key is a user's own; there is no server key:

| | Whose key | Where it lives | Picked by |
|---|---|---|---|
| **Chat** | the signed-in user's | `tbl_UserCloud` (Fernet-encrypted) | that user, on the AI model page (`tbl_UserModel`) |
| **Live insights** | the replay *driver's*: whoever last pressed a replay control (in memory; after a restart the replay is paused, so the next Play decides) | the same | the driver's own model choice |
| **Summarise now** | whoever clicks it | the same | their own model choice |

A user without a key gets no answers, and insights pause with a notice
naming the driver and linking to the AI model page.
`model_config.resolve(user_id)` and `insights.status()` say what answers and,
when nothing can, why.
`advisor.Target` carries the `user_id`, and `cloud.config()` decrypts the key
only for the call that uses it.

### Flow: an insight

```
"prediction" / "work_order" event
   │ insights.Engine.triggers(): condition change? threshold crossed? work order?
   ▼
pending triggers ── one generation at a time; triggers arriving meanwhile (or during the
   │                cooldown after it) are merged into the next one
   ▼
snapshot.build(events)      the dashboard's current state + one line per trigger
prompts.insight_messages()  insight-v1; `/no_think` for a Qwen3 model
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

Tool calls are hidden behind `advisor.tool_round()`: arguments arrive as JSON
strings (a dict is accepted too) and results go back matched by call id. A
model the provider says can't use tools (an error mentioning tool support) is
remembered for the rest of the run and answered from the snapshot only;
`done.tools = false` makes the UI say so.

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
offers: no AI model page, no replay controls, no model card, no first-run model
dialog; in the `dashboard_ai` condition the Advisor is pinned open, in
`dashboard_only` it isn't rendered at all.

### Flow: first run without a model

`NoModelDialog` opens when the signed-in user's chat can't resolve a model.
It explains that chat uses their own key and links to the AI model page. Dismissed per browser session; never in
study mode or on the AI model page itself.

### Secrets

- **Every API route needs a session** except `/api/health` and `/api/auth/*`:
  `main.py` puts `api/auth.current_user` on every other router, so the
  sign-in page is not the only guard. A `401` anywhere sends the frontend
  back to the sign-in page.
- **Users' keys are encrypted at rest** (Fernet, keyed from
  `KEY_ENCRYPTION_SECRET`, or a random `config/secret.key` made once with
  0600). A copied database alone reveals no key. If the secret changes, saved
  keys read as "no key" and users paste them again.
- **No response ever contains a key**, only `key_hint` (the last four
  characters); a key a provider echoes in an error message is scrubbed.
- **Accounts:** anyone may sign up; while there is no active admin the next
  sign-up becomes one, and everyone after waits (`pending`, reaching nothing
  but `/api/auth`) until an admin approves them. Two roles: `admin` (accounts,
  the Admin page, study, settings for everyone) and `engineer`. The server
  enforces them (`current_user` = active, `admin_user` = admin), the last
  active admin can't be removed, and every admin action is audited with its
  actor. No built-in account. Failed sign-ins are limited to 10 per IP per
  15 minutes.
- **Server settings** that used to be `.env` (the Gmail sender, Google
  sign-in) live in `tbl_ServerSetting`, secrets Fernet-encrypted like API keys
  and write-only (services/server_config.py).
- **Schema changes** are numbered SQL files in `backend/app/migrations/`,
  each one transaction, applied by `db.init_db()` to any older database (and
  to fresh ones, from the v3 baseline in `db.SCHEMA`).
- Cloud models receive the Advisor's prompt, including the current readings,
  and the AI model page says so.

---

## Running on a small server

The language model runs at the provider, so the app itself needs little: one
Python process scoring a cycle at a time. What keeps it light:

| Where | What | Knob |
|---|---|---|
| Predictor | models fixed to `n_jobs=1`; BLAS/OpenMP threads capped | `OMP_NUM_THREADS` etc. (`.env`) |
| Insight engine | one generation at a time, triggers merged, then a rest (fewer tokens, under rate limits) | `insights.cooldownSeconds` |
| Chat | history capped; tools optional (off = streamed, one model call) | `chat.maxTurns`, `chat.tools` |
| Prompts and tool results | rounded values, run-length history instead of rows | — |
| Running | `start` serves the built UI from the backend: no Vite / Node process | `./closed-loop.sh start` |

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
  models.tsx            "/models" — the active model, cloud providers, Advisor behaviour (one page)
  study.admin.tsx       "/study/admin" — the researcher's study console (not in the nav; open in a second window)
components/
  ui/                   primitives: Card, Button, ConditionBadge, Meter, EmptyState, Icon
  charts/               LineChart (multi-series, crosshair tooltip, legend, end labels), Sparkline
  shell/                Sidebar, TopBar (replay controls), AdvisorPanel (insights feed, chat,
                        grounding badges, work-order confirmation cards), ModelCard, ToastStack
                        (bottom-right of the page column, never over the Advisor), ProfileMenu
                        (name, role, theme), NoModelDialog (first-run: add a cloud key)
  PageHeader.tsx
features/
  dashboard/            KpiTiles, ComponentCard, TrendPanel (chart + table), ActivityFeed, StatusBanner, NewWorkOrder
  models/               ActiveModelBanner, ProviderList, AdvisorSettings, types.ts
context/              React state shared across pages
  LiveContext.tsx       replay state, overview, trend, activity, insights, runtime settings; refreshed from /api/stream; toasts; replay controls
  ChatContext.tsx       the Advisor conversation, tool lookups, proposed actions (respond); panel open/closed
  ModelsContext.tsx     the active model; choosing a provider
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
  sidebar card and the AI model page agree.
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
- **The Advisor is the only code that talks to the model.** `services/advisor.py`
  (streaming, complete, tool rounds) calls `services/cloud.py`; nothing else does.
- **The AI only sees what the operator sees.** The snapshot is built from
  the same queries as the dashboard and never includes `TrueCondition`; it is
  stored with each insight, so any text can be re-checked later.
- **Actions need a person.** The monitor may open work orders by rule; the
  language model may only *propose* one, and nothing is created until the
  engineer confirms.
- **Every prompt is versioned.** `prompts.INSIGHT_VERSION` / `CHAT_VERSION`
  are stored with every output, so the evaluation can tell prompt changes apart.
- **Fail soft, explain why.** With no provider ready, `/api/models/active`
  still answers and says what's missing. Without trained models or
  the dataset the API still runs and says what to do. The insight engine
  survives model errors and says once that it's paused.
- **Daedalus is a reference only.** Several modules are scaled-down versions
  of Daedalus patterns (noted in their docstrings), but nothing imports from,
  runs, or modifies `Daedalus/`.

## Known limits (deliberate)

- The Advisor needs network access to its provider; with the provider down,
  insights pause and chat answers with the provider's error.
- Proposed work orders are held in memory: a backend restart forgets
  unanswered proposals.
- The profile is per browser, not an account: it isn't sent to the backend
  or written to any log.
- With tools on, chat answers arrive whole rather than word by word (the tool
  rounds are non-streamed); turn tools off for streaming.
- The grounding check is v1: it doesn't check that a number belongs to the
  component its sentence names.
