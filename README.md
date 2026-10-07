# Closed Loop

A predictive-maintenance dashboard for hydraulic systems, built around the
UCI Hydraulic Condition Monitoring dataset. FYP I, Universiti Teknologi
PETRONAS.

The dashboard surfaces live-style component health (cooler, valve, pump,
accumulator), auto-generated maintenance work orders, a raw sensor feed,
and an advisor chat panel that explains why a component was flagged.

## Stack

- [Vite](https://vite.dev) + [React](https://react.dev) + TypeScript
- [TanStack Router](https://tanstack.com/router) (file-based routing)
- [Tailwind CSS v4](https://tailwindcss.com)
- [pnpm](https://pnpm.io) as the package manager

## Getting started

Needs Node, pnpm and Python 3. Docker is optional.

```bash
./closed-loop.sh setup        # once: pnpm packages + backend/.venv
./closed-loop.sh dev --host   # backend :8000 + frontend :5173, no Docker
```

Open `http://localhost:5173`. The Advisor chat also needs
[Ollama](https://ollama.com) running (`ollama serve`).

With Docker, `./closed-loop.sh start` runs everything in one container at
`http://localhost:8000`. See `./closed-loop.sh --help` for the rest.

## Project layout

```
src/
  routes/        # TanStack Router pages: loop, work orders, sensor feed
  components/     # Sidebar, Advisor panel, status pill, page header
  lib/             # status → style helpers
  data.ts          # dashboard data (components, work orders, sensors, KPIs)
  index.css        # Tailwind theme tokens (colors, fonts)
```
