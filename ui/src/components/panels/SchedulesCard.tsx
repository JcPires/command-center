import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useSchedules, useScheduleUpdate, useScheduleDelete } from "@/hooks/useQueries";
import { Card, CardContent, CardHeader, CardKicker, CardTitle, Skeleton, EmptyState, Button, Badge, ExplainButton } from "@/components/ui";
import { CalendarClock, Plus, Trash2 } from "lucide-react";
import { ScheduleComposer } from "./ScheduleComposer";

function nextRunAge(iso: string | null, t: TFunction): { label: string; tone: "ok" | "warn" } {
  if (!iso) return { label: "—", tone: "ok" };
  const ts = Date.parse(iso); const now = Date.now();
  const sec = Math.round((ts - now) / 1000);
  if (sec < -300) return { label: t("overdue"), tone: "warn" };
  if (sec < 0)   return { label: t("now"), tone: "ok" };
  if (sec < 60)  return { label: t("in {{n}}s", { n: sec }), tone: "ok" };
  if (sec < 3600) return { label: t("in {{n}}m", { n: Math.round(sec/60) }), tone: "ok" };
  if (sec < 86400) return { label: t("in {{n}}h", { n: Math.round(sec/3600) }), tone: "ok" };
  return { label: t("in {{n}}d", { n: Math.round(sec/86400) }), tone: "ok" };
}

export function SchedulesCard() {
  const { t } = useTranslation();
  const { data, isLoading } = useSchedules();
  const update = useScheduleUpdate();
  const remove = useScheduleDelete();
  const [composerOpen, setComposerOpen] = useState(false);
  const tz = new Date().toLocaleString(undefined, { timeZoneName: "short" }).split(" ").pop();

  return (
    <Card>
      <CardHeader>
        <div>
          <CardKicker>{t("Mission control")}</CardKicker>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-3.5 w-3.5 text-text-dim" />
            {t("Schedules")}
            <span className="text-[10px] mono text-text-subtle ml-2">{tz}</span>
            <ExplainButton
              topic="schedules"
              label={t("Explain schedules")}
              hint={t("Explain how scheduled tasks are evaluated and flag any overdue or unusual entries.")}
              data={{ tz, count: data?.rows.length ?? 0, schedules: data?.rows.map((s) => ({ name: s.name, cron: s.cron_expression, enabled: s.enabled, next_run_at: s.next_run_at, assigned_skill: s.assigned_skill })) }}
            />
          </CardTitle>
        </div>
        <Button variant="primary" size="sm" onClick={() => setComposerOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> {t("New schedule")}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[160px]" />
        ) : !data || data.rows.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title={t("No schedules")}
            description={t("Recurring tasks materialize as ops_tasks entries when their cron fires.")}
            action={<Button variant="primary" size="sm" onClick={() => setComposerOpen(true)}>{t("Create schedule")}</Button>}
          />
        ) : (
          <ul className="divide-y divide-border/40">
            {data.rows.map((s) => {
              const nr = nextRunAge(s.next_run_at, t);
              return (
                <li key={s.id} className="py-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => update.mutate({ id: s.id, body: { enabled: s.enabled ? 0 : 1 } as any })}
                    aria-pressed={s.enabled === 1}
                    className={`h-5 w-9 rounded-full transition-colors relative ${
                      s.enabled ? "bg-accent" : "bg-surface-2 border border-border"
                    }`}
                  >
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                      s.enabled ? "translate-x-4" : "translate-x-0.5"
                    }`} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text truncate">{s.name}</span>
                      <Badge tone={nr.tone}>{nr.label}</Badge>
                      {s.assigned_skill && <Badge tone="accent">{s.assigned_skill}</Badge>}
                    </div>
                    <div className="mono text-[11px] text-text-subtle">
                      <span className="text-text-dim">{s.cron_expression}</span> · {s.task_title}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => remove.mutate(s.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
      <ScheduleComposer open={composerOpen} onClose={() => setComposerOpen(false)} />
    </Card>
  );
}
