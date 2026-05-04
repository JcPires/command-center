import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useEditDecisions } from "@/hooks/useQueries";
import { Card, CardContent, CardHeader, CardKicker, CardTitle, RangeToggle, Skeleton, EmptyState, Badge, Tooltip, ExplainButton } from "@/components/ui";
import { CheckCheck } from "lucide-react";
import { fmtPct } from "@/lib/format";
import type { Range } from "@/lib/api";

export function EditAcceptanceCard() {
  const { t } = useTranslation();
  const [range, setRange] = useState<Range>("7d");
  const { data, isLoading } = useEditDecisions(range);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardKicker>{t("Edits")}</CardKicker>
          <CardTitle className="flex items-center gap-2">
            {t("Acceptance rate")}
            <ExplainButton
              topic="edit_acceptance"
              label={t("Acceptance rate")}
              hint={t("Per-tool accept/reject ratio from OTEL tool_decision events. Low rates may indicate noisy suggestions or risky edits.")}
              data={{
                tools_count: data?.rows?.length ?? 0,
                rows: data?.rows?.map((r) => ({ tool: r.tool, accept_rate: r.accept_rate, n: r.n })),
              }}
            />
          </CardTitle>
        </div>
        <RangeToggle value={range} onChange={setRange} />
      </CardHeader>
      <CardContent>
        {isLoading || !data ? (
          <Skeleton className="h-[160px]" />
        ) : data.rows.length === 0 ? (
          <EmptyState
            icon={CheckCheck}
            title={t("No edit decisions yet")}
            description={t("Accept/reject signal arrives via OTEL tool_decision events. Enable telemetry to see this.")}
          />
        ) : (
          <ul className="space-y-2.5">
            {data.rows.map((r) => (
              <li key={r.tool}>
                <div className="flex items-center justify-between text-[12px] mb-1">
                  <span className="font-medium text-text">{r.tool}</span>
                  <div className="flex items-center gap-2">
                    {r.low_sample && (
                      <Tooltip label={t("Fewer than 10 events — interpret with caution")}>
                        <Badge tone="warn">N={r.n}</Badge>
                      </Tooltip>
                    )}
                    <span className="mono text-text">{fmtPct(r.accept_rate)}</span>
                  </div>
                </div>
                <div className="h-2 rounded-md bg-surface-2 overflow-hidden flex">
                  <div className="h-full bg-ok" style={{ width: `${r.accept_rate * 100}%` }} />
                  <div className="h-full bg-err/70" style={{ width: `${r.n > 0 ? (r.reject / r.n) * 100 : 0}%` }} />
                  <div className="h-full bg-text-subtle/50" style={{ width: `${r.n > 0 ? (r.other / r.n) * 100 : 0}%` }} />
                </div>
                <div className="flex justify-between text-[10px] mono text-text-subtle mt-1">
                  <span>{r.accept} {t("accept")}</span>
                  <span>{r.reject} {t("reject")}</span>
                  <span>{r.other} {t("other")}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
