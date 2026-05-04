---
name: mission-control
description: Internal — runs the dispatcher heartbeat. Not user-invocable.
user_invocable: false
autonomy_level: manual
---

# Mission Control

Background dispatcher: claims pending `ops_tasks`, materialises schedules, runs
each task as a `claude -p` subprocess (classic or stream mode), parses
`DECISION:` / `INBOX:` markers from streamed output, and writes results back to
the dashboard DB.

Production runs via the `com.commandcentre.mission-control` launchd agent.
Trigger a one-shot tick from anywhere with:

```
python3 .claude/skills/mission-control/scripts/heartbeat.py --once
```

Or via the dashboard API: `POST /api/dispatcher/trigger`.
