import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOutcomes } from "@/hooks/useQueries";
import { Card, CardContent, CardHeader, CardKicker, CardTitle, RangeToggle, Skeleton, ExplainButton } from "@/components/ui";
import { StackedBars, type StackedBarRow } from "@/components/charts/StackedBars";
import type { Range } from "@/lib/api";

const COLORS = {
  ok:           "rgb(16 185 129 / 0.85)",
  unfinished:   "rgb(136 136 160 / 0.7)",
  truncated:    "rgb(245 158 11 / 0.85)",
  rate_limited: "rgb(245 158 11 / 0.95)",
  errored:      "rgb(239 68 68 / 0.9)",
};

export function SessionOutcomesCard() {
  const { t } = useTranslation();
  const [range, setRange] = useState<Range>("7d");
  const { data, isLoading } = useOutcomes(range);

  const totals = useMemo(() => {
    if (!data) return { ok: 0, errored: 0, rate_limited: 0, truncated: 0, unfinished: 0, total: 0 };
    const acc = { ok: 0, errored: 0, rate_limited: 0, truncated: 0, unfinished: 0 };
    for (const d of data.daily) {
      acc.ok += d.ok; acc.errored += d.errored; acc.rate_limited += d.rate_limited;
      acc.truncated += d.truncated; acc.unfinished += d.unfinished;
    }
    const total = acc.ok + acc.errored + acc.rate_limited + acc.truncated + acc.unfinished;
    return { ...acc, total };
  }, [data]);

  const rows = useMemo<StackedBarRow[]>(() => {
    if (!data) return [];
    return data.daily.map((d) => ({
      date: d.date,
      segments: [
        { key: "errored",      value: d.errored,      color: COLORS.errored },
        { key: "rate_limited", value: d.rate_limited, color: COLORS.rate_limited },
        { key: "truncated",    value: d.truncated,    color: COLORS.truncated },
        { key: "unfinished",   value: d.unfinished,   color: COLORS.unfinished },
        { key: "ok",           value: d.ok,           color: COLORS.ok },
      ],
    }));
  }, [data]);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardKicker>{t("Outcomes")}</CardKicker>
          <CardTitle className="flex items-center gap-2">
            {t("Session outcomes")}
            <ExplainButton
              topic="session_outcomes"
              label={t("Session outcomes")}
              hint={t("Daily breakdown of how Claude Code sessions ended (ok / errored / rate-limited / truncated / unfinished). Watch for spikes in errored or rate_limited.")}
              data={totals}
            />
          </CardTitle>
        </div>
        <RangeToggle value={range} onChange={setRange} />
      </CardHeader>
      <CardContent>
        {isLoading || !data ? (
          <Skeleton className="h-[180px]" />
        ) : (
          <>
            <StackedBars rows={rows} height={140} formatTooltip={(r) => {
              const ok = r.segments.find((s) => s.key === "ok")?.value ?? 0;
              const total = r.segments.reduce((s, x) => s + x.value, 0);
              return `${r.date} · ${ok}/${total} ${t("ok")}`;
            }} />
            <Legend />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Legend() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-4 text-[11px] text-text-dim">
      <Item color={COLORS.ok}           label={t("ok")} />
      <Item color={COLORS.unfinished}   label={t("unfinished")} />
      <Item color={COLORS.truncated}    label={t("truncated")} />
      <Item color={COLORS.rate_limited} label={t("rate limited")} />
      <Item color={COLORS.errored}      label={t("errored")} />
    </div>
  );
}
function Item({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}
