#!/usr/bin/env bash
# Closed Loop — single entry point for everything you'd want to run.
#
#   ./closed-loop.sh setup      one-time: dependencies, .env, trained models
#   ./closed-loop.sh start      build the dashboard once and serve it with the API
#                               on one port (lightest; use this for demos)
#   ./closed-loop.sh dev        hot-reload backend + Vite dev server (for coding)
#   ./closed-loop.sh test       backend tests + frontend type check and lint
#   ./closed-loop.sh status     whether the API and Ollama answer
#   ./closed-loop.sh reset-db   delete the database (recreated empty on next start)
#
# Everything runs directly on this machine — no containers. Both `start` and
# `dev` start `ollama serve` if Ollama is installed but not running (with the
# low-resource limits from .env), and stop it again on Ctrl-C.

set -euo pipefail
cd "$(dirname "$0")"

# shellcheck source=scripts/common.sh
. ./scripts/common.sh

load_env

BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
PY=backend/.venv/bin/python

usage() { sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; }

CMD="${1:-help}"

# ── commands ─────────────────────────────────────────────────────────────────

cmd_setup() {
  head_ "Checking prerequisites"
  local missing=0
  for tool in node python3; do
    if have "$tool"; then ok "$tool $($tool --version 2>/dev/null | head -1)"
    else err "$tool is not installed"; missing=1; fi
  done
  if have pnpm; then ok "pnpm $(pnpm --version)"
  elif have corepack; then warn "pnpm missing — enabling via corepack"; corepack enable || true
  else err "pnpm is not installed (npm i -g pnpm)"; missing=1; fi
  [ "$missing" -eq 0 ] || { err "install the missing tools above, then re-run"; exit 1; }

  head_ "Configuration"
  ensure_env
  ensure_dirs

  head_ "Frontend dependencies"
  pnpm --dir frontend install
  ok "node modules installed"

  head_ "Backend virtualenv"
  # A venv whose Python was removed (e.g. an uninstalled conda) still has its
  # folder and scripts, so test the interpreter, not the directory.
  if $PY -c "" 2>/dev/null; then
    ok "backend/.venv already exists"
  else
    rm -rf backend/.venv
    python3 -m venv backend/.venv
    ok "created backend/.venv"
  fi
  $PY -m pip install --quiet --upgrade pip
  $PY -m pip install --quiet -r backend/requirements.txt -r backend/requirements-dev.txt
  ok "python packages installed"

  head_ "ML models"
  # Trained models aren't committed; build them once from the committed dataset (~2 min).
  if ls backend/ml/models/*.joblib >/dev/null 2>&1; then
    ok "trained models present"
  else
    (cd backend && .venv/bin/python -m ml.train) || fail "model training failed — the output above says why"
    ok "models trained"
  fi

  head_ "Local language models (optional)"
  if have ollama; then ok "ollama $(ollama --version 2>/dev/null | tail -1)"
  else warn "Ollama not installed — get it from https://ollama.com, or use a cloud API on the Models page"; fi

  head_ "Done"
  say "  ${DIM}Run it:${RESET}      ./closed-loop.sh start"
  say "  ${DIM}Hot reload:${RESET}  ./closed-loop.sh dev"
  say ""
}

need_setup() {
  $PY -c "import uvicorn" 2>/dev/null || fail "backend/.venv missing or broken — run './closed-loop.sh setup' first"
  [ -d frontend/node_modules ] || fail "frontend/node_modules missing — run './closed-loop.sh setup' first"
  ensure_env
  ensure_dirs
}

# Start Ollama ourselves if it's installed but not running; leave an
# already-running one alone (it isn't ours to stop). Sets OLLAMA_PID.
OLLAMA_PID=""
maybe_start_ollama() {
  if ! check_ollama && have ollama; then
    ollama serve >/dev/null 2>&1 &
    OLLAMA_PID=$!
    ok "started ollama serve (pid $OLLAMA_PID)"
  fi
}

cmd_start() {
  need_setup
  head_ "Building the dashboard"
  pnpm --dir frontend build >/dev/null || fail "frontend build failed — run 'pnpm --dir frontend build' to see why"
  ok "frontend/dist ready"
  maybe_start_ollama

  head_ "Starting Closed Loop"
  ok "dashboard   http://localhost:${BACKEND_PORT}"
  ok "API docs    http://localhost:${BACKEND_PORT}/docs"
  say "  ${DIM}Ctrl-C stops it${RESET}"
  say ""
  trap '[ -n "$OLLAMA_PID" ] && kill $OLLAMA_PID 2>/dev/null || true' EXIT INT TERM
  CLOSED_LOOP_STATIC_DIR=frontend/dist $PY -m uvicorn app.main:app --app-dir backend \
    --port "$BACKEND_PORT" --timeout-graceful-shutdown 3
}

cmd_dev() {
  need_setup
  maybe_start_ollama

  head_ "Starting dev servers"
  $PY -m uvicorn app.main:app --reload --reload-dir backend/app \
    --port "$BACKEND_PORT" --app-dir backend --timeout-graceful-shutdown 3 &
  local api_pid=$!
  trap 'kill $api_pid ${OLLAMA_PID:-} 2>/dev/null || true' EXIT INT TERM
  ok "backend   http://localhost:${BACKEND_PORT}  (pid $api_pid)"
  ok "frontend  http://localhost:${FRONTEND_PORT}"
  say ""
  # Point Vite's /api proxy at this backend, whatever port it's on.
  CLOSED_LOOP_API_URL="http://localhost:${BACKEND_PORT}" pnpm --dir frontend dev --port "$FRONTEND_PORT"
}

cmd_test() {
  need_setup
  head_ "Backend tests"
  (cd backend && .venv/bin/python -m pytest -q)
  head_ "Frontend checks"
  pnpm --dir frontend exec tsc -b && ok "types"
  pnpm --dir frontend exec oxlint src && ok "lint"
}

# The backend recreates the tables on its next start (db.init_db). Stop it
# first: a running server keeps the old file open.
cmd_reset_db() {
  rm -f config/closed_loop.db config/closed_loop.db-wal config/closed_loop.db-shm
  ok "database removed — restart the backend to recreate it empty"
}

cmd_status() {
  head_ "API"
  if curl -fsS --max-time 3 "http://localhost:${BACKEND_PORT}/api/models/active" >/dev/null 2>&1; then
    ok "reachable on :${BACKEND_PORT}"
    curl -fsS --max-time 3 "http://localhost:${BACKEND_PORT}/api/models/active" | python3 -m json.tool 2>/dev/null | sed 's/^/  /'
  else
    warn "API not reachable on :${BACKEND_PORT} — is it running?"
  fi
  head_ "Ollama"
  check_ollama || true
  say ""
}

case "$CMD" in
  setup)    cmd_setup ;;
  start)    cmd_start ;;
  dev)      cmd_dev ;;
  test)     cmd_test ;;
  status)   cmd_status ;;
  reset-db) cmd_reset_db ;;
  -h|--help|help) usage ;;
  *) err "unknown command '$CMD'"; say ""; usage; exit 1 ;;
esac
