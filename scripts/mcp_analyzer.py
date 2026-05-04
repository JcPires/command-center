"""MCP server stats: aggregate per-server / per-tool latency.

Three sources, in priority order:
  1. ``otel_events`` rows where ``mcp_server_name`` is set (precise — requires
     ``OTEL_LOG_TOOL_DETAILS=1``)
  2. ``tool_calls`` rows whose ``tool_name`` matches ``mcp__<server>__<tool>``
     (legacy JSONL pairing — works without OTEL)
  3. Pre-generic ``tool_name='mcp_tool'`` rows without details (counted only)
"""
from __future__ import annotations

import re
from typing import Any

from db import connect

MCP_TOOL_RE = re.compile(r"^mcp__([^_]+(?:_[^_]+)*?)__(.+)$")


def _percentiles(values: list[int]) -> dict[str, int | None]:
    if not values:
        return {"p50": None, "p95": None, "max": None, "n": 0}
    s = sorted(values)
    n = len(s)
    def pick(p: float) -> int:
        idx = max(0, min(n - 1, int(round(p * (n - 1)))))
        return s[idx]
    return {"p50": pick(0.50), "p95": pick(0.95), "max": s[-1], "n": n}


def list_servers(range_clause: str = "") -> list[dict[str, Any]]:
    """Return per-server rollup: server, tool_count, total_calls, p50, p95, error_rate."""
    with connect() as conn:
        # Source 1: OTEL with explicit server names
        otel_rows = conn.execute(
            f"""SELECT mcp_server_name AS server, mcp_tool_name AS tool,
                       tool_duration_ms AS dur, tool_success
                FROM otel_events
                WHERE mcp_server_name IS NOT NULL
                  {range_clause}"""
        ).fetchall()

        # Source 2: tool_calls with mcp__server__tool naming
        tc_rows = conn.execute(
            f"""SELECT tool_name, duration_ms, error
                FROM tool_calls
                WHERE tool_name LIKE 'mcp\\_\\_%' ESCAPE '\\'
                  {range_clause.replace('AND timestamp', 'AND ts')}"""
        ).fetchall()

    by_server: dict[str, dict[str, Any]] = {}

    for r in otel_rows:
        s = r["server"]
        if not s:
            continue
        b = by_server.setdefault(s, {"tools": set(), "durations": [], "errors": 0, "calls": 0})
        b["tools"].add(r["tool"])
        b["calls"] += 1
        if r["dur"] is not None:
            b["durations"].append(r["dur"])
        if r["tool_success"] == 0:
            b["errors"] += 1

    for r in tc_rows:
        m = MCP_TOOL_RE.match(r["tool_name"])
        if not m:
            continue
        srv, tool = m.group(1), m.group(2)
        b = by_server.setdefault(srv, {"tools": set(), "durations": [], "errors": 0, "calls": 0})
        b["tools"].add(tool)
        b["calls"] += 1
        if r["duration_ms"] is not None:
            b["durations"].append(r["duration_ms"])
        if r["error"]:
            b["errors"] += 1

    out = []
    for srv, b in by_server.items():
        pct = _percentiles(b["durations"])
        out.append({
            "server":      srv,
            "tools":       len(b["tools"]),
            "total_calls": b["calls"],
            "p50_ms":      pct["p50"],
            "p95_ms":      pct["p95"],
            "max_ms":      pct["max"],
            "error_rate":  (b["errors"] / b["calls"]) if b["calls"] else 0.0,
        })
    out.sort(key=lambda x: (x["p95_ms"] or 0), reverse=True)
    return out


def list_tools_for_server(server: str, range_clause: str = "") -> list[dict[str, Any]]:
    with connect() as conn:
        otel_rows = conn.execute(
            f"""SELECT mcp_tool_name AS tool, tool_duration_ms AS dur, tool_success
                FROM otel_events
                WHERE mcp_server_name = ? {range_clause}""",
            (server,),
        ).fetchall()
        tc_rows = conn.execute(
            f"""SELECT tool_name, duration_ms, error FROM tool_calls
                WHERE tool_name LIKE ? {range_clause.replace('AND timestamp', 'AND ts')}""",
            (f"mcp__{server}__%",),
        ).fetchall()

    by_tool: dict[str, dict[str, Any]] = {}
    for r in otel_rows:
        t = r["tool"] or "?"
        b = by_tool.setdefault(t, {"durations": [], "errors": 0, "calls": 0})
        b["calls"] += 1
        if r["dur"] is not None:
            b["durations"].append(r["dur"])
        if r["tool_success"] == 0:
            b["errors"] += 1
    for r in tc_rows:
        m = MCP_TOOL_RE.match(r["tool_name"])
        if not m or m.group(1) != server:
            continue
        t = m.group(2)
        b = by_tool.setdefault(t, {"durations": [], "errors": 0, "calls": 0})
        b["calls"] += 1
        if r["duration_ms"] is not None:
            b["durations"].append(r["duration_ms"])
        if r["error"]:
            b["errors"] += 1

    out = []
    for tool, b in by_tool.items():
        pct = _percentiles(b["durations"])
        out.append({
            "tool":       tool,
            "calls":      b["calls"],
            "p50_ms":     pct["p50"],
            "p95_ms":     pct["p95"],
            "max_ms":     pct["max"],
            "error_rate": (b["errors"] / b["calls"]) if b["calls"] else 0.0,
        })
    out.sort(key=lambda x: (x["p95_ms"] or 0), reverse=True)
    return out


def rebuild_stats() -> dict[str, int]:
    """Materialise per-server rollup into ``mcp_stats``."""
    servers = list_servers()
    with connect() as conn:
        conn.execute("DELETE FROM mcp_stats")
        for s in servers:
            conn.execute(
                """INSERT INTO mcp_stats (server, tools, total_tokens, error)
                   VALUES (?, ?, ?, ?)""",
                (s["server"], s["tools"], 0, None),
            )
    return {"servers": len(servers)}
