"""Dispatcher: spawns ``claude -p`` per pending task.

Two execution modes:

  classic  — single-shot, capture stdout, write output_summary.
  stream   — uses ``claude -p --output-format stream-json --input-format stream-json``
             so we can scan assistant text for ``DECISION:`` / ``INBOX:`` markers
             and inject answers / follow-ups via stdin without restarting the
             process. Skips fenced code blocks (triple backtick) so model output
             that *talks about* DECISION: doesn't trigger a real prompt.

PID marker files (``.tmp/mission-control-queue/pids/{pid}``) are how
``/api/system/emergency-stop`` finds dispatched children. macOS 12+ blocks
``ps eww`` env disclosure at user privilege, so the env-marker approach the
spec mentions doesn't actually work — files on disk do.

This module exposes ``run_once()`` which the heartbeat tick invokes.
"""
from __future__ import annotations

import json
import os
import queue
import re
import shlex
import shutil
import signal
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from db import connect  # noqa: E402
import task_tracker      # noqa: E402
import skill_router      # noqa: E402

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

QUEUE_DIR = ROOT / ".tmp" / "mission-control-queue"
PID_DIR = QUEUE_DIR / "pids"
QUEUE_DIR.mkdir(parents=True, exist_ok=True)
PID_DIR.mkdir(parents=True, exist_ok=True)

MAX_CONCURRENT     = int(os.environ.get("MAX_CONCURRENT_TASKS", "3"))
TASK_TIMEOUT_SECS  = int(os.environ.get("TASK_TIMEOUT_SECONDS", "900"))
DECISION_POLL_SECS = float(os.environ.get("DECISION_POLL_SECS", "2"))
DEFAULT_MODEL      = os.environ.get("MISSION_CONTROL_DEFAULT_MODEL", "claude-sonnet-4-6")

CLAUDE_CMD = os.environ.get("CLAUDE_CMD") or shutil.which("claude") or "claude"

DECISION_RE = re.compile(r"^DECISION:\s*(.+?)\s*$", re.MULTILINE)
INBOX_RE    = re.compile(r"^INBOX:\s*(.+?)\s*$", re.MULTILINE)


# ---------------------------------------------------------------------------
# PID marker helpers
# ---------------------------------------------------------------------------

def _mark_child_pid(pid: int) -> None:
    try:
        (PID_DIR / str(pid)).touch()
    except OSError:
        pass


def _unmark_child_pid(pid: int) -> None:
    (PID_DIR / str(pid)).unlink(missing_ok=True)


def _sweep_stale_pids() -> int:
    n = 0
    for p in PID_DIR.glob("*"):
        try:
            pid = int(p.name)
            os.kill(pid, 0)
        except (ValueError, ProcessLookupError, OSError):
            try: p.unlink(missing_ok=True); n += 1
            except OSError: pass
    return n


# ---------------------------------------------------------------------------
# Marker scanner — fence-aware
# ---------------------------------------------------------------------------

def scan_markers(text: str) -> tuple[list[str], list[str]]:
    """Return (decisions, inbox messages) found in ``text``.

    Lines inside triple-backtick fenced blocks are skipped so model prose
    that *describes* the markers (e.g. inside docs) doesn't fire them.
    """
    decisions: list[str] = []
    inboxes:   list[str] = []
    in_fence = False
    for line in text.splitlines():
        stripped = line.lstrip()
        if stripped.startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        if stripped.startswith("DECISION:"):
            decisions.append(stripped[len("DECISION:"):].strip())
        elif stripped.startswith("INBOX:"):
            inboxes.append(stripped[len("INBOX:"):].strip())
    return decisions, inboxes


# ---------------------------------------------------------------------------
# DB helpers — decisions / inbox
# ---------------------------------------------------------------------------

def _create_decision(task_id: int, session_id: str | None, prompt: str) -> int | None:
    """``INSERT OR IGNORE`` against the partial UNIQUE on (session_id, prompt).
    Returns the row id (existing or new) or None on failure.
    """
    with connect() as conn:
        try:
            cur = conn.execute(
                """INSERT INTO ops_decisions (task_id, session_id, prompt, status)
                   VALUES (?, ?, ?, 'pending')""",
                (task_id, session_id, prompt),
            )
            return cur.lastrowid
        except Exception:  # noqa: BLE001
            r = conn.execute(
                "SELECT id FROM ops_decisions WHERE session_id = ? AND prompt = ?",
                (session_id, prompt),
            ).fetchone()
            return r["id"] if r else None


def _decision_answer(decision_id: int) -> str | None:
    with connect() as conn:
        r = conn.execute(
            "SELECT answer, status FROM ops_decisions WHERE id = ?", (decision_id,)
        ).fetchone()
    if r and r["status"] == "answered":
        return r["answer"]
    return None


def _post_inbox(task_id: int, session_id: str | None, body: str) -> None:
    with connect() as conn:
        conn.execute(
            """INSERT INTO ops_inbox (task_id, session_id, direction, body)
               VALUES (?, ?, 'agent_to_user', ?)""",
            (task_id, session_id, body),
        )


# ---------------------------------------------------------------------------
# Resolution helpers
# ---------------------------------------------------------------------------

def _read_skill_frontmatter(skill_name: str) -> dict | None:
    with connect() as conn:
        r = conn.execute(
            "SELECT path FROM skills WHERE name = ?", (skill_name,)
        ).fetchone()
    if not r or not r["path"]:
        return None
    skill_md = Path(r["path"]) / "SKILL.md"
    if not skill_md.exists():
        return None
    try:
        import yaml
        text = skill_md.read_text(encoding="utf-8", errors="replace")[:8000]
        m = re.match(r"---\s*\n(.*?)\n---\s*\n", text, re.DOTALL)
        if m:
            data = yaml.safe_load(m.group(1)) or {}
            return data if isinstance(data, dict) else None
    except Exception:  # noqa: BLE001
        return None
    return None


def resolve_model(task: dict) -> str:
    if task.get("model"):
        return task["model"]
    skill = task.get("assigned_skill")
    if skill:
        meta = _read_skill_frontmatter(skill) or {}
        if meta.get("model"):
            return meta["model"]
    return DEFAULT_MODEL


def _build_env(task: dict) -> dict[str, str]:
    env = os.environ.copy()
    # Telemetry on the dispatched child so we get OTEL events back into our DB
    env["CLAUDE_CODE_ENABLE_TELEMETRY"] = "1"
    env.setdefault("OTEL_EXPORTER_OTLP_ENDPOINT", f"http://127.0.0.1:{os.environ.get('CC_PORT', '8765')}")
    env.setdefault("OTEL_EXPORTER_OTLP_PROTOCOL", "http/json")
    env.setdefault("OTEL_METRICS_EXPORTER", "otlp")
    env.setdefault("OTEL_LOGS_EXPORTER", "otlp")
    env.setdefault("OTEL_LOG_TOOL_DETAILS", "1")
    env["ATOMICOPS_DISPATCHED"] = "1"  # legacy marker; PID files are the real safety gate
    if task.get("dry_run"):
        env["MISSION_CONTROL_DRY_RUN"] = "1"
    return env


def _build_prompt(task: dict) -> str:
    title = task.get("title", "")
    desc  = task.get("description") or ""
    prefix = ""
    if task.get("dry_run"):
        prefix += "DRY RUN — analyze and report only; do not modify files or run side-effecting tools.\n\n"
    if task.get("assigned_skill"):
        prefix += f"Use the skill: {task['assigned_skill']}\n\n"
    return f"{prefix}{title}\n\n{desc}".strip()


# ---------------------------------------------------------------------------
# Classic mode — fire-and-forget single shot
# ---------------------------------------------------------------------------

def _run_classic(task: dict) -> tuple[bool, str]:
    prompt = _build_prompt(task)
    model = resolve_model(task)
    cmd = [CLAUDE_CMD, "-p", prompt, "--model", model, "--output-format", "text"]
    env = _build_env(task)
    proc = subprocess.Popen(
        cmd, env=env, cwd=str(ROOT),
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, start_new_session=True,
    )
    _mark_child_pid(proc.pid)
    try:
        out, err = proc.communicate(timeout=TASK_TIMEOUT_SECS)
        ok = (proc.returncode == 0)
        summary = (out or err or "").strip()
        return ok, summary
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.communicate(timeout=10)
        return False, f"Timeout after {TASK_TIMEOUT_SECS}s"
    finally:
        _unmark_child_pid(proc.pid)


# ---------------------------------------------------------------------------
# Stream mode — interactive with DECISION: / INBOX: parsing
# ---------------------------------------------------------------------------

def _stdout_reader(stream, q: "queue.Queue[str]") -> None:
    try:
        for line in iter(stream.readline, ""):
            if not line:
                break
            q.put(line)
    finally:
        try: stream.close()
        except Exception: pass  # noqa: BLE001
        q.put("__EOF__")


def _run_stream(task: dict) -> tuple[bool, str]:
    """Stream-mode runner. Returns (ok, summary)."""
    prompt = _build_prompt(task)
    model = resolve_model(task)
    cmd = [
        CLAUDE_CMD, "-p", prompt, "--model", model,
        "--output-format", "stream-json",
        "--input-format", "stream-json",
        "--verbose",
    ]
    env = _build_env(task)
    proc = subprocess.Popen(
        cmd, env=env, cwd=str(ROOT),
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, bufsize=1, start_new_session=True,
    )
    _mark_child_pid(proc.pid)

    q: "queue.Queue[str]" = queue.Queue()
    t_out = threading.Thread(target=_stdout_reader, args=(proc.stdout, q), daemon=True)
    t_err = threading.Thread(target=_stdout_reader, args=(proc.stderr, q), daemon=True)
    t_out.start(); t_err.start()

    session_id: str | None = None
    summary_parts: list[str] = []
    pending_decision_ids: set[int] = set()
    queue_file = QUEUE_DIR / f"_pre_session_{task['id']}.jsonl"
    queue_offset = 0
    deadline = time.time() + TASK_TIMEOUT_SECS
    eof_count = 0

    def _drain_queue_file() -> None:
        nonlocal queue_offset
        if not session_id:
            return
        path = QUEUE_DIR / f"{session_id}.jsonl"
        if not path.exists():
            return
        try:
            with path.open("r", encoding="utf-8") as fh:
                fh.seek(queue_offset)
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        msg = json.loads(line)
                        if proc.stdin and not proc.stdin.closed:
                            payload = json.dumps({
                                "type": "user",
                                "message": {"role": "user", "content": msg.get("body") or msg.get("answer") or ""},
                            })
                            proc.stdin.write(payload + "\n")
                            proc.stdin.flush()
                    except (json.JSONDecodeError, BrokenPipeError, OSError):
                        continue
                queue_offset = fh.tell()
        except OSError:
            pass

    try:
        while time.time() < deadline and proc.poll() is None and eof_count < 2:
            try:
                line = q.get(timeout=DECISION_POLL_SECS)
            except queue.Empty:
                # Timeout — answer pending decisions, drain user queue
                for did in list(pending_decision_ids):
                    ans = _decision_answer(did)
                    if ans is not None and proc.stdin and not proc.stdin.closed:
                        try:
                            proc.stdin.write(json.dumps({
                                "type": "user",
                                "message": {"role": "user", "content": ans},
                            }) + "\n")
                            proc.stdin.flush()
                            pending_decision_ids.remove(did)
                        except (BrokenPipeError, OSError):
                            pass
                _drain_queue_file()
                continue

            if line == "__EOF__":
                eof_count += 1
                continue

            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                # Non-JSON stderr line — ignore but keep summary
                continue

            etype = event.get("type")
            if etype == "system" and event.get("subtype") == "init":
                sid = event.get("session_id")
                if sid:
                    session_id = sid
                    task_tracker.update_session(task["id"], sid)
                    # Marker so the dashboard can know this session is
                    # dispatcher-managed (queue drains will reach it).
                    try:
                        (PID_DIR / f"sid-{sid}").touch()
                    except OSError:
                        pass

            elif etype == "assistant":
                msg = event.get("message") or {}
                # Walk content blocks for text we should scan
                for block in msg.get("content") or []:
                    if isinstance(block, dict) and block.get("type") == "text":
                        text = block.get("text") or ""
                        if not text:
                            continue
                        summary_parts.append(text)
                        decisions, inboxes = scan_markers(text)
                        for prompt_text in decisions:
                            did = _create_decision(task["id"], session_id, prompt_text)
                            if did:
                                pending_decision_ids.add(did)
                        for body in inboxes:
                            _post_inbox(task["id"], session_id, body)

            elif etype == "result":
                # Final summary event from claude -p stream-json
                if event.get("result"):
                    summary_parts.append(str(event.get("result"))[:4000])

            _drain_queue_file()

        # Drain remaining stdout briefly to flush summary
        try: proc.wait(timeout=2)
        except subprocess.TimeoutExpired: pass

        ok = proc.poll() == 0
        summary = "\n".join(summary_parts).strip()[:8000]
        if not ok and proc.poll() is None:
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
            except (ProcessLookupError, OSError):
                pass
        return ok, summary

    finally:
        if proc.poll() is None:
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
            except (ProcessLookupError, OSError):
                pass
        _unmark_child_pid(proc.pid)
        if session_id:
            try:
                (PID_DIR / f"sid-{session_id}").unlink(missing_ok=True)
            except OSError:
                pass
        try: queue_file.unlink(missing_ok=True)
        except OSError: pass


# ---------------------------------------------------------------------------
# Top-level entry: claim + execute one tick of pending tasks
# ---------------------------------------------------------------------------

def _autonomy_for(skill: str | None) -> str:
    if not skill:
        return "auto"
    with connect() as conn:
        r = conn.execute(
            "SELECT autonomy_level FROM skills WHERE name = ?", (skill,)
        ).fetchone()
    return (r["autonomy_level"] if r else "auto") or "auto"


def _run_one(task: dict) -> None:
    started = time.time()
    try:
        if task.get("execution_mode") == "stream":
            ok, summary = _run_stream(task)
        else:
            ok, summary = _run_classic(task)
    except Exception as e:  # noqa: BLE001
        ok, summary = False, f"Dispatcher error: {e}"

    duration_ms = int((time.time() - started) * 1000)
    if ok:
        task_tracker.complete_task(task["id"], summary or None, duration_ms)
    else:
        task_tracker.fail_task(task["id"], summary or "(no output)", duration_ms)


def run_once(verbose: bool = False) -> dict[str, int]:
    """One dispatcher tick. Honors emergency_stop."""
    if task_tracker.is_emergency_stopped():
        if verbose: print("[dispatcher] emergency stop active — skipping")
        return {"skipped": 1, "claimed": 0, "swept_pids": 0}

    swept = _sweep_stale_pids()
    counts = {"skipped": 0, "claimed": 0, "swept_pids": swept,
              "promoted_for_approval": 0, "auto_assigned_skill": 0}

    candidates = task_tracker.list_runnable(MAX_CONCURRENT * 2)
    threads: list[threading.Thread] = []
    for c in candidates:
        if len(threads) >= MAX_CONCURRENT:
            break
        # Auto-route skill if missing
        if not c.get("assigned_skill"):
            picked = skill_router.pick(c)
            if picked:
                with connect() as conn:
                    conn.execute(
                        "UPDATE ops_tasks SET assigned_skill = ? WHERE id = ?",
                        (picked, c["id"]),
                    )
                c["assigned_skill"] = picked
                counts["auto_assigned_skill"] += 1

        autonomy = _autonomy_for(c.get("assigned_skill"))
        if autonomy in ("manual", "review"):
            task_tracker.gate_for_approval(c["id"])
            counts["promoted_for_approval"] += 1
            continue

        claimed = task_tracker.claim_pending(c["id"])
        if not claimed:
            continue
        counts["claimed"] += 1
        t = threading.Thread(target=_run_one, args=(claimed,), daemon=True)
        t.start()
        threads.append(t)

    # Block heartbeat until either all threads complete or its own timeout
    # (heartbeat caller decides when to give up).
    for t in threads:
        t.join(timeout=TASK_TIMEOUT_SECS + 30)

    return counts


if __name__ == "__main__":
    print(run_once(verbose=True))
