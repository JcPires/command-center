import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useUsageCache } from "@/hooks/useQueries";
import { Card, CardContent, CardHeader, CardKicker, CardTitle, Badge, RangeToggle, Skeleton, Tooltip, ExplainButton } from "@/components/ui";
import { Sparkline } from "@/components/charts/Sparkline";
import { fmtPct, fmtCompact } from "@/lib/format";
import type { Range } from "@/lib/api";

export function CacheEfficiencyCard() {
  const { t } = useTranslation();
  const [range, setRange] = useState<Range>("7d");
  const { data, isLoading } = useUsageCache(range);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardKicker>{t("Cache hit rate")}</CardKicker>
          <CardTitle className="flex items-center gap-2">
            {t("Efficiency")}
            <ExplainButton
              topic="cache_efficiency"
              label={t("Cache efficiency")}
              hint={t("Anthropic prompt-cache hit rate over the selected window. Target ≥ 70%. Below 50% is a strong signal that cache_control breakpoints are misplaced.")}
              data={data && { hit_rate: data.overall, billable_tokens: data.billable_tokens, low_sample: data.low_sample, range }}
            />
          </CardTitle>
        </div>
        <RangeToggle value={range} onChange={setRange} />
      </CardHeader>
      <CardContent>
        {isLoading || !data ? (
          <Skeleton className="h-[120px]" />
        ) : (
          <div className="space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className={`text-4xl font-semibold mono tabular-nums ${
                  data.overall >= 0.7 ? "text-ok" : data.overall >= 0.5 ? "text-warn" : "text-err"
                }`}>
                  {fmtPct(data.overall, 1)}
                </div>
                <div className="text-[11px] text-text-subtle mt-1 mono">
                  {fmtCompact(data.billable_tokens)} {t("billable")} {data.low_sample && (
                    <Tooltip label={t("Less than 10K billable tokens in window — interpret with care.")}>
                      <Badge tone="warn" className="ml-2">{t("low sample")}</Badge>
                    </Tooltip>
                  )}
                </div>
              </div>
              <div>
                <Sparkline
                  values={data.daily.map((d) => d.hit_rate)}
                  target={0.70}
                  width={160} height={48}
                  color="var(--ink-mute)"
                  strokeWidth={1.6}
                  area
                  areaOpacity={0.22}
                  showDots
                  colorAt={(v) => {
                    if (v >= 0.7) return "var(--pos)";
                    if (v >= 0.5) return "var(--warn)";
                    return "var(--neg)";
                  }}
                />
                <div className="flex justify-between text-[10px] mono text-text-subtle mt-1">
                  <span>{data.daily[0]?.date.slice(5)}</span>
                  <span className="text-text-dim">{t("target 70%")}</span>
                  <span>{data.daily[data.daily.length-1]?.date.slice(5)}</span>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-text-dim">
              {t("Hit rate = cache_read / (input + cache_read + cache_create). Higher is cheaper.")}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
