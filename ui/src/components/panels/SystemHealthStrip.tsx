import { Activity, Cpu, RadioTower, Bell, RefreshCcw, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSystemHealth } from "@/hooks/useQueries";
import { StatePill, ExplainButton } from "@/components/ui";
import { fmtAge } from "@/lib/format";

function uptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function ageTone(age: number | null, warnAt: number, errAt: number): "ok" | "warn" | "err" | "muted" {
  if (age === null) return "muted";
  if (age >= errAt) return "err";
  if (age >= warnAt) return "warn";
  return "ok";
}

export function SystemHealthStrip() {
  const { data } = useSystemHealth();
  const { t } = useTranslation();
  if (!data) {
    return <div className="h-9 rounded-lg bg-surface-2 border-[0.5px] border-hairline animate-pulse" />;
  }
  return (
    <div className="flex flex-wrap items-center gap-2 p-2 rounded-xl border-[0.5px] border-hairline bg-surface backdrop-blur-sm">
      <StatePill label={t("Uptime")} tone="ok" value={uptime(data.uptime_seconds)} />
      <StatePill label={t("Mem")} tone="muted"
        value={data.memory_mb ? `${Math.round(data.memory_mb)} MB` : "—"} />
      <div className="h-5 w-px bg-hairline" />
      <StatePill
        label={t("OTEL")}
        tone={ageTone(data.last_otel_event_age_seconds, 60, 600)}
        value={fmtAge(data.last_otel_event_age_seconds)}
        pulse={data.last_otel_event_age_seconds !== null && data.last_otel_event_age_seconds < 30}
      />
      <StatePill
        label={t("Sync")}
        tone={ageTone(data.last_sync_tick_age_seconds, 180, 600)}
        value={fmtAge(data.last_sync_tick_age_seconds)}
      />
      <StatePill
        label={t("Daemon")}
        tone={ageTone(data.dispatcher_tick_age_seconds, 300, 900)}
        value={fmtAge(data.dispatcher_tick_age_seconds)}
      />
      <StatePill
        label={t("Notify")}
        tone={ageTone(data.last_notifier_tick_age_seconds, 120, 600)}
        value={fmtAge(data.last_notifier_tick_age_seconds)}
      />
      <div className="ml-auto flex items-center gap-3 px-2 text-[11px] text-text-subtle mono">
        {data.drops.otel_logs + data.drops.otel_metrics > 0 && (
          <span className="text-warn">{data.drops.otel_logs + data.drops.otel_metrics} {t("drops")}</span>
        )}
        <ExplainButton
          topic="system_health"
          label={t("Explain system health")}
          hint={t("Explain the current system health signals and flag anything that looks stale or unhealthy.")}
          data={{
            uptime_seconds: data.uptime_seconds,
            memory_mb: data.memory_mb,
            last_otel_event_age_seconds: data.last_otel_event_age_seconds,
            last_sync_tick_age_seconds: data.last_sync_tick_age_seconds,
            dispatcher_tick_age_seconds: data.dispatcher_tick_age_seconds,
            last_notifier_tick_age_seconds: data.last_notifier_tick_age_seconds,
            drops: data.drops,
          }}
        />
        <span>{data.tz}</span>
      </div>
    </div>
  );
}

// Re-export friend icons for convenience (keeps tree-shake happy)
export const _icons = { Activity, Cpu, RadioTower, Bell, RefreshCcw, Clock };
