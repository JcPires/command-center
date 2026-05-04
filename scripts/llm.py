"""Subprocess wrapper around `claude -p` so endpoints can ask the local
Claude Code install (using your Pro/Max subscription quota) for short
explanations or analyses without going through the Anthropic API.

Cheap, slow, async. ~5-15s per call. One call per request unless cached.
"""
from __future__ import annotations

import asyncio
import json

DEFAULT_MODEL = "haiku"
DEFAULT_TIMEOUT_S = 45.0


class LLMError(RuntimeError):
    pass


async def ask(
    prompt: str,
    *,
    system_prompt: str | None = None,
    resume_session_id: str | None = None,
    model: str = DEFAULT_MODEL,
    timeout: float = DEFAULT_TIMEOUT_S,
) -> dict:
    """Run `claude -p`. Returns ``{result, session_id}``.

    ``resume_session_id`` continues a prior conversation via
    ``--resume <id>`` so the user can ask follow-ups with context preserved.
    """
    args = ["claude", "-p", "--model", model, "--output-format", "json"]
    if system_prompt:
        args.extend(["--append-system-prompt", system_prompt])
    if resume_session_id:
        args.extend(["--resume", resume_session_id])
    args.append(prompt)
    try:
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError as exc:
        raise LLMError(f"claude -p timed out after {timeout}s") from exc
    if proc.returncode != 0:
        raise LLMError(f"claude exited {proc.returncode}: {stderr.decode(errors='replace')[:500]}")
    try:
        payload = json.loads(stdout.decode())
    except json.JSONDecodeError as exc:
        raise LLMError(f"claude returned non-JSON output: {stdout[:200]!r}") from exc
    if payload.get("is_error"):
        raise LLMError(payload.get("result") or "claude reported an error")
    result = payload.get("result")
    if not isinstance(result, str):
        raise LLMError(f"unexpected result shape: {payload!r}")
    return {"result": result.strip(), "session_id": payload.get("session_id")}
