import { useTranslation } from "react-i18next";
import { useSummary } from "@/hooks/useQueries";
import { KpiCard, Skeleton } from "@/components/ui";
import { fmtCompact } from "@/lib/format";

export function KpiRow() {
  const { data, isLoading } = useSummary();
  const { t } = useTranslation();

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_repeat(3,1fr)] gap-[var(--gap-xl)]">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[160px] rounded-card" />)}
      </div>
    );
  }

  const { sessions, tokens, tools, errors, live_sessions } = data;

  // For tokens: render the 24h value but use the 7-day spark for visual context
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_repeat(3,1fr)] gap-[var(--gap-xl)]">
      <KpiCard
        hero
        live={live_sessions > 0}
        eyebrow={t("Sessions aujourd'hui")}
        value={fmtCompact(sessions.current, 0)}
        suffix={
          live_sessions > 0
            ? <><span className="tnum">{live_sessions}</span> {live_sessions > 1 ? t("en direct") : t("en direct (sing)")}</>
            : sessions.previous > 0
              ? <><span className="tnum">{fmtCompact(sessions.previous, 0)}</span> {t("hier")}</>
              : t("aucune hier")
        }
        delta={sessions.delta_pct !== null ? { value: sessions.delta_pct, label: t("vs. hier") } : undefined}
        spark={sessions.spark}
      />
      <KpiCard
        eyebrow={t("Tokens 24h")}
        value={fmtCompact(tokens.current)}
        badge={tokens.delta_pct !== null ? (tokens.delta_pct >= 0 ? "up" : "down") : null}
        delta={tokens.delta_pct !== null ? { value: tokens.delta_pct } : undefined}
        metaInline={tokens.previous > 0
          ? <><span className="tnum">{fmtCompact(tokens.previous)}</span> {t("hier")}</>
          : t("aucune comparaison")}
        spark={tokens.spark}
      />
      <KpiCard
        eyebrow={t("Appels d'outils")}
        value={fmtCompact(tools.current, 0)}
        delta={tools.delta_pct !== null ? { value: tools.delta_pct } : undefined}
        positiveSentiment={tools.delta_pct === null ? true : tools.delta_pct >= 0}
        metaInline={tools.previous > 0
          ? <><span className="tnum">{fmtCompact(tools.previous, 0)}</span> {t("hier")}</>
          : t("aucune comparaison")}
        spark={tools.spark}
      />
      <KpiCard
        eyebrow={t("Erreurs")}
        value={fmtCompact(errors.current, 0)}
        delta={errors.delta_pct !== null ? { value: errors.delta_pct } : undefined}
        positiveSentiment={errors.delta_pct === null ? errors.current === 0 : errors.delta_pct <= 0}
        metaInline={errors.current === 0
          ? t("aucune")
          : errors.previous > 0
            ? <><span className="tnum">{fmtCompact(errors.previous, 0)}</span> {t("hier")}</>
            : t("première erreur")}
        spark={errors.spark}
      />
    </div>
  );
}
