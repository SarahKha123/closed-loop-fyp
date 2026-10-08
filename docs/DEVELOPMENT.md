# Development guide

## Setup

```bash
./closed-loop.sh setup
```

This checks for Node, pnpm and Python (Docker is optional), creates `.env`
from `.env.example`, installs `frontend/node_modules`, and creates
`backend/.venv` with `backend/requirements.txt`.

## Running

| Mode | Command | URLs |
|---|---|---|
| Dev, no Docker | `./closed-loop.sh dev --host` | UI <http://localhost:5173>, API <http://localhost:8000> |
| Dev, containers | `./closed-loop.sh dev` | same |
| Production container | `./closed-loop.sh start` | <http://localhost:8000> |

`dev --host` starts `ollama serve` itself if Ollama is installed but not
running, and stops it again on Ctrl-C. Both servers reload on save.

Running the two halves by hand, if you need to:

```bash
# backend (from the repo root)
CLOSED_LOOP_CONFIG_DIR=config backend/.venv/bin/uvicorn app.main:app --reload --app-dir backend

# frontend
pnpm --dir frontend dev
```

### Configuration (`.env`)

| Variable | Default | Used for |
|---|---|---|
| `CLOSED_LOOP_PORT` | `8000` | port of the production container |
| `BACKEND_PORT` / `FRONTEND_PORT` | `8000` / `5173` | dev servers |
| `OLLAMA_BASE_URL` | `http://host.docker.internal:11434` | where Ollama is; localhost is tried automatically too |
| `CLOSED_LOOP_CONFIG_DIR` | `config` | where `model_config.json` and `cloud.json` live |

## ML pipeline (once)

The live system scores cycles with the FYP1 models. The dataset is committed
(`backend/data/hydraulic_condition_monitoring_summary.csv`, see [DATASET.md](DATASET.md));
the ML libraries come with `backend/requirements.txt`. Build the models once:

```bash
cd backend
.venv/bin/python -m ml.evaluate     # cross-validation → ml/results/ (~1 min)
.venv/bin/python -m ml.train        # final models + SHAP → ml/models/ (~20 s)
.venv/bin/python -m ml.replay_check # optional: all 2,205 cycles through the live predictor (~2 min)
```

Re-run `ml.train` after upgrading any ML library — the saved models are
version-sensitive, which is why they're rebuilt rather than committed. See
[`backend/ml/README.md`](../backend/ml/README.md).

## Database

The backend creates `config/closed_loop.db` (SQLite, gitignored) on start.
To start from empty: stop the backend, run `./closed-loop.sh reset-db`, start it again.

## Checks

```bash
pnpm --dir frontend exec tsc -b          # type-check
pnpm --dir frontend lint                 # oxlint
pnpm --dir frontend build                # production build
backend/.venv/bin/pip install -r backend/requirements-dev.txt   # once: pytest
backend/.venv/bin/pytest -q backend/tests                        # backend tests
backend/.venv/bin/python backend/tests/check_models.py           # model-selection self-check
```

`check_models.py` is a plain-assert script (no test framework). It covers
auto selection skipping embedding models, cloud mode resolving, keys never
appearing in responses, the Advisor routing to cloud, and parsing a
provider's streamed reply.

## Where things go

| You want to… | Put it in |
|---|---|
| add a page | `frontend/src/routes/<name>.tsx` (the route tree regenerates itself), and a link in `components/shell/Sidebar.tsx` |
| add page-specific components | `frontend/src/features/<page>/` |
| add shared dashboard state | `frontend/src/context/appReducer.ts` (an action) + `AppState.tsx` (expose it) |
| add pure logic or types | `frontend/src/domain/` |
| call a new endpoint | `request()` / `streamEvents()` from `frontend/src/lib/http.ts` |
| add an endpoint | a router in `backend/app/api/`, logic in `backend/app/services/`, mount it in `main.py`, document it in `docs/API.md` |

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

**Replace the demo data.** Everything reads cycles through
`frontend/src/domain/maintenance.ts` and `demo-data.ts`. Swap those for
calls to a real endpoint and the pages don't change.

## Conventions

- **Python:** `from __future__ import annotations`, type hints, a module
  docstring saying what the module owns. Services raise their own error
  types (`OllamaError`, `CloudError`, `NoModel`); routers turn them into HTTP
  statuses.
- **TypeScript:** function components, named exports, a one-line header
  comment per file, Tailwind classes inline (shared ones in `lib/ui.ts`).
- **Never edit `Daedalus/`.** It's a reference project; read it for
  patterns, but all changes go in this repo's own code.
- **Secrets** go in `config/cloud.json` (gitignored), never in `.env.example`
  or the code.
- **Requirements are unpinned.** `requirements*.txt` list package names only,
  so the project keeps installing in future; anything version-sensitive (the
  trained models) is rebuilt instead.
