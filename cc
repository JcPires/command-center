#!/usr/bin/env bash
# Command Centre launcher shim. One entry point for the daily verbs.
#
#   cc start         — boot the FastAPI server (foreground unless launchd loaded)
#   cc stop          — kill the FastAPI server (and Mission Control launchd job if present)
#   cc restart       — stop then start
#   cc doctor        — run scripts/doctor.py
#   cc setup otel    — run scripts/setup_otel.py
#   cc sync          — manual JSONL re-scrape
#   cc logs          — tail -f the server + dispatcher logs

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON="${PYTHON:-${ROOT}/.venv/bin/python}"
if [[ ! -x "$PYTHON" ]]; then
  PYTHON="$(command -v python3.14 || command -v python3.13 || command -v python3.12 || command -v python3.11 || command -v python3.10 || command -v python3 || echo python3)"
fi

PORT="${CC_PORT:-8765}"
HOST="${CC_HOST:-127.0.0.1}"

# Load .env if present
if [[ -f "$ROOT/.env" ]]; then
  set -a; source "$ROOT/.env"; set +a
fi

mkdir -p "$ROOT/logs"

cmd_start() {
  if curl -sf "http://${HOST}:${PORT}/api/health" >/dev/null 2>&1; then
    echo "[cc] already running on ${HOST}:${PORT}"
    return 0
  fi
  echo "[cc] booting server on ${HOST}:${PORT}…"
  exec "$PYTHON" -m uvicorn scripts.server:app --host "$HOST" --port "$PORT" --log-level warning
}

cmd_stop() {
  local pids
  pids=$(pgrep -f "uvicorn scripts.server:app" || true)
  if [[ -n "$pids" ]]; then
    echo "[cc] stopping server pids: $pids"
    kill $pids 2>/dev/null || true
  else
    echo "[cc] no server process found"
  fi
  if launchctl list 2>/dev/null | grep -q "com.commandcentre"; then
    launchctl unload "$HOME/Library/LaunchAgents/com.commandcentre.mission-control.plist" 2>/dev/null || true
    launchctl unload "$HOME/Library/LaunchAgents/com.commandcentre.server.plist" 2>/dev/null || true
    echo "[cc] unloaded launchd agents"
  fi
}

cmd_restart() { cmd_stop; sleep 1; cmd_start; }

cmd_doctor() { exec "$PYTHON" "$ROOT/scripts/doctor.py"; }

cmd_setup() {
  case "${1:-}" in
    otel) shift; exec "$PYTHON" "$ROOT/scripts/setup_otel.py" "$@";;
    *)    echo "usage: cc setup otel"; exit 2;;
  esac
}

cmd_sync() {
  curl -sf -X POST "http://${HOST}:${PORT}/api/sync" \
    | "$PYTHON" -c "import json,sys; print(json.dumps(json.load(sys.stdin), indent=2))"
}

cmd_logs() {
  if [[ ! -d "$ROOT/logs" ]] || ! ls "$ROOT/logs/"*.log >/dev/null 2>&1; then
    echo "[cc] no logs in $ROOT/logs/"; return 1
  fi
  exec tail -f "$ROOT/logs/"*.log
}

case "${1:-}" in
  start)   shift; cmd_start "$@";;
  stop)    shift; cmd_stop "$@";;
  restart) shift; cmd_restart "$@";;
  doctor)  shift; cmd_doctor "$@";;
  setup)   shift; cmd_setup "$@";;
  sync)    shift; cmd_sync "$@";;
  logs)    shift; cmd_logs "$@";;
  ""|-h|--help|help)
    cat <<EOF
Command Centre — usage:

  cc start              Boot the FastAPI server (port ${PORT})
  cc stop               Kill server + unload launchd agents
  cc restart            stop then start
  cc doctor             Run health checks (no LLM)
  cc setup otel [--yes] Update ~/.claude/settings.json with OTEL env
  cc sync               Manual JSONL re-scrape
  cc logs               tail -f logs/

Open the dashboard at: http://${HOST}:${PORT}/
EOF
    ;;
  *) echo "[cc] unknown verb: $1"; exit 2;;
esac
