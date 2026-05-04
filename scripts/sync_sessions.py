"""Scrape Claude Code JSONL session files into SQLite.

Source: ``~/.claude/projects/<project-hash>/<session-id>.jsonl``

Per session we walk the file once, accumulating:
  - first/last timestamp, model, cwd, git_branch, source, sidechain flag
  - per-content-block tool_use → tool_result pairing (10-min duration cap)
  - usage totals from each ``assistant.message.usage``
  - error count, rate-limit hits, stop_reason

We then upsert the ``sessions`` row, REPLACE all ``tool_calls`` for that
session, and increment the per-(date, model, source) ``token_usage`` rollup
by the *delta* since last sync (using the previously-stored totals on
``sessions``). This keeps the rollup correct across re-parses.

Bucketing: dates are derived in **local time** so an evening session in
UTC+2 doesn't get pushed to "tomorrow".
"""
from __future__ import annotations

import json
import os
import sqlite3
import time
from collections.abc import Iterator
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from db import DEFAULT_DB_PATH, connect, init_db

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

PROJECTS_DIR = Path(os.environ.get("CC_PROJECTS_DIR") or Path.home() / ".claude" / "projects")
TOOL_DURATION_CAP_MS = 10 * 60 * 1000  # 10 minutes — orphans from crashed sessions

# Indicative pricing (USD per million tokens). User is on a flat-rate plan,
# so this is a relative-effort gauge, not a bill.
PRICING: dict[str, tuple[float, float]] = {
    # model_substring: (input_per_mtok, output_per_mtok)
    "opus":   (15.0, 75.0),
    "sonnet": ( 3.0, 15.0),
    "haiku":  ( 0.80, 4.0),
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_iso(ts: str | None) -> datetime | None:
    if not ts:
        return None
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def _local_date(ts: str | None) -> str | None:
    """ISO timestamp → 'YYYY-MM-DD' in the system's local time zone."""
    dt = _parse_iso(ts)
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone().strftime("%Y-%m-%d")


def _ms_between(start: str | None, end: str | None) -> int | None:
    a, b = _parse_iso(start), _parse_iso(end)
    if a is None or b is None:
        return None
    delta_ms = int((b - a).total_seconds() * 1000)
    return max(0, delta_ms)


def _price_for(model: str | None) -> tuple[float, float]:
    if not model:
        return (0.0, 0.0)
    m = model.lower()
    for needle, rates in PRICING.items():
        if needle in m:
            return rates
    return (0.0, 0.0)


def _estimate_cost(model: str | None, usage: dict[str, int]) -> float:
    inp, out = _price_for(model)
    if not (inp or out):
        return 0.0
    in_tok = usage.get("input_tokens", 0) + usage.get("cache_create_tokens", 0)
    out_tok = usage.get("output_tokens", 0)
    cache_read_tok = usage.get("cache_read_tokens", 0)
    # Cache reads at ~10% of input rate (Anthropic public pricing as of 2026)
    return (in_tok * inp + out_tok * out + cache_read_tok * inp * 0.10) / 1_000_000.0


def _iter_jsonl(path: Path) -> Iterator[dict[str, Any]]:
    with path.open("r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue


# ---------------------------------------------------------------------------
# Per-file aggregation
# ---------------------------------------------------------------------------

def _aggregate_file(path: Path) -> dict[str, Any] | None:
    """Walk one JSONL file and return the row dict (or None if unusable)."""
    session_id = path.stem  # filename = <uuid>.jsonl
    started_at: str | None = None
    ended_at: str | None = None
    cwd: str | None = None
    git_branch: str | None = None
    model: str | None = None
    is_sidechain_session = False
    title: str | None = None
    stop_reason: str | None = None

    usage = {"input_tokens": 0, "output_tokens": 0,
             "cache_read_tokens": 0, "cache_create_tokens": 0}
    error_count = 0
    rate_limit_hit = False

    pending_tool_uses: dict[str, dict[str, Any]] = {}  # tool_use_id → {ts, name, is_sidechain}
    tool_calls: list[dict[str, Any]] = []

    for ev in _iter_jsonl(path):
        ev_type = ev.get("type")
        ts = ev.get("timestamp")
        if ts:
            if started_at is None or ts < started_at:
                started_at = ts
            if ended_at is None or ts > ended_at:
                ended_at = ts

        if ev.get("isSidechain"):
            is_sidechain_session = True

        cwd = cwd or ev.get("cwd")
        git_branch = git_branch or ev.get("gitBranch")

        # Capture title from the first non-empty user prompt
        if title is None and ev_type == "user":
            msg = ev.get("message") or {}
            content = msg.get("content")
            text: str | None = None
            if isinstance(content, str):
                text = content
            elif isinstance(content, list):
                for b in content:
                    if isinstance(b, dict) and b.get("type") == "text":
                        text = b.get("text")
                        break
            if text:
                # Skip command-stub messages
                stripped = text.strip()
                if stripped and not stripped.startswith("<command-name>"):
                    title = stripped[:200]

        msg = ev.get("message") if isinstance(ev.get("message"), dict) else {}

        # Aggregate token usage from assistant messages
        if ev_type == "assistant":
            model = model or msg.get("model")
            stop_reason = msg.get("stop_reason") or stop_reason
            u = msg.get("usage") or {}
            usage["input_tokens"]        += int(u.get("input_tokens") or 0)
            usage["output_tokens"]       += int(u.get("output_tokens") or 0)
            usage["cache_read_tokens"]   += int(u.get("cache_read_input_tokens") or 0)
            usage["cache_create_tokens"] += int(u.get("cache_creation_input_tokens") or 0)

        # Walk content blocks for tool pairing + error accounting
        for block in msg.get("content") or []:
            if not isinstance(block, dict):
                continue
            btype = block.get("type")
            if btype == "tool_use":
                tu_id = block.get("id")
                if tu_id and ts:
                    pending_tool_uses[tu_id] = {
                        "ts": ts,
                        "name": block.get("name") or "?",
                        "is_sidechain": bool(ev.get("isSidechain")),
                    }
            elif btype == "tool_result":
                tu_id = block.get("tool_use_id")
                is_err = bool(block.get("is_error"))
                if is_err:
                    error_count += 1
                started = pending_tool_uses.pop(tu_id, None) if tu_id else None
                if started and ts:
                    dur = _ms_between(started["ts"], ts)
                    if dur is not None and dur > TOOL_DURATION_CAP_MS:
                        dur = None  # orphan from a crashed session
                    error_text = None
                    if is_err:
                        # tool_result content can be string or block list
                        c = block.get("content")
                        if isinstance(c, str):
                            error_text = c[:500]
                        elif isinstance(c, list):
                            for cb in c:
                                if isinstance(cb, dict) and cb.get("type") == "text":
                                    error_text = (cb.get("text") or "")[:500]
                                    break
                    tool_calls.append({
                        "session_id": session_id,
                        "tool_use_id": tu_id,
                        "tool_name": started["name"],
                        "ts": started["ts"],
                        "duration_ms": dur,
                        "error": error_text,
                        "is_sidechain": 1 if started["is_sidechain"] else 0,
                    })

        # Rate-limit detection: stop_reason or system event hints
        if stop_reason and "rate" in str(stop_reason).lower():
            rate_limit_hit = True

    # Orphan tool_uses (no matching tool_result) — record without duration
    for tu_id, started in pending_tool_uses.items():
        tool_calls.append({
            "session_id": session_id,
            "tool_use_id": tu_id,
            "tool_name": started["name"],
            "ts": started["ts"],
            "duration_ms": None,
            "error": None,
            "is_sidechain": 1 if started["is_sidechain"] else 0,
        })

    if started_at is None:
        return None  # empty / unparseable file

    total = sum(usage.values())
    effective = usage["input_tokens"] + usage["output_tokens"] + usage["cache_create_tokens"]
    cost = _estimate_cost(model, usage)

    # Determine source: best-effort heuristic — Cowork sessions live elsewhere
    source = "ide"

    return {
        "session_id": session_id,
        "source": source,
        "cwd": cwd,
        "git_branch": git_branch,
        "model": model,
        "started_at": started_at,
        "ended_at": ended_at,
        "input_tokens": usage["input_tokens"],
        "output_tokens": usage["output_tokens"],
        "cache_read_tokens": usage["cache_read_tokens"],
        "cache_create_tokens": usage["cache_create_tokens"],
        "total_tokens": total,
        "effective_tokens": effective,
        "cost_usd": round(cost, 6),
        "duration_ms": _ms_between(started_at, ended_at) or 0,
        "error_count": error_count,
        "rate_limit_hit": 1 if rate_limit_hit else 0,
        "stop_reason": stop_reason,
        "is_sidechain": 1 if is_sidechain_session else 0,
        "title": title,
        "tool_calls": tool_calls,
    }


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------

_UPSERT_SESSION_SQL = """
INSERT INTO sessions (
    session_id, source, cwd, git_branch, model, started_at, ended_at,
    input_tokens, output_tokens, cache_read_tokens, cache_create_tokens,
    total_tokens, effective_tokens, cost_usd, duration_ms, error_count,
    rate_limit_hit, stop_reason, is_sidechain, title, synced_at
) VALUES (
    :session_id, :source, :cwd, :git_branch, :model, :started_at, :ended_at,
    :input_tokens, :output_tokens, :cache_read_tokens, :cache_create_tokens,
    :total_tokens, :effective_tokens, :cost_usd, :duration_ms, :error_count,
    :rate_limit_hit, :stop_reason, :is_sidechain, :title, :synced_at
)
ON CONFLICT(session_id) DO UPDATE SET
    source              = excluded.source,
    cwd                 = excluded.cwd,
    git_branch          = excluded.git_branch,
    model               = excluded.model,
    started_at          = excluded.started_at,
    ended_at            = excluded.ended_at,
    input_tokens        = excluded.input_tokens,
    output_tokens       = excluded.output_tokens,
    cache_read_tokens   = excluded.cache_read_tokens,
    cache_create_tokens = excluded.cache_create_tokens,
    total_tokens        = excluded.total_tokens,
    effective_tokens    = excluded.effective_tokens,
    cost_usd            = excluded.cost_usd,
    duration_ms         = excluded.duration_ms,
    error_count         = excluded.error_count,
    rate_limit_hit      = excluded.rate_limit_hit,
    stop_reason         = excluded.stop_reason,
    is_sidechain        = excluded.is_sidechain,
    title               = COALESCE(excluded.title, sessions.title),
    synced_at           = excluded.synced_at
"""


def _persist(conn: sqlite3.Connection, row: dict[str, Any]) -> tuple[bool, dict[str, int]]:
    """Persist one session row + tool calls. Returns (was_new, token_delta)."""
    cur = conn.cursor()

    prev = cur.execute(
        "SELECT input_tokens, output_tokens, cache_read_tokens, cache_create_tokens "
        "FROM sessions WHERE session_id = ?",
        (row["session_id"],),
    ).fetchone()

    delta = {
        "input_tokens":        row["input_tokens"]        - (prev["input_tokens"]        if prev else 0),
        "output_tokens":       row["output_tokens"]       - (prev["output_tokens"]       if prev else 0),
        "cache_read_tokens":   row["cache_read_tokens"]   - (prev["cache_read_tokens"]   if prev else 0),
        "cache_create_tokens": row["cache_create_tokens"] - (prev["cache_create_tokens"] if prev else 0),
    }
    was_new = prev is None

    row["synced_at"] = datetime.now(timezone.utc).isoformat()
    cur.execute(_UPSERT_SESSION_SQL, {k: v for k, v in row.items() if k != "tool_calls"})

    # Tool calls: replace-on-conflict via INSERT OR REPLACE
    cur.executemany(
        """INSERT OR REPLACE INTO tool_calls
           (session_id, tool_use_id, tool_name, ts, duration_ms, error, is_sidechain)
           VALUES (:session_id, :tool_use_id, :tool_name, :ts, :duration_ms,
                   :error, :is_sidechain)""",
        row["tool_calls"],
    )

    # token_usage daily rollup — apply the delta against the session's started_at date
    bucket = _local_date(row["started_at"])
    if bucket and row["model"] and any(delta.values()):
        cur.execute(
            """INSERT INTO token_usage (date, model, source, input_tokens,
                output_tokens, cache_read_tokens, cache_create_tokens)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(date, model, source) DO UPDATE SET
                   input_tokens        = input_tokens        + excluded.input_tokens,
                   output_tokens       = output_tokens       + excluded.output_tokens,
                   cache_read_tokens   = cache_read_tokens   + excluded.cache_read_tokens,
                   cache_create_tokens = cache_create_tokens + excluded.cache_create_tokens
            """,
            (
                bucket, row["model"], row["source"],
                delta["input_tokens"], delta["output_tokens"],
                delta["cache_read_tokens"], delta["cache_create_tokens"],
            ),
        )

    return was_new, delta


# ---------------------------------------------------------------------------
# Public entry points
# ---------------------------------------------------------------------------

def sync(projects_dir: Path = PROJECTS_DIR, db_path: Path = DEFAULT_DB_PATH) -> dict[str, int]:
    """Scan all JSONL files. Skip ones whose mtime ≤ stored synced_at."""
    init_db(db_path)
    files = sorted(projects_dir.glob("*/*.jsonl"))
    counts = {"files_scanned": 0, "sessions_new": 0, "sessions_updated": 0,
              "sessions_skipped": 0, "files_failed": 0}

    with connect(db_path) as conn:
        synced_map = {
            r["session_id"]: r["synced_at"]
            for r in conn.execute("SELECT session_id, synced_at FROM sessions").fetchall()
            if r["synced_at"]
        }

        try:
            conn.execute("BEGIN")
            for fp in files:
                counts["files_scanned"] += 1
                sid = fp.stem
                mtime = datetime.fromtimestamp(fp.stat().st_mtime, tz=timezone.utc).isoformat()
                if sid in synced_map and mtime <= synced_map[sid]:
                    counts["sessions_skipped"] += 1
                    continue
                try:
                    row = _aggregate_file(fp)
                except Exception:
                    counts["files_failed"] += 1
                    continue
                if row is None:
                    counts["files_failed"] += 1
                    continue
                was_new, _ = _persist(conn, row)
                counts["sessions_new" if was_new else "sessions_updated"] += 1
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise

    return counts


if __name__ == "__main__":
    t0 = time.time()
    res = sync()
    dt = time.time() - t0
    print(f"Sync complete in {dt:.1f}s: {res}")
