<h1 align="center">Closed Loop</h1>

<p align="center">
  <b>Predict the failure. Open the work order. Learn whether the prediction was right.</b><br>
  A predictive-maintenance dashboard for hydraulic systems, with an AI Advisor whose every number is checked against the data.
</p>

<p align="center">
  <img alt="FYP · UTP" src="https://img.shields.io/badge/FYP-UNIVERSITI%20TEKNOLOGI%20PETRONAS-B5FC04?style=for-the-badge&labelColor=1D1E1D">
  <img alt="DATASET UCI HYDRAULIC" src="https://img.shields.io/badge/DATASET-UCI%20HYDRAULIC-136C33?style=for-the-badge&labelColor=1D1E1D">
  <img alt="LICENSE MIT" src="https://img.shields.io/badge/LICENSE-MIT-C4A5F5?style=for-the-badge&labelColor=1D1E1D">
</p>

<p align="center"><sub>built with</sub></p>

<p align="center">
  <img alt="React 19" src="https://img.shields.io/badge/React%2019-20232A?style=flat&logo=react&logoColor=61DAFB">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white">
  <img alt="TanStack Router" src="https://img.shields.io/badge/TanStack%20Router-FF4154?style=flat&logo=reactrouter&logoColor=white">
  <img alt="Tailwind CSS v4" src="https://img.shields.io/badge/Tailwind%20CSS%20v4-06B6D4?style=flat&logo=tailwindcss&logoColor=white">
</p>

<p align="center">
  <img alt="Python 3.12" src="https://img.shields.io/badge/Python%203.12-3776AB?style=flat&logo=python&logoColor=white">
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-009688?style=flat&logo=fastapi&logoColor=white">
  <img alt="scikit-learn" src="https://img.shields.io/badge/scikit--learn-F7931E?style=flat&logo=scikitlearn&logoColor=white">
  <img alt="XGBoost" src="https://img.shields.io/badge/XGBoost%20%2B%20SHAP-189FDD?style=flat">
  <img alt="SQLite / Postgres" src="https://img.shields.io/badge/SQLite%20%2F%20Postgres-4169E1?style=flat&logo=postgresql&logoColor=white">
  <img alt="OpenAI-compatible" src="https://img.shields.io/badge/any%20OpenAI--compatible%20LLM-412991?style=flat&logo=openai&logoColor=white">
</p>

<p align="center">
  <img alt="Vercel" src="https://img.shields.io/badge/Vercel-000000?style=flat&logo=vercel&logoColor=white">
  <img alt="Render" src="https://img.shields.io/badge/Render-46E3B7?style=flat&logo=render&logoColor=1D1E1D">
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-3FCF8E?style=flat&logo=supabase&logoColor=white">
  <img alt="GitHub Actions" src="https://img.shields.io/badge/GitHub%20Actions-2088FF?style=flat&logo=githubactions&logoColor=white">
</p>

<p align="center"><sub>Final Year Project · Universiti Teknologi PETRONAS</sub></p>

---

## Contents

1. [What it does](#what-it-does)
2. [Getting started](#getting-started)
3. [Architecture](#architecture)
4. [Deploying](#deploying)
5. [Repository layout](#repository-layout)
6. [Documentation](#documentation) · [License](#license)

---

## What it does

Built around the **UCI Hydraulic Condition Monitoring** dataset. Recorded cycles are replayed as a
live feed; each cycle is scored by the four FYP1 models (cooler, valve, pump, accumulator) with SHAP
explanations. A monitor opens a maintenance **work order** when a component turns Critical, and a
technician closes it with what they found, and whether it matched the prediction. That feeds a
**confirmation rate** (**Work orders → History**), which closes the loop.

An AI **Advisor** closes the loop for people:

<div align="center">

| Feature | What it does |
|---|---|
| **Live insights** | When a component changes condition, crosses the risk threshold, or a work order opens or closes, the Advisor writes a short explanation by itself |
| **Chat** | Ask about the live state; the Advisor can look up status and history, and propose a work order that you confirm |
| **Grounding check** | Every number, work order ID and condition in the AI's text is checked against the data it was given; failures are rewritten once and otherwise marked *Unverified* |

</div>

The Advisor answers from a **cloud model** (OpenAI, Anthropic, Gemini, Groq, OpenRouter, DeepSeek,
Ollama Cloud, or any OpenAI-compatible endpoint), chosen on the **AI model** page. With nothing set
up yet, the dashboard asks for an API key; Groq and Google Gemini both offer free ones.

For the FYP's evaluation it also has:

<div align="center">

| Tool | What it does |
|---|---|
| **Study mode** | A researcher console at `/study/admin` for the user study: two conditions (dashboard only / dashboard + AI), fixed task presets, counterbalancing, a timed task log and CSV export |
| **Evaluation harness** | `eval/` measures grounding accuracy, hallucination rate and latency per model, with the validator on and off, plus a whole-system performance run |

</div>

---

## Getting started

Everything runs directly on your machine, no Docker.

### 1. Prerequisites

<div align="center">

| Tool | Version |
|---|---|
| Python | 3.11+ |
| Node.js | 22+ |
| pnpm | latest |
| An API key | one cloud provider (Groq and Gemini have free tiers) |

</div>

### 2. Install and run

```bash
./closed-loop.sh setup    # once: packages, .env, trains the ML models (~2 min)
./closed-loop.sh start    # http://localhost:8000, then add a key on the AI model page
```

Create an account (the first one becomes the admin, or set `ADMIN_EMAILS` in `.env` to choose who).
On **AI model**, add your own key for one provider, test it and press *Use*. Press play in the top
bar: the live insights run on the key of whoever presses Play.

### 3. Commands

<div align="center">

| Command | What it does |
|---|---|
| `./closed-loop.sh setup` | Install / upgrade dependencies, create `.env`, train the models if missing. Safe to re-run |
| `./closed-loop.sh start` | Build the dashboard once and serve it with the API on one port (lightest; for demos) |
| `./closed-loop.sh dev` | Hot-reload backend (:8000) + Vite (:5173), for editing code; Vite starts once the API answers |
| `./closed-loop.sh test` | Backend tests, frontend type check and lint |
| `./closed-loop.sh status` | Does the API answer (the models are per user, on the AI model page) |
| `./closed-loop.sh reset-db` | Delete the database (recreated empty on the next start); refuses while it holds study logs unless `--force` |

</div>

Ctrl-C stops everything the command started. Something not working? See
[Troubleshooting](docs/DEVELOPMENT.md#troubleshooting).

---

## Architecture

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/img/architecture-dark.png">
  <img src="docs/img/architecture.png" alt="Architecture diagram: a user reaches the React dashboard on Vercel over HTTPS; Vercel forwards /api and the SSE stream to FastAPI on Render, which scores cycles with scikit-learn models and SHAP, asks a cloud LLM for chat and insights, emails work orders through Brevo and stores data in Supabase Postgres; the user signs in with Google; GitHub Actions deploys Vercel and Render and migrates Supabase" width="100%">
</picture>

- **Frontend: Vercel.** The React/Vite dashboard. The browser uses the Vercel URL as its single origin; Vercel forwards `/api/*` to Render (`frontend/vercel.json`).
- **Backend: Render.** One FastAPI process runs the replay, the four scoring models with SHAP, the monitor, work orders, the insight engine, the grounding check and the chat tools. The models are trained during the Render build.
- **Database: Supabase.** Postgres in production; locally, without `DATABASE_URL`, the backend uses SQLite (`config/closed_loop.db`).
- **AI: the user's own key.** Every key belongs to a user and is encrypted at rest; there is no server key.
- **Delivery: GitHub Actions.** Runs the checks, applies migrations, and deploys each side by hand.

### The closed loop

Each lane is one part of the system; a replayed cycle travels from left to right and comes back as a
work order outcome.

```mermaid
flowchart LR
  subgraph data["Data"]
    csv[("UCI hydraulic<br/>dataset")]
    replay["Replay<br/>every N s"]
  end

  subgraph ml["Scoring"]
    predictor["Predictor<br/>4 models + SHAP<br/>~60 ms / cycle"]
  end

  subgraph ops["Operations"]
    monitor{"Critical<br/>× confirmCycles?"}
    wo["Work order<br/>opened"]
    email["Email<br/>(Brevo)"]
    outcome["Technician closes it<br/>finding · action · matched?"]
    rate["Confirmation rate"]
  end

  subgraph ai["AI Advisor"]
    insight["Insight engine<br/>triggers · cooldown"]
    ground{"Grounding<br/>check"}
    shown["Insight shown"]
  end

  csv --> replay --> predictor
  predictor --> monitor
  monitor -- yes --> wo --> outcome --> rate
  wo --> email
  predictor -->|condition change ·<br/>risk threshold| insight
  wo -->|opened / closed| insight
  insight --> ground
  ground -- pass --> shown
  ground -- fail --> insight
  rate -.->|was the prediction right?| predictor
```

### An insight, step by step

```mermaid
sequenceDiagram
  participant R as Replay
  participant P as Predictor
  participant E as Insight engine
  participant L as Cloud LLM
  participant G as Grounding check
  participant B as Browser (SSE)
  R->>P: "cycle" event
  P->>B: "prediction" (condition, failure probability, SHAP top 3)
  P->>E: condition changed / threshold crossed
  E->>E: snapshot.build() + prompts (insight-v1)
  E->>L: advisor.complete()
  L-->>E: draft text
  E->>G: validate(text, snapshot)
  alt every number, WO ID and condition found
    G-->>E: grounded
  else mismatches
    G-->>E: list of mismatches
    E->>L: one rewrite with the mismatches
    L-->>E: new text (marked Unverified if it fails again)
  end
  E->>B: "insight"
```

### Chat with tools

```mermaid
flowchart LR
  q["Engineer's question"] --> snap["Live snapshot<br/>in the system prompt"]
  snap --> loop["Model, up to 3 tool rounds<br/>get_equipment_status · get_history"]
  loop --> loop
  loop --> propose{"create_work_order?"}
  propose -- yes --> confirm["Confirm card<br/>nothing created until approved"]
  confirm --> created["Work order<br/>(created by user)"]
  propose -- no --> check{"Grounding check"}
  check --> reply["Reply streamed<br/>grounded or Unverified"]
```

More detail (every module, the tables, model selection, secrets): **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

### Tech stack

<div align="center">

| Layer | Choice |
|---|---|
| Frontend | Vite, React 19, TypeScript, TanStack Router (file-based routes), Tailwind CSS v4, pnpm |
| Backend | FastAPI, httpx, psutil; SQLite locally, Postgres (Supabase) in production |
| ML | scikit-learn, imbalanced-learn, XGBoost, SHAP |
| AI | Any OpenAI-compatible chat API, one key per user (Fernet-encrypted) |
| Auth | Email + password (scrypt) and Google sign-in; server-side sessions |
| Email | Brevo over HTTPS (Gmail SMTP locally) |
| Hosting | Vercel (dashboard) · Render (API) · Supabase (Postgres) |
| CI / CD | GitHub Actions: checks, database migrations, hand-started deploys |

</div>

---

## Deploying

The frontend goes to **Vercel**, the backend to **Render** and the database to **Supabase**
(Postgres), each deployed on its own by a GitHub Actions workflow you start by hand, after the
checks pass. Database migrations apply themselves when a migration file changes. Step by step:
**[docs/DEPLOY.md](docs/DEPLOY.md)**.

<div align="center">

| Workflow | What it does |
|---|---|
| `checks.yml` | Backend tests (trains the models first), frontend type check and lint |
| `database.yml` | Applies Supabase migrations when a migration file changes |
| `deploy-frontend.yml` | Deploys the dashboard to Vercel |
| `deploy-backend.yml` | Triggers the Render deploy hook (auto-deploy is off) |

</div>

Locally nothing changes: without `DATABASE_URL` the backend keeps using SQLite.

---

## Repository layout

```
closed-loop-fyp/
├── frontend/          React + Vite dashboard (TypeScript, Tailwind, TanStack Router)
├── backend/           FastAPI service: replay, predictor, monitor, work orders, insights,
│   │                  grounding check, chat tools, model selection, cloud client
│   ├── app/             the API (api/ routers, services/ logic)
│   ├── ml/              FYP1 ML pipeline: features, labels, evaluation, training, SHAP, saved models
│   ├── data/            the dataset (hydraulic_condition_monitoring_summary.csv)
│   └── tests/           pytest (stub models, no API key needed)
├── eval/              Evaluation harness: scenarios, runner, analysis, rating sheets, system performance
├── config/            Model choice, study tasks, settings, the SQLite database
│                      (keys and DB gitignored)
├── docs/              Architecture, API reference, development guide, dataset, scope
├── scripts/common.sh  Shell helpers for closed-loop.sh
├── closed-loop.sh     The one entry point for running anything
├── .env.example       Ports, cloud model, sign-in, email (copied to .env)
└── Daedalus/          Reference project only, not part of this app, never modified
```

---

## Documentation

<div align="center">

| Document | What's in it |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the pieces fit, the closed loop, request flows, design decisions |
| [docs/API.md](docs/API.md) | Every backend endpoint and live event, with request and response shapes |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Setup, configuration, settings, study mode, evaluation, checks, troubleshooting, extending it |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Vercel, Render and Supabase, step by step |
| [docs/DATASET.md](docs/DATASET.md) | The hydraulic dataset: sensors, labels, structure, verification |
| [docs/FYP_NEW_SCOPE.md](docs/FYP_NEW_SCOPE.md) | The revised FYP topic, chapter by chapter |
| [backend/ml/README.md](backend/ml/README.md) | The ML pipeline and its results |
| [TODO.md](TODO.md) | The technical build plan, by milestone, with status |

</div>

## License

[MIT](LICENSE). The architecture diagram was made with [stack-diagram](https://github.com/caru-ini/stack-diagram); brand logos belong to their owners.
