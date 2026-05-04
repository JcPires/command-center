import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOutcomes } from "@/hooks/useQueries";
import { Card, RangeToggle, Skeleton } from "@/components/ui";
import { fmtCompact } from "@/lib/format";
import type { Range } from "@/lib/api";

type Slice = { key: string; label: string; value: number; color: string };

export function DonutOutcomes() {
  const { t } = useTranslation();
  const [range, setRange] = useState<Range>("7d");
  const { data, isLoading } = useOutcomes(range);

  const slices = useMemo<Slice[]>(() => {
    if (!data) return [];
    const acc = { ok: 0, errored: 0, rate_limited: 0, truncated: 0, unfinished: 0 };
    for (const d of data.daily) {
      acc.ok += d.ok; acc.errored += d.errored; acc.rate_limited += d.rate_limited;
      acc.truncated += d.truncated; acc.unfinished += d.unfinished;
    }
    return [
      { key: "ok",       label: t("Réussites"),  value: acc.ok,                              color: "var(--pos)" },
      { key: "warn",     label: t("Avec warns"), value: acc.truncated + acc.rate_limited,    color: "var(--warn)" },
      { key: "errored",  label: t("Erreurs"),    value: acc.errored,                         color: "var(--neg)" },
      { key: "canceled", label: t("Annulées"),   value: acc.unfinished,                      color: "var(--ink-mute)" },
    ];
  }, [data, t]);

  const total = slices.reduce((s, x) => s + x.value, 0);

  return (
    <Card>
      <div className="card-head justify-between">
        <div>
          <div className="kicker">{t("Résultats")}</div>
          <h3 className="text-[14.5px] font-semibold tracking-[-0.005em] font-display mt-0.5">
            {t("Distribution des sessions")}
          </h3>
        </div>
        <RangeToggle value={range} onChange={setRange} />
      </div>
      <div className="card-body">
        {isLoading || !data ? (
          <Skeleton className="h-[180px]" />
        ) : total === 0 ? (
          <div className="h-[180px] grid place-items-center text-ink-mute text-sm">
            {t("Aucune donnée")}
          </div>
        ) : (
          <div className="grid grid-cols-[156px_1fr] gap-6 items-center">
            <Donut slices={slices} total={total} />
            <ul className="flex flex-col gap-2">
              {slices.map((s) => {
                const pct = total > 0 ? (s.value / total) * 100 : 0;
                return (
                  <li key={s.key} className="flex items-center gap-3 text-[12.5px]">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
                    <span className="text-ink-soft flex-1">{s.label}</span>
                    <span className="mono tnum text-ink">{fmtCompact(s.value, 0)}</span>
                    <span className="mono tnum text-ink-mute w-10 text-right">{pct.toFixed(0)}%</span>
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

function Donut({ slices, total }: { slices: Slice[]; total: number }) {
  const size = 156;
  const stroke = 22;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        {slices.map((s) => {
          const frac = total > 0 ? s.value / total : 0;
          const len = c * frac;
          const dasharray = `${len} ${c - len}`;
          const offset = -acc;
          acc += len;
          return (
            <circle
              key={s.key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={dasharray}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              style={{ transition: "stroke-dasharray 200ms" }}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div className="font-display font-semibold text-[28px] tnum tracking-[-0.025em] text-ink leading-none">
          {fmtCompact(total, 0)}
        </div>
        <div className="kicker mt-1.5">SESSIONS</div>
      </div>
    </div>
  );
}
