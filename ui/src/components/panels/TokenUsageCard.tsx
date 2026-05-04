import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUsageTokens } from "@/hooks/useQueries";
import { Card, RangeToggle, Skeleton, Toggle } from "@/components/ui";
import { fmtCompact } from "@/lib/format";
import type { Range } from "@/lib/api";

// Three well-separated hues so the legend stays readable even when one
// segment dominates (cache is typically 95%+ of the total).
const COL_CACHE  = "var(--mdl-opus)";  // purple
const COL_INPUT  = "var(--info)";      // cyan
const COL_OUTPUT = "var(--acc-2)";     // warm orange / yellow

type Day = { date: string; output: number; input: number; cache: number; total: number };

type HoverInfo = { day: Day; rect: DOMRect };

export function TokenUsageCard() {
  const { t } = useTranslation();
  const [range, setRange] = useState<Range>("30d");
  const [hideCache, setHideCache] = useState(false);
  const { data, isLoading } = useUsageTokens(range);

  const containerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<HoverInfo | null>(null);

  const days = useMemo<Day[]>(() => {
    if (!data) return [];
    const byDate = new Map<string, Day>();
    for (const r of data.daily) {
      const cur = byDate.get(r.date) ?? { date: r.date, output: 0, input: 0, cache: 0, total: 0 };
      cur.output += r.output_tokens;
      cur.input  += r.input_tokens;
      cur.cache  += r.cache_create_tokens + r.cache_read_tokens;
      cur.total = cur.output + cur.input + cur.cache;
      byDate.set(r.date, cur);
    }
    const list = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    return list.slice(-14);
  }, [data]);

  // Compute bar values either with or without the cache segment. When cache is
  // hidden the scaling is recomputed against input+output only — that lets the
  // user actually see the input/output dynamics that are normally crushed by
  // the cache (which usually accounts for 99% of the total).
  const visibleMax = useMemo(() => {
    return Math.max(1, ...days.map((d) => hideCache ? d.input + d.output : d.total));
  }, [days, hideCache]);
  const sqrtMax = Math.sqrt(visibleMax);

  const totals = useMemo(() => {
    return days.reduce(
      (acc, d) => {
        acc.cache  += d.cache;
        acc.input  += d.input;
        acc.output += d.output;
        acc.total  += d.total;
        return acc;
      },
      { cache: 0, input: 0, output: 0, total: 0 },
    );
  }, [days]);

  const yTicks = useMemo(() => buildYTicks(visibleMax), [visibleMax]);

  const tooltipPos = useMemo(() => {
    if (!hovered || !containerRef.current) return null;
    const cRect = containerRef.current.getBoundingClientRect();
    return {
      x: hovered.rect.left - cRect.left + hovered.rect.width / 2,
      y: hovered.rect.top - cRect.top,
    };
  }, [hovered]);

  return (
    <Card>
      <div className="card-head justify-between">
        <div>
          <div className="kicker">{t("Tokens")}</div>
          <h3 className="text-[14.5px] font-semibold tracking-[-0.005em] font-display mt-0.5">
            {t("Tokens · 14 j")}
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <label
            className="flex items-center gap-2 cursor-pointer select-none"
            title={t("Bascule l'affichage du cache pour voir input/output sans qu'ils soient écrasés")}
          >
            <span className="kicker">{t("cache")}</span>
            <Toggle
              on={!hideCache}
              onToggle={() => setHideCache((v) => !v)}
              ariaLabel={hideCache ? t("Inclure le cache") : t("Exclure le cache")}
            />
          </label>
          <RangeToggle value={range} onChange={setRange} />
        </div>
      </div>
      <div className="card-body relative" ref={containerRef}>
        {isLoading || !data ? (
          <Skeleton className="h-[200px]" />
        ) : (
          <>
            <div className="grid grid-cols-[44px_1fr] gap-2">
              {/* Y axis (positions follow the bars' sqrt scale) */}
              <div className="relative h-[160px] mono text-[9.5px] text-ink-faint">
                {yTicks.map((tick) => (
                  <div
                    key={tick.value}
                    className="absolute right-0 -translate-y-1/2 leading-none"
                    style={{ top: `${(1 - Math.sqrt(tick.value) / sqrtMax) * 100}%` }}
                  >
                    {tick.label}
                  </div>
                ))}
              </div>
              {/* Plot area */}
              <div>
                <div className="relative h-[160px]">
                  {/* Grid lines */}
                  {yTicks.map((tick) => (
                    <div
                      key={tick.value}
                      className="absolute inset-x-0 border-t-[0.5px]"
                      style={{
                        top: `${(1 - Math.sqrt(tick.value) / sqrtMax) * 100}%`,
                        borderColor: "var(--chart-grid)",
                      }}
                    />
                  ))}
                  <div className="absolute inset-0 flex items-end gap-[6px]">
                    {days.map((d) => {
                      const visibleTotal = hideCache ? d.input + d.output : d.total;
                      const totalPct = visibleTotal > 0 ? (Math.sqrt(visibleTotal) / sqrtMax) * 100 : 0;
                      const cachePct = !hideCache && d.total > 0 ? totalPct * (d.cache  / d.total) : 0;
                      const inputPct = visibleTotal > 0 ? totalPct * (d.input  / visibleTotal) : 0;
                      const outPct   = visibleTotal > 0 ? totalPct * (d.output / visibleTotal) : 0;
                      return (
                        <BarColumn
                          key={d.date}
                          day={d}
                          cachePct={cachePct}
                          inputPct={inputPct}
                          outputPct={outPct}
                          isHovered={hovered?.day.date === d.date}
                          onHover={setHovered}
                        />
                      );
                    })}
                  </div>
                </div>
                {/* X axis */}
                <div className="flex items-center gap-[6px] mt-2">
                  {days.map((_, i) => {
                    const fromEnd = days.length - 1 - i;
                    const show = fromEnd % 2 === 0;
                    return (
                      <div
                        key={i}
                        className="flex-1 mono text-[9.5px] text-ink-faint text-center"
                        style={{ visibility: show ? "visible" : "hidden" }}
                      >
                        J-{fromEnd}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 mt-4 text-[10.5px] mono uppercase tracking-[0.10em] text-ink-mute">
              <div className="flex items-center gap-4">
                <LegendStat color={COL_CACHE}  label={t("cache")}  value={totals.cache}  pct={totals.total ? totals.cache  / totals.total : 0} dim={hideCache} />
                <LegendStat color={COL_INPUT}  label={t("input")}  value={totals.input}  pct={totals.total ? totals.input  / totals.total : 0} />
                <LegendStat color={COL_OUTPUT} label={t("output")} value={totals.output} pct={totals.total ? totals.output / totals.total : 0} />
              </div>
              <span className="mono text-[10.5px] text-ink-soft tnum normal-case tracking-normal">
                {t("total")} <span className="text-ink font-semibold">{fmtCompact(totals.total)}</span>
              </span>
            </div>
          </>
        )}

        {hovered && tooltipPos && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-50 -translate-x-1/2 -translate-y-full"
            style={{ left: tooltipPos.x, top: tooltipPos.y - 8 }}
          >
            <div
              className="rounded-md px-3 py-2 shadow-lg whitespace-nowrap border-[0.5px] min-w-[180px]"
              style={{
                background: "var(--bg-elev)",
                borderColor: "var(--hairline-strong)",
                color: "var(--ink)",
              }}
            >
              <div className="mono text-[10px] uppercase tracking-[0.10em] text-ink-mute">
                {hovered.day.date}
              </div>
              <div className="mt-1.5 grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-1 text-[11.5px]">
                <TooltipRow color={COL_CACHE}  label={t("cache")}  value={hovered.day.cache}  total={hovered.day.total} />
                <TooltipRow color={COL_INPUT}  label={t("input")}  value={hovered.day.input}  total={hovered.day.total} />
                <TooltipRow color={COL_OUTPUT} label={t("output")} value={hovered.day.output} total={hovered.day.total} />
                <span />
                <span className="text-[10px] mono uppercase tracking-[0.10em] text-ink-mute mt-1 col-start-2">{t("total")}</span>
                <span className="mono tnum text-ink font-semibold mt-1">{fmtCompact(hovered.day.total)}</span>
              </div>
            </div>
            <span
              className="absolute left-1/2 -translate-x-1/2 -bottom-1 h-2 w-2 rotate-45 border-r-[0.5px] border-b-[0.5px]"
              style={{ background: "var(--bg-elev)", borderColor: "var(--hairline-strong)" }}
            />
          </div>
        )}
      </div>
    </Card>
  );
}

function TooltipRow({ color, label, value, total }: { color: string; label: string; value: number; total: number }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-sm shrink-0" style={{ background: color }} />
        <span className="text-[10px] mono uppercase tracking-[0.10em]" style={{ color }}>{label}</span>
      </span>
      <span className="mono tnum text-ink">{fmtCompact(value)}</span>
      <span className="mono tnum text-ink-faint text-right">{pct >= 0.1 ? `${pct.toFixed(pct < 1 ? 2 : 0)}%` : "<0.1%"}</span>
    </>
  );
}

function BarColumn({
  day, cachePct, inputPct, outputPct, isHovered, onHover,
}: {
  day: Day;
  cachePct: number;
  inputPct: number;
  outputPct: number;
  isHovered: boolean;
  onHover: (info: HoverInfo | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      className="flex-1 h-full flex flex-col-reverse gap-[1px] cursor-pointer relative"
      style={{ opacity: isHovered ? 1 : 0.92, transition: "opacity 120ms" }}
      onMouseEnter={() => {
        if (ref.current) onHover({ day, rect: ref.current.getBoundingClientRect() });
      }}
      onMouseLeave={() => onHover(null)}
    >
      {outputPct > 0 && (
        <div className="rounded-b-[3px]" style={{ height: `${outputPct}%`, background: COL_OUTPUT }} />
      )}
      {inputPct > 0 && (
        <div style={{ height: `${inputPct}%`, background: COL_INPUT }} />
      )}
      {cachePct > 0 && (
        <div className="rounded-t-[3px]" style={{ height: `${cachePct}%`, background: COL_CACHE }} />
      )}
    </div>
  );
}

function LegendStat({ color, label, value, pct, dim = false }: { color: string; label: string; value: number; pct: number; dim?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5" style={{ opacity: dim ? 0.45 : 1 }}>
      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />
      <span style={{ color }}>{label}</span>
      <span className="mono text-[11px] text-ink tnum normal-case tracking-normal font-semibold">{fmtCompact(value)}</span>
      <span className="mono text-[10px] text-ink-faint tnum normal-case tracking-normal">{Math.round(pct * 100)}%</span>
    </span>
  );
}

function buildYTicks(max: number): { value: number; label: string }[] {
  const steps = 4;
  const raw = max / steps;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const niceMul = [1, 2, 5, 10].find((m) => raw <= m * mag) ?? 10;
  const step = niceMul * mag;
  const ticks: { value: number; label: string }[] = [];
  for (let i = steps; i >= 0; i--) {
    const v = step * i;
    if (v <= max * 1.05) {
      ticks.push({ value: v, label: fmtCompact(v, v >= 10_000 ? 0 : 1).toUpperCase() });
    }
  }
  return ticks;
}
