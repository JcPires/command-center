"""Live measurement of MCP server tool schemas.

Reads stdio-typed MCP servers from `~/.claude.json`, spawns each one,
calls `tools/list`, and persists per-tool schema size into `mcp_schemas`.

Stdio servers only — cloud (claude.ai *) and plugin servers are skipped:
they require auth tokens and live outside the user-controlled config.
"""
from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from mcp.client.session import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client

from db import connect

CLAUDE_CONFIG = Path(os.environ.get("CC_CLAUDE_CONFIG") or Path.home() / ".claude.json")
PER_SERVER_TIMEOUT = 15.0


def _estimate_tokens(schema_bytes: int) -> int:
    # Rough JSON-to-token ratio. Cheap and good enough for ranking servers
    # by context cost; not meant to match a tokenizer exactly.
    return max(1, schema_bytes // 4)


def _load_stdio_servers() -> dict[str, dict]:
    if not CLAUDE_CONFIG.exists():
        return {}
    try:
        cfg = json.loads(CLAUDE_CONFIG.read_text())
    except (OSError, json.JSONDecodeError):
        return {}
    servers = cfg.get("mcpServers") or {}
    return {name: spec for name, spec in servers.items() if spec.get("type") == "stdio"}


async def _measure_one(name: str, spec: dict) -> dict:
    params = StdioServerParameters(
        command=spec["command"],
        args=spec.get("args") or [],
        env=spec.get("env") or None,
    )
    rows: list[tuple[str, str, str, int]] = []
    try:
        async with asyncio.timeout(PER_SERVER_TIMEOUT):
            async with stdio_client(params) as (r, w):
                async with ClientSession(r, w) as session:
                    await session.initialize()
                    listing = await session.list_tools()
                    for tool in listing.tools:
                        schema_json = json.dumps(tool.inputSchema or {}, separators=(",", ":"))
                        rows.append((name, tool.name, schema_json, _estimate_tokens(len(schema_json))))
    except asyncio.TimeoutError:
        return {"server": name, "status": "timeout", "tools": 0, "tokens": 0}
    except Exception as e:  # noqa: BLE001
        return {"server": name, "status": "error", "error": str(e)[:200], "tools": 0, "tokens": 0}
    return {"server": name, "status": "ok", "rows": rows, "tools": len(rows),
            "tokens": sum(r[3] for r in rows)}


def _persist(server: str, rows: list[tuple[str, str, str, int]]) -> None:
    now = datetime.now(timezone.utc).isoformat()
    with connect() as conn:
        conn.execute("DELETE FROM mcp_schemas WHERE server = ?", (server,))
        conn.executemany(
            "INSERT INTO mcp_schemas (server, tool, schema_json, tokens, collected_at) "
            "VALUES (?, ?, ?, ?, ?)",
            [(s, t, j, k, now) for (s, t, j, k) in rows],
        )


async def measure_all() -> dict:
    servers = _load_stdio_servers()
    if not servers:
        return {"servers": [], "skipped": "no stdio servers in ~/.claude.json"}

    results = await asyncio.gather(*[_measure_one(n, s) for n, s in servers.items()])
    summary = []
    for res in results:
        if res["status"] == "ok":
            await asyncio.to_thread(_persist, res["server"], res["rows"])
            summary.append({"server": res["server"], "status": "ok",
                            "tools": res["tools"], "tokens": res["tokens"]})
        else:
            summary.append({k: v for k, v in res.items() if k != "rows"})
    return {"servers": summary, "measured_at": datetime.now(timezone.utc).isoformat()}


if __name__ == "__main__":
    print(json.dumps(asyncio.run(measure_all()), indent=2))
