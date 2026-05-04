import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useProductivity } from "@/hooks/useQueries";
import { Card, CardContent, CardHeader, CardKicker, CardTitle, RangeToggle, Skeleton, EmptyState, ExplainButton } from "@/components/ui";
import { GitCommit, GitPullRequest, FileCode2 } from "lucide-react";
import { fmtCompact } from "@/lib/format";
import type { Range } from "@/lib/api";

export function ProductivityCard() {
  const { t } = useTranslation();
  const [range, setRange] = useState<Range>("7d");
  const { data, isLoading } = useProductivity(range);

  const empty = !data || (data.commits === 0 && data.pull_requests === 0 && data.lines_of_code === 0 && data.daily.length === 0);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardKicker>{t("Output")}</CardKicker>
          <CardTitle className="flex items-center gap-2">
            {t("Productivity")}
            <ExplainButton
              topic="productivity"
              label={t("Productivity")}
              hint={t("Commits, PRs, and lines of code emitted by Claude Code OTEL counters. Shows tangible code output for the selected range.")}
              data={{
                commits: data?.commits,
                pull_requests: data?.pull_requests,
                lines_of_code: data?.lines_of_code,
              }}
            />
          </CardTitle>
        </div>
        <RangeToggle value={range} onChange={setRange} />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[140px]" />
        ) : empty ? (
          <EmptyState
            icon={GitCommit}
            title={t("No productivity counters")}
            description={t("Commits, PRs, and lines-of-code are emitted by Claude Code OTEL counters. Enable telemetry to populate.")}
          />
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <Tile icon={GitCommit}      kicker={t("Commits")} value={fmtCompact(data!.commits, 0)} />
            <Tile icon={GitPullRequest} kicker={t("PRs")}     value={fmtCompact(data!.pull_requests, 0)} />
            <Tile icon={FileCode2}      kicker={t("Lines")}   value={fmtCompact(data!.lines_of_code)} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Tile({
  icon: Icon, kicker, value,
}: { icon: typeof GitCommit; kicker: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/50 px-3 py-3">
      <div className="flex items-center justify-between">
        <span className="kicker">{kicker}</span>
        <Icon className="h-3.5 w-3.5 text-text-subtle" />
      </div>
      <div className="text-xl font-semibold mono mt-1.5 tabular-nums">{value}</div>
    </div>
  );
}
