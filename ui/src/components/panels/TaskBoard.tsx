import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTasks, useTaskApprove, useTaskRerun, useTaskDelete } from "@/hooks/useQueries";
import { Card, CardContent, CardHeader, CardKicker, CardTitle, Skeleton, EmptyState, Badge, Button, ExplainButton } from "@/components/ui";
import { CheckSquare, RefreshCcw, Trash2, Plus } from "lucide-react";
import { TaskComposer } from "./TaskComposer";
import type { Task } from "@/lib/api";
import { fmtRel } from "@/lib/format";

const RISK_TONE: Record<string, "ok"|"warn"|"err"|"muted"> = {
  low: "muted", medium: "warn", high: "err",
};

export function TaskBoard() {
  const { t } = useTranslation();
  const COLUMNS = useMemo<{ key: string; title: string; statuses: string[] }[]>(() => [
    { key: "pending", title: t("Pending"),  statuses: ["pending", "awaiting_approval"] },
    { key: "running", title: t("Running"),  statuses: ["running"] },
    { key: "done",    title: t("Done"),     statuses: ["done", "failed", "cancelled"] },
  ], [t]);

  const { data, isLoading } = useTasks({ limit: 200 });
  const approve = useTaskApprove();
  const rerun   = useTaskRerun();
  const del     = useTaskDelete();
  const [composerOpen, setComposerOpen] = useState(false);

  useEffect(() => {
    const onPalette = () => setComposerOpen(true);
    window.addEventListener("cc:queue-task", onPalette);
    return () => window.removeEventListener("cc:queue-task", onPalette);
  }, []);

  const grouped: Record<string, Task[]> = { pending: [], running: [], done: [] };
  if (data) for (const task of data.rows) {
    for (const c of COLUMNS) if (c.statuses.includes(task.status)) { grouped[c.key].push(task); break; }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardKicker>{t("Mission control")}</CardKicker>
          <CardTitle className="flex items-center gap-2">
            {t("Task queue")}
            <ExplainButton
              topic="task_queue"
              label={t("Task queue")}
              hint={t("Kanban of queued tasks: pending (incl. awaiting approval), running, and done/failed/cancelled. Mission Control picks pending tasks every 120s.")}
              data={{
                pending: grouped.pending.length,
                running: grouped.running.length,
                done: grouped.done.length,
                awaiting_approval: grouped.pending.filter((t) => t.status === "awaiting_approval").length,
                failed: grouped.done.filter((t) => t.status === "failed").length,
              }}
            />
          </CardTitle>
        </div>
        <Button variant="primary" size="sm" onClick={() => setComposerOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> {t("Queue a task")}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-3 gap-3">{[0,1,2].map((i) => <Skeleton key={i} className="h-32" />)}</div>
        ) : !data || data.rows.length === 0 ? (
          <EmptyState
            icon={CheckSquare}
            title={t("No tasks queued")}
            description={t("Queue from this dashboard or via the API. Mission Control picks them up every 120s.")}
            action={<Button variant="primary" size="sm" onClick={() => setComposerOpen(true)}>{t("Queue a task")}</Button>}
          />
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {COLUMNS.map((col) => (
              <div key={col.key}>
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="kicker">{col.title}</span>
                  <span className="mono text-[11px] text-text-subtle">{grouped[col.key].length}</span>
                </div>
                <ul className="space-y-2 min-h-[80px]">
                  {grouped[col.key].map((task) => (
                    <li key={task.id} className="rounded-lg border border-border bg-surface-2/40 p-3 hover:border-border-glow transition-colors">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-[12.5px] font-medium text-text truncate">{task.title}</div>
                          {task.description && (
                            <p className="text-[11px] text-text-dim line-clamp-2 mt-0.5">{task.description}</p>
                          )}
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            {task.assigned_skill && <Badge tone="accent">{task.assigned_skill}</Badge>}
                            {task.model && <Badge tone="muted">{task.model.replace("claude-", "")}</Badge>}
                            <Badge tone={task.execution_mode === "stream" ? "info" : "muted"}>{task.execution_mode}</Badge>
                            <Badge tone={RISK_TONE[task.risk_level] ?? "muted"}>{task.risk_level}</Badge>
                            {task.dry_run === 1 && <Badge tone="warn">{t("dry-run")}</Badge>}
                            {task.status === "failed" && <Badge tone="err">{t("failed")}</Badge>}
                            {task.status === "awaiting_approval" && <Badge tone="warn">{t("awaiting")}</Badge>}
                          </div>
                          <div className="text-[10px] mono text-text-subtle mt-2">
                            {fmtRel(task.created_at)}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1.5 mt-2">
                        {task.status === "awaiting_approval" && (
                          <Button size="sm" variant="primary" onClick={() => approve.mutate(task.id)}>{t("Approve")}</Button>
                        )}
                        {task.status === "failed" && (
                          <Button size="sm" onClick={() => rerun.mutate(task.id)}><RefreshCcw className="h-3 w-3" /> {t("Rerun")}</Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => del.mutate(task.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <TaskComposer open={composerOpen} onClose={() => setComposerOpen(false)} />
    </Card>
  );
}
