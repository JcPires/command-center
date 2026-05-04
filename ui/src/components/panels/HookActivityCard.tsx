import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useHookActivity } from "@/hooks/useQueries";
import { Card, CardContent, CardHeader, CardKicker, CardTitle, RangeToggle, Skeleton, EmptyState, ExplainButton } from "@/components/ui";
import { Sparkline } from "@/components/charts/Sparkline";
import { Hexagon } from "lucide-react";
import { fmtMs } from "@/lib/format";
import type { Range } from "@/lib/api";

export function HookActivityCard() {
  const { t } = useTranslation();
  const [range, setRange] = useState<Range>("7d");
  const { data, isLoading } = useHookActivity(range);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardKicker>{t("Hooks")}</CardKicker>
          <CardTitle className="flex items-center gap-2">
            {t("Activity")}
            <ExplainButton
              topic="hook_activity"
              label={t("Hook activity")}
              hint={t("Hook fires from ~/.claude/settings.json. 'Paired' means a matching post-hook completed; p95 is the slowest 5% latency.")}
              data={{
                total_fires: data?.total_fires,
                paired: data?.paired,
                p95_ms: data?.p95_ms,
              }}
            />
          </CardTitle>
        </div>
        <RangeToggle value={range} onChange={setRange} />
      </CardHeader>
      <CardContent>
        {isLoading || !data ? (
          <Skeleton className="h-[160px]" />
        ) : data.total_fires === 0 ? (
          <EmptyState
            icon={Hexagon}
            title={t("No hook activity")}
            description={t("Hooks fire when configured in ~/.claude/settings.json. Add one and they'll appear here.")}
          />
        ) : (
          <div className="grid grid-cols-3 gap-4">
            <Stat kicker={t("Fires")} value={data.total_fires.toLocaleString()} />
            <Stat kicker={t("Paired")} value={`${data.paired}`} hint={`${data.total_fires ? Math.round(100*data.paired/data.total_fires) : 0}%`} />
            <Stat kicker={t("p95")} value={fmtMs(data.p95_ms)} />
            <div className="col-span-3 mt-2">
              <Sparkline values={data.daily.map((d) => d.fires)} width={420} height={48} color="rgb(var(--info))" />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ kicker, value, hint }: { kicker: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/50 px-3 py-2.5">
      <div className="kicker">{kicker}</div>
      <div className="text-base mono mt-1">{value}</div>
      {hint && <div className="text-[10px] text-text-subtle mono">{hint}</div>}
    </div>
  );
}
