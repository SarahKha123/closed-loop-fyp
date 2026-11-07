# Development guide

Everything runs directly on your machine: Python and Node. The Advisor's
language model is a cloud API, so there are no containers and no model to
download.

## Setup (once)

Needs Python 3.11+, Node 22+ and pnpm, and an API key for one cloud provider
(Groq and Google Gemini both offer free keys).

```bash
./closed-loop.sh setup
```

This checks the tools, creates `.env` from `.env.example` (and later adds
any new keys to an existing `.env`), creates `config/`, installs
`frontend/node_modules`, creates `backend/.venv` and installs (and upgrades)
`requirements.txt` and `requirements-dev.txt` into it, trains the four ML
models if `backend/ml/models/*.joblib` is missing (~2 min, from the committed
dataset).

Re-running `setup` is safe and is how you update: it upgrades the Python
packages to their latest releases (the requirements are unpinned, and the
committed `manifest.json` records the versions the models were trained with).

Then open the app, go to **AI model**, add a key for one provider, *Test
connection*, pick a model and press *Use*.

## Running

| Command | What runs | Open |
|---|---|---|
| `./closed-loop.sh start` | builds the frontend once; one backend process serves the API and the built UI | <http://localhost:8000> |
| `./closed-loop.sh dev` | reloading backend + Vite dev server with hot reload | <http://localhost:5173> (API on :8000) |

Use `start` for demos and on a slow machine (no Node process at run time);
`dev` while editing code.

`dev` starts the backend first and waits (up to 60 s) until `GET
/api/health` answers before it starts Vite, so the browser's first requests
don't fail while the models load. If the backend exits during startup, `dev`
stops and the backend's own output above says why. One Ctrl-C stops the
backend and Vite, and the prompt returns only after
the backend has finished shutting down.

Other commands: `./closed-loop.sh test` (all checks), `status` (does the API
answer, and which model is active), `reset-db` (see Database).

Running the two halves by hand, if you need to:

```bash
# backend (from the repo root)
backend/.venv/bin/python -m uvicorn app.main:app --reload --app-dir backend

# frontend
pnpm --dir frontend dev
```

### Configuration (`.env`)

`closed-loop.sh` exports `.env` to the backend. A variable already set in your
shell wins over `.env`.

| Variable | Default | Used for |
|---|---|---|
| `BACKEND_PORT` | `8000` | the API (and the UI with `start`) |
| `FRONTEND_PORT` | `5173` | the Vite dev server (`dev` only) |
| `CLOUD_PROVIDER` / `CLOUD_API_KEY` / `CLOUD_MODEL` / `CLOUD_BASE_URL` | *(empty)* | the server key: writes the live insights (never used for chat); insights pause without it |
| `KEY_ENCRYPTION_SECRET` | *(empty: a random `config/secret.key`)* | encrypts users' saved keys; keep it stable or they become unreadable |
| `ALLOW_SIGNUP` | `true` | `false` on a deployed server: no sign-up, no new Google accounts, no demo account |
| `OMP_NUM_THREADS`, `OPENBLAS_NUM_THREADS`, `MKL_NUM_THREADS` | `2` | CPU threads for the ML predictor |
| `CLOSED_LOOP_CONFIG_DIR` | repo `config/` | where the config files and the database live |
| `CLOSED_LOOP_STATIC_DIR` | *(unset)* | serve a built UI from this folder (`start` sets `frontend/dist`) |

Each user's own key (for their chat) is saved on the AI model page, encrypted
in the database. The `CLOUD_*` server key is only for live insights.

### Runtime settings (`config/settings.json`)

Toggles that change behaviour without a restart, edited under **AI model →
Advisor behaviour** or with `PUT /api/settings` (see [API.md](API.md#settings)). The
file holds only what differs from the defaults in
`backend/app/services/settings.py`.

| Setting | Default | Effect |
|---|---|---|
| `insights.enabled` | `true` | the Advisor writes insights on events (off for the dashboard-only study condition) |
| `insights.threshold` | `0.5` | a failure probability crossing this triggers an insight |
| `insights.cooldownSeconds` | `10` | rest after each insight; raise it to spend fewer tokens or stay under a rate limit |
| `grounding.enabled` | `true` | check AI text against its data (off → `Grounded = NULL`, for the comparison) |
| `grounding.hideUnverified` | `false` | don't show insights that failed the check (still saved) |
| `monitor.confirmCycles` | `1` | Critical cycles in a row before an automatic work order |
| `monitor.autoCloseOnRecovery` | `false` | on: automatic work orders also close when the component is Optimal again, logged as unverified outcomes; off: a technician closes every one with an outcome |
| `notifications.email` | `true` | email each new work order to `NOTIFY_EMAIL_TO` (only once `SMTP_*` is set in `.env`; never in study mode) |
| `chat.maxTurns` | `10` | user/assistant exchanges sent to the model |
| `chat.tools` | `true` | chat tools and work-order proposals; off → streamed, snapshot-only answers |
| `study.enabled` | `false` | study mode: participants can't change the setup (see Study mode) |
| `study.condition` | `dashboard_ai` | `dashboard_only` hides the Advisor and turns insights off; `dashboard_ai` pins it open |

## Choosing a model

Any chat model the provider offers works; *Test connection* lists them. Small,
fast models (Groq's `llama-3.1-8b-instant`, Gemini Flash) answer quickest and
cost least; larger ones (`llama-3.3-70b-versatile`, `gpt-oss-120b` on Ollama
Cloud) are slower. Whether they ground better is what RQ2 measures. Models without tool support still chat;
they just can't look things up or propose work orders — the Advisor notices
the refusal and falls back to snapshot-only answers.

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
it again. `POST /api/replay/reset` empties it without a restart (and keeps
the study log).

`reset-db` refuses while the database holds user-study log rows, so a
participant's data can't be lost by accident: export them first
(`GET /api/study/export`, or the button on `/study/admin`), then run
`./closed-loop.sh reset-db --force`.

## Study mode (user study, Part C)

The researcher runs the session from **`/study/admin`** in a second window
(it isn't linked from the navigation); the participant uses the normal
dashboard.

1. Turn on **Study mode** on `/study/admin` (it sets `study.enabled`). The
   participant's dashboard loses the AI model page, the replay controls, the
   model card and the first-run model dialog. Choose and test the model
   *before* turning it on.
2. Enter the participant number. The counterbalanced plan gives the two
   blocks: which condition (`dashboard_only` / `dashboard_ai`) with which
   task set (A / B), rotating through the four orders.
3. **Start** a task. Its preset loads — the replay is reset to the task's
   `from` cycle and stepped to `to`, so every participant sees the same
   state and history — the participant's chat clears, and the clock starts
   once the last cycle is scored.
4. Type the participant's answer, mark it correct / wrong (or leave it
   unmarked), and **End** the task. Duration, chat turns and insights shown
   are logged to `tbl_StudyLog`.
5. **Export CSV** for one participant or everyone.

The tasks are in `config/study_scenarios.json` (committed): two parallel sets
of four, each with a `level`, the `from`/`to` cycles, the question and the
researcher's reference answer. The reference answers were read off the
dashboard with the shipped models — if you retrain the models, re-check them
in a dry run.

## Evaluation (Part B and Part D)

The harness is in `eval/`; run everything from the repo root with the
backend's Python. Results go to `eval/results/`.

```bash
backend/.venv/bin/python eval/make_scenarios.py        # once: the frozen scenario set (committed — don't re-run)
backend/.venv/bin/python eval/run.py --models cloud:groq/llama-3.1-8b-instant,cloud:groq/llama-3.3-70b-versatile --validator both [--repeats 3] [--limit N] [--out NAME]
backend/.venv/bin/python eval/analyse.py eval/results/NAME.csv [--ratings eval/results/NAME-ratings.csv]
backend/.venv/bin/python eval/rate.py eval/results/NAME.csv [--n 60]     # blind sample for human ratings
backend/.venv/bin/python eval/system_perf.py --yes [--speed 0.2]          # Part D, against a running `start`
```

- **`make_scenarios.py`** replays the whole dataset through the live code
  into a throwaway database and saves the exact snapshots the insight engine
  would send (`eval/scenarios/*.json`, 50 of them, by category). It refuses
  to overwrite the set unless `--force`.
- **`run.py`** calls the app's own insight path (generate → grounding check →
  one retry) for each model × scenario × validator setting × repeat, one CSV
  row each, plus `<name>.config.json` (models, prompt version). Re-running
  with the same `--out` resumes. Models are `cloud:<provider>` or
  `cloud:<provider>/<model>`, so one key can compare a small and a large
  model. Keys come from the `CLOUD_*` server key, or with `--user <username>`
  from that account's keys saved on the AI model page. Use `--limit` and `--repeats 1` for a
  quick pass.
- **`analyse.py`** writes `<name>.report.md` (grounding accuracy,
  hallucination rate, regeneration rate, coverage, latency) and two charts:
  the small-vs-large model trade-off (RQ2) and the validator effect (RQ3).
- **`rate.py`** exports a blind sample for two raters (1–5 rubric in its
  docstring) plus a separate key; `analyse.py --ratings` adds mean usefulness
  and Cohen's κ.
- **`system_perf.py`** empties the database (hence `--yes`), plays the
  replay and measures scoring latency per cycle and the backend's memory
  over time, from a client on `/api/stream`.

## Checks

```bash
./closed-loop.sh test        # all of the below except check_models.py
```

```bash
(cd backend && .venv/bin/python -m pytest -q)            # backend tests (stub models: no API key needed)
pnpm --dir frontend exec tsc -b                          # type-check
pnpm --dir frontend lint                                 # oxlint
pnpm --dir frontend build                                # production build
backend/.venv/bin/python backend/tests/check_models.py   # model-selection self-check
```

The backend tests (92) cover the data layer, events, replay, predictor,
dashboard API, monitor, settings, the insight engine, the grounding check,
model selection and the cloud client (`tests/check_models.py`), chat tools (including
confirm-before-create and the no-tools fallback), the history cap, study mode
(plan, presets, the task log, export) and the evaluation helpers. AI behaviour is tested with stubbed model replies, never a real model.
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
| add a runtime setting | `DEFAULTS` (and `LIMITS` if numeric, `CHOICES` if text) in `services/settings.py`, the `Settings` type in `lib/api.ts`, a row in `features/models/AdvisorSettings.tsx` |
| add or change a study task | `config/study_scenarios.json` (keep sets A and B parallel), then a dry run |
| add a toast | `pushToast()` in `context/LiveContext.tsx` (shown by `components/shell/ToastStack.tsx`) |

### Recipes

**Add a cloud provider.** If it speaks the OpenAI chat API, add one line to
`PROVIDERS` in `backend/app/services/cloud.py`:

```python
"mistral": ("Mistral", "https://api.mistral.ai/v1", "https://console.mistral.ai/api-keys"),
```

It appears on the AI model page automatically.

**Add a chat tool.** Add its JSON schema to `TOOLS` in
`backend/app/services/tools.py` and a function to `_READ` (read-only tools);
anything that changes data must go through a pending action and
`POST /api/chat/confirm`, like `create_work_order`. Keep results small and
rounded, and mention the tool in `prompts.CHAT_TOOLS` (bump `CHAT_VERSION`).

**Add an insight trigger.** Return another `(type, one-line description)`
from `insights.Engine.triggers()`, add the type to `Insight["triggerType"]`
and `TRIGGER` in `AdvisorPanel.tsx`.

## Troubleshooting

| You see | Why, and what to do |
|---|---|
| `predictor: models were trained with <lib> X, installed is Y` | the venv's ML libraries differ from the ones in `manifest.json`. Run `./closed-loop.sh setup` (upgrades the packages); if it still warns, retrain: `(cd backend && .venv/bin/python -m ml.train)` |
| `[vite] http proxy error … ECONNREFUSED 127.0.0.1:8000` | the backend isn't answering. `dev` waits for it now, so this only appears if the backend stopped or restarted (a reload after a backend edit) — check its output above |
| `the backend exited during startup` | the backend's error is printed just above; often port 8000 is taken (`BACKEND_PORT=8001 ./closed-loop.sh dev`) |
| `backend/.venv missing or broken` | run `./closed-loop.sh setup` |
| The Advisor says no model can answer | chat: add your own key and model on **AI model** and press *Use*. Live insights paused: set `CLOUD_PROVIDER` / `CLOUD_API_KEY` / `CLOUD_MODEL` in `.env` |
| `reset-db` refuses | the database holds study logs — export them, then `reset-db --force` |

## Conventions

- **Python:** `from __future__ import annotations`, type hints, a module
  docstring saying what the module owns. Services raise their own error
  types (`CloudError`, `NoModel`, `ReplyError`,
  `WorkOrderError`, `SettingsError`); routers turn them into HTTP statuses.
- **TypeScript:** function components, named exports, a one-line header
  comment per file, Tailwind classes inline (shared ones in `lib/ui.ts`).
- **All SQL in `repo.py`, all prompts in `prompts.py`, all live events
  through `events.py`.**
- **Update `docs/API.md`** in the same change as any endpoint change.
- **Never edit `Daedalus/`.** It's a reference project; read it for
  patterns, but all changes go in this repo's own code.
- **Secrets** go in `.env` (the server key, `KEY_ENCRYPTION_SECRET`) or, for
  users' keys, the database (encrypted); never in `.env.example` or the code. Never commit the database or the trained models.
- **Requirements are unpinned.** `requirements*.txt` list package names only,
  so the project keeps installing in future; anything version-sensitive (the
  trained models) is rebuilt instead.
