// Typed API client. All endpoints under /api/* (proxied by Vite to :8765 in dev,
// served same-origin in production).

export type Range = "today" | "7d" | "30d";

export interface SystemHealth {
  uptime_seconds: number;
  started_at: string;
  memory_mb: number | null;
  last_otel_event_age_seconds: number | null;
  last_sync_tick_age_seconds: number | null;
  last_notifier_tick_age_seconds: number | null;
  dispatcher_tick_age_seconds: number | null;
  tz: string;
  drops: { otel_logs: number; otel_metrics: number };
}

export interface SummaryMetric {
  current: number;
  previous: number;
  delta_pct: number | null;
  spark: number[];
}
export interface Summary {
  sessions: SummaryMetric;
  tokens: SummaryMetric;
  tools: SummaryMetric;
  errors: SummaryMetric;
  live_sessions: number;
}

export interface AttentionItem { kind: string; id?: number; title?: string; detail: string; }
export interface AttentionResponse { items: AttentionItem[]; count: number; }

export interface SessionRow {
  session_id: string; source: string; cwd: string | null; git_branch: string | null;
  model: string | null; started_at: string; ended_at: string | null;
  effective_tokens: number; total_tokens: number; error_count: number;
  rate_limit_hit: number; stop_reason: string | null; is_sidechain: number;
  title: string | null;
}
export interface SessionListResponse { rows: SessionRow[]; total: number; limit: number; offset: number; }

export interface LiveSession {
  session_id: string; cwd: string | null; model: string | null;
  title: string | null; effective_tokens: number; started_at: string;
  state: string; current_tool: string | null; mtime_age_seconds: number;
  dispatcher_managed: boolean;
}

export interface ToolCall {
  session_id: string; tool_use_id: string; tool_name: string; ts: string;
  duration_ms: number | null; error: string | null; is_sidechain: number;
}
export interface SessionDetails { session: SessionRow; tool_calls: ToolCall[]; }

export interface TokenDailyRow {
  date: string; model: string; source: string;
  input_tokens: number; output_tokens: number;
  cache_read_tokens: number; cache_create_tokens: number;
}
export interface TokenUsageResponse {
  daily: TokenDailyRow[];
  totals: { input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_create_tokens: number };
  range: Range;
}

export interface CacheDailyRow { date: string; hit_rate: number; input: number; cache_read: number; cache_create: number; }
export interface CacheResponse { daily: CacheDailyRow[]; overall: number; low_sample: boolean; billable_tokens: number; range: Range; }

export interface OutcomeDailyRow { date: string; errored: number; rate_limited: number; truncated: number; unfinished: number; ok: number; }
export interface OutcomesResponse { daily: OutcomeDailyRow[]; range: Range; }

export interface ToolLatencyRow { tool: string; n: number; avg_ms: number | null; p50_ms: number | null; p95_ms: number | null; p99_ms: number | null; max_ms: number | null; error_rate: number; }
export interface ToolLatencyResponse { rows: ToolLatencyRow[]; range: Range; }

export interface HookActivityResponse {
  daily: { date: string; fires: number }[];
  total_fires: number; paired: number;
  p50_ms: number | null; p95_ms: number | null; max_ms: number | null;
  range: Range;
}

export interface ProjectRow { cwd: string | null; sessions: number; tokens: number; tools: number; }
export interface ProjectsResponse { rows: ProjectRow[]; range: Range; }

export interface FanoutRow { session_id: string; agent_calls: number; title: string | null; model: string | null; cwd: string | null; }
export interface FanoutResponse { rows: FanoutRow[]; range: Range; }

export interface EditDecisionRow { tool: string; n: number; accept: number; reject: number; other: number; accept_rate: number; low_sample: boolean; }
export interface EditDecisionsResponse { rows: EditDecisionRow[]; range: Range; }

export interface ProductivityResponse {
  commits: number; pull_requests: number; lines_of_code: number;
  daily: { date: string; metric_name: string; v: number }[];
  range: Range;
}

export interface PressureResponse {
  retry_exhausted: number;
  max_retries_threshold: number;
  compactions: number;
  recent_errors: { timestamp: string; model: string | null; error_message: string | null; status_code: number | null; attempt_count: number | null }[];
}

export interface MCPServerRow { server: string; tools: number; total_calls: number; p50_ms: number | null; p95_ms: number | null; max_ms: number | null; error_rate: number; }
export interface MCPListResponse { servers: MCPServerRow[]; range: Range; }
export interface MCPToolRow { tool: string; calls: number; p50_ms: number | null; p95_ms: number | null; max_ms: number | null; error_rate: number; }
export interface MCPToolsResponse { server: string; tools: MCPToolRow[]; range: Range; }
export interface MCPMeasureRow { server: string; status: "ok" | "error" | "timeout"; tools?: number; tokens?: number; error?: string; }
export interface MCPMeasureResponse { servers: MCPMeasureRow[]; measured_at?: string; skipped?: string; }

export interface SkillRow {
  name: string; environment: string; description: string | null; path: string | null;
  autonomy_level: "auto" | "review" | "manual"; user_invocable: number;
  script_count: number; last_modified: string | null;
}

export interface Decision { id: number; task_id: number | null; session_id: string | null; prompt: string; answer: string | null; status: string; created_at: string; answered_at: string | null; }
export interface InboxMessage { id: number; task_id: number | null; session_id: string | null; direction: string; body: string; read: number; created_at: string; }

export interface Task {
  id: number; title: string; description: string | null;
  status: string; priority: number;
  assigned_skill: string | null; model: string | null;
  execution_mode: "stream" | "classic"; scheduled_for: string | null;
  requires_approval: number; risk_level: string; dry_run: number;
  quadrant: string; approved_at: string | null; session_id: string | null;
  started_at: string | null; completed_at: string | null;
  duration_ms: number | null; cost_usd: number | null;
  output_summary: string | null; error_message: string | null;
  consecutive_failures: number; created_at: string;
}

export interface Schedule {
  id: number; name: string; cron_expression: string;
  task_title: string; task_description: string | null;
  assigned_skill: string | null; enabled: number;
  next_run_at: string | null; last_run_at: string | null; created_at: string;
}

// ---------------------------------------------------------------------------
// Fetch wrapper
// ---------------------------------------------------------------------------

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!r.ok) {
    let detail: string;
    try { detail = JSON.stringify(await r.json()); } catch { detail = r.statusText; }
    throw new Error(`${r.status} ${detail}`);
  }
  return r.json();
}

const qs = (params: Record<string, unknown>) => {
  const u = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  });
  const s = u.toString();
  return s ? `?${s}` : "";
};

export const api = {
  health:        () => req<{ ok: boolean }>("/api/health"),
  systemHealth:  () => req<SystemHealth>("/api/system/health"),
  systemState:   () => req<Record<string, string>>("/api/system/state"),
  attention:     () => req<AttentionResponse>("/api/attention"),
  pressure:      () => req<PressureResponse>("/api/system/pressure"),
  emergencyStop:   () => req<{ stopped: boolean; processes_killed: number; interactive_spared: number }>(
                       "/api/system/emergency-stop", { method: "POST" }),
  emergencyResume: () => req<{ resumed: boolean }>("/api/system/emergency-resume", { method: "POST" }),

  summary:       () => req<Summary>("/api/summary"),

  sessions:      (p: { range?: Range; source?: string; model?: string; q?: string; limit?: number; offset?: number } = {}) =>
                   req<SessionListResponse>(`/api/sessions${qs(p)}`),
  sessionDetails: (sid: string) => req<SessionDetails>(`/api/sessions/${sid}/details`),
  liveSessions:  () => req<{ rows: LiveSession[]; count: number }>("/api/sessions/live"),
  liveMessage:   (sid: string, body: string) =>
                   req<{ queued: boolean }>(`/api/sessions/live/${sid}/message`,
                     { method: "POST", body: JSON.stringify({ body }) }),

  usageTokens:   (range: Range = "7d") => req<TokenUsageResponse>(`/api/usage/tokens${qs({ range })}`),
  usageCache:    (range: Range = "7d") => req<CacheResponse>(`/api/usage/cache${qs({ range })}`),
  outcomes:      (range: Range = "7d") => req<OutcomesResponse>(`/api/sessions/outcomes${qs({ range })}`),
  toolLatency:   (range: Range = "7d") => req<ToolLatencyResponse>(`/api/tools/latency${qs({ range })}`),
  hookActivity:  (range: Range = "7d") => req<HookActivityResponse>(`/api/hooks/activity${qs({ range })}`),
  byProject:     (range: Range = "7d") => req<ProjectsResponse>(`/api/sessions/by-project${qs({ range })}`),
  agentFanout:   (range: Range = "7d") => req<FanoutResponse>(`/api/tools/agent-fanout${qs({ range })}`),
  editDecisions: (range: Range = "7d") => req<EditDecisionsResponse>(`/api/tools/edit-decisions${qs({ range })}`),
  productivity:  (range: Range = "7d") => req<ProductivityResponse>(`/api/activity/productivity${qs({ range })}`),
  activityHourly: () => req<{ grid: number[][]; max: number }>("/api/activity/hourly"),
  toolLatencySeries: (range: Range = "7d") =>
    req<{
      rows: { tool: string; series: number[]; prev_series: number[]; current_p95: number | null; prev_p95: number | null; delta_pct: number | null }[];
      range: Range;
    }>(`/api/tools/latency/series${qs({ range })}`),
  sessionSparks: (ids: string[]) =>
    req<{ sparks: Record<string, number[]> }>(`/api/sessions/sparks${qs({ ids: ids.join(","), buckets: 18 })}`),
  activityDaily: (days = 365) =>
                   req<{ daily: { date: string; v: number }[]; max: number; total: number; days: number }>(
                     `/api/activity/daily${qs({ days })}`),

  mcpList:        (range: Range = "30d") => req<MCPListResponse>(`/api/mcp${qs({ range })}`),
  mcpTools:       (server: string, range: Range = "30d") =>
                   req<MCPToolsResponse>(`/api/mcp/${encodeURIComponent(server)}/tools${qs({ range })}`),
  mcpSync:        () => req<{ servers: number }>(`/api/mcp/sync`, { method: "POST" }),
  mcpMeasure:     () => req<MCPMeasureResponse>(`/api/mcp/measure`, { method: "POST" }),

  skillsList:     (p: { environment?: string; user_invocable?: number } = {}) =>
                   req<{ rows: SkillRow[] }>(`/api/skills${qs(p)}`),
  skillsSync:     () => req<{ discovered: number; written: number }>("/api/skills/sync", { method: "POST" }),
  skillAutonomy:  (name: string, level: "auto" | "review" | "manual") =>
                   req<{ updated: boolean; autonomy_level: string }>(
                     `/api/skills/${encodeURIComponent(name)}/autonomy`,
                     { method: "PATCH", body: JSON.stringify({ autonomy_level: level }) }),

  decisions:      (status: "pending" | "answered" = "pending") =>
                   req<{ rows: Decision[] }>(`/api/decisions${qs({ status })}`),
  decisionAnswer: (id: number, answer: string) =>
                   req<{ answered: boolean }>(`/api/decisions/${id}/answer`,
                     { method: "POST", body: JSON.stringify({ answer }) }),

  inbox:          (p: { unread?: number; max_age_days?: number } = {}) =>
                   req<{ rows: InboxMessage[] }>(`/api/inbox${qs(p)}`),
  inboxRead:      (id: number) => req<{ read: boolean }>(`/api/inbox/${id}/read`, { method: "POST" }),
  inboxReply:     (id: number, body: string) =>
                   req<{ replied: boolean }>(`/api/inbox/${id}/reply`,
                     { method: "POST", body: JSON.stringify({ body }) }),

  tasks:          (p: { status?: string; quadrant?: string; limit?: number } = {}) =>
                   req<{ rows: Task[] }>(`/api/tasks${qs(p)}`),
  taskCreate:     (body: Partial<Task>) =>
                   req<{ id: number; status: string }>("/api/tasks",
                     { method: "POST", body: JSON.stringify(body) }),
  taskUpdate:     (id: number, body: Partial<Task>) =>
                   req<{ updated: boolean }>(`/api/tasks/${id}`,
                     { method: "PATCH", body: JSON.stringify(body) }),
  taskDelete:     (id: number) => req<{ deleted: number }>(`/api/tasks/${id}`, { method: "DELETE" }),
  taskApprove:    (id: number) => req<{ approved: boolean }>(`/api/tasks/${id}/approve`, { method: "POST" }),
  taskRerun:      (id: number) => req<{ rerun: boolean }>(`/api/tasks/${id}/rerun`, { method: "POST" }),
  dispatcherTrigger: () => req<{ triggered: boolean; pid?: number; reason?: string }>(
                       "/api/dispatcher/trigger", { method: "POST" }),

  schedules:        () => req<{ rows: Schedule[] }>("/api/schedules"),
  scheduleCreate:   (body: Partial<Schedule>) =>
                     req<{ id: number; next_run_at: string | null }>("/api/schedules",
                       { method: "POST", body: JSON.stringify(body) }),
  scheduleUpdate:   (id: number, body: Partial<Schedule>) =>
                     req<{ updated: boolean; next_run_at: string | null }>(`/api/schedules/${id}`,
                       { method: "PATCH", body: JSON.stringify(body) }),
  scheduleDelete:   (id: number) => req<{ deleted: number }>(`/api/schedules/${id}`, { method: "DELETE" }),
  scheduleRuns:     (id: number) => req<{ rows: any[] }>(`/api/schedules/${id}/runs`),
};
