# Architecture

Vue technique pour comprendre comment les pièces communiquent.

## Composants

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Claude Code (CLI / IDE)                       │
│                                                                     │
│  écrit ~/.claude/projects/<project>/<session_id>.jsonl              │
│  émet des events OTEL si configuré (logs + metrics)                 │
└──────────────┬─────────────────────┬────────────────────────────────┘
               │                     │
               │ logs/metrics OTEL   │ JSONL files
               │ POST /v1/{logs,     │ (file watcher)
               │       metrics}      │
               ▼                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│  scripts/server.py — FastAPI sur 127.0.0.1:8765                     │
│                                                                     │
│  • Endpoints OTEL (POST /v1/logs, /v1/metrics)                      │
│    persistent dans otel_events / otel_metrics                       │
│                                                                     │
│  • API de lecture (/api/*)                                          │
│    summary, sessions, tokens, cache, latency, hooks, fanout,        │
│    activity/hourly, activity/daily, tools/latency/series,           │
│    sessions/sparks, decisions, inbox, tasks, schedules, mcp,        │
│    skills, system/health, system/state, attention, pressure         │
│                                                                     │
│  • API d'écriture (POST)                                            │
│    sessions/live/{sid}/message → enqueue suivi                      │
│    decisions/{id}/answer → injecte la réponse                       │
│    tasks → file Mission Control                                     │
│    mcp/sync, mcp/measure, sync                                      │
│                                                                     │
│  • SSE                                                              │
│    /api/sessions/live/{sid}/stream → live JSONL events              │
│                                                                     │
│  • Static                                                           │
│    sert ui/dist comme SPA fallback                                  │
└──────────────┬───────────────────────────────────────┬──────────────┘
               │                                       │
               │ SQLite (data/command-centre.db)       │
               │                                       │
               ▼                                       ▼
┌──────────────────────────┐         ┌─────────────────────────────────┐
│ scripts/sync_*.py        │         │ Mission Control                 │
│                          │         │ .claude/skills/mission-control/ │
│ sync_sessions.py         │         │                                 │
│   parse JSONL → sessions │         │ heartbeat.py (launchd 120s)     │
│   + tool_calls           │         │   claim une tâche pending,      │
│                          │         │   appelle dispatcher.py         │
│ sync_skills.py           │         │                                 │
│   scan .claude/skills/   │         │ dispatcher.py                   │
│   → skills_registry      │         │   spawn `claude -p ...`         │
│                          │         │   inject stdin depuis           │
│ Triggered par /api/sync  │         │   .tmp/mission-control-queue/   │
│ ou par le serveur au     │         │   {sid}.jsonl                   │
│ démarrage (lifespan).    │         │                                 │
└──────────────────────────┘         └─────────────────────────────────┘
                                                   │
                                                   ▼
                                     PID files dans /pids/
                                     Marker sid-{session_id}
                                     pour signaler dispatcher_managed=true
```

## Tables SQLite

Schéma défini dans `scripts/db.py`. Tables principales :

| Table | Rôle |
|---|---|
| `sessions` | une ligne par session Claude Code (started_at, ended_at, model, tokens cumulés, error_count…) |
| `tool_calls` | une ligne par appel d'outil (session_id, tool_name, ts, duration_ms, error) |
| `token_usage` | rollup quotidien `(date, model, source)` → tokens input/output/cache |
| `otel_events` | logs OTEL bruts (event_name, timestamp, attributes JSON) |
| `otel_metrics` | counters/gauges OTEL (metric_name, timestamp, value) |
| `live_session_state` | écrit par le hook session_state_hook.py (current_tool, state) |
| `ops_tasks` | file Mission Control |
| `ops_decisions` | décisions HITL en attente / répondues |
| `ops_inbox` | messages agent ↔ user |
| `ops_schedules` | schedules cron-like |
| `skills_registry` | index des skills découverts |

Index sur `started_at`, `cwd`, `source`, `date`, `tool_name+ts`. Voir `scripts/db.py`.

## Flux de données

### 1. Session Claude Code → SQLite

1. L'utilisateur lance Claude Code (IDE ou CLI) : un fichier JSONL est créé dans `~/.claude/projects/<project>/<session_id>.jsonl`.
2. Chaque message ajoute une ligne au JSONL.
3. Si OTEL est configuré (`./cc setup otel`), Claude Code émet des events (`hook_execution_*`, `tool_decision`, `api_request`, métriques `claude_code.*`) qui sont POSTés vers `/v1/logs` et `/v1/metrics` du dashboard.
4. À chaque tick (au démarrage du serveur + après un `POST /api/sync`), `sync_sessions.py` re-scrape les JSONL modifiés et upsert dans `sessions` + `tool_calls`.

### 2. UI → API → SQLite

Le frontend utilise TanStack Query (`ui/src/hooks/useQueries.ts`). Chaque card branche un hook qui appelle un endpoint REST. Les ranges (`today/7d/30d`) sont passés en query string.

Refetch interval typique :
- 5 s pour les decisions, tasks, system/health, liveSessions
- 10 s pour attention, inbox
- 15-30 s pour summary, schedules, pressure
- 60 s pour activity/hourly
- 5 min pour activity/daily

### 3. Mission Control (optionnel)

Quand on met une tâche en file via le dashboard (`POST /api/tasks`), elle est insérée dans `ops_tasks` avec `status = pending`.

`heartbeat.py` (cron toutes les 120 s) :
- claim la prochaine tâche pending,
- la passe à `dispatcher.py`.

`dispatcher.py` :
- spawn `claude -p <prompt> --output-format stream-json --input-format stream-json`,
- lit le stdout (JSONL events), extrait le `session_id` quand `system.subtype == "init"`,
- touch `.tmp/mission-control-queue/pids/sid-<session_id>` pour marquer la session comme `dispatcher_managed`,
- draine `.tmp/mission-control-queue/<session_id>.jsonl` vers le stdin (suivis dashboard),
- répond aux décisions HITL via le même pipe,
- scan les markers `DECISION:` et `INBOX:` dans le texte assistant pour créer les rows correspondantes.

À la fin (process exit ou timeout) : unlink du PID + marker, suppression de la queue file.

## Frontend

### Routes (TanStack Router)
- `/` → `routes/index.tsx` (page Commande)
- `/activity` → `routes/activity.tsx`
- `/skills` → `routes/skills.tsx`

### Composants

```
ui/src/components/
├── layout/
│   ├── AppShell.tsx          # topbar + main + status bar + tweaks
│   ├── Brand.tsx             # logo brand-mark gradient
│   ├── CommandPalette.tsx    # ⌘K
│   ├── StatusBar.tsx         # footer fixe
│   └── TweaksPanel.tsx
├── ui/                       # primitives partagées
│   ├── Card.tsx
│   ├── Badge.tsx             # tones × variants (soft/outline/solid)
│   ├── Button.tsx
│   ├── Segmented.tsx         # ⭐ partagé, primary (gradient) / subtle
│   ├── Toggle.tsx            # ⭐ partagé, knob coloré
│   ├── RangeToggle.tsx       # = Segmented<Range> primary
│   ├── KpiCard.tsx           # hero + standard, suffixe + delta + sparkline
│   ├── SectionH.tsx          # section pliable
│   ├── EmptyState.tsx
│   ├── Sheet.tsx             # drawer latéral
│   ├── Tooltip.tsx
│   └── ...
├── charts/
│   ├── Sparkline.tsx         # bezier lissé, area, colorAt segmenté
│   └── StackedBars.tsx
└── panels/                   # un fichier par card du dashboard
    ├── KpiRow.tsx
    ├── HourlyHeatmap.tsx
    ├── HeatmapGrid.tsx       # 1 an
    ├── TokenUsageCard.tsx
    ├── SessionsTable.tsx
    ├── LiveSessionsCard.tsx
    ├── ToolLatencyCard.tsx
    ├── DonutOutcomes.tsx
    ├── CacheEfficiencyCard.tsx
    ├── HookActivityCard.tsx
    ├── ProjectBreakdownCard.tsx
    ├── AgentFanoutCard.tsx
    ├── EditAcceptanceCard.tsx
    ├── ProductivityCard.tsx
    ├── PressurePanel.tsx
    ├── DecisionsCard.tsx
    ├── InboxCard.tsx
    ├── TaskBoard.tsx
    ├── SchedulesCard.tsx
    ├── EmergencyStopBanner.tsx
    ├── SystemHealthStrip.tsx
    ├── AttentionBar.tsx
    ├── OtelPanel.tsx
    ├── MCPPanel.tsx
    ├── SkillsRegistry.tsx
    ├── SkillCostCard.tsx
    └── ContextHealthCard.tsx
```

### Système de tokens (CSS variables)

Tout le design est piloté par CSS variables dans `ui/src/tokens.css`. Les attributs sur `<body>` switchent les valeurs :

- `data-theme="dark|light"` → palette `--bg`, `--ink`, `--hairline`…
- `data-palette="indigo|slate|mono|ocean|sunset|lavender|ember|arctic"` → `--acc`, `--acc-grad`, `--on-acc`, `--mdl-*`…
- `data-density="compact|regular|comfy"` → `--row-h`, `--pad-card`, `--gap-xl`, `--fs-body`
- `data-borders="none|hairline|strong"` → poids des bordures de card
- `data-elev="flat|soft|strong"` → `box-shadow` des cards
- `data-badge="soft|outline|solid"` → variant par défaut des `<Badge>`
- `data-decor="on|off"`, `data-grid="on|off"`, `data-zebra="on|off"` → toggles décor
- `body.no-motion` → désactive animations

Tailwind est configuré pour piocher dans ces variables (`ui/tailwind.config.ts`). Couleurs principales (bg, ink) en triplets RGB pour supporter les alpha-modifiers (`bg-bg/70`).

### State / persistance

- TanStack Query gère le cache/refetch des données.
- Tweaks persistés en localStorage (`cc-theme`, `cc-palette`, `cc-density`, `cc-elev`, `cc-borders`, `cc-badge`, `cc-radius-card`, `cc-fs-body`, `cc-kpi-scale`, `cc-grain`, `cc-decor`, `cc-grid`, `cc-motion`, `cc-zebra`, `cc-hero-gradient`).
- Anti-FOUC : un script inline en début de `<body>` lit le localStorage et applique `data-theme`/`data-palette`/`data-density` avant le rendu React.

## API endpoints

Liste exhaustive des routes dans `scripts/server.py`. Catégories :

| Préfixe | Rôle |
|---|---|
| `/v1/logs`, `/v1/metrics` | endpoints OTEL (POST) — Claude Code y envoie sa télémétrie |
| `/api/health`, `/api/system/*` | santé, état du serveur, emergency stop |
| `/api/summary`, `/api/sessions*` | KPI hero, table sessions, sparks, live sessions, SSE stream |
| `/api/usage/*` | tokens, cache |
| `/api/tools/*` | latency, agent-fanout, edit-decisions, latency/series |
| `/api/hooks/activity` | activité des hooks |
| `/api/activity/*` | productivity, hourly heatmap, daily (1 an) |
| `/api/mcp/*` | serveurs MCP, tools, sync, measure |
| `/api/skills` | registre des skills |
| `/api/decisions`, `/api/inbox` | HITL |
| `/api/tasks`, `/api/schedules` | Mission Control |
| `/api/explain*` | LLM explainer |
| `/api/sync` | force un re-scrape JSONL |
| `/api/firehose`, `/api/attention`, `/api/system/pressure` | stream / signaux |

## Ports et chemins

- Serveur : `127.0.0.1:8765` (configurable via `CC_PORT`)
- Dev UI : `vite` sur :5173 si tu lances `npm run dev` (proxy à mettre en place ou taper `:8765`)
- DB : `data/command-centre.db`
- Logs : `logs/server.{out,err}.log` et `logs/mission-control.{out,err}.log`
- IPC : `.tmp/mission-control-queue/<sid>.jsonl` (suivis) et `.tmp/mission-control-queue/pids/{pid,sid-XXX}` (markers)
