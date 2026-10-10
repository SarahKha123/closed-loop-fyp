# Closed Loop

A predictive-maintenance dashboard for hydraulic systems, built around the
UCI Hydraulic Condition Monitoring dataset. FYP, Universiti Teknologi
PETRONAS.

Recorded cycles are replayed as a live feed. Each cycle is scored by the four
FYP1 models (cooler, valve, pump, accumulator) with SHAP explanations; a
monitor opens a maintenance work order when a component turns Critical and
closes it on recovery. An AI **Advisor** closes the loop for people:

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
endpoint), chosen on the **Models** page.

## Quick start

Needs Python 3.11+, Node 22+, pnpm, and [Ollama](https://ollama.com) for local
models. Everything runs directly on your machine — no Docker.

```bash
./closed-loop.sh setup    # once: packages, .env, trains the ML models (~2 min)
./closed-loop.sh start    # http://localhost:8000 — starts Ollama if needed
```

Then **Models → Download** a chat model (`qwen3:1.7b` on an 8 GB laptop) or
add a key under **Cloud APIs**, and press play in the top bar.

| Command | What it does |
|---|---|
| `./closed-loop.sh setup` | Install dependencies, create `.env`, train the models if missing |
| `./closed-loop.sh start` | Build the dashboard once and serve it with the API on one port (lightest; for demos) |
| `./closed-loop.sh dev` | Hot-reload backend (:8000) + Vite (:5173), for editing code |
| `./closed-loop.sh test` | Backend tests, frontend type check and lint |
| `./closed-loop.sh status` | Does the API answer, which model is active, is Ollama up |
| `./closed-loop.sh reset-db` | Delete the database (recreated empty on the next start) |

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
├── config/            Runtime config, settings and the SQLite database (keys and DB gitignored)
├── docs/              Architecture, API reference, development guide, dataset, scope
├── scripts/common.sh  Shell helpers for closed-loop.sh
├── closed-loop.sh     The one entry point for running anything
├── .env.example       Ports, Ollama address, low-resource limits (copied to .env)
└── Daedalus/          Reference project only — not part of this app, never modified
```

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the pieces fit, the closed loop, request flows, design decisions
- [docs/API.md](docs/API.md) — every backend endpoint and live event, with request and response shapes
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — setup, configuration, settings, checks, and how to extend it
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
