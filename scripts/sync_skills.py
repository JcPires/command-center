"""Discover skills across IDE (project + global) environments.

A skill is a directory under one of:
  - ``<CC_PROJECT_ROOT>/.claude/skills/<name>/``   → ide:project
  - ``~/.claude/skills/<name>/``                   → ide:global
  - ``<other-project-cwd>/.claude/skills/<name>/`` → ide:project:<basename>
    (other-project cwds are discovered from the ``sessions`` table — every
     project Claude Code has touched. Worktree paths are stripped to their
     parent project to avoid double-counting.)

We read frontmatter from ``SKILL.md`` if present (YAML between ``---`` markers),
extracting ``description`` and ``autonomy_level``. ``user_invocable`` defaults
to ``True``. ``script_count`` counts files under ``scripts/``.

Note: ``skills.name`` is the primary key, so a name collision across projects
keeps only the last-scanned occurrence. The current project wins by being
scanned first.
"""
from __future__ import annotations

import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import yaml

from db import connect, init_db

PROJECT_ROOT = Path(os.environ.get("CC_PROJECT_ROOT") or Path.cwd())
GLOBAL_HOME = Path.home() / ".claude" / "skills"

FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)


def _read_frontmatter(skill_md: Path) -> dict:
    try:
        text = skill_md.read_text(encoding="utf-8", errors="replace")[:8000]
    except OSError:
        return {}
    m = FRONTMATTER_RE.match(text)
    if not m:
        return {}
    try:
        data = yaml.safe_load(m.group(1)) or {}
    except yaml.YAMLError:
        return {}
    return data if isinstance(data, dict) else {}


def _walk_skill_dir(root: Path, environment: str) -> Iterable[dict]:
    if not root.exists():
        return
    for child in sorted(root.iterdir()):
        if not child.is_dir():
            continue
        skill_md = child / "SKILL.md"
        meta = _read_frontmatter(skill_md) if skill_md.exists() else {}
        scripts_dir = child / "scripts"
        script_count = sum(1 for _ in scripts_dir.rglob("*")) if scripts_dir.exists() else 0
        try:
            mtime = max(p.stat().st_mtime for p in child.rglob("*") if p.is_file())
        except (OSError, ValueError):
            mtime = child.stat().st_mtime
        yield {
            "name":             meta.get("name") or child.name,
            "environment":      environment,
            "description":      (meta.get("description") or "")[:1000],
            "path":             str(child),
            "autonomy_level":   meta.get("autonomy_level") or "review",
            "user_invocable":   1 if meta.get("user_invocable", True) else 0,
            "script_count":     script_count,
            "last_modified":    datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat(),
        }


_WORKTREE_SUFFIX_RE = re.compile(r"/\.claude/worktrees/[^/]+/?$")


def _strip_worktree(cwd: str) -> str:
    return _WORKTREE_SUFFIX_RE.sub("", cwd)


def _other_project_roots(current: Path) -> list[Path]:
    """Distinct project roots from the sessions table, minus current and global."""
    try:
        global_skills_real = str(GLOBAL_HOME.resolve())
    except OSError:
        global_skills_real = ""
    seen_roots: set[str] = {str(current.resolve())}
    seen_skill_dirs: set[str] = {global_skills_real} if global_skills_real else set()
    out: list[Path] = []
    try:
        with connect() as conn:
            rows = conn.execute(
                "SELECT DISTINCT cwd FROM sessions WHERE cwd IS NOT NULL"
            ).fetchall()
    except Exception:  # noqa: BLE001
        return out
    for r in rows:
        cwd = _strip_worktree(r["cwd"])
        try:
            real_root = str(Path(cwd).resolve())
        except OSError:
            continue
        if real_root in seen_roots:
            continue
        seen_roots.add(real_root)
        skill_dir = Path(real_root) / ".claude" / "skills"
        if not skill_dir.is_dir():
            continue
        try:
            real_skills = str(skill_dir.resolve())
        except OSError:
            continue
        if real_skills in seen_skill_dirs:
            continue
        seen_skill_dirs.add(real_skills)
        out.append(Path(real_root))
    return out


def sync() -> dict[str, int]:
    init_db()
    rows: list[dict] = []
    rows.extend(_walk_skill_dir(PROJECT_ROOT / ".claude" / "skills", "ide:project"))
    rows.extend(_walk_skill_dir(GLOBAL_HOME, "ide:global"))
    for root in _other_project_roots(PROJECT_ROOT):
        env = f"ide:project:{root.name}"
        rows.extend(_walk_skill_dir(root / ".claude" / "skills", env))

    counts = {"discovered": len(rows), "written": 0}
    with connect() as conn:
        conn.execute("BEGIN")
        conn.execute("DELETE FROM skills")
        for r in rows:
            conn.execute(
                """INSERT OR REPLACE INTO skills
                   (name, environment, description, path, autonomy_level,
                    user_invocable, script_count, last_modified)
                   VALUES (:name, :environment, :description, :path,
                           :autonomy_level, :user_invocable, :script_count,
                           :last_modified)""",
                r,
            )
            counts["written"] += 1
        conn.execute("COMMIT")
    return counts


if __name__ == "__main__":
    print(sync())
