import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToolLatency, useToolLatencySeries } from "@/hooks/useQueries";
import { Card, RangeToggle, Skeleton, Badge } from "@/components/ui";
import { Sparkline } from "@/components/charts/Sparkline";
import { fmtMs } from "@/lib/format";
import type { Range, ToolLatencyRow } from "@/lib/api";

function statusFor(row: ToolLatencyRow): { tone: "ok" | "warn" | "err"; label: string } {
  const p95 = row.p95_ms ?? 0;
  if (p95 >= 10_000 || row.error_rate > 0.1) return { tone: "err", label: "ERR" };
  if (p95 >= 2_000 || row.error_rate > 0.02) return { tone: "warn", label: "WARN" };
  return { tone: "ok", label: "OK" };
}

export function ToolLatencyCard() {
  const { t } = useTranslation();
  const [range, setRange] = useState<Range>("7d");
  const { data, isLoading } = useToolLatency(range);
  const series = useToolLatencySeries(range);

  const seriesByTool = useMemo(() => {
    const map = new Map<string, { series: number[]; delta_pct: number | null }>();
    for (const r of series.data?.rows ?? []) {
      map.set(r.tool, { series: r.series, delta_pct: r.delta_pct });
    }
    return map;
  }, [series.data]);

  return (
    <Card>
      <div className="card-head justify-between">
        <div>
          <div className="kicker">{t("Latence")}</div>
          <h3 className="text-[14.5px] font-semibold tracking-[-0.005em] font-display mt-0.5">
            {t("Routes · API & MCP")}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="kicker">P95 · {range.toUpperCase()}</span>
          <RangeToggle value={range} onChange={setRange} />
        </div>
      </div>
      <div className="card-body">
        {isLoading || !data ? (
          <Skeleton className="h-[260px]" />
        ) : data.rows.length === 0 ? (
          <p className="text-[12.5px] text-ink-mute py-6 text-center">{t("No tool calls in range.")}</p>
        ) : (
          <div>
            <div
              className="grid items-center text-[10px] kicker pb-2 border-b-[0.5px] border-hairline"
              style={{ gridTemplateColumns: "1.2fr 1fr 1fr 1fr 1fr 1.2fr" }}
            >
              <div>{t("Route")}</div>
              <div className="text-right">AVG</div>
              <div className="text-right">P50</div>
              <div className="text-right">P95</div>
              <div className="text-right">P99</div>
              <div
                className="text-right pr-2 cursor-help"
                title={t("p95 quotidien sur la fenêtre courante. Le delta % compare le p95 global de cette fenêtre à celui de la fenêtre précédente de même durée — vert = plus rapide, rouge = ralentissement.")}
              >
                {t("Trend")}
              </div>
            </div>
            <ul>
              {data.rows.slice(0, 10).map((r) => {
                const status = statusFor(r);
                const avg = r.avg_ms;
                const p50 = r.p50_ms;
                const p95 = r.p95_ms ?? 0;
                const p99 = r.p99_ms;
                const sd = seriesByTool.get(r.tool);
                const delta = sd?.delta_pct ?? null;
                // Lower latency is better → up trend (delta>0) is BAD
                const trendColor = delta === null
                  ? "var(--ink-mute)"
                  : delta > 2
                    ? "var(--neg)"
                    : delta < -2
                      ? "var(--pos)"
                      : "var(--ink-mute)";
                const trendValues = sd?.series ?? [];
                return (
                  <li
                    key={r.tool}
                    className="grid items-center py-2 border-b-[0.5px] border-hairline last:border-b-0 text-[12.5px]"
                    style={{ gridTemplateColumns: "1.2fr 1fr 1fr 1fr 1fr 1.2fr" }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <code className="mono text-ink truncate">{r.tool}</code>
                      <Badge tone={status.tone} variant="soft" className="shrink-0">{status.label}</Badge>
                    </div>
                    <div className="text-right mono tnum text-ink-soft">{fmtMs(avg)}</div>
                    <div className="text-right mono tnum text-ink">{fmtMs(p50)}</div>
                    <div
                      className="text-right mono tnum"
                      style={{ color: status.tone === "err" ? "var(--neg)" : status.tone === "warn" ? "var(--warn)" : "var(--ink)" }}
                    >
                      {fmtMs(p95)}
                    </div>
                    <div className="text-right mono tnum text-ink-soft">{fmtMs(p99)}</div>
                    <div
                      className="flex items-center justify-end gap-2 pr-2"
                      title={t("p95 quotidien sur la fenêtre — delta vs fenêtre précédente.")}
                    >
                      <span style={{ color: trendColor }}>
                        {trendValues.length > 1 ? (
                          <Sparkline
                            values={trendValues}
                            width={56}
                            height={16}
                            color="currentColor"
                            strokeWidth={1.2}
                            area
                            areaOpacity={0.18}
                          />
                        ) : (
                          <span className="text-ink-faint">—</span>
                        )}
                      </span>
                      <span
                        className="mono tnum text-[11px] w-10 text-right"
                        style={{ color: trendColor }}
                      >
                        {delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta}%`}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
