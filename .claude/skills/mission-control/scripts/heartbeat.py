"""Mission Control heartbeat — launchd-driven tick.

Every invocation:
  1. Materialize schedules whose next_run_at has passed (creates ops_tasks rows).
  2. Recompute next_run_at via parse_cron_simple().
  3. Hand off to dispatcher.run_once().
  4. Write an `activities(event_type='heartbeat')` row so /api/system/health
     can surface daemon staleness.

Invoke with ``--once`` for manual single-tick runs (used by
``POST /api/dispatcher/trigger``). Without args, falls into a 120s loop
when called directly (mostly for local debugging — production runs via
launchd).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from db import connect, init_db  # noqa: E402
import task_tracker               # noqa: E402
import dispatcher                 # noqa: E402

HEARTBEAT_INTERVAL = int(os.environ.get("HEARTBEAT_INTERVAL", "120"))


# ---------------------------------------------------------------------------
# Cron parsing — same convention as the API server (Mon=0..Sun=6)
# ---------------------------------------------------------------------------

def parse_cron_simple(expr: str, now: datetime | None = None) -> datetime | None:
    parts = expr.strip().split()
    if len(parts) != 5:
        return None
    minute, hour, dom, month, dow = parts

    def _vals(field: str) -> set[int] | None:
        if field == "*":
            return None
        out: set[int] = set()
        for chunk in field.split(","):
            chunk = chunk.strip()
            try: out.add(int(chunk))
            except ValueError: return set()
        return out

    minute_set = _vals(minute)
    hour_set   = _vals(hour)
    dom_set    = _vals(dom)
    month_set  = _vals(month)
    dow_set    = _vals(dow)

    n = (now or datetime.now().astimezone()).replace(second=0, microsecond=0)
    cur = n + timedelta(minutes=1)
    for _ in range(366 * 24 * 60):
        if minute_set is not None and cur.minute not in minute_set:
            cur += timedelta(minutes=1); continue
        if hour_set is not None and cur.hour not in hour_set:
            cur += timedelta(minutes=1); continue
        if dom_set is not None and cur.day not in dom_set:
            cur += timedelta(minutes=1); continue
        if month_set is not None and cur.month not in month_set:
            cur += timedelta(minutes=1); continue
        if dow_set is not None and cur.weekday() not in dow_set:
            cur += timedelta(minutes=1); continue
        return cur.astimezone(timezone.utc)
    return None


# ---------------------------------------------------------------------------
# Schedule materialization
# ---------------------------------------------------------------------------

def materialise_schedules() -> int:
    """Walk enabled schedules whose next_run_at is due. Insert ops_tasks +
    bump next_run_at. Wraps in BEGIN IMMEDIATE so concurrent heartbeats
    can't double-materialize.
    """
    now = datetime.now(timezone.utc).isoformat()
    created = 0
    with connect() as conn:
        try:
            conn.execute("BEGIN IMMEDIATE")
            rows = conn.execute(
                """SELECT id, name, cron_expression, task_title, task_description,
                          assigned_skill, next_run_at
                   FROM ops_schedules
                   WHERE enabled=1
                     AND (next_run_at IS NULL OR next_run_at <= ?)""",
                (now,),
            ).fetchall()
            for r in rows:
                conn.execute(
                    """INSERT INTO ops_tasks
                       (title, description, status, priority, assigned_skill, execution_mode, quadrant)
                       VALUES (?, ?, 'pending', 5, ?, 'classic', 'schedule')""",
                    (r["task_title"], r["task_description"], r["assigned_skill"]),
                )
                nxt = parse_cron_simple(r["cron_expression"])
                conn.execute(
                    "UPDATE ops_schedules SET next_run_at = ?, last_run_at = ? WHERE id = ?",
                    (nxt.isoformat() if nxt else None, now, r["id"]),
                )
                created += 1
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise
    return created


# ---------------------------------------------------------------------------
# Tick
# ---------------------------------------------------------------------------

def tick() -> dict:
    init_db()
    materialised = materialise_schedules()
    dispatch_counts = dispatcher.run_once()
    detail = json.dumps({"materialised": materialised, **dispatch_counts})
    task_tracker.heartbeat("ok", detail)
    return {"materialised": materialised, **dispatch_counts}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true", help="run a single tick and exit")
    args = ap.parse_args()
    if args.once:
        print(tick())
        return
    while True:
        try:
            tick()
        except Exception as e:  # noqa: BLE001
            print(f"[heartbeat] error: {e}", file=sys.stderr)
        time.sleep(HEARTBEAT_INTERVAL)


if __name__ == "__main__":
    main()
