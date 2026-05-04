import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Sheet, Button } from "@/components/ui";
import { useScheduleCreate, useSkills } from "@/hooks/useQueries";
import { Plus } from "lucide-react";
import { cn } from "@/lib/cn";

const HOURS    = Array.from({ length: 24 }, (_, i) => i);
const MINUTES  = [0, 15, 30, 45];

function buildCron(hour: number, minute: number, days: number[]): string {
  const dow = days.length === 7 ? "*" : days.sort((a,b)=>a-b).join(",");
  return `${minute} ${hour} * * ${dow}`;
}

export function ScheduleComposer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  // DOW Mon=0..Sun=6 to match the heartbeat cron parser
  const DOW = [
    { v: 0, label: t("Mon") }, { v: 1, label: t("Tue") }, { v: 2, label: t("Wed") },
    { v: 3, label: t("Thu") }, { v: 4, label: t("Fri") }, { v: 5, label: t("Sat") }, { v: 6, label: t("Sun") },
  ];
  const QUICKS: { label: string; days: number[] }[] = [
    { label: t("Every day"), days: [0,1,2,3,4,5,6] },
    { label: t("Weekdays"),  days: [0,1,2,3,4] },
    { label: t("Weekends"),  days: [5,6] },
  ];
  const [name, setName] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [skill, setSkill] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [days, setDays] = useState<number[]>([0,1,2,3,4]);

  const { data: skills } = useSkills();
  const create = useScheduleCreate();

  useEffect(() => {
    if (open) {
      setName(""); setTaskTitle(""); setTaskDesc(""); setSkill("");
      setEnabled(true); setHour(9); setMinute(0); setDays([0,1,2,3,4]);
    }
  }, [open]);

  const cron = useMemo(() => buildCron(hour, minute, days), [hour, minute, days]);

  const submit = async () => {
    if (!name.trim() || !taskTitle.trim()) return;
    await create.mutateAsync({
      name, cron_expression: cron,
      task_title: taskTitle, task_description: taskDesc || null,
      assigned_skill: skill || null, enabled: enabled ? 1 : 0,
    } as any);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("New schedule")} description={t("Cron fires in your local time zone.")}>
      <form className="px-6 py-4 space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label={t("Name")} required>
          <input
            autoFocus required
            value={name} onChange={(e) => setName(e.target.value)}
            className="w-full h-10 rounded-lg bg-surface-2 border border-border px-3 text-sm focus-ring"
            placeholder={t("e.g. Morning sweep")}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Hour")}>
            <select value={hour} onChange={(e) => setHour(parseInt(e.target.value, 10))}
              className="w-full h-10 rounded-lg bg-surface-2 border border-border px-3 text-sm focus-ring">
              {HOURS.map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}</option>)}
            </select>
          </Field>
          <Field label={t("Minute")}>
            <select value={minute} onChange={(e) => setMinute(parseInt(e.target.value, 10))}
              className="w-full h-10 rounded-lg bg-surface-2 border border-border px-3 text-sm focus-ring">
              {MINUTES.map((m) => <option key={m} value={m}>{String(m).padStart(2, "0")}</option>)}
            </select>
          </Field>
        </div>

        <Field label={t("Days")}>
          <div className="flex flex-wrap gap-1.5">
            {DOW.map((d) => {
              const active = days.includes(d.v);
              return (
                <button
                  key={d.v} type="button"
                  onClick={() => setDays((cur) => cur.includes(d.v) ? cur.filter((x) => x !== d.v) : [...cur, d.v])}
                  className={cn(
                    "h-8 px-3 rounded-md text-xs font-medium transition-colors",
                    active
                      ? "bg-accent/15 text-accent border border-accent/40"
                      : "bg-surface-2 text-text-dim border border-border hover:text-text"
                  )}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2 mt-2">
            {QUICKS.map((q) => (
              <button
                key={q.label} type="button"
                onClick={() => setDays(q.days)}
                className="text-[11px] text-text-dim hover:text-text underline-offset-2 hover:underline"
              >
                {q.label}
              </button>
            ))}
          </div>
        </Field>

        <div className="rounded-lg border border-border bg-surface-2/40 px-3 py-2">
          <div className="kicker mb-1">{t("Cron preview")}</div>
          <code className="mono text-sm text-text">{cron}</code>
        </div>

        <Field label={t("Task title")} required>
          <input
            required
            value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)}
            className="w-full h-10 rounded-lg bg-surface-2 border border-border px-3 text-sm focus-ring"
            placeholder={t("Title for each materialised task")}
          />
        </Field>

        <Field label={t("Task details")}>
          <textarea
            value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)}
            className="w-full min-h-[80px] rounded-lg bg-surface-2 border border-border px-3 py-2 text-sm focus-ring resize-y"
          />
        </Field>

        <Field label={t("Skill")}>
          <select
            value={skill} onChange={(e) => setSkill(e.target.value)}
            className="w-full h-10 rounded-lg bg-surface-2 border border-border px-3 text-sm focus-ring"
          >
            <option value="">{t("— auto-route —")}</option>
            {(skills?.rows ?? []).map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        </Field>

        <label className="inline-flex items-center gap-2 text-sm text-text-dim">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-3.5 w-3.5 accent-accent" />
          {t("Enable immediately")}
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>{t("Cancel")}</Button>
          <Button type="submit" variant="primary" disabled={!name.trim() || !taskTitle.trim() || create.isPending}>
            <Plus className="h-3.5 w-3.5" />
            {create.isPending ? t("Saving…") : t("Create")}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="kicker block mb-1.5">
        {label}{required && <span className="text-err"> *</span>}
      </span>
      {children}
    </label>
  );
}
