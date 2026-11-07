#!/usr/bin/env bash
# Closed Loop — single entry point for everything you'd want to run.
#
#   ./closed-loop.sh setup      one-time: dependencies, .env, trained models
#   ./closed-loop.sh start      build the dashboard once and serve it with the API
#                               on one port (lightest; use this for demos)
#   ./closed-loop.sh dev        hot-reload backend + Vite dev server (for coding)
#   ./closed-loop.sh test       backend tests + frontend type check and lint
#   ./closed-loop.sh status     whether the API answers, and which model it uses
#   ./closed-loop.sh reset-db   delete the database (recreated empty on next start);
#                               refuses while it holds user-study logs, unless --force
#
# Everything runs directly on this machine — no containers. The Advisor answers
# from a cloud API on each user's own key, added on the AI model page.

set -euo pipefail
cd "$(dirname "$0")"

# shellcheck source=scripts/common.sh
. ./scripts/common.sh

load_env

BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
PY=backend/.venv/bin/python

usage() { sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; }

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
  # folder and scripts, so test the interpreter, not the directory. Also test
  # pip: without ensurepip, `python3 -m venv` leaves a venv that has no pip.
  if $PY -m pip --version >/dev/null 2>&1; then
    ok "backend/.venv already exists"
  else
    python3 -c "import ensurepip" 2>/dev/null \
      || fail "python3 has no venv/ensurepip support — on Debian/Ubuntu run: sudo apt install python3-venv (or python3.$(python3 -c 'import sys; print(sys.version_info[1])')-venv)"
    rm -rf backend/.venv
    python3 -m venv backend/.venv
    ok "created backend/.venv"
  fi
  $PY -m pip install --quiet --upgrade pip
  # --upgrade: requirements are unpinned and the committed models are trained on
  # the latest releases, so a stale venv would warn about version mismatches.
  $PY -m pip install --quiet --upgrade -r backend/requirements.txt -r backend/requirements-dev.txt
  ok "python packages installed"

  head_ "ML models"
  # Trained models aren't committed; build them once from the committed dataset (~2 min).
  if ls backend/ml/models/*.joblib >/dev/null 2>&1; then
    ok "trained models present"
  else
    (cd backend && .venv/bin/python -m ml.train) || fail "model training failed — the output above says why"
    ok "models trained"
  fi

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

cmd_start() {
  need_setup
  head_ "Building the dashboard"
  pnpm --dir frontend build >/dev/null || fail "frontend build failed — run 'pnpm --dir frontend build' to see why"
  ok "frontend/dist ready"

  head_ "Starting Closed Loop"
  ok "dashboard   http://localhost:${BACKEND_PORT}"
  ok "API docs    http://localhost:${BACKEND_PORT}/docs"
  say "  ${DIM}Ctrl-C stops it${RESET}"
  say ""
  trap 'exit 130' INT TERM
  CLOSED_LOOP_STATIC_DIR=frontend/dist $PY -m uvicorn app.main:app --app-dir backend \
    --port "$BACKEND_PORT" --timeout-graceful-shutdown 3
}

# Global, not `local`: the EXIT trap runs after cmd_dev has returned, where a
# local is gone and `set -u` turns it into "unbound variable".
API_PID=""
stop_dev() {
  if [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null; then
    wait "$API_PID" 2>/dev/null || true # let uvicorn finish logging before the prompt returns
  fi
  return 0
}

# Block until the backend answers, so Vite's first proxied requests don't hit
# a closed port while the models load. Fails fast if the backend dies.
wait_for_api() {
  local _
  for _ in $(seq 1 120); do
    curl -fsS --max-time 1 "http://localhost:${BACKEND_PORT}/api/health" >/dev/null 2>&1 && return 0
    kill -0 "$API_PID" 2>/dev/null || fail "the backend exited during startup — the output above says why"
    sleep 0.5
  done
  fail "the backend didn't answer on :${BACKEND_PORT} within 60 s"
}

cmd_dev() {
  need_setup

  head_ "Starting dev servers"
  trap 'stop_dev' EXIT
  trap 'exit 130' INT TERM # → the EXIT trap, so cleanup runs exactly once
  $PY -m uvicorn app.main:app --reload --reload-dir backend/app \
    --port "$BACKEND_PORT" --app-dir backend --timeout-graceful-shutdown 3 &
  API_PID=$!
  wait_for_api
  ok "backend   http://localhost:${BACKEND_PORT}  (pid $API_PID)"
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
  # The study log and the work-order outcomes live in the same database: never lose
  # participants' data or technicians' findings by accident.
  rows() { $PY -c "import sqlite3; print(sqlite3.connect('config/closed_loop.db').execute('SELECT COUNT(*) FROM $1').fetchone()[0])" 2>/dev/null || echo 0; }
  local study outcomes
  study=$(rows tbl_StudyLog)
  outcomes=$(rows tbl_WorkOrderOutcome)
  if [[ "${2:-}" != "--force" ]]; then
    [[ "$study" == "0" ]] || fail "the database holds $study user-study log rows — export them (GET /api/study/export) first, then: ./closed-loop.sh reset-db --force"
    [[ "$outcomes" == "0" ]] || fail "the database holds $outcomes work-order outcomes — export them (GET /api/work-orders/outcomes.csv) first, then: ./closed-loop.sh reset-db --force"
  fi
  rm -f config/closed_loop.db config/closed_loop.db-wal config/closed_loop.db-shm
  ok "database removed — restart the backend to recreate it empty"
}

cmd_status() {
  head_ "API"
  if curl -fsS --max-time 3 "http://localhost:${BACKEND_PORT}/api/health" >/dev/null 2>&1; then
    ok "reachable on :${BACKEND_PORT}"
    curl -fsS --max-time 3 "http://localhost:${BACKEND_PORT}/api/health" | python3 -m json.tool 2>/dev/null | sed 's/^/  /'
  else
    warn "API not reachable on :${BACKEND_PORT} — is it running?"
  fi
  say ""
}

case "$CMD" in
  setup)    cmd_setup ;;
  start)    cmd_start ;;
  dev)      cmd_dev ;;
  test)     cmd_test ;;
  status)   cmd_status ;;
  reset-db) cmd_reset_db "$@" ;;
  -h|--help|help) usage ;;
  *) err "unknown command '$CMD'"; say ""; usage; exit 1 ;;
esac
