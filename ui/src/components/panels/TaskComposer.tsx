import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Sheet, Button, Tooltip } from "@/components/ui";
import { useSkills, useTaskCreate } from "@/hooks/useQueries";
import { Plus, Info } from "lucide-react";

export function TaskComposer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();

  const QUADRANTS = useMemo<{ v: "do"|"schedule"|"delegate"|"archive"; label: string }[]>(() => [
    { v: "do", label: t("Do") }, { v: "schedule", label: t("Schedule") },
    { v: "delegate", label: t("Delegate") }, { v: "archive", label: t("Archive") },
  ], [t]);

  const RISKS = useMemo<{ v: "low"|"medium"|"high"; label: string }[]>(() => [
    { v: "low", label: t("Low") }, { v: "medium", label: t("Medium") }, { v: "high", label: t("High") },
  ], [t]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [model, setModel] = useState("");
  const [executionMode, setExecutionMode] = useState<"stream" | "classic">("stream");
  const [priority, setPriority] = useState(5);
  const [quadrant, setQuadrant] = useState<"do"|"schedule"|"delegate"|"archive">("do");
  const [risk, setRisk] = useState<"low"|"medium"|"high">("low");
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [skill, setSkill] = useState("");

  const { data: skills } = useSkills();
  const create = useTaskCreate();

  useEffect(() => {
    if (open) { setTitle(""); setDescription(""); setSkill(""); setExecutionMode("stream"); setRiskAndAll(); }
  }, [open]);
  function setRiskAndAll() {
    setModel(""); setPriority(5); setQuadrant("do"); setRisk("low");
    setRequiresApproval(false); setDryRun(false);
  }

  const submit = async () => {
    if (!title.trim()) return;
    await create.mutateAsync({
      title, description: description || null,
      priority, quadrant, risk_level: risk,
      requires_approval: requiresApproval ? 1 : 0,
      dry_run: dryRun ? 1 : 0,
      model: model || null,
      execution_mode: executionMode,
      assigned_skill: skill || null,
    } as any);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("Queue a task")} description={t("Mission Control will pick this up at the next dispatcher tick.")}>
      <form
        className="px-6 py-4 space-y-4"
        onSubmit={(e) => { e.preventDefault(); submit(); }}
      >
        <Field label={t("Title")} required>
          <input
            autoFocus required
            value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder={t("What should the agent do?")}
            className="w-full h-10 rounded-lg bg-surface-2 border border-border px-3 text-sm focus-ring"
          />
        </Field>

        <Field label={t("Description")}>
          <textarea
            value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder={t("Optional details, constraints, links…")}
            className="w-full min-h-[100px] rounded-lg bg-surface-2 border border-border px-3 py-2 text-sm focus-ring resize-y"
          />
        </Field>

        <Field label={t("Skill")}>
          <select
            value={skill} onChange={(e) => setSkill(e.target.value)}
            className="w-full h-10 rounded-lg bg-surface-2 border border-border px-3 text-sm focus-ring"
          >
            <option value="">{t("— auto-route via skill_router —")}</option>
            {(skills?.rows ?? []).map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Model")}>
            <select
              value={model} onChange={(e) => setModel(e.target.value)}
              className="w-full h-10 rounded-lg bg-surface-2 border border-border px-3 text-sm focus-ring"
            >
              <option value="">{t("default (from skill)")}</option>
              <option value="claude-haiku-4-5-20251001">claude-haiku-4-5</option>
              <option value="claude-sonnet-4-6">claude-sonnet-4-6</option>
              <option value="claude-opus-4-7">claude-opus-4-7</option>
            </select>
          </Field>
          <Field label={t("Mode")} hint={t("Interactive lets you reply mid-run; one-shot is fire-and-forget.")}>
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-surface-2/60 p-1">
              <ModeBtn active={executionMode === "stream"}  onClick={() => setExecutionMode("stream")}  label={t("Interactive")}
                hint={t("Reply mid-run from the dashboard")} />
              <ModeBtn active={executionMode === "classic"} onClick={() => setExecutionMode("classic")} label={t("One-shot")}
                hint={t("Fire and forget — no back-and-forth")} />
            </div>
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label={t("Priority")}>
            <input
              type="number" min={1} max={10}
              value={priority} onChange={(e) => setPriority(parseInt(e.target.value || "5", 10))}
              className="w-full h-10 rounded-lg bg-surface-2 border border-border px-3 text-sm focus-ring"
            />
          </Field>
          <Field label={t("Quadrant")}>
            <select
              value={quadrant} onChange={(e) => setQuadrant(e.target.value as any)}
              className="w-full h-10 rounded-lg bg-surface-2 border border-border px-3 text-sm focus-ring"
            >
              {QUADRANTS.map((q) => <option key={q.v} value={q.v}>{q.label}</option>)}
            </select>
          </Field>
          <Field label={t("Risk")}>
            <select
              value={risk} onChange={(e) => setRisk(e.target.value as any)}
              className="w-full h-10 rounded-lg bg-surface-2 border border-border px-3 text-sm focus-ring"
            >
              {RISKS.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
            </select>
          </Field>
        </div>

        <div className="flex flex-col gap-2 pt-2 border-t border-border/60">
          <label className="inline-flex items-center gap-2 text-sm text-text-dim">
            <input type="checkbox" checked={requiresApproval}
              onChange={(e) => setRequiresApproval(e.target.checked)}
              className="h-3.5 w-3.5 accent-accent" />
            {t("Requires approval before run")}
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-text-dim">
            <input type="checkbox" checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              className="h-3.5 w-3.5 accent-accent" />
            {t("Dry run")}
            <Tooltip label={t("Skill should respect this and skip side-effects.")}>
              <Info className="h-3 w-3 text-text-subtle" />
            </Tooltip>
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>{t("Cancel")}</Button>
          <Button type="submit" variant="primary" disabled={!title.trim() || create.isPending}>
            <Plus className="h-3.5 w-3.5" />
            {create.isPending ? t("Queuing…") : t("Queue")}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="kicker block mb-1.5">
        {label}{required && <span className="text-err"> *</span>}
        {hint && <span className="ml-1 normal-case tracking-normal text-[10.5px] text-text-subtle">— {hint}</span>}
      </span>
      {children}
    </label>
  );
}

function ModeBtn({ active, onClick, label, hint }: { active: boolean; onClick: () => void; label: string; hint: string }) {
  return (
    <button
      type="button" onClick={onClick}
      className={`px-2 py-1.5 rounded-md text-[12px] text-left transition-colors ${
        active ? "bg-surface text-text border border-border" : "text-text-dim hover:text-text"
      }`}
    >
      <div className="font-medium">{label}</div>
      <div className="text-[10px] text-text-subtle">{hint}</div>
    </button>
  );
}
