#!/usr/bin/env bash
# Command Centre installer.
#
# Idempotent. Safe to re-run. Defaults to the directory you cloned this repo
# into; pass `--into <dir>` to install elsewhere.
#
#   ./install.sh                 interactive
#   ./install.sh --yes           non-interactive, accept all defaults
#   ./install.sh --no-otel       skip the settings.json wizard
#   ./install.sh --no-launchd    don't load the launchd agents
#   ./install.sh --port 8765     change the API port
#   ./install.sh --no-start      don't boot the server at the end

set -euo pipefail

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------

YES=0; OTEL=1; LAUNCHD=1; START=1
PORT="${CC_PORT:-8765}"
DEFAULT_MODEL="${MISSION_CONTROL_DEFAULT_MODEL:-claude-sonnet-4-6}"
INTO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$INTO"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes|-y)              YES=1;;
    --no-otel)             OTEL=0;;
    --no-launchd)          LAUNCHD=0;;
    --no-start)            START=0;;
    --port)                PORT="$2"; shift;;
    --port=*)              PORT="${1#*=}";;
    --model)               DEFAULT_MODEL="$2"; shift;;
    --model=*)             DEFAULT_MODEL="${1#*=}";;
    --into)                INTO="$2"; shift;;
    --into=*)              INTO="${1#*=}";;
    --project-root)        PROJECT_ROOT="$2"; shift;;
    --project-root=*)      PROJECT_ROOT="${1#*=}";;
    -h|--help)
      sed -n '2,18p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'
      exit 0;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
  shift
done

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

green()  { printf "\033[32m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }
red()    { printf "\033[31m%s\033[0m\n" "$*"; }
hdr()    { printf "\n\033[36m▶ %s\033[0m\n" "$*"; }

# ---------------------------------------------------------------------------
# Python detection — prefer Homebrew (PEP 604 unions need 3.10+ at runtime)
# ---------------------------------------------------------------------------

hdr "Python"
PYTHON=""
for cand in \
  /opt/homebrew/opt/python@3.14/bin/python3.14 \
  /opt/homebrew/opt/python@3.13/bin/python3.13 \
  /opt/homebrew/opt/python@3.12/bin/python3.12 \
  /opt/homebrew/opt/python@3.11/bin/python3.11 \
  /opt/homebrew/bin/python3.14 \
  /opt/homebrew/bin/python3.13 \
  /opt/homebrew/bin/python3.12 \
  python3.14 python3.13 python3.12 python3.11 python3.10 python3
do
  if cmd_path=$(command -v "$cand" 2>/dev/null); then
    if "$cmd_path" -c 'import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)' >/dev/null 2>&1; then
      PYTHON="$cmd_path"; break
    fi
  fi
done
if [[ -z "$PYTHON" ]]; then
  red "No Python ≥ 3.10 found. Install Homebrew Python: brew install python@3.12"
  exit 1
fi
green "  using $PYTHON ($("$PYTHON" --version))"

# ---------------------------------------------------------------------------
# Layout
# ---------------------------------------------------------------------------

hdr "Layout: $INTO"
mkdir -p "$INTO" "$INTO/data" "$INTO/logs"
if [[ "$INTO" != "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)" ]]; then
  rsync -a --exclude=".venv" --exclude="node_modules" --exclude=".tmp" \
        --exclude="data/*.db*" --exclude="logs" \
        "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/" "$INTO/"
fi

# ---------------------------------------------------------------------------
# Virtualenv + dependencies
# ---------------------------------------------------------------------------

hdr "Virtualenv"
if [[ ! -d "$INTO/.venv" ]]; then
  "$PYTHON" -m venv "$INTO/.venv"
fi
"$INTO/.venv/bin/pip" install -q --upgrade pip
"$INTO/.venv/bin/pip" install -q -r "$INTO/requirements.txt"
green "  deps installed"

# ---------------------------------------------------------------------------
# UI build
# ---------------------------------------------------------------------------

hdr "UI"
if [[ -d "$INTO/ui" ]]; then
  if command -v npm >/dev/null 2>&1; then
    if [[ ! -d "$INTO/ui/node_modules" ]]; then
      (cd "$INTO/ui" && npm install --silent --no-fund --no-audit)
    fi
    if [[ ! -d "$INTO/ui/dist" ]]; then
      (cd "$INTO/ui" && npx vite build)
    fi
    green "  ui/dist ready"
  else
    yellow "  npm not found — skipping UI build (server will still start)"
  fi
fi

# ---------------------------------------------------------------------------
# .env
# ---------------------------------------------------------------------------

hdr "Configuration"
if [[ ! -f "$INTO/.env" ]]; then
  cp "$INTO/.env.example" "$INTO/.env"
  green "  wrote $INTO/.env"
else
  green "  $INTO/.env already exists — not overwriting"
fi

# ---------------------------------------------------------------------------
# DB init
# ---------------------------------------------------------------------------

hdr "Database"
"$INTO/.venv/bin/python" "$INTO/scripts/db.py"

# ---------------------------------------------------------------------------
# OTEL wizard
# ---------------------------------------------------------------------------

if [[ $OTEL -eq 1 ]]; then
  hdr "OTEL → ~/.claude/settings.json"
  if [[ $YES -eq 1 ]]; then
    "$INTO/.venv/bin/python" "$INTO/scripts/setup_otel.py" --yes --port "$PORT"
  else
    "$INTO/.venv/bin/python" "$INTO/scripts/setup_otel.py" --port "$PORT" || true
  fi
fi

# ---------------------------------------------------------------------------
# launchd agents
# ---------------------------------------------------------------------------

if [[ $LAUNCHD -eq 1 ]]; then
  hdr "launchd"
  AGENTS="$HOME/Library/LaunchAgents"
  mkdir -p "$AGENTS"

  for tmpl in "$INTO/templates/launchd/"*.plist.template; do
    [[ -f "$tmpl" ]] || continue
    out="$AGENTS/$(basename "$tmpl" .template)"
    sed -e "s|{{PYTHON}}|$INTO/.venv/bin/python|g" \
        -e "s|{{INSTALL_DIR}}|$INTO|g" \
        -e "s|{{PROJECT_ROOT}}|$PROJECT_ROOT|g" \
        -e "s|{{PORT}}|$PORT|g" \
        -e "s|{{DEFAULT_MODEL}}|$DEFAULT_MODEL|g" \
        "$tmpl" > "$out"
    launchctl unload "$out" 2>/dev/null || true
    launchctl load "$out" 2>/dev/null || yellow "  could not load $out (may need permission)"
    green "  installed $(basename "$out")"
  done
fi

# ---------------------------------------------------------------------------
# Symlink cc into ~/.local/bin if available
# ---------------------------------------------------------------------------

if [[ -d "$HOME/.local/bin" ]]; then
  ln -sf "$INTO/cc" "$HOME/.local/bin/cc"
  green "  linked: $HOME/.local/bin/cc"
fi

# ---------------------------------------------------------------------------
# Boot
# ---------------------------------------------------------------------------

if [[ $START -eq 1 && $LAUNCHD -eq 0 ]]; then
  hdr "Starting server"
  ( cd "$INTO" && nohup "$INTO/.venv/bin/python" -m uvicorn scripts.server:app \
      --host 127.0.0.1 --port "$PORT" --log-level warning \
      > "$INTO/logs/server.out.log" 2> "$INTO/logs/server.err.log" & )
  sleep 2
fi

green ""
green "═══════════════════════════════════════════════"
green " Command Centre installed."
green "═══════════════════════════════════════════════"
echo
echo " Open:    http://127.0.0.1:${PORT}/"
echo " Doctor:  $INTO/cc doctor"
echo " Logs:    $INTO/logs/"
if [[ $OTEL -eq 1 ]]; then
  echo
  yellow " ⚠  Quit and restart Claude Code to activate OTEL."
fi
