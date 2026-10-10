#!/usr/bin/env bash
# Shared helpers for closed-loop.sh. Sourced, not run.
#
# Trimmed from Daedalus's scripts/common.sh: coloured output, a .env that
# never silently drifts from .env.example, and an Ollama check.
#
# Callers must `cd` to the repo root before sourcing.

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  cat >&2 <<'USAGE'
scripts/common.sh is a library, not a command — there is nothing to run.

It defines the helpers closed-loop.sh uses. Source it instead:

    cd "$(git rev-parse --show-toplevel)"
    . ./scripts/common.sh

You probably wanted:

    ./closed-loop.sh --help
USAGE
  exit 1
fi

# ── output ───────────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'
  RED=$'\033[31m'; RESET=$'\033[0m'
else
  BOLD=''; DIM=''; GREEN=''; YELLOW=''; RED=''; RESET=''
fi

say()   { printf '%s\n' "$*"; }
ok()    { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$*"; }
warn()  { printf '  %s!%s %s\n' "$YELLOW" "$RESET" "$*"; }
err()   { printf '  %s✗%s %s\n' "$RED" "$RESET" "$*" >&2; }
info()  { printf '    %s\n' "$*"; }
head_() { printf '\n%s%s%s\n' "$BOLD" "$*" "$RESET"; }
fail()  { err "$*"; exit 1; }

have()  { command -v "$1" >/dev/null 2>&1; }

# ── environment file ─────────────────────────────────────────────────────────
env_missing_keys() {
  [ -f .env ] && [ -f .env.example ] || return 0
  local key
  while IFS= read -r key; do
    grep -q "^${key}=" .env 2>/dev/null || printf '%s\n' "$key"
  done < <(grep -E '^[A-Z_][A-Z0-9_]*=' .env.example | cut -d= -f1)
}

env_backfill() {
  local missing=()
  mapfile -t missing < <(env_missing_keys)
  [ ${#missing[@]} -eq 0 ] && return 0
  {
    printf '\n# --- added automatically on %s ---\n' "$(date '+%Y-%m-%d %H:%M')"
    local key
    for key in "${missing[@]}"; do grep -m1 "^${key}=" .env.example; done
  } >> .env
  printf '%s\n' "${missing[@]}"
}

ensure_env() {
  if [ ! -f .env ]; then
    cp .env.example .env
    ok "created .env from .env.example"
    return 0
  fi
  local added=()
  mapfile -t added < <(env_backfill)
  if [ ${#added[@]} -gt 0 ]; then
    ok "added missing settings to .env: ${added[*]}"
  else
    ok ".env present and complete"
  fi
}

# load_env — .env's values, with anything already exported in this shell
# winning. Plain `set -a; . ./.env` gets this backwards: a shell assignment
# always beats the environment, so `BACKEND_PORT=9000 ./closed-loop.sh
# start` would silently use 8000 instead.
load_env() {
  [ -f .env ] || return 0
  local preserved=() key
  while IFS='=' read -r key _; do
    key="${key%%[[:space:]]*}"
    case "$key" in ''|'#'*) continue ;; esac
    [ -n "${!key+x}" ] && preserved+=("$key=${!key}")
  done < .env

  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a

  local kv
  for kv in ${preserved[@]+"${preserved[@]}"}; do export "${kv?}"; done
}

ensure_dirs() { mkdir -p config; }

# ── readiness ─────────────────────────────────────────────────────────────────
check_ollama() {
  local url="${OLLAMA_BASE_URL:-http://localhost:11434}"
  if curl -fsS --max-time 2 "${url}/api/tags" >/dev/null 2>&1; then
    ok "Ollama reachable at ${url}"
    return 0
  fi
  warn "no Ollama reachable at ${url}"
  info "install it from https://ollama.com, or use a cloud API on the Models page"
  return 1
}
