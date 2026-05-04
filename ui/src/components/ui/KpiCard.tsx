import type { ReactNode } from "react";
import { Sparkline } from "@/components/charts/Sparkline";
import { cn } from "@/lib/cn";

type Props = {
  eyebrow: string;
  value: ReactNode;
  /** small suffix appended after the value, eg. "actives · 412 cette semaine" */
  suffix?: ReactNode;
  /** delta line below the value */
  delta?: { value: number; label?: string };
  /** small accent meta (eg. "184k vs hier") rendered to the right of the delta pill */
  metaInline?: ReactNode;
  spark?: number[];
  hero?: boolean;
  live?: boolean;
  /** small accent icon next to the value (eg. ↗) */
  badge?: "up" | "down" | null;
  /** delta sentiment override; defaults to positive=delta>=0 */
  positiveSentiment?: boolean;
  className?: string;
};

function ArrowUp() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 17 17 7" /><path d="M9 7h8v8" />
    </svg>
  );
}
function ArrowDown() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 7 17 17" /><path d="M17 9v8H9" />
    </svg>
  );
}

export function KpiCard({
  eyebrow, value, suffix, delta, metaInline, spark, hero = false, live = false, badge = null, positiveSentiment, className,
}: Props) {
  const positive = positiveSentiment !== undefined ? positiveSentiment : (delta ? delta.value >= 0 : true);
  const deltaColor = positive ? "var(--pos)" : "var(--neg)";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-card border-[0.5px] shadow-card",
        "min-h-[148px] flex flex-col",
        hero ? "kpi-hero border-transparent text-[color:var(--on-acc)]" : "border-hairline bg-bg-card text-ink",
        className,
      )}
      style={hero ? { backgroundImage: "var(--acc-grad)" } : undefined}
    >
      {/* Eyebrow row */}
      <div className="relative z-[2] flex items-center justify-between gap-3 px-[20px] pt-[16px]">
        <div className="flex items-center gap-2">
          <span
            className="kicker"
            style={hero ? { color: "color-mix(in oklab, var(--on-acc) 60%, transparent)" } : undefined}
          >
            {eyebrow}
          </span>
          {live && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[4px]"
              style={{
                background: hero ? "color-mix(in oklab, var(--on-acc) 14%, transparent)" : "color-mix(in oklab, var(--pos) 16%, transparent)",
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full dot-pulse"
                style={{ background: "var(--pos)" }}
              />
              <span
                className="text-[9.5px] mono uppercase tracking-[0.10em]"
                style={{ color: "var(--pos)" }}
              >
                en direct
              </span>
            </span>
          )}
        </div>
        {badge && (
          <span
            className="opacity-70"
            style={hero ? { color: "color-mix(in oklab, var(--on-acc) 70%, transparent)" } : { color: positive ? "var(--pos)" : "var(--neg)" }}
          >
            {badge === "up" ? <ArrowUp /> : <ArrowDown />}
          </span>
        )}
      </div>

      {/* Value */}
      <div className="relative z-[2] px-[20px] pt-2 flex items-baseline gap-2">
        <div
          className={cn(
            "font-display font-semibold tnum",
            hero ? "leading-[0.95] tracking-[-0.035em]" : "leading-none tracking-[-0.030em]",
          )}
          style={{ fontSize: `var(${hero ? "--kpi-hero-fs" : "--kpi-fs"})` }}
        >
          {value}
        </div>
        {suffix && (
          <span
            className="text-[12px]"
            style={hero ? { color: "color-mix(in oklab, var(--on-acc) 78%, transparent)" } : { color: "var(--ink-soft)" }}
          >
            {suffix}
          </span>
        )}
      </div>

      {/* Delta line */}
      <div className="relative z-[2] px-[20px] pt-2 mt-auto">
        <div className="flex items-center gap-2 text-[11.5px]">
          {delta && (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded mono tnum font-medium"
              style={{
                background: hero
                  ? "color-mix(in oklab, var(--on-acc) 14%, transparent)"
                  : `color-mix(in oklab, ${deltaColor} 14%, transparent)`,
                color: hero
                  ? "color-mix(in oklab, var(--on-acc) 85%, transparent)"
                  : deltaColor,
              }}
            >
              {positive ? "↑" : "↓"} {Math.abs(delta.value)}%
            </span>
          )}
          {(metaInline || delta?.label) && (
            <span
              className="text-[11px]"
              style={hero ? { color: "color-mix(in oklab, var(--on-acc) 60%, transparent)" } : { color: "var(--ink-mute)" }}
            >
              {metaInline ?? delta?.label}
            </span>
          )}
        </div>
      </div>

      {/* Sparkline at bottom — fills card width */}
      {spark && spark.length > 1 && (
        <div className="relative z-[1] mt-2 px-[12px] pb-[10px] [&>svg]:w-full [&>svg]:h-[36px]">
          <Sparkline
            values={spark}
            width={400}
            height={36}
            color={hero ? "var(--on-acc)" : (positive ? "var(--pos)" : "var(--neg)")}
            area
            areaOpacity={0.18}
            strokeWidth={1.4}
          />
        </div>
      )}
    </div>
  );
}
