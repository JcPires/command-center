import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardKicker, CardTitle, Skeleton, Badge, ExplainButton } from "@/components/ui";
import { FileText, Layers } from "lucide-react";

export function ContextHealthCard() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ["contextHealth"],
    queryFn: async () => {
      const [skillsRes, mcpRes] = await Promise.all([
        fetch("/api/skills").then((r) => r.json()),
        fetch("/api/mcp?range=30d").then((r) => r.json()),
      ]);
      const skills = (skillsRes.rows ?? []) as Array<{ environment: string }>;
      const skillsByEnv: Record<string, number> = {};
      for (const s of skills) skillsByEnv[s.environment] = (skillsByEnv[s.environment] ?? 0) + 1;
      return {
        skills: skills.length,
        skillsByEnv,
        mcpServers: mcpRes.servers?.length ?? 0,
      };
    },
    refetchInterval: 60_000,
  });

  return (
    <Card>
      <CardHeader>
        <div>
          <CardKicker>{t("Context")}</CardKicker>
          <CardTitle className="flex items-center gap-2">
            {t("Health")}
            <ExplainButton
              topic="context_health"
              label={t("Context health")}
              hint={t("Counts of skills (per environment) and MCP servers active over the last 30 days. Suggest specific cleanups or red flags.")}
              data={data}
            />
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading || !data ? (
          <Skeleton className="h-24" />
        ) : (
          <div className="space-y-2.5 text-[12px]">
            <Row icon={Layers} label={t("Skills")} value={data.skills} />
            <Row icon={FileText} label={t("MCP servers (30d)")} value={data.mcpServers} />
            <p className="text-[11px] text-text-dim mt-3">
              {t("Click the ? above for an LLM-powered analysis of your context surface.")}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-text-dim">
        <Icon className="h-3 w-3 text-text-subtle" />
        {label}
      </div>
      <Badge tone="muted">{value}</Badge>
    </div>
  );
}
