import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { SectionH } from "@/components/ui";

import { SystemHealthStrip } from "@/components/panels/SystemHealthStrip";
import { KpiRow } from "@/components/panels/KpiRow";
import { AttentionBar } from "@/components/panels/AttentionBar";
import { HourlyHeatmap } from "@/components/panels/HourlyHeatmap";
import { TokenUsageCard } from "@/components/panels/TokenUsageCard";
import { CacheEfficiencyCard } from "@/components/panels/CacheEfficiencyCard";
import { DonutOutcomes } from "@/components/panels/DonutOutcomes";
import { ToolLatencyCard } from "@/components/panels/ToolLatencyCard";
import { HookActivityCard } from "@/components/panels/HookActivityCard";
import { ProjectBreakdownCard } from "@/components/panels/ProjectBreakdownCard";
import { AgentFanoutCard } from "@/components/panels/AgentFanoutCard";
import { EditAcceptanceCard } from "@/components/panels/EditAcceptanceCard";
import { ProductivityCard } from "@/components/panels/ProductivityCard";
import { PressurePanel } from "@/components/panels/PressurePanel";
import { SessionsTable } from "@/components/panels/SessionsTable";
import { LiveSessionsCard } from "@/components/panels/LiveSessionsCard";
import { DecisionsCard } from "@/components/panels/DecisionsCard";
import { InboxCard } from "@/components/panels/InboxCard";
import { TaskBoard } from "@/components/panels/TaskBoard";
import { SchedulesCard } from "@/components/panels/SchedulesCard";
import { EmergencyStopBanner } from "@/components/panels/EmergencyStopBanner";

export const Route = createFileRoute("/")({ component: CommandPage });

function CommandPage() {
  const { t } = useTranslation();
  return (
    <div>
      <SystemHealthStrip />

      <SectionH title={t("Aperçu")} meta={t("commande · 24h")}>
        <KpiRow />
        <EmergencyStopBanner />
        <AttentionBar />
      </SectionH>

      <SectionH title={t("Suivi & flux")} meta={t("heatmap · stacked")}>
        <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-[var(--gap-xl)]">
          <HourlyHeatmap />
          <TokenUsageCard />
        </div>
        <LiveSessionsCard />
      </SectionH>

      <SectionH title={t("Observabilité")} meta={t("p95 · distribution")}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--gap-xl)]">
          <ToolLatencyCard />
          <DonutOutcomes />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--gap-xl)]">
          <AgentFanoutCard />
          <ProductivityCard />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--gap-xl)]">
          <CacheEfficiencyCard />
          <HookActivityCard />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--gap-xl)]">
          <ProjectBreakdownCard />
          <EditAcceptanceCard />
        </div>
        <PressurePanel />
      </SectionH>

      <SectionH title={t("Sessions")} meta={t("toutes")}>
        <SessionsTable />
      </SectionH>

      <SectionH title={t("Humain dans la boucle")} meta={t("décisions & inbox")}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--gap-xl)]">
          <DecisionsCard />
          <InboxCard />
        </div>
      </SectionH>

      <SectionH title={t("Centre de contrôle")} meta={t("tâches & planifications")}>
        <TaskBoard />
        <SchedulesCard />
      </SectionH>
    </div>
  );
}
