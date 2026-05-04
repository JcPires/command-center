import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAgentFanout } from "@/hooks/useQueries";
import { Card, CardContent, CardHeader, CardKicker, CardTitle, RangeToggle, Skeleton, EmptyState, ExplainButton } from "@/components/ui";
import { GitBranch } from "lucide-react";
import { projectName } from "@/lib/format";
import type { Range } from "@/lib/api";

export function AgentFanoutCard() {
  const { t } = useTranslation();
  const [range, setRange] = useState<Range>("7d");
  const { data, isLoading } = useAgentFanout(range);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardKicker>{t("Subagents")}</CardKicker>
          <CardTitle className="flex items-center gap-2">
            {t("Agent fan-out")}
            <ExplainButton
              topic="agent_fanout"
              label={t("Agent fan-out")}
              hint={t("Sessions that dispatched subagents via the Agent tool. Higher counts indicate orchestration-heavy workflows.")}
              data={{ sessions_count: data?.rows?.length ?? 0, top: data?.rows?.[0] }}
            />
          </CardTitle>
        </div>
        <RangeToggle value={range} onChange={setRange} />
      </CardHeader>
      <CardContent>
        {isLoading || !data ? (
          <Skeleton className="h-[200px]" />
        ) : data.rows.length === 0 ? (
          <EmptyState
            icon={GitBranch}
            title={t("No subagent dispatches")}
            description={t("Sessions that call the Agent tool will surface here.")}
          />
        ) : (
          <ul className="space-y-1 max-h-[260px] overflow-y-auto pr-1">
            {data.rows.slice(0, 12).map((r) => (
              <li key={r.session_id} className="flex items-center gap-3 py-1.5 text-[12px] border-b border-border/30">
                <div className="h-6 w-6 rounded-md bg-surface-2 border border-border grid place-items-center shrink-0">
                  <GitBranch className="h-3 w-3 text-text-subtle" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-text">
                    {r.title ? r.title.slice(0, 80) : <span className="text-text-subtle">{t("session")}: {r.session_id.slice(0, 8)}</span>}
                  </div>
                  <div className="text-[10px] mono text-text-subtle truncate">
                    {projectName(r.cwd)} · {r.model || "—"}
                  </div>
                </div>
                <div className="shrink-0 mono text-text">{r.agent_calls}×</div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
