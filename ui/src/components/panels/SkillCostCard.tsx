import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardKicker, CardTitle, Skeleton, EmptyState, ExplainButton } from "@/components/ui";
import { useQuery } from "@tanstack/react-query";
import { Coins } from "lucide-react";
import { fmtCompact } from "@/lib/format";

// Token spend grouped by model. Aggregation runs in the browser from the
// /api/sessions list (last 7 days, 200 sessions). It's the actual model spend,
// not a synthetic proxy — the card title reflects this.
export function SkillCostCard() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ["skillCost"],
    queryFn: async () => {
      const r = await fetch("/api/sessions?range=7d&limit=200");
      if (!r.ok) return { rows: [] };
      return r.json();
    },
  });

  const rows = useMemo(() => {
    if (!data?.rows) return [];
    const by = new Map<string, { sessions: number; tokens: number }>();
    for (const s of data.rows) {
      const k = s.model || "unknown";
      const cur = by.get(k) || { sessions: 0, tokens: 0 };
      cur.sessions += 1;
      cur.tokens += s.effective_tokens || 0;
      by.set(k, cur);
    }
    return Array.from(by.entries()).map(([model, v]) => ({ model, ...v }))
      .sort((a, b) => b.tokens - a.tokens);
  }, [data]);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardKicker>{t("Economics")}</CardKicker>
          <CardTitle className="flex items-center gap-2">
            {t("Token spend by model")}
            <ExplainButton
              topic="token_spend_by_model"
              label={t("Token spend by model")}
              hint={t("Effective tokens consumed per model over the last 7 days. Bars are normalized to the heaviest model. Use to spot which model dominates your spend.")}
              data={{
                models: rows.slice(0, 5).map((r) => ({ model: r.model, tokens: r.tokens, sessions: r.sessions })),
                total_tokens: rows.reduce((s, r) => s + r.tokens, 0),
              }}
            />
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[140px]" />
        ) : rows.length === 0 ? (
          <EmptyState icon={Coins} title={t("No usage in window")} />
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => {
              const max = rows[0].tokens || 1;
              const pct = (r.tokens / max) * 100;
              return (
                <li key={r.model}>
                  <div className="flex items-center justify-between text-[12px] mb-1">
                    <span className="text-text font-medium">{r.model}</span>
                    <span className="mono text-text">{fmtCompact(r.tokens)}</span>
                  </div>
                  <div className="h-1.5 rounded bg-surface-2 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-accent to-accent2" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-[10px] mono text-text-subtle mt-0.5">{r.sessions} {t("sessions")}</div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
