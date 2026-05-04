import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Square } from "lucide-react";
import { Button } from "@/components/ui";
import { useEmergencyStop } from "@/hooks/useQueries";

export function EmergencyStopBanner() {
  const { t } = useTranslation();
  const [confirm, setConfirm] = useState(false);
  const stop = useEmergencyStop();
  const [last, setLast] = useState<{ killed: number; spared: number } | null>(null);

  return (
    <div
      className="rounded-xl px-4 py-3 flex items-center gap-3"
      style={{
        background: "linear-gradient(135deg, color-mix(in oklab, var(--neg) 14%, transparent), color-mix(in oklab, var(--neg) 4%, transparent))",
      }}
    >
      <Square className="h-4 w-4 text-err" fill="currentColor" />
      <div className="flex-1">
        <div className="text-xs font-semibold uppercase tracking-wider text-err mono">{t("Emergency stop")}</div>
        <p className="text-xs text-text-dim mt-0.5">
          {t("SIGTERM dispatched")} <code className="mono">claude -p</code> {t("children. Interactive sessions are spared.")}
          {last && (
            <span className="ml-2 text-text">
              {t("Last run: killed {{killed}}, spared {{spared}}.", { killed: last.killed, spared: last.spared })}
            </span>
          )}
        </p>
      </div>
      {confirm ? (
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>{t("Cancel")}</Button>
          <Button
            variant="danger" size="sm"
            disabled={stop.isPending}
            onClick={async () => {
              const r = await stop.mutateAsync();
              setLast({ killed: r.processes_killed, spared: r.interactive_spared });
              setConfirm(false);
            }}
          >
            {stop.isPending ? t("Stopping…") : t("Confirm stop")}
          </Button>
        </div>
      ) : (
        <Button variant="danger" size="sm" onClick={() => setConfirm(true)}>{t("Stop dispatched runs")}</Button>
      )}
    </div>
  );
}
