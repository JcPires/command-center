"""Atomic task lifecycle helpers shared by heartbeat + dispatcher.

Every state transition is one SQL UPDATE with a status precondition. The
``rowcount`` tells us whether *we* claimed the row vs. someone else (another
heartbeat, a manual --once, etc.) raced us first.
"""
from __future__ import annotations

import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

# Make the project's `scripts/` importable so we share `db.connect`.
ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / "scripts"))

from db import connect  # noqa: E402


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def claim_pending(task_id: int) -> dict | None:
    """Atomically flip ``pending → running``. Returns the row, or None if
    the task was already claimed (or not pending)."""
    with connect() as conn:
        cur = conn.execute(
            """UPDATE ops_tasks
               SET status='running', started_at=?
               WHERE id = ? AND status='pending'""",
            (_now_iso(), task_id),
        )
        if cur.rowcount == 0:
            return None
        row = conn.execute(
            "SELECT * FROM ops_tasks WHERE id = ?", (task_id,)
        ).fetchone()
        return dict(row) if row else None


def list_runnable(limit: int = 10) -> list[dict]:
    """Tasks ready to run, ordered by priority then created_at."""
    with connect() as conn:
        rows = conn.execute(
            """SELECT id FROM ops_tasks
               WHERE status='pending'
                 AND (scheduled_for IS NULL OR scheduled_for <= ?)
               ORDER BY priority DESC, created_at ASC
               LIMIT ?""",
            (_now_iso(), limit),
        ).fetchall()
    return [dict(r) for r in rows]


def update_session(task_id: int, session_id: str) -> None:
    with connect() as conn:
        conn.execute(
            "UPDATE ops_tasks SET session_id = ? WHERE id = ?",
            (session_id, task_id),
        )


def complete_task(task_id: int, output_summary: str | None, duration_ms: int) -> None:
    with connect() as conn:
        conn.execute(
            """UPDATE ops_tasks
               SET status='done', completed_at=?, duration_ms=?,
                   output_summary=?, consecutive_failures=0
               WHERE id = ?""",
            (_now_iso(), duration_ms, (output_summary or "")[:8000], task_id),
        )


def fail_task(task_id: int, error_message: str, duration_ms: int) -> None:
    with connect() as conn:
        conn.execute(
            """UPDATE ops_tasks
               SET status='failed', completed_at=?, duration_ms=?,
                   error_message=?,
                   consecutive_failures = COALESCE(consecutive_failures, 0) + 1
               WHERE id = ?""",
            (_now_iso(), duration_ms, error_message[:4000], task_id),
        )


def gate_for_approval(task_id: int) -> None:
    """Promote a pending task to awaiting_approval (autonomy=manual / review)."""
    with connect() as conn:
        conn.execute(
            "UPDATE ops_tasks SET status='awaiting_approval' WHERE id = ? AND status='pending'",
            (task_id,),
        )


def is_emergency_stopped() -> bool:
    with connect() as conn:
        r = conn.execute(
            "SELECT value FROM system_state WHERE key='emergency_stop'"
        ).fetchone()
    return bool(r) and str(r["value"]) == "1"


def heartbeat(detail: str = "ok", metadata: str | None = None) -> None:
    with connect() as conn:
        conn.execute(
            "INSERT INTO activities (event_type, detail, metadata) VALUES ('heartbeat', ?, ?)",
            (detail, metadata),
        )
