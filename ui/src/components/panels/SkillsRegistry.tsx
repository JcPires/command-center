import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSkills, useSkillAutonomy } from "@/hooks/useQueries";
import { Card, CardContent, CardHeader, CardKicker, CardTitle, Skeleton, Badge, Button, EmptyState, ExplainButton, Segmented } from "@/components/ui";
import { Layers, RefreshCcw } from "lucide-react";
import { api } from "@/lib/api";

const LEVELS: ("auto"|"review"|"manual")[] = ["auto", "review", "manual"];

export function SkillsRegistry() {
  const { t } = useTranslation();
  const [env, setEnv] = useState("");
  // Always fetch the unfiltered set so the dropdown can list every known
  // environment; we filter client-side.
  const { data, isLoading, refetch } = useSkills();
  const setLevel = useSkillAutonomy();
  const [syncing, setSyncing] = useState(false);

  const envs = useMemo(() => {
    const set = new Set(data?.rows.map((r) => r.environment) ?? []);
    return ["", ...Array.from(set).sort()];
  }, [data]);
  const filtered = useMemo(
    () => (env ? data?.rows.filter((r) => r.environment === env) : data?.rows) ?? [],
    [data, env],
  );

  const onSync = async () => {
    setSyncing(true);
    try { await api.skillsSync(); await refetch(); }
    finally { setSyncing(false); }
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <CardKicker>{t("Registry")}</CardKicker>
          <CardTitle className="flex items-center gap-2">
            {t("Skills")}
            <ExplainButton
              topic="skills_registry"
              label={t("Skills registry")}
              hint={t("Skills discovered under .claude/skills/ across environments, with their script count and autonomy level (auto / review / manual). Adjust autonomy to gate risky actions.")}
              data={{
                total: data?.rows.length ?? 0,
                shown: filtered.length,
                environment_filter: env || null,
                by_autonomy: {
                  auto: filtered.filter((s) => s.autonomy_level === "auto").length,
                  review: filtered.filter((s) => s.autonomy_level === "review").length,
                  manual: filtered.filter((s) => s.autonomy_level === "manual").length,
                },
              }}
            />
          </CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={env} onChange={(e) => setEnv(e.target.value)}
            className="h-8 rounded-md bg-surface-2 border-[0.5px] border-hairline px-2 text-xs focus-ring"
          >
            {envs.map((e) => <option key={e} value={e}>{e || t("all environments")}</option>)}
          </select>
          <Button size="sm" onClick={onSync} disabled={syncing}>
            <RefreshCcw className="h-3 w-3" /> {syncing ? t("Syncing…") : t("Sync")}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[280px]" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Layers}
            title={t("No skills found")}
            description={t("Add a skill under .claude/skills/ or ~/.claude/skills/ then click Sync.")}
            action={<Button onClick={onSync} size="sm">{t("Sync now")}</Button>}
          />
        ) : (
          <div className="overflow-hidden rounded-lg border-[0.5px] border-hairline">
            <div className="grid grid-cols-[1fr,140px,80px,160px] text-[10px] kicker px-3 py-2 bg-surface-2 border-b-[0.5px] border-hairline">
              <div>{t("Name")}</div>
              <div>{t("Environment")}</div>
              <div className="text-right">{t("Scripts")}</div>
              <div className="text-right">{t("Autonomy")}</div>
            </div>
            <ul>
              {filtered.map((s) => (
                <li key={s.name} className="grid grid-cols-[1fr,140px,80px,160px] items-center px-3 py-2.5 border-b-[0.5px] border-hairline last:border-b-0 text-[12px]">
                  <div className="min-w-0">
                    <div className="font-medium text-text truncate">{s.name}</div>
                    {s.description && <div className="text-[11px] text-text-dim truncate">{s.description}</div>}
                  </div>
                  <div><Badge tone="muted">{s.environment}</Badge></div>
                  <div className="text-right mono text-text-subtle">{s.script_count}</div>
                  <div className="flex justify-end">
                    <Segmented<"auto" | "review" | "manual">
                      value={(s.autonomy_level as "auto" | "review" | "manual") ?? "manual"}
                      onChange={(level) => setLevel.mutate({ name: s.name, level })}
                      options={LEVELS.map((l) => ({ value: l, label: t(l) }))}
                      variant="primary"
                      size="sm"
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
