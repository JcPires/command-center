"""Deterministic health check. No LLM calls. Exits 0 when everything green.

Used by ``cc doctor`` to confirm the install is functional and that Claude
Code will be able to post telemetry to us.
"""
from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
from pathlib import Path
from urllib.request import urlopen

REQUIRED_OTEL_KEYS = (
    "CLAUDE_CODE_ENABLE_TELEMETRY",
    "OTEL_EXPORTER_OTLP_ENDPOINT",
    "OTEL_EXPORTER_OTLP_PROTOCOL",
    "OTEL_METRICS_EXPORTER",
    "OTEL_LOGS_EXPORTER",
    "OTEL_LOG_TOOL_DETAILS",
)


def _color(code: str, text: str) -> str:
    return text if not sys.stdout.isatty() else f"\033[{code}m{text}\033[0m"


def _ok(msg: str) -> None:    print(f"  {_color('32', '✓')} {msg}")
def _warn(msg: str) -> None:  print(f"  {_color('33', '!')} {msg}")
def _err(msg: str) -> None:   print(f"  {_color('31', '✗')} {msg}")


def check_python() -> bool:
    v = sys.version_info
    if v >= (3, 10):
        _ok(f"Python {v.major}.{v.minor}.{v.micro}")
        return True
    _warn(f"Python {v.major}.{v.minor} — recommend 3.10+ (PEP 604 unions)")
    return False


def check_claude_cli() -> bool:
    from shutil import which
    p = which("claude")
    if p:
        _ok(f"`claude` CLI on PATH: {p}")
        return True
    _warn("`claude` not on PATH — dispatcher won't be able to spawn child runs")
    return False


def check_claude_settings() -> bool:
    sp = Path.home() / ".claude" / "settings.json"
    if not sp.exists():
        _err(f"{sp} missing — run `cc setup otel`")
        return False
    try:
        data = json.loads(sp.read_text(encoding="utf-8") or "{}")
    except json.JSONDecodeError:
        _err(f"{sp} is not valid JSON")
        return False
    env = data.get("env") or {}
    missing = [k for k in REQUIRED_OTEL_KEYS if k not in env]
    if missing:
        _warn(f"settings.json missing OTEL keys: {', '.join(missing)} — run `cc setup otel`")
        return False
    _ok("settings.json has all 6 OTEL keys")
    return True


def check_projects_dir() -> bool:
    pd = Path.home() / ".claude" / "projects"
    if not pd.exists():
        _err(f"{pd} not found — Claude Code hasn't run yet?")
        return False
    files = list(pd.glob("*/*.jsonl"))
    _ok(f"{pd} — {len(files)} session files")
    return True


def check_cc_project_root() -> bool:
    v = os.environ.get("CC_PROJECT_ROOT")
    if v:
        _ok(f"CC_PROJECT_ROOT = {v}")
        return True
    _warn("CC_PROJECT_ROOT not set in env (using cwd) — fine for local dev")
    return True


def check_port_reachable(port: int) -> bool:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(1.5)
    try:
        s.connect(("127.0.0.1", port))
        s.close()
        _ok(f"port {port} reachable")
        return True
    except OSError:
        _err(f"port {port} not reachable — server not running?")
        return False


def check_health_endpoint(port: int) -> bool:
    try:
        with urlopen(f"http://127.0.0.1:{port}/api/system/health", timeout=2) as r:
            data = json.loads(r.read().decode("utf-8"))
        def _age(k: str) -> str:
            v = data.get(k)
            return f"{v}s" if v is not None else "—"
        _ok(f"uptime {data.get('uptime_seconds')}s · "
            f"OTEL age {_age('last_otel_event_age_seconds')} · "
            f"sync age {_age('last_sync_tick_age_seconds')}")
        return True
    except Exception as e:  # noqa: BLE001
        _err(f"GET /api/system/health failed: {e}")
        return False


def check_launchd() -> bool:
    try:
        out = subprocess.run(
            ["launchctl", "list"], capture_output=True, text=True, timeout=3
        ).stdout
        loaded = [
            "com.commandcentre.server" in out,
            "com.commandcentre.mission-control" in out,
        ]
        if all(loaded):
            _ok("launchd: server + mission-control loaded")
            return True
        if any(loaded):
            _warn("launchd: only some agents loaded — `cc start` to load both")
            return False
        _warn("launchd agents not loaded — run with `--no-launchd` or `cc start`")
        return False
    except (subprocess.SubprocessError, FileNotFoundError):
        _warn("launchctl unavailable — skipping")
        return True


def main() -> int:
    print(_color("36", "\nCommand Centre — doctor\n"))

    port = int(os.environ.get("CC_PORT", "8765"))
    checks = [
        ("Python",            check_python),
        ("Claude CLI",        check_claude_cli),
        ("settings.json",     check_claude_settings),
        ("~/.claude/projects",check_projects_dir),
        ("CC_PROJECT_ROOT",   check_cc_project_root),
        ("server port",       lambda: check_port_reachable(port)),
        ("health endpoint",   lambda: check_health_endpoint(port)),
        ("launchd",           check_launchd),
    ]

    fails = 0
    for name, fn in checks:
        print(_color("90", f"\n[{name}]"))
        try:
            ok = fn()
        except Exception as e:  # noqa: BLE001
            _err(str(e))
            ok = False
        if not ok:
            fails += 1

    print()
    if fails == 0:
        print(_color("32", "All checks passed."))
        return 0
    print(_color("31", f"{fails} check(s) failed."))
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
