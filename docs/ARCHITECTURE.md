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

The dashboard data (cycles, work orders, sensor readings) is **demo data in
the frontend** (`frontend/src/domain/demo-data.ts`), standing in for the ML
pipeline's output. The backend only handles models and the Advisor.

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
| `services/paths.py` | Where config lives (`CLOSED_LOOP_CONFIG_DIR`) |

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

```
main.tsx              router setup + mount
index.css             Tailwind theme tokens (colours, fonts)
routes/               one file per page (TanStack file-based routing)
  __root.tsx            the shell: providers, Sidebar, page column, AdvisorPanel, toasts
  index.tsx             "/" — KPI tiles + component health cards
  work-orders.tsx       "/work-orders"
  sensors.tsx           "/sensors" (?component= highlights that component's sensors)
  models.tsx            "/models" — page frame + tabs (?tab=download|cloud|hardware)
components/           shared presentational pieces
  PageHeader, StatusPill
  shell/                pieces of the app frame: Sidebar, CycleSelector, NotificationBell,
                        ModelCard, AdvisorPanel, ToastStack
features/models/      everything only the Models page uses
  ActiveModelBanner, LocalModelsTab (Installed + Download), CloudTab, HardwareTab, types.ts
context/              React state shared across pages
  AppState.tsx          cycle, work orders, KPIs, toasts, Advisor transcript + chat streaming
  appReducer.ts         every AppState change, as one pure reducer
  ModelsContext.tsx     installed models + the active model (cached from the backend)
domain/               plain TypeScript, no React
  types.ts              Cycle, ComponentReading, WorkOrder, ChatMessage, …
  demo-data.ts          the demo cycles and work-order history
  maintenance.ts        getCycle, getWorkOrders (derived as of a cycle), getKpiTiles
  advisor.ts            canned explanations, welcome messages, the chat system prompt
lib/                  small utilities
  http.ts               request() for JSON, streamEvents() for SSE — the only fetch code
  format.ts, status.ts, ui.ts (shared Tailwind class strings)
```

**Rules of thumb that keep it understandable:**

- **Routes are thin.** A route file picks data from context and lays it out;
  anything bigger lives in `features/<page>/`.
- **`domain/` has no React.** It's the logic you could unit-test or move to
  the backend unchanged.
- **One place per concern.** Every network call goes through `lib/http.ts`,
  every dashboard state change through `appReducer.ts`, and every model
  choice is decided by the backend's `resolve_now()`. The frontend never
  decides which model runs.
- **The layout is fixed to the viewport.** The page never scrolls; a tall
  view scrolls inside its own column (`routes/__root.tsx`).

### State

- `AppState` holds what the dashboard is showing: the selected cycle (the
  sidebar's CycleSelector), the work orders and KPIs derived from it, toasts,
  and the Advisor transcript. Switching cycles announces newly opened or
  resolved work orders in the chat and as toasts.
- `ModelsContext` caches `/api/models` and `/api/models/active` so the
  sidebar card and the Models page agree. After anything that changes them
  (select, download, delete), call `refresh()`.

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
