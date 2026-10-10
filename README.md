# Closed Loop

A predictive-maintenance dashboard for hydraulic systems, built around the
UCI Hydraulic Condition Monitoring dataset. FYP I, Universiti Teknologi
PETRONAS.

The dashboard shows component health (cooler, valve, pump, accumulator) per
batch cycle, the maintenance work orders those cycles open and close, the raw
sensor means, and an **Advisor** chat that explains why a component was
flagged. The Advisor answers from a **local model** (Ollama) or a **cloud
API** (OpenAI, Anthropic, Gemini, Groq, OpenRouter, DeepSeek, or any
OpenAI-compatible endpoint), chosen on the **Models** page.

## Quick start

Needs Node 22+, pnpm, Python 3.11+, and [Ollama](https://ollama.com) for local
models. Docker is optional.

```bash
./closed-loop.sh setup        # once: frontend packages + backend virtualenv
./closed-loop.sh dev --host   # backend :8000 + frontend :5173, starts Ollama if needed
```

Open <http://localhost:5173>, then go to **Models → Download** to get a chat
model (or **Cloud APIs** to use a key).

### Low-resource machines

Defaults suit a 4-core, 8 GB laptop with no GPU (tested: `qwen3:1.7b` on CPU
writes a verified insight in ~30 s). The knobs, all in `.env`
(see `.env.example`): `OLLAMA_CONTEXT_LENGTH` (RAM per request),
`OLLAMA_NUM_PREDICT`, `OLLAMA_KEEP_ALIVE`, `OLLAMA_NUM_PARALLEL=1` /
`OLLAMA_MAX_LOADED_MODELS=1` (one model in RAM), a q8_0 KV cache, and
`OMP_NUM_THREADS` for the ML predictor. In the app, **Models → Settings →
Rest between insights** keeps a slow model free for chat. Use `qwen3:0.6b` or
`gemma3:1b` on 4 GB, or a cloud API to take the model off the machine entirely.

With Docker instead: `./closed-loop.sh start` serves everything from one
container at <http://localhost:8000>.

| Command | What it does |
|---|---|
| `./closed-loop.sh setup` | Install frontend and backend dependencies |
| `./closed-loop.sh dev --host` | Hot-reload dev servers on this machine (no Docker) |
| `./closed-loop.sh dev` | Same, in containers |
| `./closed-loop.sh start` | Build and run the production container |
| `./closed-loop.sh stop` / `logs` / `status` / `rebuild` | Manage the container stack |

## Repository layout

```
closed-loop-fyp/
├── frontend/          React + Vite dashboard (TypeScript, Tailwind, TanStack Router)
├── backend/           FastAPI service: live replay, data layer, model selection, Ollama, cloud APIs, Advisor chat
│   ├── app/             the API (api/ routers, services/ logic)
│   ├── ml/              FYP1 ML pipeline: features, labels, evaluation, training, SHAP, saved models
│   └── data/            the dataset (hydraulic_condition_monitoring_summary.csv)
├── config/            Runtime config and the SQLite database (cloud keys and DB gitignored)
├── docs/              Architecture, API reference, development guide
├── scripts/common.sh  Shell helpers for closed-loop.sh
├── closed-loop.sh     The one entry point for running anything
├── Dockerfile         Builds the frontend, then serves it from the backend
├── docker-compose*.yml  Base stack, dev overlay, GPU overlay
└── Daedalus/          Reference project only — not part of this app, never modified
```

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the pieces fit, request flows, design decisions
- [docs/API.md](docs/API.md) — every backend endpoint, with request and response shapes
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — setup, checks, and how to add a page, endpoint or provider
- [docs/DATASET.md](docs/DATASET.md) — the hydraulic dataset: sensors, labels, structure, verification
- [docs/FYP_NEW_SCOPE.md](docs/FYP_NEW_SCOPE.md) — the revised FYP topic, chapter by chapter
- [TODO.md](TODO.md) — the full technical build plan, by milestone

## Stack

Frontend: [Vite](https://vite.dev), [React 19](https://react.dev), TypeScript,
[TanStack Router](https://tanstack.com/router) (file-based routes),
[Tailwind CSS v4](https://tailwindcss.com), pnpm.
Backend: [FastAPI](https://fastapi.tiangolo.com), httpx, psutil.
