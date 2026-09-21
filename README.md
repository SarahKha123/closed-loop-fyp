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

```bash
pnpm install
pnpm dev
```

Then open the URL Vite prints (defaults to `http://localhost:5173`).

## Project layout

```
src/
  routes/        # TanStack Router pages: loop, work orders, sensor feed
  components/     # Sidebar, Advisor panel, status pill, page header
  lib/             # status → style helpers
  data.ts          # dashboard data (components, work orders, sensors, KPIs)
  index.css        # Tailwind theme tokens (colors, fonts)
```
