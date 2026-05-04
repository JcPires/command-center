import { useMemo } from "react";
import { Tooltip } from "@/components/ui/Tooltip";

export interface StackSegment { key: string; value: number; color: string; label?: string; }
export interface StackedBarRow { date: string; segments: StackSegment[]; }

export function StackedBars({
  rows, height = 160, gap = 6, formatTooltip,
}: {
  rows: StackedBarRow[];
  height?: number;
  gap?: number;
  formatTooltip?: (row: StackedBarRow) => string;
}) {
  const max = useMemo(() => {
    return Math.max(1, ...rows.map((r) => r.segments.reduce((s, x) => s + x.value, 0)));
  }, [rows]);

  if (rows.length === 0) {
    return <div className="h-[160px] grid place-items-center text-xs text-text-subtle">no data in range</div>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-[6px]" style={{ height }}>
        {rows.map((r) => {
          const total = r.segments.reduce((s, x) => s + x.value, 0);
          const tooltip = formatTooltip ? formatTooltip(r) : `${r.date} · ${total.toLocaleString()}`;
          return (
            <Tooltip key={r.date} label={tooltip} className="flex-1">
              <div className="flex flex-col-reverse w-full" style={{ height, gap }}>
                {r.segments.map((s) => {
                  if (s.value <= 0) return null;
                  const pct = (s.value / max) * 100;
                  return (
                    <div
                      key={s.key}
                      style={{ height: `${pct}%`, background: s.color }}
                      className="rounded-[3px] min-h-[2px] transition-opacity hover:opacity-90"
                      aria-label={s.label || s.key}
                    />
                  );
                })}
              </div>
            </Tooltip>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-text-subtle mono px-0.5">
        <span>{rows[0]?.date.slice(5)}</span>
        <span>{rows[rows.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  );
}
