"""In-flight session detection.

A session is "live" when its JSONL file has been written to in the last
``LIVE_WINDOW_SECONDS``. We pair that with the ``live_session_state`` table
(written by a Claude Code hook) when it's available.
"""
from __future__ import annotations

import os
import time
from pathlib import Path

from db import connect

LIVE_WINDOW_SECONDS = int(os.environ.get("CC_LIVE_WINDOW", "300"))
PROJECTS_DIR = Path(os.environ.get("CC_PROJECTS_DIR") or Path.home() / ".claude" / "projects")
PROJECT_ROOT = Path(__file__).resolve().parents[1]
DISPATCHER_PID_DIR = PROJECT_ROOT / ".tmp" / "mission-control-queue" / "pids"


def list_live(now: float | None = None) -> list[dict]:
    """Return live sessions: session_id, cwd, model, mtime_age_seconds, state."""
    now = now or time.time()
    cutoff = now - LIVE_WINDOW_SECONDS
    live_files: dict[str, float] = {}
    for fp in PROJECTS_DIR.glob("*/*.jsonl"):
        try:
            m = fp.stat().st_mtime
        except OSError:
            continue
        if m >= cutoff:
            live_files[fp.stem] = m

    if not live_files:
        return []

    rows = []
    with connect() as conn:
        placeholders = ",".join("?" * len(live_files))
        for r in conn.execute(
            f"""SELECT s.session_id, s.cwd, s.model, s.title, s.effective_tokens,
                       s.started_at, lss.state, lss.current_tool
                FROM sessions s
                LEFT JOIN live_session_state lss ON lss.session_id = s.session_id
                WHERE s.session_id IN ({placeholders})
                ORDER BY s.started_at DESC""",
            list(live_files.keys()),
        ):
            sid = r["session_id"]
            rows.append({
                "session_id":          sid,
                "cwd":                 r["cwd"],
                "model":               r["model"],
                "title":               r["title"],
                "effective_tokens":    r["effective_tokens"],
                "started_at":          r["started_at"],
                "state":               r["state"] or "active",
                "current_tool":        r["current_tool"],
                "mtime_age_seconds":   int(now - live_files[sid]),
                "dispatcher_managed":  (DISPATCHER_PID_DIR / f"sid-{sid}").exists(),
            })
    return rows


def session_jsonl_path(session_id: str) -> Path | None:
    for fp in PROJECTS_DIR.glob(f"*/{session_id}.jsonl"):
        return fp
    return None
