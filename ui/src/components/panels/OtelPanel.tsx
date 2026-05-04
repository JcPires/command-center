import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardKicker, CardTitle, Badge, Button, ExplainButton } from "@/components/ui";
import { Pause, Play, RadioTower } from "lucide-react";
import { fmtMs, fmtRel } from "@/lib/format";

interface FirehoseEvent {
  id: number;
  event_name: string;
  timestamp: string | null;
  session_id: string | null;
  model: string | null;
  tool_name: string | null;
  tool_success: number | null;
  tool_duration_ms: number | null;
  error_message: string | null;
  mcp_server_name: string | null;
  mcp_tool_name: string | null;
}

const TONE_FOR: Record<string, "ok"|"warn"|"err"|"info"|"muted"> = {
  tool_result: "ok",
  api_request: "info",
  api_error: "err",
  hook_execution_start: "muted",
  hook_execution_complete: "muted",
  compaction: "warn",
  tool_decision: "info",
};

export function OtelPanel() {
  const { t } = useTranslation();
  const [events, setEvents] = useState<FirehoseEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState("");
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (paused) {
      sourceRef.current?.close();
      sourceRef.current = null;
      return;
    }
    const es = new EventSource("/api/firehose");
    sourceRef.current = es;
    es.onmessage = (msg) => {
      try {
        const ev = JSON.parse(msg.data) as FirehoseEvent;
        setEvents((prev) => [ev, ...prev].slice(0, 200));
      } catch { /* ignore */ }
    };
    return () => { es.close(); sourceRef.current = null; };
  }, [paused]);

  const filtered = filter
    ? events.filter((e) => e.event_name.includes(filter) || (e.tool_name || "").includes(filter))
    : events;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardKicker>{t("Live")}</CardKicker>
          <CardTitle className="flex items-center gap-2">
            <RadioTower className={`h-3.5 w-3.5 ${paused ? "text-text-subtle" : "text-ok dot-pulse"}`} />
            {t("Telemetry firehose")}
            <ExplainButton
              topic="telemetry_firehose"
              label={t("Explain telemetry firehose")}
              hint={t("Explain what telemetry events flow through the firehose and how to interpret recent activity.")}
              data={{ paused, filter, total_events: events.length, recent_event_names: Array.from(new Set(events.slice(0, 50).map((e) => e.event_name))) }}
            />
          </CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={filter} onChange={(e) => setFilter(e.target.value)}
            placeholder={t("filter event_name / tool")}
            className="h-8 rounded-md bg-surface-2 border border-border px-2.5 text-xs focus-ring w-44"
          />
          <Button size="sm" variant="ghost" onClick={() => setPaused((v) => !v)}>
            {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
            {paused ? t("Resume") : t("Pause")}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-xs text-text-subtle py-12 text-center">
            {t("Waiting for telemetry… enable OTEL in Claude Code settings to see events stream in.")}
          </p>
        ) : (
          <ul className="max-h-[60vh] overflow-y-auto mono text-[11px] divide-y divide-border/30">
            {filtered.map((e) => (
              <li key={e.id} className="py-1.5 flex items-center gap-3">
                <Badge tone={TONE_FOR[e.event_name] ?? "muted"}>{e.event_name}</Badge>
                <span className="text-text-subtle whitespace-nowrap">{fmtRel(e.timestamp)}</span>
                {e.tool_name && <span className="text-text">{e.tool_name}{e.mcp_server_name && ` · ${e.mcp_server_name}/${e.mcp_tool_name}`}</span>}
                {e.tool_duration_ms !== null && <span className="text-text-dim ml-auto">{fmtMs(e.tool_duration_ms)}</span>}
                {e.tool_success === 0 && <span className="text-err">✗</span>}
                {e.error_message && <span className="text-err truncate">{e.error_message.slice(0, 80)}</span>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
