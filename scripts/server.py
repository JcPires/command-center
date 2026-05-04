"""FastAPI server for Command Centre — full API surface.

Endpoints are grouped by section. All raw SQL, no ORM. Local-time bucketing
everywhere with ``DATE(ts, 'localtime')``. Per-row try/except on OTEL ingest
so a malformed event never drops the batch.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
import signal
import sqlite3
import subprocess
import sys
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

sys.path.insert(0, str(Path(__file__).resolve().parent))
from db import DEFAULT_DB_PATH, connect, init_db                       # noqa: E402
from sync_sessions import sync as sync_sessions                          # noqa: E402
from sync_skills import sync as sync_skills                              # noqa: E402
from live_sessions import LIVE_WINDOW_SECONDS, list_live, session_jsonl_path  # noqa: E402
import mcp_analyzer                                                      # noqa: E402

# ---------------------------------------------------------------------------
# Config & state
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(os.environ.get("CC_PROJECT_ROOT") or Path(__file__).resolve().parent.parent)
QUEUE_DIR = PROJECT_ROOT / ".tmp" / "mission-control-queue"
PID_DIR = QUEUE_DIR / "pids"
STATIC_DIR = PROJECT_ROOT / "ui" / "dist"
SYNC_INTERVAL_SECONDS = int(os.environ.get("CC_SYNC_INTERVAL", "120"))

_started_at = datetime.now(timezone.utc)
_last_sync_tick: datetime | None = None
_last_otel_event: datetime | None = None
_last_notifier_tick: datetime | None = None
_drop_counter = {"otel_logs": 0, "otel_metrics": 0}

UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")


# ---------------------------------------------------------------------------
# Lifespan: schema + background sync loop
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    QUEUE_DIR.mkdir(parents=True, exist_ok=True)
    PID_DIR.mkdir(parents=True, exist_ok=True)
    sync_task = asyncio.create_task(_sync_loop())
    try:
        yield
    finally:
        sync_task.cancel()
        try:
            await sync_task
        except asyncio.CancelledError:
            pass


async def _sync_loop() -> None:
    global _last_sync_tick
    await asyncio.sleep(2)
    while True:
        try:
            await asyncio.to_thread(sync_sessions)
            _last_sync_tick = datetime.now(timezone.utc)
            with connect() as conn:
                conn.execute(
                    "INSERT INTO activities (event_type, detail) VALUES (?, ?)",
                    ("sync_loop_heartbeat", "ok"),
                )
        except Exception as e:  # noqa: BLE001
            print(f"[sync] error: {e}", file=sys.stderr)
        await asyncio.sleep(SYNC_INTERVAL_SECONDS)


app = FastAPI(title="Command Centre", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"], allow_headers=["*"], allow_credentials=False,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _range_filter(range_param: str, ts_col: str = "started_at") -> tuple[str, list]:
    """Return ('AND <ts_col> >= ?', [iso_cutoff]) for today/7d/30d."""
    now = datetime.now(timezone.utc)
    if range_param == "today":
        local_today = datetime.now().astimezone().replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        cutoff = local_today.astimezone(timezone.utc)
    elif range_param == "30d":
        cutoff = now - timedelta(days=30)
    else:  # default 7d
        cutoff = now - timedelta(days=7)
    return f"AND {ts_col} >= ?", [cutoff.isoformat()]


def _percentiles(values: list[int]) -> dict[str, int | None]:
    if not values:
        return {"avg": None, "p50": None, "p95": None, "p99": None, "max": None}
    s = sorted(values)
    n = len(s)
    def pick(p: float) -> int:
        return s[max(0, min(n - 1, int(round(p * (n - 1)))))]
    return {
        "avg": int(round(sum(s) / n)),
        "p50": pick(0.50),
        "p95": pick(0.95),
        "p99": pick(0.99),
        "max": s[-1],
    }


def _row_to_dict(r: sqlite3.Row | None) -> dict | None:
    return dict(r) if r else None


# ---------------------------------------------------------------------------
# OTEL ingest (logs + metrics)
# ---------------------------------------------------------------------------

_OTEL_LOG_COLUMNS = {
    "session.id":            "session_id", "user.session.id":  "session_id",
    "prompt_id":             "prompt_id",  "model":            "model",
    "tool_name":             "tool_name",  "tool.success":     "tool_success",
    "tool_success":          "tool_success",
    "duration_ms":           "tool_duration_ms",
    "tool.duration_ms":      "tool_duration_ms",
    "tool_error":            "tool_error", "cost_usd":         "cost_usd",
    "api.duration_ms":       "api_duration_ms",
    "input_tokens":          "input_tokens",
    "output_tokens":         "output_tokens",
    "cache_read_tokens":     "cache_read_tokens",
    "cache_creation_tokens": "cache_create_tokens",
    "speed":                 "speed",       "error":           "error_message",
    "status_code":           "status_code", "attempt":         "attempt_count",
    "skill_name":            "skill_name",  "skill_source":    "skill_source",
    "prompt_length":         "prompt_length",
    "decision":              "decision",    "decision_source": "decision_source",
    "request_id":            "request_id",
    "tool_result_size_bytes":"tool_result_size_bytes",
    "mcp_server_scope":      "mcp_server_scope",
    "plugin_name":           "plugin_name", "plugin_version":  "plugin_version",
    "marketplace_name":      "marketplace_name",
    "install_trigger":       "install_trigger",
}

_OTEL_INSERT_COLS = (
    "event_name","session_id","prompt_id","timestamp","model",
    "tool_name","tool_success","tool_duration_ms","tool_error",
    "cost_usd","api_duration_ms","input_tokens","output_tokens",
    "cache_read_tokens","cache_create_tokens","speed","error_message",
    "status_code","attempt_count","skill_name","skill_source",
    "prompt_length","decision","decision_source","request_id",
    "tool_result_size_bytes","mcp_server_scope","plugin_name",
    "plugin_version","marketplace_name","install_trigger",
    "mcp_server_name","mcp_tool_name",
)
_OTEL_INSERT_SQL = (
    f"INSERT INTO otel_events ({', '.join(_OTEL_INSERT_COLS)}) "
    f"VALUES ({', '.join(':' + c for c in _OTEL_INSERT_COLS)})"
)


def _attr_value(v: Any) -> Any:
    if not isinstance(v, dict):
        return v
    for key in ("stringValue", "intValue", "doubleValue", "boolValue"):
        if key in v:
            val = v[key]
            if key == "intValue" and isinstance(val, str):
                try: return int(val)
                except ValueError: return val
            return val
    return v.get("arrayValue", v)


def _flatten_attrs(attrs: list[dict] | None) -> dict[str, Any]:
    return {kv["key"]: _attr_value(kv.get("value")) for kv in (attrs or []) if kv.get("key")}


def _record_to_row(rec: dict, resource_attrs: dict) -> dict[str, Any] | None:
    attrs = _flatten_attrs(rec.get("attributes"))
    merged = {**resource_attrs, **attrs}
    event_name = merged.get("event.name") or merged.get("name")
    if not event_name:
        return None
    row: dict[str, Any] = {c: None for c in _OTEL_INSERT_COLS}
    row["event_name"] = event_name
    ts_ns = rec.get("timeUnixNano") or rec.get("observedTimeUnixNano")
    if ts_ns:
        try:
            row["timestamp"] = datetime.fromtimestamp(int(ts_ns) / 1e9, tz=timezone.utc).isoformat()
        except (ValueError, TypeError, OSError):
            pass
    for src_key, col in _OTEL_LOG_COLUMNS.items():
        if src_key in merged and row.get(col) is None:
            row[col] = merged[src_key]
    if isinstance(row["tool_success"], str):
        row["tool_success"] = row["tool_success"].lower() in ("true", "1", "yes")
    if isinstance(row["tool_success"], bool):
        row["tool_success"] = 1 if row["tool_success"] else 0
    if row["tool_name"] == "mcp_tool":
        params_raw = merged.get("tool_parameters")
        if isinstance(params_raw, str):
            try:
                params = json.loads(params_raw)
                row["mcp_server_name"] = params.get("mcp_server_name")
                row["mcp_tool_name"] = params.get("mcp_tool_name")
            except (json.JSONDecodeError, TypeError):
                pass
    return row


@app.post("/v1/logs")
async def otel_logs(request: Request) -> JSONResponse:
    global _last_otel_event
    try:
        payload = await request.json()
    except Exception:  # noqa: BLE001
        _drop_counter["otel_logs"] += 1
        return JSONResponse({"ok": True, "dropped": 1})
    rows: list[dict[str, Any]] = []
    for rl in payload.get("resourceLogs") or []:
        resource_attrs = _flatten_attrs(((rl.get("resource") or {}).get("attributes")))
        for sl in rl.get("scopeLogs") or []:
            for rec in sl.get("logRecords") or []:
                try:
                    row = _record_to_row(rec, resource_attrs)
                    if row:
                        rows.append(row)
                except Exception:  # noqa: BLE001
                    _drop_counter["otel_logs"] += 1
    if rows:
        try:
            await asyncio.to_thread(_persist_otel_logs, rows)
            _last_otel_event = datetime.now(timezone.utc)
        except Exception as e:  # noqa: BLE001
            print(f"[otel] persist failed: {e}", file=sys.stderr)
            _drop_counter["otel_logs"] += len(rows)
    return JSONResponse({"ok": True, "ingested": len(rows)})


def _persist_otel_logs(rows: list[dict[str, Any]]) -> None:
    with connect() as conn:
        conn.execute("BEGIN")
        for r in rows:
            try:
                conn.execute(_OTEL_INSERT_SQL, r)
            except sqlite3.Error:
                _drop_counter["otel_logs"] += 1
        conn.execute("COMMIT")


@app.post("/v1/metrics")
async def otel_metrics(request: Request) -> JSONResponse:
    try:
        payload = await request.json()
    except Exception:  # noqa: BLE001
        _drop_counter["otel_metrics"] += 1
        return JSONResponse({"ok": True, "dropped": 1})
    rows: list[tuple] = []
    for rm in payload.get("resourceMetrics") or []:
        resource_attrs = _flatten_attrs(((rm.get("resource") or {}).get("attributes")))
        for sm in rm.get("scopeMetrics") or []:
            for metric in sm.get("metrics") or []:
                name = metric.get("name") or "unknown"
                for kind in ("sum", "gauge", "histogram"):
                    body = metric.get(kind)
                    if not body:
                        continue
                    mtype = "counter" if kind == "sum" else kind
                    for dp in body.get("dataPoints") or []:
                        attrs = {**resource_attrs, **_flatten_attrs(dp.get("attributes"))}
                        ts_ns = dp.get("timeUnixNano")
                        ts_iso = None
                        if ts_ns:
                            try:
                                ts_iso = datetime.fromtimestamp(int(ts_ns) / 1e9, tz=timezone.utc).isoformat()
                            except (ValueError, TypeError, OSError):
                                pass
                        val = dp.get("asDouble")
                        if val is None:
                            val = dp.get("asInt")
                        try:
                            value = float(val) if val is not None else 0.0
                        except (TypeError, ValueError):
                            value = 0.0
                        rows.append((name, mtype, value,
                                     attrs.get("session.id") or attrs.get("user.session.id"),
                                     attrs.get("model"), ts_iso))
    if rows:
        try:
            await asyncio.to_thread(_persist_otel_metrics, rows)
        except Exception as e:  # noqa: BLE001
            print(f"[otel] metrics persist failed: {e}", file=sys.stderr)
            _drop_counter["otel_metrics"] += len(rows)
    return JSONResponse({"ok": True, "ingested": len(rows)})


def _persist_otel_metrics(rows: list[tuple]) -> None:
    with connect() as conn:
        conn.executemany(
            "INSERT INTO otel_metrics (metric_name, metric_type, value, session_id, model, timestamp) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            rows,
        )


# ---------------------------------------------------------------------------
# System & health
# ---------------------------------------------------------------------------

@app.get("/api/health")
async def health() -> dict[str, Any]:
    return {"ok": True}


@app.get("/api/system/health")
async def system_health() -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    def _q():
        with connect() as conn:
            r = conn.execute(
                """SELECT MAX(created_at) AS daemon_tick
                   FROM activities WHERE event_type='heartbeat'"""
            ).fetchone()
        return r["daemon_tick"]
    daemon_tick = await asyncio.to_thread(_q)
    daemon_age = None
    if daemon_tick:
        try:
            dt = datetime.fromisoformat(daemon_tick.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            daemon_age = int((now - dt).total_seconds())
        except (ValueError, TypeError):
            pass
    try:
        import resource
        mem_kb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        mem_mb = mem_kb / 1024 if sys.platform != "darwin" else mem_kb / 1024 / 1024
    except Exception:  # noqa: BLE001
        mem_mb = None
    return {
        "uptime_seconds": int((now - _started_at).total_seconds()),
        "started_at": _started_at.isoformat(),
        "memory_mb": round(mem_mb, 1) if mem_mb else None,
        "last_otel_event_age_seconds":
            int((now - _last_otel_event).total_seconds()) if _last_otel_event else None,
        "last_sync_tick_age_seconds":
            int((now - _last_sync_tick).total_seconds()) if _last_sync_tick else None,
        "last_notifier_tick_age_seconds":
            int((now - _last_notifier_tick).total_seconds()) if _last_notifier_tick else None,
        "dispatcher_tick_age_seconds": daemon_age,
        "tz": datetime.now().astimezone().tzname(),
        "drops": dict(_drop_counter),
    }


@app.get("/api/system/state")
async def system_state() -> dict[str, Any]:
    def _q():
        with connect() as conn:
            return {r["key"]: r["value"] for r in conn.execute(
                "SELECT key, value FROM system_state").fetchall()}
    return await asyncio.to_thread(_q)


def _alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except (OSError, ProcessLookupError):
        return False


def _is_claude_p_process(pid: int) -> bool:
    try:
        out = subprocess.run(
            ["ps", "-p", str(pid), "-o", "command="],
            capture_output=True, text=True, timeout=2,
        )
        cmd = out.stdout.strip()
        return ("claude" in cmd) and (" -p " in f" {cmd} ")
    except (subprocess.SubprocessError, OSError):
        return False


@app.post("/api/system/emergency-stop")
async def emergency_stop() -> dict[str, Any]:
    killed, spared = 0, 0
    def _do():
        nonlocal killed, spared
        for pid_file in PID_DIR.glob("*"):
            try:
                pid = int(pid_file.name)
            except ValueError:
                pid_file.unlink(missing_ok=True)
                continue
            if not _alive(pid):
                pid_file.unlink(missing_ok=True)
                continue
            if not _is_claude_p_process(pid):
                spared += 1
                continue
            try:
                os.kill(pid, signal.SIGTERM)
                killed += 1
            except (OSError, ProcessLookupError):
                pass
            pid_file.unlink(missing_ok=True)
        with connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO system_state (key, value, updated_at) "
                "VALUES ('emergency_stop', '1', CURRENT_TIMESTAMP)"
            )
            conn.execute(
                """UPDATE ops_tasks SET status='failed',
                   error_message='Emergency stop triggered', completed_at=CURRENT_TIMESTAMP
                   WHERE status='running'"""
            )
    await asyncio.to_thread(_do)
    return {"stopped": True, "processes_killed": killed, "interactive_spared": spared}


@app.post("/api/system/emergency-resume")
async def emergency_resume() -> dict[str, Any]:
    def _do():
        with connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO system_state (key, value, updated_at) "
                "VALUES ('emergency_stop', '0', CURRENT_TIMESTAMP)"
            )
    await asyncio.to_thread(_do)
    return {"resumed": True}


@app.get("/api/attention")
async def attention() -> dict[str, Any]:
    def _q():
        items = []
        with connect() as conn:
            for r in conn.execute(
                """SELECT id, title, error_message FROM ops_tasks
                   WHERE status='failed'
                     AND completed_at >= datetime('now','-24 hours')
                   ORDER BY completed_at DESC LIMIT 5"""
            ):
                items.append({"kind":"task_failed","id":r["id"],"title":r["title"],
                              "detail":(r["error_message"] or "")[:200]})
            for r in conn.execute(
                "SELECT id, prompt FROM ops_decisions WHERE status='pending' ORDER BY id DESC"
            ):
                items.append({"kind":"decision_pending","id":r["id"],
                              "detail":(r["prompt"] or "")[:200]})
            stale = conn.execute(
                """SELECT id, name, next_run_at FROM ops_schedules
                   WHERE enabled=1 AND next_run_at IS NOT NULL
                     AND next_run_at < datetime('now','-5 minutes')"""
            ).fetchall()
            for r in stale:
                items.append({"kind":"schedule_stale","id":r["id"],"title":r["name"],
                              "detail":f"Next run was {r['next_run_at']}"})
        return items
    items = await asyncio.to_thread(_q)
    return {"items": items, "count": len(items)}


@app.get("/api/system/pressure")
async def system_pressure() -> dict[str, Any]:
    try:
        max_retries = int(os.environ.get("CLAUDE_CODE_MAX_RETRIES", "10"))
    except ValueError:
        max_retries = 10
    def _q():
        with connect() as conn:
            retry_exhausted = conn.execute(
                """SELECT COUNT(*) AS n FROM otel_events
                   WHERE event_name='api_error' AND attempt_count >= ?
                     AND received_at >= datetime('now','-7 days')""",
                (max_retries,),
            ).fetchone()["n"]
            compactions = conn.execute(
                """SELECT COUNT(*) AS n FROM otel_events
                   WHERE event_name='compaction'
                     AND received_at >= datetime('now','-7 days')"""
            ).fetchone()["n"]
            recent_errors = [dict(r) for r in conn.execute(
                """SELECT timestamp, model, error_message, status_code, attempt_count
                   FROM otel_events
                   WHERE event_name='api_error'
                   ORDER BY id DESC LIMIT 10"""
            ).fetchall()]
        return {
            "retry_exhausted": retry_exhausted,
            "max_retries_threshold": max_retries,
            "compactions": compactions,
            "recent_errors": recent_errors,
        }
    return await asyncio.to_thread(_q)


@app.get("/api/firehose")
async def firehose():
    """SSE stream of recent OTEL events. Polls every 1s for new rows."""
    async def gen():
        last_id = 0
        with connect() as conn:
            row = conn.execute("SELECT MAX(id) AS m FROM otel_events").fetchone()
            last_id = row["m"] or 0
        yield ": connected\n\n"
        while True:
            try:
                def _fetch():
                    with connect() as conn:
                        return [dict(r) for r in conn.execute(
                            """SELECT id, event_name, timestamp, session_id, model, tool_name,
                                      tool_success, tool_duration_ms, error_message,
                                      mcp_server_name, mcp_tool_name
                               FROM otel_events WHERE id > ?
                               ORDER BY id ASC LIMIT 200""", (last_id,),
                        ).fetchall()]
                rows = await asyncio.to_thread(_fetch)
                for r in rows:
                    last_id = r["id"]
                    yield f"data: {json.dumps(r)}\n\n"
                await asyncio.sleep(1.0)
            except asyncio.CancelledError:
                break
            except Exception as e:  # noqa: BLE001
                yield f": error {e}\n\n"
                await asyncio.sleep(2.0)
    return StreamingResponse(gen(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# Summary & sessions
# ---------------------------------------------------------------------------

@app.get("/api/summary")
async def summary() -> dict[str, Any]:
    """Headline counters for today plus the same window yesterday and a 7-day
    daily series for sparklines. All values are real — no client-side fakery."""
    def _q():
        with connect() as conn:
            today = conn.execute(
                """SELECT COUNT(*) AS sessions,
                          COALESCE(SUM(effective_tokens),0) AS tokens,
                          COALESCE(SUM(error_count),0) AS errors
                   FROM sessions
                   WHERE DATE(started_at,'localtime') = DATE('now','localtime')"""
            ).fetchone()
            yesterday = conn.execute(
                """SELECT COUNT(*) AS sessions,
                          COALESCE(SUM(effective_tokens),0) AS tokens,
                          COALESCE(SUM(error_count),0) AS errors
                   FROM sessions
                   WHERE DATE(started_at,'localtime') = DATE('now','localtime','-1 day')"""
            ).fetchone()
            tools_today = conn.execute(
                """SELECT COUNT(*) AS n FROM tool_calls
                   WHERE DATE(ts,'localtime') = DATE('now','localtime')"""
            ).fetchone()["n"]
            tools_yesterday = conn.execute(
                """SELECT COUNT(*) AS n FROM tool_calls
                   WHERE DATE(ts,'localtime') = DATE('now','localtime','-1 day')"""
            ).fetchone()["n"]

            # 7-day series (most recent on the right)
            sess_rows = conn.execute(
                """SELECT DATE(started_at,'localtime') AS d,
                          COUNT(*) AS sessions,
                          COALESCE(SUM(effective_tokens),0) AS tokens,
                          COALESCE(SUM(error_count),0) AS errors
                   FROM sessions
                   WHERE DATE(started_at,'localtime') >= DATE('now','localtime','-6 days')
                   GROUP BY d ORDER BY d"""
            ).fetchall()
            tool_rows = conn.execute(
                """SELECT DATE(ts,'localtime') AS d, COUNT(*) AS n
                   FROM tool_calls
                   WHERE DATE(ts,'localtime') >= DATE('now','localtime','-6 days')
                   GROUP BY d ORDER BY d"""
            ).fetchall()

        from datetime import date, timedelta
        days = [(date.today() - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]
        sess_by_day = {r["d"]: r for r in sess_rows}
        tools_by_day = {r["d"]: r["n"] for r in tool_rows}

        sessions_spark = [int(sess_by_day.get(d, {"sessions": 0})["sessions"]) for d in days]
        tokens_spark   = [int(sess_by_day.get(d, {"tokens":   0})["tokens"])   for d in days]
        errors_spark   = [int(sess_by_day.get(d, {"errors":   0})["errors"])   for d in days]
        tools_spark    = [int(tools_by_day.get(d, 0)) for d in days]

        # Live sessions: real source of truth for the "EN DIRECT" pill
        live_count = len(list_live())

        def metric(current: int, previous: int, spark: list[int]) -> dict[str, Any]:
            delta_pct = None
            if previous > 0:
                delta_pct = round(((current - previous) / previous) * 100)
            elif current > 0:
                delta_pct = None  # no baseline to compare against
            return {
                "current": int(current),
                "previous": int(previous),
                "delta_pct": delta_pct,
                "spark": spark,
            }

        return {
            "sessions": metric(today["sessions"],     yesterday["sessions"], sessions_spark),
            "tokens":   metric(today["tokens"],       yesterday["tokens"],   tokens_spark),
            "tools":    metric(tools_today,           tools_yesterday,       tools_spark),
            "errors":   metric(today["errors"],       yesterday["errors"],   errors_spark),
            "live_sessions": live_count,
        }
    return await asyncio.to_thread(_q)


@app.get("/api/sessions")
async def list_sessions(
    range: str = Query("7d"),
    source: str | None = None,
    model: str | None = None,
    q: str | None = None,
    limit: int = Query(50, le=500),
    offset: int = 0,
) -> dict[str, Any]:
    rng_clause, rng_args = _range_filter(range, "started_at")
    # rng_clause already starts with "AND ", strip it for join
    where = ["1=1", rng_clause.removeprefix("AND ").strip()]
    args: list = list(rng_args)
    if source:
        where.append("source = ?"); args.append(source)
    if model:
        where.append("model = ?"); args.append(model)
    if q:
        where.append("(title LIKE ? OR cwd LIKE ?)")
        args.extend([f"%{q}%", f"%{q}%"])
    sql_where = " AND ".join(where)
    def _q():
        with connect() as conn:
            total = conn.execute(
                f"SELECT COUNT(*) AS n FROM sessions WHERE {sql_where}", args).fetchone()["n"]
            rows = [dict(r) for r in conn.execute(
                f"""SELECT session_id, source, cwd, git_branch, model,
                          started_at, ended_at, effective_tokens, total_tokens,
                          error_count, rate_limit_hit, stop_reason, is_sidechain, title
                   FROM sessions WHERE {sql_where}
                   ORDER BY started_at DESC LIMIT ? OFFSET ?""",
                args + [limit, offset]).fetchall()]
        return {"total": total, "rows": rows, "limit": limit, "offset": offset}
    return await asyncio.to_thread(_q)


@app.get("/api/sessions/{sid}/details")
async def session_details(sid: str) -> dict[str, Any]:
    if not UUID_RE.match(sid):
        raise HTTPException(400, "invalid session_id")
    def _q():
        with connect() as conn:
            sess = _row_to_dict(conn.execute(
                "SELECT * FROM sessions WHERE session_id = ?", (sid,)).fetchone())
            if not sess:
                return None
            tools = [dict(r) for r in conn.execute(
                """SELECT tool_use_id, tool_name, ts, duration_ms, error, is_sidechain
                   FROM tool_calls WHERE session_id = ? ORDER BY ts""", (sid,)).fetchall()]
        return {"session": sess, "tool_calls": tools}
    res = await asyncio.to_thread(_q)
    if res is None:
        raise HTTPException(404, "session not found")
    return res


# ---- Live sessions --------------------------------------------------------

@app.get("/api/sessions/live")
async def sessions_live() -> dict[str, Any]:
    rows = await asyncio.to_thread(list_live)
    return {"rows": rows, "count": len(rows)}


@app.get("/api/sessions/live/{sid}/state")
async def session_live_state(sid: str) -> dict[str, Any]:
    if not UUID_RE.match(sid):
        raise HTTPException(400, "invalid session_id")
    def _q():
        with connect() as conn:
            return _row_to_dict(conn.execute(
                "SELECT * FROM live_session_state WHERE session_id = ?", (sid,)).fetchone())
    state = await asyncio.to_thread(_q)
    if state is None:
        return {"session_id": sid, "state": "unknown", "current_tool": None}
    return state


@app.get("/api/sessions/live/{sid}/stream")
async def session_live_stream(sid: str, request: Request):
    if not UUID_RE.match(sid):
        raise HTTPException(400, "invalid session_id")
    fp = await asyncio.to_thread(session_jsonl_path, sid)
    if not fp:
        raise HTTPException(404, "session file not found")

    # Resume from Last-Event-ID (byte offset) if the browser is reconnecting,
    # otherwise start tailing from the current end of file.
    last_id = request.headers.get("last-event-id")
    try:
        size_now = fp.stat().st_size
    except OSError:
        size_now = 0
    if last_id:
        try:
            resume = int(last_id)
        except ValueError:
            resume = size_now
        # File was rotated/truncated since the client's last id — restart from 0.
        start_offset = resume if 0 <= resume <= size_now else 0
    else:
        start_offset = size_now

    POLL_SECONDS = 1.0
    IDLE_LIMIT = LIVE_WINDOW_SECONDS

    async def gen():
        offset = start_offset
        idle_seconds = 0.0
        yield ": connected\n\n"
        while True:
            try:
                size = fp.stat().st_size
                if size < offset:
                    # rotation mid-stream — resync to head
                    offset = 0
                if size > offset:
                    idle_seconds = 0.0
                    with fp.open("r", encoding="utf-8", errors="replace") as fh:
                        fh.seek(offset)
                        while True:
                            line = fh.readline()
                            if not line:
                                break
                            new_offset = fh.tell()
                            stripped = line.strip()
                            if stripped:
                                yield f"id: {new_offset}\ndata: {stripped}\n\n"
                            offset = new_offset
                else:
                    idle_seconds += POLL_SECONDS
                    if idle_seconds >= IDLE_LIMIT:
                        # Session is no longer live — close cleanly.
                        yield "event: done\ndata: {\"reason\":\"idle\"}\n\n"
                        break
                await asyncio.sleep(POLL_SECONDS)
            except asyncio.CancelledError:
                break
            except FileNotFoundError:
                yield "event: done\ndata: {\"reason\":\"file-gone\"}\n\n"
                break
    return StreamingResponse(gen(), media_type="text/event-stream")


class LiveMessageBody(BaseModel):
    body: str = Field(..., min_length=1, max_length=20000)


@app.post("/api/sessions/live/{sid}/message")
async def session_live_message(sid: str, msg: LiveMessageBody) -> dict[str, Any]:
    if not UUID_RE.match(sid):
        raise HTTPException(400, "invalid session_id")
    def _do():
        QUEUE_DIR.mkdir(parents=True, exist_ok=True)
        path = QUEUE_DIR / f"{sid}.jsonl"
        with path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps({"body": msg.body, "ts": datetime.now(timezone.utc).isoformat()}) + "\n")
    await asyncio.to_thread(_do)
    return {"queued": True}


# ---------------------------------------------------------------------------
# Observability — usage, cache, outcomes, latency, hooks, projects, fan-out, edits, productivity
# ---------------------------------------------------------------------------

@app.get("/api/usage/tokens")
async def usage_tokens(range: str = "7d") -> dict[str, Any]:
    days = {"today": 1, "7d": 7, "30d": 30}.get(range, 7)
    def _q():
        with connect() as conn:
            rows = [dict(r) for r in conn.execute(
                """SELECT date, model, source,
                          input_tokens, output_tokens,
                          cache_read_tokens, cache_create_tokens
                   FROM token_usage
                   WHERE date >= DATE('now','localtime', ?)
                   ORDER BY date ASC""", (f"-{days-1} days",)).fetchall()]
            totals = conn.execute(
                """SELECT
                     COALESCE(SUM(input_tokens),0)        AS input_tokens,
                     COALESCE(SUM(output_tokens),0)       AS output_tokens,
                     COALESCE(SUM(cache_read_tokens),0)   AS cache_read_tokens,
                     COALESCE(SUM(cache_create_tokens),0) AS cache_create_tokens
                   FROM token_usage
                   WHERE date >= DATE('now','localtime', ?)""", (f"-{days-1} days",)).fetchone()
        return {"daily": rows, "totals": dict(totals), "range": range}
    return await asyncio.to_thread(_q)


@app.get("/api/usage/cache")
async def usage_cache(range: str = "7d") -> dict[str, Any]:
    days = {"today": 1, "7d": 7, "30d": 30}.get(range, 7)
    def _q():
        with connect() as conn:
            rows = [dict(r) for r in conn.execute(
                """SELECT date,
                          SUM(input_tokens)        AS input,
                          SUM(cache_read_tokens)   AS cache_read,
                          SUM(cache_create_tokens) AS cache_create
                   FROM token_usage
                   WHERE date >= DATE('now','localtime', ?)
                   GROUP BY date ORDER BY date ASC""", (f"-{days-1} days",)).fetchall()]
        daily = []
        billable_total = 0
        for r in rows:
            denom = (r["input"] or 0) + (r["cache_read"] or 0) + (r["cache_create"] or 0)
            hit = (r["cache_read"] or 0) / denom if denom else 0.0
            daily.append({"date": r["date"], "hit_rate": round(hit, 4),
                          "input": r["input"] or 0,
                          "cache_read": r["cache_read"] or 0,
                          "cache_create": r["cache_create"] or 0})
            billable_total += (r["input"] or 0) + (r["cache_create"] or 0)
        all_denom = sum((r["input"] or 0) + (r["cache_read"] or 0) + (r["cache_create"] or 0) for r in rows)
        all_read = sum((r["cache_read"] or 0) for r in rows)
        overall = (all_read / all_denom) if all_denom else 0.0
        return {"daily": daily, "overall": round(overall, 4),
                "low_sample": billable_total < 10_000,
                "billable_tokens": billable_total, "range": range}
    return await asyncio.to_thread(_q)


@app.get("/api/sessions/outcomes")
async def session_outcomes(range: str = "7d") -> dict[str, Any]:
    days = {"today": 1, "7d": 7, "30d": 30}.get(range, 7)
    def _q():
        with connect() as conn:
            rows = conn.execute(
                f"""SELECT DATE(started_at,'localtime') AS date,
                          stop_reason, error_count, rate_limit_hit, ended_at, duration_ms
                   FROM sessions
                   WHERE DATE(started_at,'localtime') >= DATE('now','localtime','-{days-1} days')"""
            ).fetchall()
        buckets: dict[str, dict[str, int]] = {}
        for r in rows:
            d = r["date"] or "?"
            b = buckets.setdefault(d, {"errored":0,"rate_limited":0,"truncated":0,"unfinished":0,"ok":0})
            sr = (r["stop_reason"] or "").lower()
            if r["error_count"] and r["error_count"] > 0:
                b["errored"] += 1
            elif r["rate_limit_hit"]:
                b["rate_limited"] += 1
            elif sr == "max_tokens":
                b["truncated"] += 1
            elif not r["ended_at"]:
                b["unfinished"] += 1
            else:
                b["ok"] += 1
        daily = [{"date": d, **counts} for d, counts in sorted(buckets.items())]
        return {"daily": daily, "range": range}
    return await asyncio.to_thread(_q)


@app.get("/api/tools/latency")
async def tools_latency(range: str = "7d") -> dict[str, Any]:
    rng_clause, rng_args = _range_filter(range, "ts")
    def _q():
        with connect() as conn:
            tools_idx = {}
            for r in conn.execute(
                f"""SELECT tool_name, duration_ms, error FROM tool_calls
                    WHERE 1=1 {rng_clause}""", rng_args):
                t = tools_idx.setdefault(r["tool_name"], {"durations":[], "errors":0, "n":0})
                t["n"] += 1
                if r["duration_ms"] is not None:
                    t["durations"].append(r["duration_ms"])
                if r["error"]:
                    t["errors"] += 1
        out = []
        for name, t in tools_idx.items():
            pct = _percentiles(t["durations"])
            out.append({"tool": name, "n": t["n"],
                        "avg_ms": pct["avg"],
                        "p50_ms": pct["p50"], "p95_ms": pct["p95"],
                        "p99_ms": pct["p99"], "max_ms": pct["max"],
                        "error_rate": round(t["errors"]/t["n"], 4) if t["n"] else 0.0})
        out.sort(key=lambda x: (x["p95_ms"] or 0), reverse=True)
        return {"rows": out, "range": range}
    return await asyncio.to_thread(_q)


@app.get("/api/hooks/activity")
async def hooks_activity(range: str = "7d") -> dict[str, Any]:
    rng_clause, rng_args = _range_filter(range, "received_at")
    def _q():
        with connect() as conn:
            starts = conn.execute(
                f"""SELECT id, session_id, timestamp FROM otel_events
                    WHERE event_name='hook_execution_start' {rng_clause}
                    ORDER BY id ASC""", rng_args).fetchall()
            completes = conn.execute(
                f"""SELECT id, session_id, timestamp FROM otel_events
                    WHERE event_name='hook_execution_complete' {rng_clause}
                    ORDER BY id ASC""", rng_args).fetchall()
            daily = [dict(r) for r in conn.execute(
                f"""SELECT DATE(received_at,'localtime') AS date, COUNT(*) AS fires
                    FROM otel_events
                    WHERE event_name='hook_execution_start' {rng_clause}
                    GROUP BY date ORDER BY date""", rng_args).fetchall()]
        # Pair start→complete by session FIFO, cap 60s
        queues: dict[str, list[str]] = {}
        for s in starts:
            queues.setdefault(s["session_id"] or "_", []).append(s["timestamp"])
        durs = []
        paired = 0
        for c in completes:
            q = queues.get(c["session_id"] or "_", [])
            if not q:
                continue
            start_ts = q.pop(0)
            try:
                a = datetime.fromisoformat((start_ts or "").replace("Z", "+00:00"))
                b = datetime.fromisoformat((c["timestamp"] or "").replace("Z", "+00:00"))
                ms = int((b - a).total_seconds() * 1000)
                if 0 <= ms <= 60_000:
                    durs.append(ms); paired += 1
            except (ValueError, TypeError):
                continue
        pct = _percentiles(durs)
        return {"daily": daily, "total_fires": sum(d["fires"] for d in daily),
                "paired": paired,
                "p50_ms": pct["p50"], "p95_ms": pct["p95"], "max_ms": pct["max"],
                "range": range}
    return await asyncio.to_thread(_q)


@app.get("/api/sessions/by-project")
async def sessions_by_project(range: str = "7d") -> dict[str, Any]:
    rng_clause, rng_args = _range_filter(range, "started_at")
    def _q():
        with connect() as conn:
            rows = [dict(r) for r in conn.execute(
                f"""SELECT cwd, COUNT(*) AS sessions,
                          COALESCE(SUM(effective_tokens),0) AS tokens
                   FROM sessions WHERE 1=1 {rng_clause}
                   GROUP BY cwd ORDER BY tokens DESC LIMIT 50""", rng_args).fetchall()]
            tools_per_cwd = {r["cwd"]: r["n"] for r in conn.execute(
                f"""SELECT s.cwd AS cwd, COUNT(tc.tool_use_id) AS n
                   FROM sessions s LEFT JOIN tool_calls tc ON tc.session_id = s.session_id
                   WHERE 1=1 {rng_clause}
                   GROUP BY s.cwd""", rng_args).fetchall()}
        for r in rows:
            r["tools"] = tools_per_cwd.get(r["cwd"], 0)
        return {"rows": rows, "range": range}
    return await asyncio.to_thread(_q)


@app.get("/api/tools/agent-fanout")
async def tools_agent_fanout(range: str = "7d") -> dict[str, Any]:
    rng_clause, rng_args = _range_filter(range, "ts")
    def _q():
        with connect() as conn:
            rows = [dict(r) for r in conn.execute(
                f"""SELECT tc.session_id, COUNT(*) AS agent_calls,
                          s.title, s.model, s.cwd
                   FROM tool_calls tc
                   LEFT JOIN sessions s ON s.session_id = tc.session_id
                   WHERE tc.tool_name='Agent' {rng_clause}
                   GROUP BY tc.session_id
                   ORDER BY agent_calls DESC LIMIT 50""", rng_args).fetchall()]
        return {"rows": rows, "range": range}
    return await asyncio.to_thread(_q)


@app.get("/api/tools/edit-decisions")
async def tools_edit_decisions(range: str = "7d") -> dict[str, Any]:
    rng_clause, rng_args = _range_filter(range, "received_at")
    def _q():
        with connect() as conn:
            rows = conn.execute(
                f"""SELECT tool_name, decision, COUNT(*) AS n FROM otel_events
                    WHERE event_name='tool_decision'
                      AND tool_name IN ('Edit','MultiEdit','Write','NotebookEdit')
                      {rng_clause}
                    GROUP BY tool_name, decision""", rng_args).fetchall()
        agg: dict[str, dict[str, int]] = {}
        for r in rows:
            d = agg.setdefault(r["tool_name"], {"accept":0,"reject":0,"other":0})
            dec = (r["decision"] or "other").lower()
            if dec in ("accept", "approve"):
                d["accept"] += r["n"]
            elif dec in ("reject", "deny"):
                d["reject"] += r["n"]
            else:
                d["other"] += r["n"]
        out = []
        for name, d in agg.items():
            n = d["accept"] + d["reject"] + d["other"]
            out.append({"tool": name, "n": n,
                        "accept": d["accept"], "reject": d["reject"], "other": d["other"],
                        "accept_rate": round(d["accept"] / n, 4) if n else 0.0,
                        "low_sample": n < 10})
        return {"rows": out, "range": range}
    return await asyncio.to_thread(_q)


@app.get("/api/activity/productivity")
async def activity_productivity(range: str = "7d") -> dict[str, Any]:
    days = {"today": 1, "7d": 7, "30d": 30}.get(range, 7)
    def _q():
        with connect() as conn:
            totals = {}
            for name in ("claude_code.commit.count",
                         "claude_code.pull_request.count",
                         "claude_code.lines_of_code.count"):
                r = conn.execute(
                    """SELECT COALESCE(SUM(value),0) AS v FROM otel_metrics
                       WHERE metric_name = ?
                         AND timestamp >= datetime('now', ?)""",
                    (name, f"-{days} days")).fetchone()
                totals[name] = r["v"]
            daily = [dict(r) for r in conn.execute(
                """SELECT DATE(timestamp,'localtime') AS date, metric_name,
                          SUM(value) AS v
                   FROM otel_metrics
                   WHERE metric_name LIKE 'claude_code.%'
                     AND timestamp >= datetime('now', ?)
                   GROUP BY date, metric_name
                   ORDER BY date""", (f"-{days} days",)).fetchall()]
        return {
            "commits": int(totals.get("claude_code.commit.count", 0) or 0),
            "pull_requests": int(totals.get("claude_code.pull_request.count", 0) or 0),
            "lines_of_code": int(totals.get("claude_code.lines_of_code.count", 0) or 0),
            "daily": daily, "range": range,
        }
    return await asyncio.to_thread(_q)


@app.get("/api/tools/latency/series")
async def tools_latency_series(range: str = "7d") -> dict[str, Any]:
    """Per-tool daily p95 series for the latency table sparkline + delta vs
    the prior window of the same length."""
    rng_value = range  # avoid shadowing the builtin range() in nested scope
    days = {"today": 1, "7d": 7, "30d": 30}.get(rng_value, 7)
    import builtins
    def _q():
        with connect() as conn:
            # Top tools in current window (by call count) — limit so we don't
            # fan out a huge response.
            top = conn.execute(
                f"""SELECT tool_name, COUNT(*) AS n
                   FROM tool_calls
                   WHERE ts >= datetime('now','-{days} days')
                     AND duration_ms IS NOT NULL
                   GROUP BY tool_name
                   ORDER BY n DESC
                   LIMIT 30"""
            ).fetchall()
            tools = [r["tool_name"] for r in top]
            if not tools:
                return {"rows": [], "range": rng_value}

            # SQLite doesn't have built-in percentiles. Pull all durations per
            # (tool, day) and compute p95 in Python — bounded by LIMIT above.
            placeholders = ",".join("?" * len(tools))
            rows = conn.execute(
                f"""SELECT tool_name,
                          DATE(ts,'localtime') AS day,
                          duration_ms
                   FROM tool_calls
                   WHERE ts >= datetime('now','-{days * 2} days')
                     AND duration_ms IS NOT NULL
                     AND tool_name IN ({placeholders})
                   ORDER BY tool_name, day, duration_ms""",
                tools,
            ).fetchall()

        from collections import defaultdict
        by_tool_day: dict[str, dict[str, list[int]]] = defaultdict(lambda: defaultdict(list))
        for r in rows:
            by_tool_day[r["tool_name"]][r["day"]].append(int(r["duration_ms"]))

        def p95(vals: list[int]) -> int | None:
            if not vals:
                return None
            vals = sorted(vals)
            idx = max(0, int(round(0.95 * (len(vals) - 1))))
            return vals[idx]

        # Build a date axis covering 2*days so we can split current vs prev
        from datetime import date, timedelta
        today = date.today()
        all_days = [(today - timedelta(days=i)).isoformat() for i in builtins.range(days * 2 - 1, -1, -1)]
        cur_days = all_days[-days:]
        prev_days = all_days[:days]

        out = []
        for tool in tools:
            day_p95 = {d: p95(by_tool_day[tool].get(d, [])) for d in all_days}
            cur_series = [day_p95[d] for d in cur_days]
            prev_series = [day_p95[d] for d in prev_days]
            cur_overall = p95([v for d in cur_days for v in by_tool_day[tool].get(d, [])])
            prev_overall = p95([v for d in prev_days for v in by_tool_day[tool].get(d, [])])
            delta_pct = None
            if cur_overall is not None and prev_overall and prev_overall > 0:
                delta_pct = round(((cur_overall - prev_overall) / prev_overall) * 100)
            out.append({
                "tool": tool,
                "series": [v if v is not None else 0 for v in cur_series],
                "prev_series": [v if v is not None else 0 for v in prev_series],
                "current_p95": cur_overall,
                "prev_p95": prev_overall,
                "delta_pct": delta_pct,
            })
        return {"rows": out, "range": rng_value}
    return await asyncio.to_thread(_q)


@app.get("/api/sessions/sparks")
async def sessions_sparks(ids: str = "", buckets: int = 18) -> dict[str, Any]:
    """For each session id, return a small numeric series derived from the
    durations of its tool_calls bucketed across the session lifetime. Used to
    render a real (non-mocked) trend sparkline in the sessions table."""
    id_list = [s.strip() for s in ids.split(",") if s.strip()]
    if not id_list:
        return {"sparks": {}}
    buckets = max(4, min(buckets, 30))

    def _q():
        sparks: dict[str, list[int]] = {}
        with connect() as conn:
            placeholders = ",".join("?" * len(id_list))
            sessions = conn.execute(
                f"SELECT session_id, started_at, ended_at FROM sessions WHERE session_id IN ({placeholders})",
                id_list,
            ).fetchall()
            calls_by_sid: dict[str, list[tuple[str, int]]] = {}
            rows = conn.execute(
                f"""SELECT session_id, ts, duration_ms FROM tool_calls
                   WHERE session_id IN ({placeholders})
                     AND duration_ms IS NOT NULL""",
                id_list,
            ).fetchall()
            for r in rows:
                calls_by_sid.setdefault(r["session_id"], []).append((r["ts"], int(r["duration_ms"])))

        from datetime import datetime
        for s in sessions:
            sid = s["session_id"]
            calls = calls_by_sid.get(sid, [])
            if not calls or not s["started_at"]:
                sparks[sid] = []
                continue
            try:
                start = datetime.fromisoformat(s["started_at"].replace("Z", "+00:00"))
                end_str = s["ended_at"] or calls[-1][0]
                end = datetime.fromisoformat(end_str.replace("Z", "+00:00"))
                span = max((end - start).total_seconds(), 1.0)
            except Exception:
                sparks[sid] = []
                continue
            bins = [0] * buckets
            counts = [0] * buckets
            for ts, dur in calls:
                try:
                    t = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                except Exception:
                    continue
                rel = (t - start).total_seconds() / span
                idx = min(buckets - 1, max(0, int(rel * buckets)))
                bins[idx] += dur
                counts[idx] += 1
            # Average per bucket so empty bins stay flat
            sparks[sid] = [int(bins[i] / counts[i]) if counts[i] > 0 else 0 for i in range(buckets)]
        return {"sparks": sparks}
    return await asyncio.to_thread(_q)


@app.get("/api/activity/daily")
async def activity_daily(days: int = 365) -> dict[str, Any]:
    """Daily activity counts (tokens consumed) over a window of N days, ending today.
    Used for the calendar-style yearly heatmap."""
    days = max(1, min(days, 730))
    def _q():
        with connect() as conn:
            rows = conn.execute(
                """SELECT date,
                          SUM(input_tokens + output_tokens + cache_create_tokens) AS v
                   FROM token_usage
                   WHERE date >= DATE('now','localtime', ?)
                   GROUP BY date
                   ORDER BY date""",
                (f"-{days - 1} days",)
            ).fetchall()
        daily = [{"date": r["date"], "v": int(r["v"] or 0)} for r in rows]
        max_v = max((r["v"] for r in daily), default=0)
        total = sum(r["v"] for r in daily)
        return {"daily": daily, "max": max_v, "total": total, "days": days}
    return await asyncio.to_thread(_q)


@app.get("/api/activity/hourly")
async def activity_hourly() -> dict[str, Any]:
    """7×24 grid of tool-call counts. Days are rows (Mon..Sun, local time),
    hours are columns. Spans the last 7 calendar days ending today."""
    def _q():
        with connect() as conn:
            rows = conn.execute(
                """SELECT CAST(strftime('%w', ts, 'localtime') AS INTEGER) AS dow,
                          CAST(strftime('%H', ts, 'localtime') AS INTEGER) AS hour,
                          COUNT(*) AS n
                   FROM tool_calls
                   WHERE ts >= datetime('now', '-7 days')
                   GROUP BY dow, hour"""
            ).fetchall()
        # SQLite %w: 0=Sunday, 1=Monday, ..., 6=Saturday — we keep Sun-first.
        grid = [[0] * 24 for _ in range(7)]
        for r in rows:
            grid[int(r["dow"])][int(r["hour"])] = int(r["n"])
        max_v = max((max(row) for row in grid), default=0)
        return {"grid": grid, "max": max_v}
    return await asyncio.to_thread(_q)


# ---------------------------------------------------------------------------
# MCP
# ---------------------------------------------------------------------------

@app.get("/api/mcp")
async def mcp_list(range: str = "30d") -> dict[str, Any]:
    rng_clause_otel, rng_args = _range_filter(range, "timestamp")
    def _q():
        # Build a temporary range_clause string for analyzer (positional binding)
        # Re-implement lightweight inline using analyzer with explicit args:
        return mcp_analyzer.list_servers(
            range_clause=f"AND timestamp >= '{rng_args[0]}'"
        )
    rows = await asyncio.to_thread(_q)
    return {"servers": rows, "range": range}


@app.get("/api/mcp/{server}/tools")
async def mcp_server_tools(server: str, range: str = "30d") -> dict[str, Any]:
    _, rng_args = _range_filter(range, "timestamp")
    def _q():
        return mcp_analyzer.list_tools_for_server(
            server, range_clause=f"AND timestamp >= '{rng_args[0]}'"
        )
    rows = await asyncio.to_thread(_q)
    return {"server": server, "tools": rows, "range": range}


@app.post("/api/mcp/sync")
async def mcp_sync() -> dict[str, Any]:
    return await asyncio.to_thread(mcp_analyzer.rebuild_stats)


@app.post("/api/mcp/measure")
async def mcp_measure() -> dict[str, Any]:
    import mcp_measure as mm
    return await mm.measure_all()


# ---------------------------------------------------------------------------
# LLM-powered "Explain this" — uses local `claude -p` (subscription quota)
# ---------------------------------------------------------------------------

class ExplainBody(BaseModel):
    topic: str = Field(..., min_length=1, max_length=120)
    data: dict[str, Any] | list[Any] | None = None
    hint: str | None = Field(default=None, max_length=400)


class ExplainContinueBody(BaseModel):
    session_id: str = Field(..., min_length=8, max_length=120)
    message: str = Field(..., min_length=1, max_length=4000)


_EXPLAIN_SYSTEM = (
    "Tu es un assistant qui explique des indicateurs d'un dashboard d'observabilité "
    "Claude Code à un développeur expérimenté. Réponds en français, en 2 à 5 phrases "
    "courtes. Pas de salutation, pas de récap. Si une valeur est anormale, dis-le "
    "directement. Pas de markdown lourd : juste du texte clair, éventuellement avec "
    "un terme technique en `code` quand c'est utile."
)


def _explain_data_hash(topic: str, data: Any) -> str:
    blob = json.dumps({"topic": topic, "data": data}, sort_keys=True, default=str)
    return hashlib.sha256(blob.encode()).hexdigest()[:16]


@app.post("/api/explain")
async def explain(body: ExplainBody) -> dict[str, Any]:
    import llm
    h = _explain_data_hash(body.topic, body.data)

    def _read_cache():
        with connect() as conn:
            r = conn.execute(
                "SELECT explanation, created_at FROM explain_cache "
                "WHERE topic=? AND data_hash=? "
                "AND datetime(created_at) > datetime('now', '-1 day')",
                (body.topic, h),
            ).fetchone()
            return dict(r) if r else None

    cached = await asyncio.to_thread(_read_cache)
    if cached:
        # Cache hit means we don't pay an LLM call, but we also lose the
        # session_id needed for follow-ups. The client treats absent
        # session_id as "follow-up will start a fresh thread".
        return {"explanation": cached["explanation"], "cached": True, "session_id": None}

    prompt_parts = [f"Sujet: {body.topic}."]
    if body.hint:
        prompt_parts.append(f"Contexte: {body.hint}.")
    if body.data is not None:
        prompt_parts.append("Données actuelles (JSON): " + json.dumps(body.data, default=str)[:4000])
    prompt_parts.append("Explique brièvement ce que mesure ce panneau, comment lire les valeurs ci-dessus, et signale toute anomalie.")
    prompt = "\n".join(prompt_parts)

    try:
        out = await llm.ask(prompt, system_prompt=_EXPLAIN_SYSTEM)
    except llm.LLMError as e:
        raise HTTPException(503, f"LLM unavailable: {e}")

    explanation = out["result"]

    def _write():
        with connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO explain_cache (topic, data_hash, explanation) "
                "VALUES (?, ?, ?)",
                (body.topic, h, explanation),
            )
    await asyncio.to_thread(_write)
    return {"explanation": explanation, "cached": False, "session_id": out.get("session_id")}


@app.post("/api/explain/continue")
async def explain_continue(body: ExplainContinueBody) -> dict[str, Any]:
    """Follow-up turn in an Explain conversation.

    Resumes the prior `claude -p` session via `--resume <id>` so context is
    preserved. Note that Claude Code may rotate the session id on each turn
    — clients should always use the most recent one returned.
    """
    import llm
    try:
        out = await llm.ask(body.message, system_prompt=_EXPLAIN_SYSTEM,
                             resume_session_id=body.session_id)
    except llm.LLMError as e:
        raise HTTPException(503, f"LLM unavailable: {e}")
    return {"explanation": out["result"], "session_id": out.get("session_id")}


# ---------------------------------------------------------------------------
# Skills
# ---------------------------------------------------------------------------

@app.get("/api/skills")
async def skills_list(environment: str | None = None,
                      user_invocable: int | None = None) -> dict[str, Any]:
    where, args = ["1=1"], []
    if environment:
        where.append("environment = ?"); args.append(environment)
    if user_invocable is not None:
        where.append("user_invocable = ?"); args.append(int(user_invocable))
    def _q():
        with connect() as conn:
            return [dict(r) for r in conn.execute(
                f"SELECT * FROM skills WHERE {' AND '.join(where)} ORDER BY name", args).fetchall()]
    return {"rows": await asyncio.to_thread(_q)}


@app.post("/api/skills/sync")
async def skills_sync_endpoint() -> dict[str, Any]:
    return await asyncio.to_thread(sync_skills)


class AutonomyBody(BaseModel):
    autonomy_level: str = Field(..., pattern="^(auto|review|manual)$")


@app.patch("/api/skills/{name}/autonomy")
async def skills_autonomy(name: str, body: AutonomyBody) -> dict[str, Any]:
    def _do():
        with connect() as conn:
            cur = conn.execute(
                "UPDATE skills SET autonomy_level = ? WHERE name = ?",
                (body.autonomy_level, name))
            return cur.rowcount
    n = await asyncio.to_thread(_do)
    if n == 0:
        raise HTTPException(404, "skill not found")
    return {"updated": True, "autonomy_level": body.autonomy_level}


# ---------------------------------------------------------------------------
# HITL — Decisions & Inbox
# ---------------------------------------------------------------------------

class DecisionCreate(BaseModel):
    task_id: int | None = None
    session_id: str | None = None
    prompt: str = Field(..., min_length=1)


class DecisionAnswer(BaseModel):
    answer: str = Field(..., min_length=1)


@app.get("/api/decisions")
async def decisions_list(status: str = "pending") -> dict[str, Any]:
    def _q():
        with connect() as conn:
            return [dict(r) for r in conn.execute(
                "SELECT * FROM ops_decisions WHERE status = ? ORDER BY id DESC", (status,)).fetchall()]
    return {"rows": await asyncio.to_thread(_q)}


@app.post("/api/decisions")
async def decisions_create(body: DecisionCreate) -> dict[str, Any]:
    def _do():
        with connect() as conn:
            try:
                cur = conn.execute(
                    """INSERT INTO ops_decisions (task_id, session_id, prompt, status)
                       VALUES (?, ?, ?, 'pending')""",
                    (body.task_id, body.session_id, body.prompt))
                return {"id": cur.lastrowid, "created": True}
            except sqlite3.IntegrityError:
                # partial UNIQUE collision — return the existing row id
                r = conn.execute(
                    "SELECT id FROM ops_decisions WHERE session_id = ? AND prompt = ?",
                    (body.session_id, body.prompt)).fetchone()
                return {"id": r["id"] if r else None, "created": False}
    return await asyncio.to_thread(_do)


@app.post("/api/decisions/{decision_id}/answer")
async def decisions_answer(decision_id: int, body: DecisionAnswer) -> dict[str, Any]:
    def _do():
        with connect() as conn:
            row = conn.execute(
                "SELECT session_id FROM ops_decisions WHERE id = ?", (decision_id,)).fetchone()
            if not row:
                return None
            conn.execute(
                """UPDATE ops_decisions SET answer=?, status='answered', answered_at=CURRENT_TIMESTAMP
                   WHERE id = ?""", (body.answer, decision_id))
            sid = row["session_id"]
            if sid and UUID_RE.match(sid):
                QUEUE_DIR.mkdir(parents=True, exist_ok=True)
                with (QUEUE_DIR / f"{sid}.jsonl").open("a", encoding="utf-8") as fh:
                    fh.write(json.dumps({
                        "decision_id": decision_id, "answer": body.answer,
                        "ts": datetime.now(timezone.utc).isoformat(),
                    }) + "\n")
            return True
    res = await asyncio.to_thread(_do)
    if res is None:
        raise HTTPException(404, "decision not found")
    return {"answered": True}


class InboxCreate(BaseModel):
    task_id: int | None = None
    session_id: str | None = None
    direction: str = Field("agent_to_user", pattern="^(agent_to_user|user_to_agent)$")
    body: str = Field(..., min_length=1)


@app.get("/api/inbox")
async def inbox_list(unread: int = 0, max_age_days: int = 30) -> dict[str, Any]:
    where, args = [f"created_at >= datetime('now','-{int(max_age_days)} days')"], []
    if unread:
        where.append("read = 0")
    def _q():
        with connect() as conn:
            return [dict(r) for r in conn.execute(
                f"""SELECT * FROM ops_inbox
                    WHERE {' AND '.join(where)}
                    ORDER BY id DESC LIMIT 200""", args).fetchall()]
    return {"rows": await asyncio.to_thread(_q)}


@app.post("/api/inbox")
async def inbox_create(body: InboxCreate) -> dict[str, Any]:
    def _do():
        with connect() as conn:
            cur = conn.execute(
                """INSERT INTO ops_inbox (task_id, session_id, direction, body)
                   VALUES (?, ?, ?, ?)""",
                (body.task_id, body.session_id, body.direction, body.body))
            return cur.lastrowid
    rid = await asyncio.to_thread(_do)
    return {"id": rid, "created": True}


@app.post("/api/inbox/{message_id}/read")
async def inbox_mark_read(message_id: int) -> dict[str, Any]:
    def _do():
        with connect() as conn:
            cur = conn.execute("UPDATE ops_inbox SET read=1 WHERE id = ?", (message_id,))
            return cur.rowcount
    if await asyncio.to_thread(_do) == 0:
        raise HTTPException(404, "message not found")
    return {"read": True}


class InboxReply(BaseModel):
    body: str = Field(..., min_length=1)


@app.post("/api/inbox/{message_id}/reply")
async def inbox_reply(message_id: int, body: InboxReply) -> dict[str, Any]:
    def _do():
        with connect() as conn:
            row = conn.execute(
                "SELECT session_id FROM ops_inbox WHERE id = ?", (message_id,)).fetchone()
            if not row:
                return None
            conn.execute(
                """INSERT INTO ops_inbox (task_id, session_id, direction, body)
                   VALUES (NULL, ?, 'user_to_agent', ?)""",
                (row["session_id"], body.body))
            sid = row["session_id"]
            if sid and UUID_RE.match(sid):
                QUEUE_DIR.mkdir(parents=True, exist_ok=True)
                with (QUEUE_DIR / f"{sid}.jsonl").open("a", encoding="utf-8") as fh:
                    fh.write(json.dumps({
                        "reply_to": message_id, "body": body.body,
                        "ts": datetime.now(timezone.utc).isoformat(),
                    }) + "\n")
            return True
    if await asyncio.to_thread(_do) is None:
        raise HTTPException(404, "message not found")
    return {"replied": True}


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------

class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    description: str | None = None
    priority: int = 5
    quadrant: str = Field("do", pattern="^(do|schedule|delegate|archive)$")
    requires_approval: bool = False
    risk_level: str = Field("low", pattern="^(low|medium|high)$")
    dry_run: bool = False
    model: str | None = None
    execution_mode: str = Field("stream", pattern="^(stream|classic)$")
    assigned_skill: str | None = None
    scheduled_for: str | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    priority: int | None = None
    status: str | None = None
    quadrant: str | None = None
    risk_level: str | None = None
    requires_approval: bool | None = None
    dry_run: bool | None = None
    model: str | None = None
    execution_mode: str | None = None
    assigned_skill: str | None = None
    scheduled_for: str | None = None


_TASK_STATUSES = {"pending","awaiting_approval","running","done","failed","cancelled"}


@app.get("/api/tasks")
async def tasks_list(status: str | None = None, quadrant: str | None = None,
                     limit: int = 100) -> dict[str, Any]:
    where, args = ["1=1"], []
    if status:
        where.append("status = ?"); args.append(status)
    if quadrant:
        where.append("quadrant = ?"); args.append(quadrant)
    def _q():
        with connect() as conn:
            return [dict(r) for r in conn.execute(
                f"""SELECT * FROM ops_tasks WHERE {' AND '.join(where)}
                    ORDER BY created_at DESC LIMIT ?""",
                args + [limit]).fetchall()]
    return {"rows": await asyncio.to_thread(_q)}


@app.post("/api/tasks")
async def tasks_create(body: TaskCreate) -> dict[str, Any]:
    initial_status = "awaiting_approval" if body.requires_approval else "pending"
    def _do():
        with connect() as conn:
            cur = conn.execute(
                """INSERT INTO ops_tasks
                   (title, description, status, priority, assigned_skill, model,
                    execution_mode, scheduled_for, requires_approval, risk_level,
                    dry_run, quadrant)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (body.title, body.description, initial_status, body.priority,
                 body.assigned_skill, body.model, body.execution_mode,
                 body.scheduled_for, int(body.requires_approval), body.risk_level,
                 int(body.dry_run), body.quadrant))
            return cur.lastrowid
    return {"id": await asyncio.to_thread(_do), "status": initial_status}


@app.patch("/api/tasks/{task_id}")
async def tasks_update(task_id: int, body: TaskUpdate) -> dict[str, Any]:
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        return {"updated": False}
    if "status" in fields and fields["status"] not in _TASK_STATUSES:
        raise HTTPException(400, "invalid status")
    set_clauses, args = [], []
    for k, v in fields.items():
        if isinstance(v, bool):
            v = int(v)
        set_clauses.append(f"{k} = ?")
        args.append(v)
    args.append(task_id)
    def _do():
        with connect() as conn:
            cur = conn.execute(
                f"UPDATE ops_tasks SET {', '.join(set_clauses)} WHERE id = ?", args)
            return cur.rowcount
    if await asyncio.to_thread(_do) == 0:
        raise HTTPException(404, "task not found")
    return {"updated": True}


@app.delete("/api/tasks/{task_id}")
async def tasks_delete(task_id: int) -> dict[str, Any]:
    def _do():
        with connect() as conn:
            cur = conn.execute("DELETE FROM ops_tasks WHERE id = ?", (task_id,))
            return cur.rowcount
    if await asyncio.to_thread(_do) == 0:
        raise HTTPException(404, "task not found")
    return {"deleted": task_id}


@app.post("/api/tasks/{task_id}/approve")
async def tasks_approve(task_id: int) -> dict[str, Any]:
    def _do():
        with connect() as conn:
            cur = conn.execute(
                """UPDATE ops_tasks
                   SET status='pending', approved_at=CURRENT_TIMESTAMP
                   WHERE id = ? AND status='awaiting_approval'""", (task_id,))
            return cur.rowcount
    if await asyncio.to_thread(_do) == 0:
        raise HTTPException(400, "task not in awaiting_approval state")
    return {"approved": True}


@app.post("/api/tasks/{task_id}/rerun")
async def tasks_rerun(task_id: int) -> dict[str, Any]:
    def _do():
        with connect() as conn:
            row = conn.execute(
                "SELECT status FROM ops_tasks WHERE id = ?", (task_id,)).fetchone()
            if not row:
                return "not_found"
            if row["status"] != "failed":
                return "wrong_state"
            conn.execute(
                """UPDATE ops_tasks SET status='pending',
                   error_message=NULL, completed_at=NULL, started_at=NULL,
                   duration_ms=NULL, output_summary=NULL, session_id=NULL
                   WHERE id = ?""", (task_id,))
            return "ok"
    res = await asyncio.to_thread(_do)
    if res == "not_found":
        raise HTTPException(404, "task not found")
    if res == "wrong_state":
        raise HTTPException(400, "task is not in failed state")
    return {"rerun": True, "task_id": task_id}


@app.post("/api/dispatcher/trigger")
async def dispatcher_trigger() -> dict[str, Any]:
    script = PROJECT_ROOT / ".claude" / "skills" / "mission-control" / "scripts" / "heartbeat.py"
    if not script.exists():
        return {"triggered": False, "reason": "dispatcher not installed"}
    def _spawn():
        return subprocess.Popen(
            [sys.executable, str(script), "--once"],
            cwd=str(PROJECT_ROOT),
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            start_new_session=True,
        ).pid
    pid = await asyncio.to_thread(_spawn)
    return {"triggered": True, "pid": pid}


# ---------------------------------------------------------------------------
# Schedules
# ---------------------------------------------------------------------------

class ScheduleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    cron_expression: str = Field(..., min_length=1)
    task_title: str = Field(..., min_length=1)
    task_description: str | None = None
    assigned_skill: str | None = None
    enabled: bool = True


class ScheduleUpdate(BaseModel):
    name: str | None = None
    cron_expression: str | None = None
    task_title: str | None = None
    task_description: str | None = None
    assigned_skill: str | None = None
    enabled: bool | None = None


def _parse_cron_simple(expr: str, now: datetime | None = None) -> datetime | None:
    """Compute next run from a 5-field cron. Supports * and comma-lists.
    DOW: 0=Mon..6=Sun (matches Python `dt.weekday()`).
    """
    parts = expr.strip().split()
    if len(parts) != 5:
        return None
    minute, hour, dom, month, dow = parts

    def _vals(field: str, lo: int, hi: int) -> set[int] | None:
        if field == "*":
            return None
        out: set[int] = set()
        for chunk in field.split(","):
            chunk = chunk.strip()
            if not chunk:
                continue
            try:
                out.add(int(chunk))
            except ValueError:
                return set()
        return out

    minute_set = _vals(minute, 0, 59)
    hour_set = _vals(hour, 0, 23)
    dom_set = _vals(dom, 1, 31)
    month_set = _vals(month, 1, 12)
    dow_set = _vals(dow, 0, 6)

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


@app.get("/api/schedules")
async def schedules_list() -> dict[str, Any]:
    def _q():
        with connect() as conn:
            return [dict(r) for r in conn.execute(
                "SELECT * FROM ops_schedules ORDER BY id DESC").fetchall()]
    return {"rows": await asyncio.to_thread(_q)}


@app.post("/api/schedules")
async def schedules_create(body: ScheduleCreate) -> dict[str, Any]:
    next_run = _parse_cron_simple(body.cron_expression)
    def _do():
        with connect() as conn:
            cur = conn.execute(
                """INSERT INTO ops_schedules
                   (name, cron_expression, task_title, task_description,
                    assigned_skill, enabled, next_run_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (body.name, body.cron_expression, body.task_title,
                 body.task_description, body.assigned_skill,
                 1 if body.enabled else 0,
                 next_run.isoformat() if next_run else None))
            return cur.lastrowid
    return {"id": await asyncio.to_thread(_do),
            "next_run_at": next_run.isoformat() if next_run else None}


@app.patch("/api/schedules/{sched_id}")
async def schedules_update(sched_id: int, body: ScheduleUpdate) -> dict[str, Any]:
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        return {"updated": False}
    if "cron_expression" in fields:
        nxt = _parse_cron_simple(fields["cron_expression"])
        fields["next_run_at"] = nxt.isoformat() if nxt else None
    set_clauses, args = [], []
    for k, v in fields.items():
        if isinstance(v, bool):
            v = int(v)
        set_clauses.append(f"{k} = ?"); args.append(v)
    args.append(sched_id)
    def _do():
        with connect() as conn:
            cur = conn.execute(
                f"UPDATE ops_schedules SET {', '.join(set_clauses)} WHERE id = ?", args)
            return cur.rowcount
    if await asyncio.to_thread(_do) == 0:
        raise HTTPException(404, "schedule not found")
    return {"updated": True, "next_run_at": fields.get("next_run_at")}


@app.delete("/api/schedules/{sched_id}")
async def schedules_delete(sched_id: int) -> dict[str, Any]:
    def _do():
        with connect() as conn:
            cur = conn.execute("DELETE FROM ops_schedules WHERE id = ?", (sched_id,))
            return cur.rowcount
    if await asyncio.to_thread(_do) == 0:
        raise HTTPException(404, "schedule not found")
    return {"deleted": sched_id}


@app.get("/api/schedules/{sched_id}/runs")
async def schedules_runs(sched_id: int, limit: int = 10) -> dict[str, Any]:
    def _q():
        with connect() as conn:
            sched = conn.execute(
                "SELECT task_title FROM ops_schedules WHERE id = ?", (sched_id,)).fetchone()
            if not sched:
                return None
            rows = [dict(r) for r in conn.execute(
                """SELECT id, status, started_at, completed_at, duration_ms,
                          output_summary, error_message
                   FROM ops_tasks
                   WHERE title = ? ORDER BY id DESC LIMIT ?""",
                (sched["task_title"], limit)).fetchall()]
        return rows
    res = await asyncio.to_thread(_q)
    if res is None:
        raise HTTPException(404, "schedule not found")
    return {"rows": res}


class NLCronBody(BaseModel):
    text: str = Field(..., min_length=1)


@app.post("/api/schedules/parse-nl")
async def schedules_parse_nl(body: NLCronBody) -> dict[str, Any]:
    """Natural-language → cron via Haiku. Requires ANTHROPIC_API_KEY.
    Best-effort fallback for trivially recognised phrases when key missing.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        # Tiny rule-based fallback for common phrases
        t = body.text.lower()
        if "every weekday at 9" in t:
            return {"cron": "0 9 * * 0,1,2,3,4", "fallback": True}
        if "every day at" in t:
            m = re.search(r"every day at (\d{1,2})", t)
            if m:
                return {"cron": f"0 {int(m.group(1))} * * *", "fallback": True}
        raise HTTPException(501, "ANTHROPIC_API_KEY not set")
    try:
        from anthropic import Anthropic
    except ImportError:
        raise HTTPException(501, "anthropic SDK not installed")
    def _do():
        client = Anthropic(api_key=api_key)
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=64,
            system=(
                "Convert the user's English phrase to a 5-field cron expression "
                "(minute hour day-of-month month day-of-week). DOW: 0=Sun..6=Sat. "
                "Reply with only the cron expression, nothing else."
            ),
            messages=[{"role": "user", "content": body.text}],
        )
        text = "".join(b.text for b in msg.content if hasattr(b, "text")).strip()
        return text
    cron = await asyncio.to_thread(_do)
    return {"cron": cron, "fallback": False}


# ---------------------------------------------------------------------------
# Manual sync trigger
# ---------------------------------------------------------------------------

@app.post("/api/sync")
async def manual_sync() -> dict[str, Any]:
    global _last_sync_tick
    res = await asyncio.to_thread(sync_sessions)
    _last_sync_tick = datetime.now(timezone.utc)
    return {"ok": True, "result": res}


# ---------------------------------------------------------------------------
# Static UI mount (last — must come after API routes)
# ---------------------------------------------------------------------------

if STATIC_DIR.exists():
    # Mount /assets first so hashed JS/CSS stays cacheable.
    assets_dir = STATIC_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    INDEX_HTML = (STATIC_DIR / "index.html").read_text(encoding="utf-8") \
                 if (STATIC_DIR / "index.html").exists() else ""

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        """Serve any non-API path as the SPA shell so TanStack Router can take
        over client-side. Matches /activity, /skills, /, and unknown deep links.
        """
        # Try a real file in dist first (e.g. favicon.ico, vite.svg)
        candidate = STATIC_DIR / full_path
        if full_path and candidate.is_file():
            from fastapi.responses import FileResponse
            return FileResponse(candidate)
        from fastapi.responses import HTMLResponse
        return HTMLResponse(INDEX_HTML)


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("CC_PORT", "8765"))
    host = os.environ.get("CC_HOST", "127.0.0.1")
    uvicorn.run(app, host=host, port=port, log_level="info")
