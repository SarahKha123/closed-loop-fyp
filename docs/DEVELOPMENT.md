# Development guide

Everything runs directly on your machine: Python, Node and (optionally)
Ollama. There are no containers.

## Setup (once)

Needs Python 3.11+, Node 22+ and pnpm; [Ollama](https://ollama.com) for local
models (or use a cloud API instead).

```bash
./closed-loop.sh setup
```

This checks the tools, creates `.env` from `.env.example` (and later adds
any new keys to an existing `.env`), creates `config/`, installs
`frontend/node_modules`, creates `backend/.venv` with `requirements.txt` and
`requirements-dev.txt`, and trains the four ML models if
`backend/ml/models/*.joblib` is missing (~2 min, from the committed dataset).

Then get a chat model: **Models → Download** in the app, or
`ollama pull qwen3:1.7b`.

## Running

| Command | What runs | Open |
|---|---|---|
| `./closed-loop.sh start` | builds the frontend once; one backend process serves the API and the built UI | <http://localhost:8000> |
| `./closed-loop.sh dev` | reloading backend + Vite dev server with hot reload | <http://localhost:5173> (API on :8000) |

Both start `ollama serve` if Ollama is installed but not running (with the
limits from `.env`), and stop it on Ctrl-C; an Ollama you started yourself is
left alone. Use `start` for demos and on a slow machine (no Node process at
run time); `dev` while editing code.

Other commands: `./closed-loop.sh test` (all checks), `status` (does the API
and Ollama answer), `reset-db` (see Database).

Running the two halves by hand, if you need to:

```bash
# backend (from the repo root)
backend/.venv/bin/python -m uvicorn app.main:app --reload --app-dir backend

# frontend
pnpm --dir frontend dev
```

### Configuration (`.env`)

`closed-loop.sh` exports `.env` to the backend and to the `ollama serve` it
starts. A variable already set in your shell wins over `.env`.

| Variable | Default | Used for |
|---|---|---|
| `BACKEND_PORT` | `8000` | the API (and the UI with `start`) |
| `FRONTEND_PORT` | `5173` | the Vite dev server (`dev` only) |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | where Ollama is; `127.0.0.1` is tried automatically too |
| `OLLAMA_CONTEXT_LENGTH` | `4096` | context window per request (KV-cache RAM grows with it) |
| `OLLAMA_NUM_PREDICT` | `1024` | longest reply, in tokens |
| `OLLAMA_KEEP_ALIVE` | `10m` | how long a model stays in RAM after a reply |
| `OLLAMA_NUM_THREAD` | *(empty: Ollama decides)* | CPU threads per request |
| `OLLAMA_NUM_PARALLEL` / `OLLAMA_MAX_LOADED_MODELS` | `1` / `1` | server: one request at a time, one model in RAM |
| `OLLAMA_FLASH_ATTENTION` / `OLLAMA_KV_CACHE_TYPE` | `1` / `q8_0` | server: smaller KV cache |
| `OMP_NUM_THREADS`, `OPENBLAS_NUM_THREADS`, `MKL_NUM_THREADS` | `2` | CPU threads for the ML predictor |
| `CLOSED_LOOP_CONFIG_DIR` | repo `config/` | where the config files and the database live |
| `CLOSED_LOOP_STATIC_DIR` | *(unset)* | serve a built UI from this folder (`start` sets `frontend/dist`) |

The first four `OLLAMA_*` values are also sent with every chat request, so
they apply even to an Ollama the script didn't start. The server-only ones
(`NUM_PARALLEL`, `MAX_LOADED_MODELS`, flash attention, KV cache type) only
apply when the script starts Ollama; for a system service set them there.

### Runtime settings (`config/settings.json`)

Toggles that change behaviour without a restart, edited on **Models →
Settings** or with `PUT /api/settings` (see [API.md](API.md#settings)). The
file holds only what differs from the defaults in
`backend/app/services/settings.py`.

| Setting | Default | Effect |
|---|---|---|
| `insights.enabled` | `true` | the Advisor writes insights on events (off for the dashboard-only study condition) |
| `insights.threshold` | `0.5` | a failure probability crossing this triggers an insight |
| `insights.cooldownSeconds` | `10` | rest after each insight; raise it on a slow machine |
| `grounding.enabled` | `true` | check AI text against its data (off → `Grounded = NULL`, for the comparison) |
| `grounding.hideUnverified` | `false` | don't show insights that failed the check (still saved) |
| `monitor.confirmCycles` | `1` | Critical cycles in a row before an automatic work order |
| `monitor.autoCloseOnRecovery` | `true` | automatic work orders close when the component is Optimal again |
| `chat.maxTurns` | `10` | user/assistant exchanges sent to the model |
| `chat.tools` | `true` | chat tools and work-order proposals; off → streamed, snapshot-only answers |

## Choosing a model for your machine

| Machine | Suggested |
|---|---|
| 4 GB RAM, no GPU | `qwen3:0.6b` or `gemma3:1b` — or a cloud API |
| 8 GB RAM, no GPU | `qwen3:1.7b` (tested: insight ~30 s, tool chat ~12 s) |
| 16 GB RAM or a GPU | `qwen3:4b` / `qwen3:8b` |

`auto` mode picks the largest installed model that fits in 60 % of RAM, so
with several installed it may pick a slower one; pin a model on the Models
page to override. Models without tool support (e.g. `gemma3:1b`) still chat;
they just can't look things up or propose work orders.

## ML pipeline

The live system scores cycles with the FYP1 models. The dataset is committed
(`backend/data/hydraulic_condition_monitoring_summary.csv`, see [DATASET.md](DATASET.md)).
`setup` trains the models if they're missing; to do it by hand:

```bash
cd backend
.venv/bin/python -m ml.evaluate     # cross-validation → ml/results/ (~1 min; the results are committed)
.venv/bin/python -m ml.train        # final models + SHAP → ml/models/ (~20 s–2 min)
.venv/bin/python -m ml.replay_check # optional: all 2,205 cycles through the live predictor (~2 min)
```

Re-run `ml.train` after upgrading any ML library — the saved models are
version-sensitive, which is why they're rebuilt rather than committed (the
backend logs a warning when the installed versions differ from
`manifest.json`). See [`backend/ml/README.md`](../backend/ml/README.md).

## Database

The backend creates `config/closed_loop.db` (SQLite, gitignored) on start.
To start from empty: stop the backend, run `./closed-loop.sh reset-db`, start
it again. `POST /api/replay/reset` empties it without a restart.

## Checks

```bash
./closed-loop.sh test        # all of the below except check_models.py
```

```bash
(cd backend && .venv/bin/python -m pytest -q)            # backend tests (stub models: no Ollama or key needed)
pnpm --dir frontend exec tsc -b                          # type-check
pnpm --dir frontend lint                                 # oxlint
pnpm --dir frontend build                                # production build
backend/.venv/bin/python backend/tests/check_models.py   # model-selection self-check
```

The backend tests cover the data layer, events, replay, predictor, dashboard
API, monitor, settings, the insight engine, the grounding check, chat tools
(including confirm-before-create and the no-tools fallback) and the history
cap. AI behaviour is tested with stubbed model replies, never a real model.
`check_models.py` is a plain-assert script for model selection, key masking
and cloud routing.

## Where things go

| You want to… | Put it in |
|---|---|
| add a page | `frontend/src/routes/<name>.tsx` (the route tree regenerates itself), and a link in `components/shell/Sidebar.tsx` |
| add page-specific components | `frontend/src/features/<page>/` |
| add live dashboard state | `frontend/src/context/LiveContext.tsx` |
| call a new endpoint | a typed function in `frontend/src/lib/api.ts` (built on `lib/http.ts`) |
| add an endpoint | a router in `backend/app/api/`, logic in `backend/app/services/`, mount it in `main.py`, document it in `docs/API.md` |
| write SQL | `backend/app/services/repo.py` only |
| change a prompt | `backend/app/services/prompts.py`, and bump its version |
| add a runtime setting | `DEFAULTS` (and `LIMITS` if numeric) in `services/settings.py`, the `Settings` type in `lib/api.ts`, a row in `features/models/SettingsTab.tsx` |

### Recipes

**Add a cloud provider.** If it speaks the OpenAI chat API, add one line to
`PROVIDERS` in `backend/app/services/cloud.py`:

```python
"mistral": ("Mistral", "https://api.mistral.ai/v1", "https://console.mistral.ai/api-keys"),
```

It appears on the Cloud APIs tab automatically.

**Suggest another local model.** Add a tuple to `_MODELS` in
`backend/app/services/catalogue.py` (check the tag exists on
<https://ollama.com/library> first).

**Add a chat tool.** Add its JSON schema to `TOOLS` in
`backend/app/services/tools.py` and a function to `_READ` (read-only tools);
anything that changes data must go through a pending action and
`POST /api/chat/confirm`, like `create_work_order`. Keep results small and
rounded, and mention the tool in `prompts.CHAT_TOOLS` (bump `CHAT_VERSION`).

**Add an insight trigger.** Return another `(type, one-line description)`
from `insights.Engine.triggers()`, add the type to `Insight["triggerType"]`
and `TRIGGER` in `AdvisorPanel.tsx`.

## Conventions

- **Python:** `from __future__ import annotations`, type hints, a module
  docstring saying what the module owns. Services raise their own error
  types (`OllamaError`, `CloudError`, `NoModel`, `ReplyError`,
  `WorkOrderError`, `SettingsError`); routers turn them into HTTP statuses.
- **TypeScript:** function components, named exports, a one-line header
  comment per file, Tailwind classes inline (shared ones in `lib/ui.ts`).
- **All SQL in `repo.py`, all prompts in `prompts.py`, all live events
  through `events.py`.**
- **Update `docs/API.md`** in the same change as any endpoint change.
- **Never edit `Daedalus/`.** It's a reference project; read it for
  patterns, but all changes go in this repo's own code.
- **Secrets** go in `config/cloud.json` (gitignored), never in `.env.example`
  or the code. Never commit the database or the trained models.
- **Requirements are unpinned.** `requirements*.txt` list package names only,
  so the project keeps installing in future; anything version-sensitive (the
  trained models) is rebuilt instead.
