"""Best-effort skill picker for tasks where ``assigned_skill`` is null.

Strategy:
  1. If ``ANTHROPIC_API_KEY`` is set, ask Haiku — single shot, ~$0.0001.
  2. Otherwise, fall back to a heuristic that picks the skill whose name or
     description shares the most lower-cased tokens with the task title +
     description. Returns None if nothing matches.

The router never blocks dispatch — on any error we return ``None`` and let
the dispatcher run with no skill (uses the model's default behavior).
"""
from __future__ import annotations

import os
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / "scripts"))

from db import connect  # noqa: E402


_TOKEN_RE = re.compile(r"[a-z0-9]{3,}")


def _tokens(s: str) -> set[str]:
    return set(_TOKEN_RE.findall(s.lower()))


def _all_skills() -> list[dict]:
    with connect() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT name, description FROM skills WHERE user_invocable=1"
        ).fetchall()]


def _heuristic(task: dict, skills: list[dict]) -> str | None:
    tt = _tokens(f"{task.get('title','')} {task.get('description','')}")
    if not tt:
        return None
    best, best_score = None, 0
    for s in skills:
        st = _tokens(f"{s.get('name','')} {s.get('description') or ''}")
        score = len(tt & st)
        if score > best_score:
            best, best_score = s["name"], score
    return best if best_score >= 1 else None


def pick(task: dict) -> str | None:
    skills = _all_skills()
    if not skills:
        return None
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if api_key:
        try:
            from anthropic import Anthropic
            client = Anthropic(api_key=api_key)
            descs = "\n".join(
                f"- {s['name']}: {(s.get('description') or '')[:200]}" for s in skills
            )
            msg = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=32,
                system=(
                    "Pick the single best skill name for this task. "
                    "Reply with only the exact skill name from the list, or 'none'."
                ),
                messages=[{"role": "user",
                          "content": f"Task: {task.get('title')}\n\n"
                                     f"Details: {task.get('description') or ''}\n\n"
                                     f"Skills:\n{descs}"}],
            )
            text = "".join(b.text for b in msg.content if hasattr(b, "text")).strip()
            if text and text.lower() != "none":
                # Validate it's actually a known skill name
                names = {s["name"] for s in skills}
                if text in names:
                    return text
        except Exception:  # noqa: BLE001
            pass
    return _heuristic(task, skills)
