#!/usr/bin/env bash
# Closed Loop — single entry point for everything you'd want to run.
#
#   ./closed-loop.sh setup      one-time: install dependencies for local development
#   ./closed-loop.sh start      build (if needed) and start the container stack
#   ./closed-loop.sh dev        hot-reload dev stack, in containers
#   ./closed-loop.sh stop       stop the stack
#   ./closed-loop.sh logs       follow the stack's logs
#   ./closed-loop.sh rebuild    force a clean image rebuild, then start
#   ./closed-loop.sh status     what's running, and whether the API answers
#
# Flags:
#   --with-ollama            run Ollama as a container too (default: use the host)
#   --host                   dev only: run the two servers on the host, not in
#                            containers (faster to attach a debugger to)
#   --gpu / --no-gpu         force GPU passthrough on or off. The default is
#                            auto: on when this host has an NVIDIA GPU
#
# The stack is one container serving both the API and the built dashboard.
# `dev` layers docker-compose.dev.yml over it: same image, source bind-mounted,
# uvicorn and vite reloading in place.
#
# Modelled on Daedalus's daedalus.sh (see ./Daedalus, reference only) — same
# shape, scaled to one service and one optional sidecar instead of five
# databases and a search engine.

set -euo pipefail
cd "$(dirname "$0")"

# shellcheck source=scripts/common.sh
. ./scripts/common.sh

load_env

PORT="${CLOSED_LOOP_PORT:-8000}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

usage() { sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'; }

# ── argument parsing ─────────────────────────────────────────────────────────
CMD="${1:-start}"
[ $# -gt 0 ] && shift || true

PROFILE_ARGS=()
DEV_ON_HOST=0
GPU_MODE=auto

for arg in "$@"; do
  case "$arg" in
    --with-ollama) PROFILE_ARGS+=(--profile with-ollama) ;;
    --host)        DEV_ON_HOST=1 ;;
    --gpu)         GPU_MODE=on ;;
    --no-gpu)      GPU_MODE=off ;;
    -h|--help)     usage; exit 0 ;;
    *) err "unknown option '$arg' (try --help)"; exit 1 ;;
  esac
done

# ── GPU passthrough ──────────────────────────────────────────────────────────
gpu_overlay() {
  case "$GPU_MODE" in
    off) return 1 ;;
    on)  printf -- '-f docker-compose.gpu.yml'; return 0 ;;
  esac
  if have nvidia-smi && nvidia-smi -L 2>/dev/null | grep -q '^GPU '; then
    printf -- '-f docker-compose.gpu.yml'
    return 0
  fi
  return 1
}

# `compose up`, with the GPU overlay dropped rather than fatal when Docker will
# not honour it, and a failing build showing why.
_compose_up_once() {
  local log="$1"; shift
  if [ "${COMPOSE_UP_QUIET:-0}" = "1" ]; then
    compose "${PROFILE_ARGS[@]}" up "$@" >/dev/null 2>"$log"
    return $?
  fi
  compose "${PROFILE_ARGS[@]}" up "$@" 2>&1 | tee "$log"
  return "${PIPESTATUS[0]}"
}

compose_up() {
  local log rc
  log="$(mktemp)"
  _compose_up_once "$log" "$@"
  rc=$?
  if [ $rc -ne 0 ] && [ -n "${GPU_FILES:-}" ] && [ "$GPU_MODE" != "on" ] \
     && grep -qiE 'nvidia|could not select device driver|gpu' "$log"; then
    warn "this host advertises a GPU but Docker will not pass it through — continuing without it"
    say "  ${DIM}install the NVIDIA Container Toolkit, or pass --no-gpu to stop asking${RESET}"
    GPU_FILES=""
    export COMPOSE_FILES="$BASE_COMPOSE_FILES"
    _compose_up_once "$log" "$@"
    rc=$?
  fi
  [ $rc -eq 0 ] || [ "${COMPOSE_UP_QUIET:-0}" != "1" ] || tail -40 "$log" >&2
  rm -f "$log"
  return $rc
}

# ── commands ─────────────────────────────────────────────────────────────────

cmd_setup() {
  head_ "Checking prerequisites"
  local missing=0
  for tool in docker node python3; do
    if have "$tool"; then ok "$tool $($tool --version 2>/dev/null | head -1)"
    else err "$tool is not installed"; missing=1; fi
  done
  if have pnpm; then ok "pnpm $(pnpm --version)"
  elif have corepack; then warn "pnpm missing — enabling via corepack"; corepack enable || true
  else err "pnpm is not installed (npm i -g pnpm)"; missing=1; fi
  [ "$missing" -eq 0 ] || { err "install the missing tools above, then re-run"; exit 1; }

  head_ "Configuration"
  ensure_env

  head_ "Frontend dependencies"
  pnpm install
  ok "node modules installed"

  head_ "Backend virtualenv"
  if [ ! -d backend/.venv ]; then
    python3 -m venv backend/.venv
    ok "created backend/.venv"
  else
    ok "backend/.venv already exists"
  fi
  backend/.venv/bin/pip install --quiet --upgrade pip
  backend/.venv/bin/pip install --quiet -r backend/requirements.txt
  ok "python packages installed"

  head_ "Runtime directories"
  ensure_dirs
  ok "config/ ready"

  head_ "Optional"
  check_ollama || true

  head_ "Done"
  say "  ${DIM}Containers:${RESET}  ./closed-loop.sh start"
  say "  ${DIM}Hot reload:${RESET}  ./closed-loop.sh dev"
  say ""
}

cmd_start() {
  ensure_env
  ensure_dirs
  [ ${#PROFILE_ARGS[@]} -gt 0 ] || check_ollama || true
  BASE_COMPOSE_FILES="${COMPOSE_FILES:--f docker-compose.yml}"
  GPU_FILES="$(gpu_overlay || true)"
  export COMPOSE_FILES="$BASE_COMPOSE_FILES${GPU_FILES:+ $GPU_FILES}"
  head_ "Starting Closed Loop"
  compose_up -d "$@" || fail "the stack did not start — the output above says why"
  if wait_for_api "$PORT"; then
    ok "dashboard   http://localhost:${PORT}"
    ok "API docs    http://localhost:${PORT}/docs"
    say ""
    say "  ${DIM}Logs:${RESET} ./closed-loop.sh logs   ${DIM}Stop:${RESET} ./closed-loop.sh stop"
    say ""
  else
    err "the API did not become healthy in 60s. Recent logs:"
    compose "${PROFILE_ARGS[@]}" logs --tail=40 app >&2
    exit 1
  fi
}

cmd_dev() {
  [ "$DEV_ON_HOST" = "1" ] && { cmd_dev_host; return; }

  ensure_env
  ensure_dirs
  check_ollama || true

  BASE_COMPOSE_FILES="-f docker-compose.yml -f docker-compose.dev.yml"
  GPU_FILES="$(gpu_overlay || true)"
  export COMPOSE_FILES="$BASE_COMPOSE_FILES${GPU_FILES:+ $GPU_FILES}"

  head_ "Starting dev stack"
  say "  ${DIM}source is bind-mounted; uvicorn and vite both reload in place${RESET}"
  [ -n "$GPU_FILES" ] \
    && say "  ${DIM}GPU passed through — /api/hardware describes the real card${RESET}" \
    || say "  ${DIM}no GPU passthrough; hardware detection will say so rather than report none${RESET}"
  say ""
  COMPOSE_UP_QUIET=1 compose_up -d --build app \
    || fail "could not start the backend — the build output above says why"

  if wait_for_api "$BACKEND_PORT"; then
    ok "backend   http://localhost:${BACKEND_PORT}"
  else
    err "the API did not become healthy in 60s. Recent logs:"
    compose logs --tail=40 app >&2
    exit 1
  fi
  ok "frontend  http://localhost:${FRONTEND_PORT}  ${DIM}(starting — first run installs deps)${RESET}"
  say ""
  say "  ${DIM}Stop:${RESET} ./closed-loop.sh stop   ${DIM}Backend logs:${RESET} ./closed-loop.sh logs"
  say ""
  # Vite in the foreground, so Ctrl-C ends the session the way it always has.
  # The backend keeps running — it is a container now, `stop` owns its
  # lifetime, and killing it on every UI restart would be the wrong default.
  compose up frontend
}

# The older path: two processes on the host. A debugger attaches to a local
# process in one step, and a container that will not start is not a reason to
# be unable to run anything.
cmd_dev_host() {
  [ -x backend/.venv/bin/uvicorn ] || fail "backend/.venv missing — run './closed-loop.sh setup' first"
  [ -d node_modules ] || fail "node_modules missing — run './closed-loop.sh setup' first"
  ensure_env
  ensure_dirs
  check_ollama || true

  head_ "Starting dev servers on the host"
  CLOSED_LOOP_CONFIG_DIR=config backend/.venv/bin/uvicorn app.main:app --reload \
    --port "$BACKEND_PORT" --app-dir backend --timeout-graceful-shutdown 3 &
  local api_pid=$!
  trap 'kill $api_pid 2>/dev/null || true' EXIT INT TERM
  ok "backend   http://localhost:${BACKEND_PORT}  (pid $api_pid)"
  ok "frontend  http://localhost:${FRONTEND_PORT}"
  say ""
  pnpm dev --port "$FRONTEND_PORT"
}

# `--remove-orphans`: `dev` layers an overlay that adds a service (frontend)
# and renames a container; without the flag a `down` from the base file alone
# leaves those behind as containers compose no longer believes in.
cmd_stop()    { compose "${PROFILE_ARGS[@]}" down --remove-orphans; }
cmd_logs()    { compose "${PROFILE_ARGS[@]}" logs -f; }
cmd_rebuild() { ensure_dirs; cmd_start --build --force-recreate; }

cmd_status() {
  head_ "Containers"
  compose ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null || say "  none running"

  head_ "API"
  if curl -fsS --max-time 3 "http://localhost:${PORT}/api/models/active" >/dev/null 2>&1; then
    ok "reachable on :${PORT}"
    curl -fsS --max-time 3 "http://localhost:${PORT}/api/models/active" | python3 -m json.tool 2>/dev/null | sed 's/^/  /'
  else
    warn "API not reachable on :${PORT} — is it running?"
  fi
  say ""
}

case "$CMD" in
  setup)        cmd_setup ;;
  start|up)     cmd_start ;;
  dev)          cmd_dev ;;
  stop|down)    cmd_stop ;;
  logs)         cmd_logs ;;
  rebuild)      cmd_rebuild ;;
  status)       cmd_status ;;
  -h|--help|help) usage ;;
  *) err "unknown command '$CMD'"; say ""; usage; exit 1 ;;
esac
