"""Interactive wizard that nudges Claude Code to POST telemetry to us.

We update ``~/.claude/settings.json`` with the six required OTEL keys,
backing the file up first and only adding missing keys (never overwriting
the user's existing values).
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path

REQUIRED = {
    "CLAUDE_CODE_ENABLE_TELEMETRY":   "1",
    "OTEL_EXPORTER_OTLP_ENDPOINT":    "http://localhost:8765",
    "OTEL_EXPORTER_OTLP_PROTOCOL":    "http/json",
    "OTEL_METRICS_EXPORTER":          "otlp",
    "OTEL_LOGS_EXPORTER":             "otlp",
    "OTEL_LOG_TOOL_DETAILS":          "1",
}


def _color(code: str, text: str) -> str:
    if not sys.stdout.isatty():
        return text
    return f"\033[{code}m{text}\033[0m"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--yes", action="store_true", help="apply without prompting")
    ap.add_argument("--port", type=int, default=int(os.environ.get("CC_PORT", "8765")))
    ap.add_argument("--settings", default=str(Path.home() / ".claude" / "settings.json"))
    args = ap.parse_args()

    settings_path = Path(args.settings)
    required = dict(REQUIRED)
    required["OTEL_EXPORTER_OTLP_ENDPOINT"] = f"http://localhost:{args.port}"

    settings: dict = {}
    if settings_path.exists():
        try:
            settings = json.loads(settings_path.read_text(encoding="utf-8") or "{}")
        except json.JSONDecodeError:
            print(_color("31", f"✗ {settings_path} is not valid JSON. Aborting."))
            return 2
    else:
        settings_path.parent.mkdir(parents=True, exist_ok=True)

    env = settings.get("env") or {}
    if not isinstance(env, dict):
        env = {}

    diffs = []
    for k, v in required.items():
        cur = env.get(k)
        if cur is None:
            diffs.append((k, None, v))
        elif str(cur) != str(v):
            diffs.append((k, cur, v))

    if not diffs:
        print(_color("32", "✓ OTEL is already configured. Nothing to do."))
        return 0

    print(_color("36", f"\nClaude Code settings: {settings_path}"))
    print("The following keys will be set under settings.env:")
    for k, cur, new in diffs:
        if cur is None:
            print(f"  + {_color('32', k)} = {new}")
        else:
            print(f"  ~ {_color('33', k)} = {cur!r} → {new!r}  (existing differs)")

    if not args.yes:
        try:
            ans = input("\nApply these changes? [Y/n] ").strip().lower()
        except EOFError:
            ans = "y"
        if ans and ans not in ("y", "yes"):
            print("Aborted.")
            return 1

    if settings_path.exists():
        ts = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup = settings_path.with_suffix(f".json.bak.{ts}")
        shutil.copy2(settings_path, backup)
        print(_color("90", f"  backup → {backup}"))

    for k, _cur, new in diffs:
        env[k] = new
    settings["env"] = env
    settings_path.write_text(json.dumps(settings, indent=2) + "\n", encoding="utf-8")
    print(_color("32", "✓ Updated."))
    print(_color("33", "  Quit and restart Claude Code so it picks up the new env."))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
