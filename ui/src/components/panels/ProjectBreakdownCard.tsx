import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useByProject } from "@/hooks/useQueries";
import { Card, CardContent, CardHeader, CardKicker, CardTitle, RangeToggle, Skeleton, ExplainButton } from "@/components/ui";
import { fmtCompact, projectName, shortenCwd } from "@/lib/format";
import { FolderGit2 } from "lucide-react";
import type { Range } from "@/lib/api";

export function ProjectBreakdownCard() {
  const { t } = useTranslation();
  const [range, setRange] = useState<Range>("7d");
  const { data, isLoading } = useByProject(range);
  const totalTokens = data?.rows.reduce((s, r) => s + r.tokens, 0) || 1;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardKicker>{t("Projects")}</CardKicker>
          <CardTitle className="flex items-center gap-2">
            {t("By cwd")}
            <ExplainButton
              topic="project_breakdown"
              label={t("Project breakdown")}
              hint={t("Token, session, and tool-call usage grouped by working directory. Use it to spot which projects consume the most.")}
              data={{
                projects_count: data?.rows?.length ?? 0,
                total_tokens: totalTokens,
                top: data?.rows?.[0] && {
                  cwd: data.rows[0].cwd,
                  tokens: data.rows[0].tokens,
                  sessions: data.rows[0].sessions,
                  tools: data.rows[0].tools,
                },
              }}
            />
          </CardTitle>
        </div>
        <RangeToggle value={range} onChange={setRange} />
      </CardHeader>
      <CardContent>
        {isLoading || !data ? (
          <Skeleton className="h-[260px]" />
        ) : data.rows.length === 0 ? (
          <p className="text-xs text-text-subtle py-6 text-center">{t("No sessions in range.")}</p>
        ) : (
          <ul className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
            {data.rows.slice(0, 16).map((r) => {
              const pct = (r.tokens / totalTokens) * 100;
              return (
                <li key={r.cwd ?? "?"} className="text-[12px]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <FolderGit2 className="h-3 w-3 text-text-subtle shrink-0" />
                      <span className="truncate text-text">{projectName(r.cwd)}</span>
                      <span className="truncate text-[11px] mono text-text-subtle hidden md:inline">{shortenCwd(r.cwd)}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 mono text-text-dim">
                      <span>{r.sessions}s</span>
                      <span>{r.tools}t</span>
                      <span className="text-text">{fmtCompact(r.tokens)}</span>
                    </div>
                  </div>
                  <div className="mt-1 h-[3px] rounded bg-surface-2 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-accent to-accent2"
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
