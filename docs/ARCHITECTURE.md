# Architecture

## The big picture

```
 Browser ──────────────► frontend (Vite dev server :5173, or static files in prod)
    │                         │  /api/* proxied (dev) or same origin (prod)
    │                         ▼
    │                    backend (FastAPI :8000)
    │                      ├── api/        HTTP only: validate, call a service, shape the response
    │                      └── services/   all the logic; each module owns one thing
    │                              │                    │
    │                              ▼                    ▼
    │                       Ollama :11434        cloud provider APIs
    │                       (local models)       (OpenAI-compatible /chat/completions)
    │
    └── config/model_config.json   which model the Advisor uses (committable)
        config/cloud.json          cloud API keys (gitignored, 0600)
```

In production (`./closed-loop.sh start`) one container runs FastAPI, which
also serves the built frontend from `static/`, so there is one origin, no
CORS and no separate web server. In development Vite serves the UI with hot
reload and proxies `/api` to the backend (`frontend/vite.config.ts`).

**The live pipeline (being built milestone by milestone, see TODO.md):**

```
backend/data/hydraulic_condition_monitoring_summary.csv
   │ loaded once at startup (services/ingest.py, via backend/ml/features.py)
   ▼
replay (services/replay.py) ── every N s ──► tbl_SensorReading (SQLite, services/db.py + repo.py)
   │ publishes "cycle"                       │
   ▼                                         ▼
event bus (services/events.py) ──► /api/stream (SSE) ──► browser
   │
   └──► predictor (services/predictor.py: 4 models + SHAP, ~60 ms/cycle)
          │ tbl_Prediction, publishes "prediction"
          ├──► /api/dashboard/* ──► dashboard
          └──► monitor (services/monitor.py) ──► work orders (services/work_orders.py), publishes "work_order"
                 Critical → open one (system:monitor, linked to the prediction); recovered → close it
```

Built so far: the data layer (M2), the replay and live stream (M3), the
predictor (M4), the dashboard on real data (M5) and the monitor with
automatic work orders (M6). Nothing on screen is demo data any more.

---

## Backend (`backend/app/`)

Two layers, with dependencies pointing one way: `api → services`, and
services never import from `api`.

| File | Responsibility |
|---|---|
| `main.py` | Creates the app, CORS, mounts routers, serves the built frontend in prod |
| **api/** | |
| `api/health.py` | `GET /api/health` liveness check |
| `api/models.py` | Local models: list, active, select, catalogue, pull, delete |
| `api/cloud.py` | Cloud provider settings: list, save, clear, test |
| `api/hardware.py` | Hardware report for the Hardware tab |
| `api/chat.py` | The Advisor's streaming chat endpoint |
| `api/sse.py` | `sse_response()` — the single way anything is streamed |
| **services/** | |
| `services/advisor.py` | Decides *what* answers (local or cloud) and streams its reply |
| `services/model_config.py` | The model choice: read/write the file, and the policy that resolves it |
| `services/ollama_client.py` | Everything that talks to Ollama, with the URL fallback written once |
| `services/cloud.py` | Cloud providers: stored settings, key masking, test, streamed chat |
| `services/catalogue.py` | The short list of suggested local models |
| `services/hardware.py` | CPU / RAM / GPU / disk probes, each independently guarded |
| `services/jsonfile.py` | Safe read + atomic write for the config files |
| `services/paths.py` | Where config and the database live (`CLOSED_LOOP_CONFIG_DIR`) |
| `services/db.py` | The shared data layer: SQLite schema (5 tables), connections, the write lock |
| `services/repo.py` | Every SQL query, in one place |
| `services/ingest.py` | The dataset in memory, one record per cycle |
| `services/replay.py` | Plays the cycles as a live feed; play / pause / step / speed / seek / reset |
| `services/events.py` | In-process publish/subscribe between the live-pipeline parts |
| `services/predictor.py` | Loads the four trained models; scores each new reading with SHAP drivers; the scoring worker |
| `api/dashboard.py` | Overview (KPIs + latest per component), trend, activity, sensors |
| `services/monitor.py` | Reacts to each prediction: opens a work order on Critical, closes it on recovery |
| `services/work_orders.py` | Opening and closing work orders, with who raised them and why |
| `api/work_orders.py` | List, raise by hand, close |
| `api/replay.py` | Replay controls |
| `api/stream.py` | `GET /api/stream` — all live events to the browser (SSE) |

### Model selection

`config/model_config.json` stores a **policy**, not just a name, so the same
file means something on another machine:

| mode | meaning |
|---|---|
| `auto` | the largest installed chat model that fits in 60% of RAM (embedding models are skipped) |
| `pinned` | exactly this Ollama tag; unresolved if it isn't installed |
| `cloud` | the configured model of this cloud provider; unresolved until it has a key and a model |

`model_config.resolve(installed, hardware)` is the pure policy (easy to test
with fake inputs). `model_config.resolve_now()` gathers the live inputs (asks
Ollama, probes hardware) and calls it. `/api/models/active`,
`/api/models/select` and the Advisor all go through `resolve_now()`, so they
can never disagree about what "auto" means.

### Request flow: a chat message

```
AdvisorPanel ── sendChat() ──► POST /api/chat {messages}
                                   │ api/chat.py: needs a user message, else 400
                                   ▼
                          advisor.choose() ── model_config.resolve_now()
                                   │  nothing available → 503 with the reason
                                   ▼
                          advisor.stream_reply(target, messages)
                             ├─ local  → ollama_client.chat_stream()  (NDJSON from Ollama)
                             └─ cloud  → cloud.chat_stream()          (SSE from the provider)
                                   │ text deltas
                                   ▼
                          SSE frames: token … token, done   (or error mid-stream)
```

The frontend sends the whole transcript every time, with a system prompt
built from the selected cycle (`domain/advisor.ts → buildSystemPrompt`). The
backend keeps no chat state.

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

## Frontend (`frontend/src/`)

A professional monitoring layout: a left sidebar (pages + each component's
live condition), a top bar (live status, replay controls, theme, Advisor
toggle), the page column, and the Advisor on the right. Light and dark themes
share one set of design tokens; charts follow the data-viz method (validated
categorical colours per component in fixed order, reserved status colours
with icon + label, legends, table views, hover tooltips).

```
main.tsx              router setup + mount
index.css             design tokens for light + dark (surfaces, ink, status, chart series)
routes/               one file per page (TanStack file-based routing)
  __root.tsx            the shell: providers, Sidebar, TopBar, page column (@container), Advisor, toasts
  index.tsx             "/" — KPIs, the four component cards, risk trend, activity feed
  components.$component.tsx  "/components/cooler" … — state, class probabilities, SHAP drivers,
                        related sensors, risk history, condition changes
  work-orders.tsx       "/work-orders" — the maintenance queue
  sensors.tsx           "/sensors" — all 17 channels for the current cycle (?component= highlights)
  models.tsx            "/models" — AI model management (?tab=download|cloud|hardware)
components/
  ui/                   primitives: Card, Button, ConditionBadge, Meter, EmptyState, Icon
  charts/               LineChart (multi-series, crosshair tooltip, legend, end labels), Sparkline
  shell/                Sidebar, TopBar (replay controls), AdvisorPanel, ModelCard, ToastStack
  PageHeader.tsx
features/
  dashboard/            KpiTiles, ComponentCard, TrendPanel (chart + table), ActivityFeed, StatusBanner
  models/               ActiveModelBanner, LocalModelsTab, CloudTab, HardwareTab, types.ts
context/              React state shared across pages
  LiveContext.tsx       replay state, overview, trend, activity; refreshed from /api/stream; toasts; replay controls
  ChatContext.tsx       the Advisor conversation (prompt built from the live overview); panel open/closed
  ModelsContext.tsx     installed models + the active model
lib/
  api.ts                typed calls + response types for the dashboard endpoints
  stream.ts             the one shared EventSource to /api/stream
  http.ts               request() for JSON, streamEvents() for SSE POSTs
  format.ts, status.ts, theme.ts, ui.ts
```

**Rules of thumb that keep it understandable:**

- **Routes are thin.** A route file picks data from context and lays it out;
  anything bigger lives in `features/<page>/`.
- **The backend is the source of truth.** No dashboard numbers are computed
  or stored in the browser; `LiveContext` mirrors `/api/dashboard/*` and
  re-fetches when the stream says something changed (throttled to ~2.5/s).
- **One place per concern.** JSON calls go through `lib/api.ts` → `lib/http.ts`,
  live events through `lib/stream.ts`, and every model choice is decided by
  the backend's `resolve_now()`.
- **Tokens, not colours.** Components use `bg-surface`, `text-ink-muted`,
  `text-critical-text`…, never hex, so dark mode needs no per-component work.
- **The layout is fixed to the viewport.** The page never scrolls; a tall
  view scrolls inside its own column. Page grids use container queries, so
  they reflow when the Advisor narrows the column.

### State

- `LiveContext` holds what the dashboard shows. It loads overview, trend and
  activity on start, then refreshes on `prediction`, `replay` and
  `work_order` stream events, and after a reconnect. Condition changes become
  toasts (worse = warning/critical, better = good).
- `ChatContext` keeps the transcript. Each request carries a system prompt
  built from the current overview (every component's condition, probability,
  since-cycle and SHAP drivers with units), so answers are grounded in what's
  on screen. M9 moves this prompt to the backend.
- `ModelsContext` caches `/api/models` and `/api/models/active` so the
  sidebar card and the AI models page agree.

---

## Design decisions

- **KISS over frameworks.** No state library (one reducer is enough), no
  component library (Tailwind classes), no ORM or database (two small JSON
  files), no class hierarchies for one implementation.
- **The OpenAI-compatible API is the only cloud protocol.** Every listed
  provider speaks it (Anthropic and Gemini through their compatibility
  endpoints), so one client covers all of them, and adding a provider is one
  line (see DEVELOPMENT.md).
- **The Advisor is the only code that knows about both local and cloud.**
  `services/advisor.py` dispatches; the two clients each know only their own
  backend; `api/chat.py` only formats SSE. Adding a third kind of backend
  means changing `advisor.py` and nothing else.
- **Fail soft, explain why.** Listing models never 500s because Ollama is
  down; it returns an empty list plus the reason, and the UI shows it.
  Hardware probes are independently guarded, so a machine with no GPU is a
  normal machine, not an error.
- **Daedalus is a reference only.** Several modules are scaled-down versions
  of Daedalus patterns (noted in their docstrings), but nothing imports from,
  runs, or modifies `Daedalus/`.

## Known limits (deliberate)

- One model download at a time, and it stops if you leave the Models page
  (or open the Cloud / Hardware tab). A background download queue would fix
  that if it's ever needed.
- "Fits in RAM/VRAM" is estimated from file size; long conversations need
  extra memory on top.
- Embedding models are recognised by name/family (`embed`, `bert`), because
  Ollama's model list has no capability field.
- Dashboard data is demo data; wiring it to the real pipeline means
  replacing `domain/demo-data.ts` with API calls.
