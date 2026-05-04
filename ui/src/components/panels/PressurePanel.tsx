import { useTranslation } from "react-i18next";
import { usePressure } from "@/hooks/useQueries";
import { Card, CardContent, CardHeader, CardKicker, CardTitle, Skeleton, Badge, ExplainButton } from "@/components/ui";
import { fmtRel } from "@/lib/format";

export function PressurePanel() {
  const { t } = useTranslation();
  const { data, isLoading } = usePressure();
  if (isLoading || !data) return <Skeleton className="h-[160px] rounded-2xl" />;
  return (
    <Card>
      <CardHeader>
        <div>
          <CardKicker>{t("Pressure")}</CardKicker>
          <CardTitle className="flex items-center gap-2">
            {t("System pressure (7d)")}
            <ExplainButton
              topic="system_pressure"
              label={t("System pressure (7d)")}
              hint={t("Signs of stress: API errors, retry exhaustions, and context compactions over the last 7 days. Anything >0 deserves a look.")}
              data={{
                retry_exhausted: data.retry_exhausted,
                compactions: data.compactions,
                recent_errors_count: data.recent_errors.length,
                max_retries_threshold: data.max_retries_threshold,
              }}
            />
          </CardTitle>
        </div>
        <div className="flex gap-3 text-[11px] mono">
          <Stat label={t("retry exhausted")} value={data.retry_exhausted}
                tone={data.retry_exhausted > 0 ? "err" : "ok"}
                hint={t("≥ {{count}} attempts", { count: data.max_retries_threshold })} />
          <Stat label={t("compactions")} value={data.compactions}
                tone={data.compactions > 0 ? "warn" : "ok"} />
        </div>
      </CardHeader>
      <CardContent>
        {data.recent_errors.length === 0 ? (
          <p className="text-xs text-text-subtle py-4 text-center">{t("No recent api_error events.")}</p>
        ) : (
          <ul className="space-y-1">
            {data.recent_errors.map((e, i) => (
              <li key={i} className="flex items-center gap-3 text-[11px] mono py-1 border-b border-border/30">
                <Badge tone={e.status_code && e.status_code >= 500 ? "err" : "warn"}>
                  {e.status_code ?? "?"}
                </Badge>
                <span className="text-text truncate flex-1">{e.error_message || t("(no message)")}</span>
                <span className="text-text-subtle">×{e.attempt_count ?? 1}</span>
                <span className="text-text-subtle whitespace-nowrap">{fmtRel(e.timestamp)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone, hint }: { label: string; value: number; tone: "ok" | "warn" | "err"; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/50 px-3 py-1.5">
      <div className="kicker !text-[10px]">{label}</div>
      <div className={`text-base mono mt-0.5 ${tone === "err" ? "text-err" : tone === "warn" ? "text-warn" : "text-ok"}`}>{value}</div>
      {hint && <div className="text-[10px] text-text-subtle mono">{hint}</div>}
    </div>
  );
}
