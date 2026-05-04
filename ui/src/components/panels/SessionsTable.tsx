import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSessions, useSessionSparks } from "@/hooks/useQueries";
import { Card, RangeToggle, Skeleton, Badge, Segmented } from "@/components/ui";
import { Sparkline } from "@/components/charts/Sparkline";
import { fmtCompact, fmtRel, projectName } from "@/lib/format";
import type { Range } from "@/lib/api";

type GroupBy = "none" | "project" | "model";

const MDL_COLOR = (model: string | undefined): string => {
  if (!model) return "var(--ink-mute)";
  if (model.includes("opus")) return "var(--mdl-opus)";
  if (model.includes("sonnet")) return "var(--mdl-sonnet)";
  if (model.includes("haiku")) return "var(--mdl-haiku)";
  return "var(--ink-mute)";
};

function ModelBadge({ model }: { model: string | undefined }) {
  if (!model) return <span className="text-ink-mute mono text-[11px]">—</span>;
  const c = MDL_COLOR(model);
  const short = model.replace("claude-", "");
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full mono text-[10.5px] tnum"
      style={{
        background: `color-mix(in oklab, ${c} 14%, transparent)`,
        color: c,
        border: `0.5px solid color-mix(in oklab, ${c} 30%, transparent)`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      {short}
    </span>
  );
}

export function SessionsTable() {
  const { t } = useTranslation();
  const [range, setRange] = useState<Range>("7d");
  const [q, setQ] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const { data, isLoading } = useSessions({ range, q: q || undefined, limit: 100 });

  const sessionIds = useMemo(
    () => (data?.rows ?? []).slice(0, 30).map((r: any) => r.session_id),
    [data],
  );
  const sparksQ = useSessionSparks(sessionIds);

  const groups = useMemo(() => {
    if (!data) return [] as { key: string; label: string; total: number; rows: any[] }[];
    if (groupBy === "none") {
      return [{ key: "all", label: "", total: 0, rows: data.rows }];
    }
    const map = new Map<string, any[]>();
    for (const r of data.rows) {
      const key = groupBy === "project" ? projectName(r.cwd) : (r.model?.replace("claude-", "") ?? "—");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries())
      .map(([k, rows]) => ({
        key: k,
        label: k,
        total: rows.reduce((s, r) => s + (r.effective_tokens ?? 0), 0),
        rows,
      }))
      .sort((a, b) => b.rows.length - a.rows.length);
  }, [data, groupBy]);

  const maxTokens = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, ...data.rows.map((r: any) => r.effective_tokens ?? 0));
  }, [data]);

  return (
    <Card>
      <div className="card-head justify-between">
        <div>
          <div className="kicker">{t("Browse")}</div>
          <h3 className="text-[14.5px] font-semibold tracking-[-0.005em] font-display mt-0.5">
            {t("All sessions")}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <SearchBox value={q} onChange={setQ} placeholder={t("title or path")} />
          <Segmented<GroupBy>
            value={groupBy}
            onChange={setGroupBy}
            options={[
              { value: "none",    label: t("Aucun") },
              { value: "project", label: t("Projet") },
              { value: "model",   label: t("Modèle") },
            ]}
            variant="primary"
            size="sm"
          />
          <RangeToggle value={range} onChange={setRange} />
        </div>
      </div>
      <div className="card-body">
        {isLoading || !data ? (
          <Skeleton className="h-[400px]" />
        ) : data.rows.length === 0 ? (
          <p className="text-[12.5px] text-ink-mute py-12 text-center">{t("No sessions match.")}</p>
        ) : (
          <div className="rounded-[12px] border-[0.5px] border-hairline overflow-hidden">
            <Header />
            <div className="max-h-[60vh] overflow-y-auto">
              {groups.map((g) => (
                <div key={g.key}>
                  {groupBy !== "none" && (
                    <div
                      className="px-4 py-2 flex items-center gap-3 border-b-[0.5px] border-hairline"
                      style={{ background: "var(--surface)" }}
                    >
                      <span className="font-display font-semibold text-[13px] text-ink">{g.label}</span>
                      <span className="kicker">{g.rows.length} {t("sessions")}</span>
                      <span className="ml-auto mono tnum text-[12px] text-ink-soft">
                        {fmtCompact(g.total)} tokens
                      </span>
                    </div>
                  )}
                  <ul>
                    {g.rows.map((s: any) => {
                      const tokens = s.effective_tokens ?? 0;
                      const pct = (tokens / maxTokens) * 100;
                      const color = MDL_COLOR(s.model);
                      return (
                        <li
                          key={s.session_id}
                          className="ses-row grid grid-cols-[2.4fr_130px_110px_90px_90px_70px_90px] items-center px-4 py-2 border-b-[0.5px] border-hairline last:border-b-0 hover:bg-[var(--surface)] transition-colors text-[12.5px]"
                          style={{ minHeight: 48 }}
                        >
                          <div className="min-w-0 flex items-center gap-3">
                            <span
                              className="w-[3px] h-7 rounded-full opacity-70"
                              style={{ background: color }}
                            />
                            <div className="min-w-0">
                              <div className="truncate text-ink font-medium">
                                {s.title?.slice(0, 100) || <span className="mono text-ink-mute">{s.session_id.slice(0, 8)}</span>}
                              </div>
                              <div className="text-[10.5px] mono text-ink-faint">
                                {s.session_id.slice(0, 8)} · {projectName(s.cwd)}
                              </div>
                            </div>
                          </div>
                          <div><ModelBadge model={s.model} /></div>
                          <div className="text-right mono tnum text-ink">{fmtCompact(tokens)}</div>
                          <div className="pr-2">
                            <div
                              className="h-1.5 rounded-full overflow-hidden"
                              style={{ background: "var(--surface-2)" }}
                            >
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${pct}%`, background: color, opacity: 0.85 }}
                              />
                            </div>
                          </div>
                          <div
                            className="flex items-center justify-center"
                            style={{ color: s.error_count > 0 ? "var(--neg)" : "var(--pos)" }}
                            title={t("Latence moyenne (ms) des appels d'outils par tranche de la durée de la session — 18 buckets de l'ouverture à la fin.")}
                          >
                            {(() => {
                              const sp = sparksQ.data?.sparks?.[s.session_id] ?? [];
                              return sp.length > 1 ? (
                                <Sparkline
                                  values={sp}
                                  width={64}
                                  height={22}
                                  color="currentColor"
                                  strokeWidth={1.2}
                                  area
                                  areaOpacity={0.18}
                                />
                              ) : (
                                <span className="text-ink-faint mono text-[10px]">—</span>
                              );
                            })()}
                          </div>
                          <div className="text-center">
                            {s.error_count > 0
                              ? <Badge tone="err" variant="solid">{s.error_count}</Badge>
                              : <span className="text-ink-faint">—</span>}
                          </div>
                          <div className="text-right text-[11px] text-ink-mute mono">{fmtRel(s.started_at)}</div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
            <div className="px-4 py-2 text-[11px] text-ink-mute mono border-t-[0.5px] border-hairline tnum">
              {data.rows.length} {t("of")} {data.total}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function Header() {
  const { t } = useTranslation();
  return (
    <div
      className="grid grid-cols-[2.4fr_130px_110px_90px_90px_70px_90px] kicker px-4 py-2 border-b-[0.5px] border-hairline"
      style={{ background: "var(--surface)" }}
    >
      <div>{t("Title")}</div>
      <div>{t("Model")}</div>
      <div className="text-right">{t("Tokens")}</div>
      <div>{t("Volume")}</div>
      <div
        className="text-center cursor-help"
        title={t("Tendance de la latence moyenne (ms) des appels d'outils, échantillonnée sur 18 buckets de la durée de la session. Utile pour repérer les sessions qui ralentissent en cours de route.")}
      >
        {t("Tendance")}
      </div>
      <div className="text-center">{t("Errs")}</div>
      <div className="text-right">{t("Started")}</div>
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <svg
        width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}
        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-mute"
      >
        <circle cx={11} cy={11} r={7} /><path d="m20 20-3.5-3.5" />
      </svg>
      <input
        value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-48 rounded-[8px] border-[0.5px] border-hairline pl-7 pr-3 text-[12px] focus-ring"
        style={{ background: "var(--surface)" }}
      />
    </div>
  );
}

