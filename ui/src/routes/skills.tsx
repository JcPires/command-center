import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { SectionH } from "@/components/ui";
import { MCPPanel } from "@/components/panels/MCPPanel";
import { SkillCostCard } from "@/components/panels/SkillCostCard";
import { ContextHealthCard } from "@/components/panels/ContextHealthCard";
import { SkillsRegistry } from "@/components/panels/SkillsRegistry";

export const Route = createFileRoute("/skills")({ component: SkillsPage });

function SkillsPage() {
  const { t } = useTranslation();
  return (
    <div>
      <SectionH title={t("MCP servers")} meta={t("centerpiece")}>
        <MCPPanel />
      </SectionH>

      <SectionH title={t("Skill economics")} meta={t("coûts & latences")}>
        <SkillCostCard />
      </SectionH>

      <SectionH title={t("Context health & registry")} meta={t("règles & inventaire")}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-[var(--gap-xl)]">
          <ContextHealthCard />
          <div className="lg:col-span-2"><SkillsRegistry /></div>
        </div>
      </SectionH>
    </div>
  );
}
