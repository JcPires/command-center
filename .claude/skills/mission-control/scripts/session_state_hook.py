"""Claude Code hook target — writes one row to ``live_session_state`` per
lifecycle event.

Wire it from ``~/.claude/settings.json`` like::

    "hooks": [
      {
        "matcher": ".*",
        "command": "python3 /path/to/.claude/skills/mission-control/scripts/session_state_hook.py"
      }
    ]

The hook is invoked with the event payload on stdin (per Claude Code spec).
We update a single row keyed by session_id so the API's
``/api/sessions/live/{sid}/state`` always reflects the latest known state.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / "scripts"))

from db import connect, init_db  # noqa: E402


def main() -> None:
    init_db()
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        payload = {}

    session_id = payload.get("session_id") or payload.get("sessionId")
    if not session_id:
        return

    state = (
        payload.get("state")
        or payload.get("event_name")
        or payload.get("event")
        or "active"
    )
    current_tool = payload.get("tool_name") or payload.get("tool") or None
    now = datetime.now(timezone.utc).isoformat()

    with connect() as conn:
        conn.execute(
            """INSERT INTO live_session_state (session_id, state, current_tool, updated_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(session_id) DO UPDATE SET
                 state = excluded.state,
                 current_tool = excluded.current_tool,
                 updated_at = excluded.updated_at""",
            (session_id, str(state)[:100], current_tool, now),
        )


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001
        # Hooks must never crash Claude Code — log to stderr and exit 0.
        print(f"[session_state_hook] {e}", file=sys.stderr)
