# Closed Loop

A predictive-maintenance dashboard for hydraulic systems, built around the
UCI Hydraulic Condition Monitoring dataset. FYP, Universiti Teknologi
PETRONAS.

Recorded cycles are replayed as a live feed. Each cycle is scored by the four
FYP1 models (cooler, valve, pump, accumulator) with SHAP explanations; a
monitor opens a maintenance work order when a component turns Critical, and a
technician closes it with what they found — whether it matched the prediction —
which feeds a confirmation rate (**Work orders → History**). An AI **Advisor**
closes the loop for people:

- **Live insights** — when a component changes condition, crosses the risk
  threshold, or a work order opens or closes, the Advisor writes a short
  explanation by itself.
- **Chat** — ask about the live state; the Advisor can look up status and
  history, and propose a work order that you confirm.
- **Grounding check** — every number, work order ID and condition in the
  AI's text is checked against the data it was given; failures are rewritten
  once and otherwise marked *Unverified*.

The Advisor answers from a **cloud model** (OpenAI, Anthropic, Gemini, Groq,
OpenRouter, DeepSeek, Ollama Cloud, or any OpenAI-compatible endpoint), chosen
on the **AI model** page. With nothing set up yet, the dashboard asks for an
API key; Groq and Google Gemini both offer free ones.

For the FYP's evaluation it also has:

- **Study mode** — a researcher console at `/study/admin` for the user
  study: two conditions (dashboard only / dashboard + AI), fixed task
  presets, counterbalancing, a timed task log and CSV export.
- **Evaluation harness** — `eval/` measures grounding accuracy,
  hallucination rate and latency per model, with the validator on and off,
  plus a whole-system performance run.

## Quick start

Needs Python 3.11+, Node 22+ and pnpm, and an API key for one cloud provider.
Everything runs directly on your machine — no Docker.

```bash
./closed-loop.sh setup    # once: packages, .env, trains the ML models (~2 min)
./closed-loop.sh start    # http://localhost:8000 — then add a key on the AI model page
```

Then create an account (the first one becomes the admin, or set `ADMIN_EMAILS` in `.env` to choose who), and on **AI model** add your own key for one
provider, test it and press *Use*. Press play in the top bar: the live insights
run on the key of whoever presses Play.

| Command | What it does |
|---|---|
| `./closed-loop.sh setup` | Install / upgrade dependencies, create `.env`, train the models if missing. Safe to re-run |
| `./closed-loop.sh start` | Build the dashboard once and serve it with the API on one port (lightest; for demos) |
| `./closed-loop.sh dev` | Hot-reload backend (:8000) + Vite (:5173), for editing code; Vite starts once the API answers |
| `./closed-loop.sh test` | Backend tests, frontend type check and lint |
| `./closed-loop.sh status` | Does the API answer (the models are per user, on the AI model page) |
| `./closed-loop.sh reset-db` | Delete the database (recreated empty on the next start); refuses while it holds study logs unless `--force` |

Ctrl-C stops everything the command started. Something not working? See
[Troubleshooting](docs/DEVELOPMENT.md#troubleshooting).

### Deploying

The frontend goes to **Vercel**, the backend to **Render** and the database to **Supabase**
(Postgres), each deployed on its own by a GitHub Actions workflow you start by hand, after the
checks pass. Database migrations apply themselves when a migration file changes. Step by step:
**[docs/DEPLOY.md](docs/DEPLOY.md)**.

Locally nothing changes: without `DATABASE_URL` the backend keeps using SQLite (`config/closed_loop.db`).

## Repository layout

```
closed-loop-fyp/
├── frontend/          React + Vite dashboard (TypeScript, Tailwind, TanStack Router)
├── backend/           FastAPI service: replay, predictor, monitor, work orders, insights,
│   │                  grounding check, chat tools, model selection, cloud client
│   ├── app/             the API (api/ routers, services/ logic)
│   ├── ml/              FYP1 ML pipeline: features, labels, evaluation, training, SHAP, saved models
│   ├── data/            the dataset (hydraulic_condition_monitoring_summary.csv)
│   └── tests/           pytest (stub models — no API key needed)
├── eval/              Evaluation harness: scenarios, runner, analysis, rating sheets, system performance
├── config/            Model choice, study tasks, settings, the SQLite database
│                      (keys and DB gitignored)
├── docs/              Architecture, API reference, development guide, dataset, scope
├── scripts/common.sh  Shell helpers for closed-loop.sh
├── closed-loop.sh     The one entry point for running anything
├── .env.example       Ports, cloud model, sign-in, email (copied to .env)
└── Daedalus/          Reference project only — not part of this app, never modified
```

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the pieces fit, the closed loop, request flows, design decisions
- [docs/API.md](docs/API.md) — every backend endpoint and live event, with request and response shapes
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — setup, configuration, settings, study mode, evaluation, checks, troubleshooting, and how to extend it
- [docs/DATASET.md](docs/DATASET.md) — the hydraulic dataset: sensors, labels, structure, verification
- [docs/FYP_NEW_SCOPE.md](docs/FYP_NEW_SCOPE.md) — the revised FYP topic, chapter by chapter
- [backend/ml/README.md](backend/ml/README.md) — the ML pipeline and its results
- [TODO.md](TODO.md) — the technical build plan, by milestone, with status

## Stack

Frontend: [Vite](https://vite.dev), [React 19](https://react.dev), TypeScript,
[TanStack Router](https://tanstack.com/router) (file-based routes),
[Tailwind CSS v4](https://tailwindcss.com), pnpm.
Backend: [FastAPI](https://fastapi.tiangolo.com), SQLite, httpx, psutil.
ML: scikit-learn, imbalanced-learn, XGBoost, SHAP.
AI: any OpenAI-compatible chat API.
