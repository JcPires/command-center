"""SQLite schema + idempotent migrations for Command Centre.

Single .db file on disk. WAL mode. Raw SQL only — no ORM.
All `CREATE TABLE IF NOT EXISTS`; column adds go through `_migrate_add_column`
so re-running `init_db()` on an existing DB is safe.

Local-time day bucketing is enforced by callers (`DATE(ts, 'localtime')`),
not by the schema itself — timestamps are stored as UTC ISO-8601 strings.
"""
from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

DEFAULT_DB_PATH = Path(
    os.environ.get("CC_DB_PATH")
    or Path(__file__).resolve().parent.parent / "data" / "command-centre.db"
)


def _open_connection(db_path: Path | str = DEFAULT_DB_PATH) -> sqlite3.Connection:
    p = Path(db_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(p), timeout=30, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=10000")
    return conn


@contextmanager
def connect(db_path: Path | str = DEFAULT_DB_PATH) -> Iterator[sqlite3.Connection]:
    # sqlite3.Connection's own __exit__ commits/rolls back but does NOT close
    # the connection — so callers using `with sqlite3.connect(...) as c:` leak
    # the underlying file descriptor. Wrapping in our own contextmanager
    # guarantees close() and avoids exhausting the per-process FD limit
    # (launchd's maxfiles=256) under sustained polling.
    conn = _open_connection(db_path)
    try:
        yield conn
    finally:
        conn.close()


@contextmanager
def cursor(db_path: Path | str = DEFAULT_DB_PATH) -> Iterator[sqlite3.Cursor]:
    with connect(db_path) as conn:
        yield conn.cursor()


def _migrate_add_column(
    conn: sqlite3.Connection, table: str, col: str, col_type: str
) -> None:
    """Add a column if it doesn't exist. Idempotent."""
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    existing = {r["name"] for r in rows}
    if col not in existing:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}")


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

SCHEMA = [
    # ---- sessions ---------------------------------------------------------
    """
    CREATE TABLE IF NOT EXISTS sessions (
        session_id              TEXT PRIMARY KEY,
        source                  TEXT NOT NULL DEFAULT 'ide',  -- ide | cowork
        cwd                     TEXT,
        git_branch              TEXT,
        model                   TEXT,
        started_at              TEXT,
        ended_at                TEXT,
        input_tokens            INTEGER NOT NULL DEFAULT 0,
        output_tokens           INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens       INTEGER NOT NULL DEFAULT 0,
        cache_create_tokens     INTEGER NOT NULL DEFAULT 0,
        total_tokens            INTEGER NOT NULL DEFAULT 0,
        effective_tokens        INTEGER NOT NULL DEFAULT 0,
        cost_usd                REAL    NOT NULL DEFAULT 0.0,  -- indicative
        duration_ms             INTEGER NOT NULL DEFAULT 0,
        error_count             INTEGER NOT NULL DEFAULT 0,
        rate_limit_hit          INTEGER NOT NULL DEFAULT 0,    -- bool
        stop_reason             TEXT,
        is_sidechain            INTEGER NOT NULL DEFAULT 0,    -- bool: subagent
        title                   TEXT,
        synced_at               TEXT
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_sessions_cwd     ON sessions(cwd)",
    "CREATE INDEX IF NOT EXISTS idx_sessions_source  ON sessions(source)",

    # ---- token_usage (daily rollup) --------------------------------------
    """
    CREATE TABLE IF NOT EXISTS token_usage (
        date                    TEXT NOT NULL,                 -- YYYY-MM-DD local
        model                   TEXT NOT NULL,
        source                  TEXT NOT NULL DEFAULT 'ide',
        input_tokens            INTEGER NOT NULL DEFAULT 0,
        output_tokens           INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens       INTEGER NOT NULL DEFAULT 0,
        cache_create_tokens     INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (date, model, source)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_tokens_date ON token_usage(date DESC)",

    # ---- tool_calls ------------------------------------------------------
    """
    CREATE TABLE IF NOT EXISTS tool_calls (
        session_id              TEXT NOT NULL,
        tool_use_id             TEXT NOT NULL,
        tool_name               TEXT NOT NULL,
        ts                      TEXT NOT NULL,
        duration_ms             INTEGER,
        error                   TEXT,
        is_sidechain            INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (session_id, tool_use_id)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_tool_calls_name_ts ON tool_calls(tool_name, ts)",
    "CREATE INDEX IF NOT EXISTS idx_tool_calls_session ON tool_calls(session_id)",

    # ---- otel_events -----------------------------------------------------
    """
    CREATE TABLE IF NOT EXISTS otel_events (
        id                      INTEGER PRIMARY KEY AUTOINCREMENT,
        event_name              TEXT NOT NULL,
        session_id              TEXT,
        prompt_id               TEXT,
        timestamp               TEXT,
        model                   TEXT,
        tool_name               TEXT,
        tool_success            INTEGER,                       -- bool
        tool_duration_ms        INTEGER,
        tool_error              TEXT,
        cost_usd                REAL,
        api_duration_ms         INTEGER,
        input_tokens            INTEGER,
        output_tokens           INTEGER,
        cache_read_tokens       INTEGER,
        cache_create_tokens     INTEGER,
        speed                   TEXT,
        error_message           TEXT,
        status_code             INTEGER,
        attempt_count           INTEGER,
        skill_name              TEXT,
        skill_source            TEXT,
        prompt_length           INTEGER,
        decision                TEXT,                          -- accept|reject|...
        decision_source         TEXT,
        request_id              TEXT,
        tool_result_size_bytes  INTEGER,
        mcp_server_scope        TEXT,
        plugin_name             TEXT,
        plugin_version          TEXT,
        marketplace_name        TEXT,
        install_trigger         TEXT,
        mcp_server_name         TEXT,
        mcp_tool_name           TEXT,
        received_at             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_otel_events_name_ts ON otel_events(event_name, timestamp)",
    "CREATE INDEX IF NOT EXISTS idx_otel_events_session ON otel_events(session_id)",
    "CREATE INDEX IF NOT EXISTS idx_otel_events_received ON otel_events(received_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_otel_events_tool   ON otel_events(tool_name, timestamp)",
    "CREATE INDEX IF NOT EXISTS idx_otel_events_mcp    ON otel_events(mcp_server_name, mcp_tool_name)",

    # ---- otel_metrics ----------------------------------------------------
    """
    CREATE TABLE IF NOT EXISTS otel_metrics (
        id                      INTEGER PRIMARY KEY AUTOINCREMENT,
        metric_name             TEXT NOT NULL,
        metric_type             TEXT NOT NULL,                 -- counter|gauge
        value                   REAL NOT NULL,
        session_id              TEXT,
        model                   TEXT,
        timestamp               TEXT
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_otel_metrics_name_ts ON otel_metrics(metric_name, timestamp)",

    # ---- ops_tasks -------------------------------------------------------
    """
    CREATE TABLE IF NOT EXISTS ops_tasks (
        id                      INTEGER PRIMARY KEY AUTOINCREMENT,
        title                   TEXT NOT NULL,
        description             TEXT,
        status                  TEXT NOT NULL DEFAULT 'pending',
            -- pending | awaiting_approval | running | done | failed | cancelled
        priority                INTEGER NOT NULL DEFAULT 5,
        assigned_skill          TEXT,
        model                   TEXT,
        execution_mode          TEXT NOT NULL DEFAULT 'stream', -- classic|stream
        scheduled_for           TEXT,
        requires_approval       INTEGER NOT NULL DEFAULT 0,
        risk_level              TEXT NOT NULL DEFAULT 'low',
        dry_run                 INTEGER NOT NULL DEFAULT 0,
        quadrant                TEXT NOT NULL DEFAULT 'do',     -- do|schedule|delegate|archive
        approved_at             TEXT,
        session_id              TEXT,
        started_at              TEXT,
        completed_at            TEXT,
        duration_ms             INTEGER,
        cost_usd                REAL,
        output_summary          TEXT,
        error_message           TEXT,
        consecutive_failures    INTEGER NOT NULL DEFAULT 0,
        created_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_tasks_status   ON ops_tasks(status)",
    "CREATE INDEX IF NOT EXISTS idx_tasks_quadrant ON ops_tasks(quadrant)",
    "CREATE INDEX IF NOT EXISTS idx_tasks_created  ON ops_tasks(created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_tasks_session  ON ops_tasks(session_id)",

    # ---- ops_schedules ---------------------------------------------------
    """
    CREATE TABLE IF NOT EXISTS ops_schedules (
        id                      INTEGER PRIMARY KEY AUTOINCREMENT,
        name                    TEXT NOT NULL,
        cron_expression         TEXT NOT NULL,
        task_title              TEXT NOT NULL,
        task_description        TEXT,
        assigned_skill          TEXT,
        enabled                 INTEGER NOT NULL DEFAULT 1,
        next_run_at             TEXT,
        last_run_at             TEXT,
        created_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_schedules_next ON ops_schedules(next_run_at)",

    # ---- ops_decisions (HITL) -------------------------------------------
    """
    CREATE TABLE IF NOT EXISTS ops_decisions (
        id                      INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id                 INTEGER,
        session_id              TEXT,
        prompt                  TEXT NOT NULL,
        answer                  TEXT,
        status                  TEXT NOT NULL DEFAULT 'pending',  -- pending | answered
        created_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        answered_at             TEXT
    )
    """,
    # Partial UNIQUE: dedupe duplicate marker lines from the same session
    """
    CREATE UNIQUE INDEX IF NOT EXISTS idx_decisions_dedupe
        ON ops_decisions(session_id, prompt)
        WHERE session_id IS NOT NULL
    """,
    "CREATE INDEX IF NOT EXISTS idx_decisions_status ON ops_decisions(status)",

    # ---- ops_inbox -------------------------------------------------------
    """
    CREATE TABLE IF NOT EXISTS ops_inbox (
        id                      INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id                 INTEGER,
        session_id              TEXT,
        direction               TEXT NOT NULL,                  -- agent_to_user | user_to_agent
        body                    TEXT NOT NULL,
        read                    INTEGER NOT NULL DEFAULT 0,
        created_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_inbox_unread  ON ops_inbox(read, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_inbox_session ON ops_inbox(session_id)",

    # ---- activities (append-only event log) -----------------------------
    """
    CREATE TABLE IF NOT EXISTS activities (
        id                      INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type              TEXT NOT NULL,
        detail                  TEXT,
        metadata                TEXT,                            -- JSON
        created_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_activities_type_ts ON activities(event_type, created_at DESC)",

    # ---- live_session_state ---------------------------------------------
    """
    CREATE TABLE IF NOT EXISTS live_session_state (
        session_id              TEXT PRIMARY KEY,
        state                   TEXT NOT NULL,
        current_tool            TEXT,
        updated_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,

    # ---- mcp_stats -------------------------------------------------------
    """
    CREATE TABLE IF NOT EXISTS mcp_stats (
        server                  TEXT PRIMARY KEY,
        tools                   INTEGER NOT NULL DEFAULT 0,
        total_tokens            INTEGER NOT NULL DEFAULT 0,
        error                   TEXT,
        measured_at             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,

    # ---- mcp_schemas -----------------------------------------------------
    """
    CREATE TABLE IF NOT EXISTS mcp_schemas (
        server                  TEXT NOT NULL,
        tool                    TEXT NOT NULL,
        schema_json             TEXT,
        tokens                  INTEGER NOT NULL DEFAULT 0,
        collected_at            TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (server, tool)
    )
    """,

    # ---- skills ----------------------------------------------------------
    """
    CREATE TABLE IF NOT EXISTS skills (
        name                    TEXT PRIMARY KEY,
        environment             TEXT NOT NULL,
            -- ide:project | ide:global | cowork:plugin | cowork:scheduled
        description             TEXT,
        path                    TEXT,
        autonomy_level          TEXT NOT NULL DEFAULT 'review', -- auto|review|manual
        user_invocable          INTEGER NOT NULL DEFAULT 1,
        script_count            INTEGER NOT NULL DEFAULT 0,
        last_modified           TEXT
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_skills_env ON skills(environment)",

    # ---- system_state (KV) ----------------------------------------------
    """
    CREATE TABLE IF NOT EXISTS system_state (
        key                     TEXT PRIMARY KEY,
        value                   TEXT,
        updated_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,

    # ---- notification_log (notifier dedupe) -----------------------------
    """
    CREATE TABLE IF NOT EXISTS notification_log (
        id                      INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type              TEXT NOT NULL,
        event_key               TEXT NOT NULL,
        chat_id                 TEXT NOT NULL,
        sent_at                 TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        snoozed_until           TEXT,
        UNIQUE(event_type, event_key, chat_id)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_notif_snooze ON notification_log(snoozed_until)",

    # ---- explain_cache (LLM-generated panel/metric explanations) -----------
    """
    CREATE TABLE IF NOT EXISTS explain_cache (
        topic                   TEXT NOT NULL,
        data_hash               TEXT NOT NULL,
        explanation             TEXT NOT NULL,
        created_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (topic, data_hash)
    )
    """,
]


# Future-proof column adds. Each entry = (table, column, type).
# Listed here even when redundant with current SCHEMA so that older DBs upgrade
# cleanly when this file is updated.
_PENDING_MIGRATIONS: list[tuple[str, str, str]] = [
    ("sessions", "is_sidechain", "INTEGER NOT NULL DEFAULT 0"),
    ("tool_calls", "is_sidechain", "INTEGER NOT NULL DEFAULT 0"),
]


def init_db(db_path: Path | str = DEFAULT_DB_PATH) -> None:
    """Create the schema (idempotent) and run pending column migrations."""
    with connect(db_path) as conn:
        for stmt in SCHEMA:
            conn.execute(stmt)
        for table, col, col_type in _PENDING_MIGRATIONS:
            _migrate_add_column(conn, table, col, col_type)


if __name__ == "__main__":
    init_db()
    print(f"DB initialized at {DEFAULT_DB_PATH}")
