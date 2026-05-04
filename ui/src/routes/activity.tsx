import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { SectionH } from "@/components/ui";
import { HeatmapGrid } from "@/components/panels/HeatmapGrid";
import { OtelPanel } from "@/components/panels/OtelPanel";
import { SessionsTable } from "@/components/panels/SessionsTable";

export const Route = createFileRoute("/activity")({ component: ActivityPage });

function ActivityPage() {
  const { t } = useTranslation();
  return (
    <div>
      <SectionH title={t("Tendances")} meta={t("12 derniers mois")}>
        <HeatmapGrid />
      </SectionH>

      <SectionH title={t("Flux de télémétrie")} meta={t("temps réel")}>
        <OtelPanel />
      </SectionH>

      <SectionH title={t("Toutes les sessions")} meta={t("avec regroupement")}>
        <SessionsTable />
      </SectionH>
    </div>
  );
}
