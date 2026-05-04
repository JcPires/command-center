import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, Skeleton } from "@/components/ui";
import { useActivityHourly } from "@/hooks/useQueries";

const DAYS_FR = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const DAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FULL_DAYS_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const FULL_DAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Bi-color scale: surface → blue (calm/moyen) → magenta (intense)
const LEVEL_BG = [
  "var(--surface)",
  "color-mix(in oklab, var(--acc) 32%, transparent)",
  "color-mix(in oklab, var(--acc) 55%, transparent)",
  "color-mix(in oklab, var(--acc) 75%, color-mix(in oklab, var(--mdl-opus) 40%, transparent))",
  "color-mix(in oklab, var(--mdl-opus) 80%, var(--acc))",
  "linear-gradient(135deg, var(--mdl-opus), oklch(0.70 0.20 350))",
] as const;

function quantize(value: number, max: number): number {
  if (value <= 0) return 0;
  if (max <= 0) return 1;
  const r = value / max;
  if (r < 0.18) return 1;
  if (r < 0.35) return 2;
  if (r < 0.55) return 3;
  if (r < 0.78) return 4;
  return 5;
}

type HoverInfo = { dow: number; hour: number; value: number; rect: DOMRect };

function HeatCell({
  dow, hour, value, lvl, onHover,
}: {
  dow: number; hour: number; value: number; lvl: number;
  onHover: (info: HoverInfo | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isMax = lvl === 5;
  return (
    <div
      ref={ref}
      className="flex-1 aspect-square rounded-[4px] transition-[transform,box-shadow] duration-100 hover:scale-110"
      style={{
        backgroundImage: isMax ? (LEVEL_BG[5] as string) : undefined,
        background: !isMax ? (LEVEL_BG[lvl] as string) : undefined,
        boxShadow: lvl >= 4 ? "0 0 8px var(--acc-soft)" : undefined,
        cursor: "pointer",
      }}
      onMouseEnter={() => {
        if (ref.current) onHover({ dow, hour, value, rect: ref.current.getBoundingClientRect() });
      }}
      onMouseLeave={() => onHover(null)}
      onFocus={() => {
        if (ref.current) onHover({ dow, hour, value, rect: ref.current.getBoundingClientRect() });
      }}
      onBlur={() => onHover(null)}
      tabIndex={0}
      aria-label={`${dow} ${hour}h: ${value}`}
    />
  );
}

export function HourlyHeatmap() {
  const { t, i18n } = useTranslation();
  const { data, isLoading } = useActivityHourly();
  const isFr = i18n.resolvedLanguage?.startsWith("fr");
  const days = isFr ? DAYS_FR : DAYS_EN;
  const fullDays = isFr ? FULL_DAYS_FR : FULL_DAYS_EN;

  const containerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<HoverInfo | null>(null);

  const { grid, max, total, peak } = useMemo(() => {
    const g = data?.grid ?? Array.from({ length: 7 }, () => Array(24).fill(0));
    const m = data?.max ?? 0;
    let total = 0;
    let peak = { d: 0, h: 0, n: 0 };
    g.forEach((row, d) => row.forEach((n, h) => {
      total += n;
      if (n > peak.n) peak = { d, h, n };
    }));
    return { grid: g, max: m, total, peak };
  }, [data]);

  const tooltipPos = useMemo(() => {
    if (!hovered || !containerRef.current) return null;
    const cRect = containerRef.current.getBoundingClientRect();
    return {
      x: hovered.rect.left - cRect.left + hovered.rect.width / 2,
      y: hovered.rect.top - cRect.top,
    };
  }, [hovered]);

  return (
    <Card>
      <div className="card-head">
        <div className="flex-1">
          <div className="kicker">{t("Tendances")}</div>
          <h3 className="text-[14.5px] font-semibold tracking-[-0.005em] font-display mt-0.5">
            {t("Activité quotidienne — heatmap horaire")}
          </h3>
        </div>
        <div className="flex items-center gap-3 text-[10px] mono uppercase tracking-[0.10em] text-ink-mute">
          <LegendItem color={LEVEL_BG[1] as string} label={t("calme")} />
          <LegendItem color={LEVEL_BG[2] as string} label={t("moyen")} />
          <LegendItem color={LEVEL_BG[5] as string} label={t("intense")} gradient />
        </div>
      </div>
      <div className="card-body relative" ref={containerRef}>
        {isLoading ? (
          <Skeleton className="h-[180px]" />
        ) : (
          <div className="flex flex-col gap-[3px]">
            {grid.map((row, d) => (
              <div key={d} className="flex items-center gap-[3px]">
                <div className="w-[34px] mono text-[10px] uppercase tracking-[0.10em] text-ink-mute">
                  {days[d]}
                </div>
                {row.map((value, h) => {
                  const lvl = quantize(value, max);
                  return (
                    <HeatCell
                      key={h}
                      dow={d}
                      hour={h}
                      value={value}
                      lvl={lvl}
                      onHover={setHovered}
                    />
                  );
                })}
              </div>
            ))}
            <div className="flex items-center gap-[3px] pl-[36px] mt-1">
              {Array.from({ length: 24 }).map((_, h) => (
                <div
                  key={h}
                  className="flex-1 mono text-[9px] text-ink-faint text-left"
                  style={{ visibility: h % 4 === 0 ? "visible" : "hidden" }}
                >
                  {h}h
                </div>
              ))}
            </div>
          </div>
        )}

        {hovered && tooltipPos && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-50 -translate-x-1/2 -translate-y-full"
            style={{ left: tooltipPos.x, top: tooltipPos.y - 8 }}
          >
            <div
              className="rounded-md px-2.5 py-1.5 shadow-lg whitespace-nowrap border-[0.5px]"
              style={{
                background: "var(--bg-elev)",
                borderColor: "var(--hairline-strong)",
                color: "var(--ink)",
              }}
            >
              <div className="mono text-[10px] uppercase tracking-[0.10em] text-ink-mute">
                {fullDays[hovered.dow]} · {hovered.hour.toString().padStart(2, "0")}h–{((hovered.hour + 1) % 24).toString().padStart(2, "0")}h
              </div>
              <div className="text-[12.5px] tnum mono mt-0.5">
                <span className="font-semibold">{hovered.value}</span>
                <span className="text-ink-soft"> {t("appels")}</span>
              </div>
            </div>
            <span
              className="absolute left-1/2 -translate-x-1/2 -bottom-1 h-2 w-2 rotate-45 border-r-[0.5px] border-b-[0.5px]"
              style={{
                background: "var(--bg-elev)",
                borderColor: "var(--hairline-strong)",
              }}
            />
          </div>
        )}

      </div>
    </Card>
  );
}

function LegendItem({ color, label, gradient = false }: { color: string; label: string; gradient?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="h-2.5 w-2.5 rounded-[3px]"
        style={gradient ? { backgroundImage: color } : { background: color }}
      />
      <span>{label}</span>
    </span>
  );
}
