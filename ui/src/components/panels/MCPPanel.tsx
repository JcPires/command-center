import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Server, Zap, AlertCircle, Gauge } from "lucide-react";
import { useMCPList, useMCPTools, useMCPMeasure } from "@/hooks/useQueries";
import { Button, Card, CardContent, CardHeader, CardKicker, CardTitle, RangeToggle, Skeleton, EmptyState, Badge, ExplainButton } from "@/components/ui";
import { fmtMs, fmtPct } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Range } from "@/lib/api";

export function MCPPanel() {
  const { t } = useTranslation();
  const [range, setRange] = useState<Range>("30d");
  const { data, isLoading } = useMCPList(range);
  const measure = useMCPMeasure();
  const [expanded, setExpanded] = useState<string | null>(null);

  const measureSummary = measure.data?.servers.reduce(
    (acc, s) => ({
      ok: acc.ok + (s.status === "ok" ? 1 : 0),
      tools: acc.tools + (s.tools ?? 0),
      tokens: acc.tokens + (s.tokens ?? 0),
      failed: acc.failed + (s.status !== "ok" ? 1 : 0),
    }),
    { ok: 0, tools: 0, tokens: 0, failed: 0 },
  );

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div>
          <CardKicker>{t("Centerpiece")}</CardKicker>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-4 w-4 text-accent" />
            {t("MCP servers")}
            <ExplainButton
              topic="mcp_servers"
              label={t("Explain MCP servers")}
              hint={t("Explain MCP server latencies, error rates, and which servers might need attention.")}
              data={{ range, servers: data?.servers.map((s) => ({ server: s.server, tools: s.tools, p50_ms: s.p50_ms, p95_ms: s.p95_ms, max_ms: s.max_ms, error_rate: s.error_rate, total_calls: s.total_calls })) }}
            />
          </CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => measure.mutate()}
            disabled={measure.isPending}
            title={t("Spawn each stdio MCP server, list its tools, and store schema sizes.")}
          >
            <Gauge className="h-3 w-3" />
            {measure.isPending ? t("Measuring…") : t("Measure schemas")}
          </Button>
          <RangeToggle value={range} onChange={setRange} />
        </div>
      </CardHeader>
      {measureSummary && (measureSummary.ok > 0 || measureSummary.failed > 0) && (
        <div className="px-6 pb-2 text-[11px] text-text-dim mono flex items-center gap-3">
          <span className="text-ok">{measureSummary.ok} {t("ok")}</span>
          {measureSummary.failed > 0 && (
            <span className="text-warn">{measureSummary.failed} {t("failed")}</span>
          )}
          <span>·</span>
          <span>{measureSummary.tools} {t("tools")}</span>
          <span>·</span>
          <span>≈ {measureSummary.tokens.toLocaleString()} {t("schema tokens")}</span>
        </div>
      )}
      <CardContent className="pt-2">
        {isLoading || !data ? (
          <div className="space-y-2">{[0,1,2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : data.servers.length === 0 ? (
          <EmptyState
            icon={Server}
            title={t("No MCP traffic detected")}
            description={t("Either OTEL_LOG_TOOL_DETAILS=1 isn't set or no MCP tools have run in this window. Generic mcp_tool calls without details show up only as totals.")}
          />
        ) : (
          <div className="rounded-xl border-[0.5px] border-hairline bg-surface-2 overflow-hidden">
            <div className="grid grid-cols-[1fr,68px,68px,68px,60px,40px,28px] text-[10px] kicker px-4 py-2 border-b-[0.5px] border-hairline">
              <div>{t("Server")}</div>
              <div className="text-right">{t("p50")}</div>
              <div className="text-right">{t("p95")}</div>
              <div className="text-right">{t("max")}</div>
              <div className="text-right">{t("err")}</div>
              <div className="text-right">{t("N")}</div>
              <div />
            </div>
            <ul>
              {data.servers.map((s) => {
                const slow = (s.p95_ms ?? 0) >= 10_000;
                const open = expanded === s.server;
                return (
                  <li key={s.server} className="border-b-[0.5px] border-hairline last:border-b-0">
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : s.server)}
                      className="w-full grid grid-cols-[1fr,68px,68px,68px,60px,40px,28px] items-center px-4 py-3 hover:bg-surface-2/60 transition-colors text-left"
                      aria-expanded={open}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={cn(
                          "h-7 w-7 rounded-md grid place-items-center shrink-0",
                          slow ? "bg-err/10 text-err" : "bg-accent/10 text-accent"
                        )}>
                          {slow ? <AlertCircle className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5" />}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-text truncate">{s.server}</div>
                          <div className="text-[11px] mono text-text-subtle">{s.tools} {s.tools === 1 ? t("tool") : t("tools")}</div>
                        </div>
                        {slow && <Badge tone="err">{t("slow")}</Badge>}
                      </div>
                      <div className="text-right mono text-[12px] text-text-dim">{fmtMs(s.p50_ms)}</div>
                      <div className={cn(
                        "text-right mono text-[12px] font-medium",
                        slow ? "text-err" : "text-text"
                      )}>{fmtMs(s.p95_ms)}</div>
                      <div className="text-right mono text-[12px] text-text-subtle">{fmtMs(s.max_ms)}</div>
                      <div className={cn(
                        "text-right mono text-[11px]",
                        s.error_rate > 0.05 ? "text-err" : "text-text-subtle"
                      )}>{s.error_rate > 0 ? fmtPct(s.error_rate, 0) : "—"}</div>
                      <div className="text-right mono text-[11px] text-text-subtle">{s.total_calls}</div>
                      <ChevronRight
                        className={cn("h-3.5 w-3.5 text-text-subtle transition-transform", open && "rotate-90")}
                      />
                    </button>

                    <AnimatePresence initial={false}>
                      {open && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                          className="overflow-hidden"
                        >
                          <ToolsTable server={s.server} range={range} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ToolsTable({ server, range }: { server: string; range: Range }) {
  const { t } = useTranslation();
  const { data, isLoading } = useMCPTools(server, range);
  if (isLoading) return <div className="px-6 py-3"><Skeleton className="h-20" /></div>;
  if (!data || data.tools.length === 0) {
    return <div className="px-6 py-3 text-[11px] text-text-subtle">{t("No per-tool data — enable OTEL_LOG_TOOL_DETAILS=1 to capture.")}</div>;
  }
  return (
    <div className="bg-bg/50 px-4 py-3">
      <div className="grid grid-cols-[1fr,68px,68px,68px,60px,40px] text-[10px] kicker px-2 mb-1">
        <div>{t("Tool")}</div>
        <div className="text-right">{t("p50")}</div>
        <div className="text-right">{t("p95")}</div>
        <div className="text-right">{t("max")}</div>
        <div className="text-right">{t("err")}</div>
        <div className="text-right">{t("N")}</div>
      </div>
      <ul>
        {data.tools.map((tool) => {
          const slow = (tool.p95_ms ?? 0) >= 10_000;
          const fast = (tool.p95_ms ?? 0) < 500 && tool.calls > 5;
          return (
            <li key={tool.tool} className="grid grid-cols-[1fr,68px,68px,68px,60px,40px] items-center px-2 py-1.5 border-t-[0.5px] border-hairline text-[12px]">
              <div className="flex items-center gap-2 min-w-0">
                <span className="truncate text-text">{tool.tool}</span>
                {slow && <span className="text-err mono text-[10px]">· {t("slow")}</span>}
                {fast && <span className="text-ok mono text-[10px]">· {t("fast")}</span>}
              </div>
              <div className="text-right mono text-text-dim">{fmtMs(tool.p50_ms)}</div>
              <div className={cn("text-right mono", slow ? "text-err" : "text-text")}>{fmtMs(tool.p95_ms)}</div>
              <div className="text-right mono text-text-subtle">{fmtMs(tool.max_ms)}</div>
              <div className={cn("text-right mono text-[11px]", tool.error_rate > 0.05 ? "text-err" : "text-text-subtle")}>
                {tool.error_rate > 0 ? fmtPct(tool.error_rate, 0) : "—"}
              </div>
              <div className="text-right mono text-[11px] text-text-subtle">{tool.calls}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
