# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — build the dashboard
# ─────────────────────────────────────────────────────────────────────────────
FROM node:24-slim AS frontend

WORKDIR /build

RUN corepack enable

COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY frontend/tsconfig*.json frontend/vite.config.ts frontend/index.html ./
COPY frontend/src ./src

RUN pnpm build


# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — runtime: FastAPI serves the API *and* the built dashboard
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    CLOSED_LOOP_STATIC_DIR=/app/static \
    OMP_NUM_THREADS=2 \
    OPENBLAS_NUM_THREADS=2 \
    MKL_NUM_THREADS=2

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./requirements.txt
RUN pip install -r requirements.txt

# The dataset and the ML pipeline; the models are trained here (~2 min, once —
# cached until ml/ or data/ change) because trained models aren't committed.
COPY backend/data ./data
COPY backend/ml ./ml
RUN python -m ml.train

COPY backend/app ./app
COPY --from=frontend /build/dist ./static

RUN mkdir -p /config \
    && useradd --create-home --uid 1000 closedloop \
    && chown -R closedloop:closedloop /app /config
USER closedloop

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -fsS http://localhost:8000/api/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--timeout-graceful-shutdown", "3"]


# ─────────────────────────────────────────────────────────────────────────────
# Stage 3 — development: the same runtime, with the source bind-mounted over it
# ─────────────────────────────────────────────────────────────────────────────
#
# Built FROM runtime, not assembled separately, so the dev image never drifts
# from the one that ships. docker-compose.yml pins `target: runtime` so this
# stage — last in the file, and therefore Docker's default target — is never
# what gets built by accident.
FROM runtime AS dev

# Vite serves the UI in dev mode; FastAPI must not also serve the stale bundle
# baked into the image at the same paths.
ENV CLOSED_LOOP_STATIC_DIR=/app/static-disabled

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--reload", "--reload-dir", "/app/app", "--timeout-graceful-shutdown", "3"]
