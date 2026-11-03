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

The Advisor runs on a **local model** (Ollama) or a **cloud API** (OpenAI,
Anthropic, Gemini, Groq, OpenRouter, DeepSeek, or any OpenAI-compatible
endpoint), chosen on the **Models** page. With nothing set up yet, the
dashboard offers to install and start Ollama for you (Linux, no sudo).

For the FYP's evaluation it also has:

- **Study mode** — a researcher console at `/study/admin` for the user
  study: two conditions (dashboard only / dashboard + AI), fixed task
  presets, counterbalancing, a timed task log and CSV export.
- **Evaluation harness** — `eval/` measures grounding accuracy,
  hallucination rate and latency per model, with the validator on and off,
  plus a whole-system performance run.

## Quick start

Needs Python 3.11+, Node 22+ and pnpm. [Ollama](https://ollama.com) is
optional: `setup` offers to install it (no sudo), or use a cloud API.
Everything runs directly on your machine — no Docker.

```bash
./closed-loop.sh setup    # once: packages, .env, trains the ML models (~2 min), offers Ollama
./closed-loop.sh start    # http://localhost:8000 — starts Ollama if needed
```

Then **Models → Download** a chat model (`qwen3:1.7b` on an 8 GB laptop) or
add a key under **Cloud APIs**, and press play in the top bar.

| Command | What it does |
|---|---|
| `./closed-loop.sh setup` | Install / upgrade dependencies, create `.env`, train the models if missing, offer to install Ollama. Safe to re-run |
| `./closed-loop.sh start` | Build the dashboard once and serve it with the API on one port (lightest; for demos) |
| `./closed-loop.sh dev` | Hot-reload backend (:8000) + Vite (:5173), for editing code; Vite starts once the API answers |
| `./closed-loop.sh test` | Backend tests, frontend type check and lint |
| `./closed-loop.sh status` | Does the API answer, which model is active, is Ollama up |
| `./closed-loop.sh reset-db` | Delete the database (recreated empty on the next start); refuses while it holds study logs unless `--force` |

Ctrl-C stops everything the command started. Something not working? See
[Troubleshooting](docs/DEVELOPMENT.md#troubleshooting).

### Low-resource machines

The defaults suit a 4-core, 8 GB laptop with no GPU (measured with
`qwen3:1.7b` on CPU: a verified insight in ~30 s, a tool-using chat answer in
~12 s). The knobs, all in `.env` (see `.env.example`):

- `OLLAMA_CONTEXT_LENGTH`, `OLLAMA_NUM_PREDICT`, `OLLAMA_KEEP_ALIVE`,
  `OLLAMA_NUM_THREAD` — memory and time per request;
- `OLLAMA_NUM_PARALLEL=1`, `OLLAMA_MAX_LOADED_MODELS=1`, a `q8_0` KV cache —
  one model in RAM, requests queue;
- `OMP_NUM_THREADS` — CPU threads for the ML predictor.

In the app, **Models → Settings** has *Rest between insights* (keeps a slow
model free for chat) and *Let the Advisor use tools* (off = one streamed
model call per answer). On 4 GB use `qwen3:0.6b` or `gemma3:1b`, or a cloud
API to take the model off the machine entirely.

## Repository layout

```
closed-loop-fyp/
├── frontend/          React + Vite dashboard (TypeScript, Tailwind, TanStack Router)
├── backend/           FastAPI service: replay, predictor, monitor, work orders, insights,
│   │                  grounding check, chat tools, model selection, Ollama + cloud clients
│   ├── app/             the API (api/ routers, services/ logic)
│   ├── ml/              FYP1 ML pipeline: features, labels, evaluation, training, SHAP, saved models
│   ├── data/            the dataset (hydraulic_condition_monitoring_summary.csv)
│   └── tests/           pytest (stub models — no Ollama or key needed)
├── eval/              Evaluation harness: scenarios, runner, analysis, rating sheets, system performance
├── config/            Model choice, study tasks, settings, the SQLite database, a local Ollama
│                      (keys, DB and Ollama gitignored)
├── docs/              Architecture, API reference, development guide, dataset, scope
├── scripts/common.sh  Shell helpers for closed-loop.sh
├── closed-loop.sh     The one entry point for running anything
├── .env.example       Ports, Ollama address, low-resource limits (copied to .env)
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
AI: [Ollama](https://ollama.com) or any OpenAI-compatible API.
