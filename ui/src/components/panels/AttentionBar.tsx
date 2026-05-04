import { AlertTriangle, AlertCircle, Clock, MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAttention } from "@/hooks/useQueries";
import { cn } from "@/lib/cn";

const KIND_ICON = {
  task_failed:        AlertCircle,
  decision_pending:   MessageSquare,
  schedule_stale:     Clock,
} as const;

export function AttentionBar() {
  const { data } = useAttention();
  const { t } = useTranslation();
  if (!data || data.count === 0) return null;
  return (
    <div className={cn(
      "rounded-xl border border-err/40 bg-err/5 px-4 py-3 flex items-start gap-3",
      "shadow-[0_0_24px_-12px_rgba(239,68,68,0.4)]"
    )}>
      <AlertTriangle className="h-4 w-4 text-err mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-err uppercase tracking-wider mono">
          {t("Needs attention")} · {data.count}
        </div>
        <ul className="mt-1.5 space-y-1">
          {data.items.slice(0, 6).map((it, i) => {
            const Icon = (KIND_ICON as any)[it.kind] ?? AlertCircle;
            return (
              <li key={i} className="flex items-start gap-2 text-xs text-text-dim">
                <Icon className="h-3 w-3 mt-0.5 text-err/70 shrink-0" />
                <span className="text-text font-medium mr-2">
                  {it.title || it.kind.replace("_", " ")}
                </span>
                <span className="truncate">{it.detail}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
