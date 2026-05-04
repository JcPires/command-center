import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, Skeleton } from "@/components/ui";
import { useActivityDaily } from "@/hooks/useQueries";
import { fmtCompact } from "@/lib/format";

const DAYS = 365;
const DAYS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const DAYS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS_FR = ["jan", "fév", "mar", "avr", "mai", "juin", "juil", "août", "sep", "oct", "nov", "déc"];
const MONTHS_EN = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const FULL_DAYS_FR = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const FULL_DAYS_EN = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const LEVEL_BG = [
  "var(--surface)",
  "color-mix(in oklab, var(--acc) 32%, transparent)",
  "color-mix(in oklab, var(--acc) 50%, transparent)",
  "color-mix(in oklab, var(--acc) 70%, transparent)",
  "var(--acc)",
  "var(--acc-grad)",
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

type DayCell = { date: Date; key: string; v: number };
type SlotCell = DayCell | null;

type HoverInfo = { cell: DayCell; rect: DOMRect };

function formatLongDate(d: Date, lang: "fr" | "en"): string {
  const dows = lang === "fr" ? FULL_DAYS_FR : FULL_DAYS_EN;
  const months = lang === "fr" ? MONTHS_FR : MONTHS_EN;
  const dow = dows[(d.getDay() + 6) % 7];
  const day = d.getDate();
  const m = months[d.getMonth()];
  const y = d.getFullYear();
  return `${dow} ${day} ${m} ${y}`;
}

function HeatCell({
  cell, lvl, onHover,
}: {
  cell: DayCell;
  lvl: number;
  onHover: (info: HoverInfo | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isMax = lvl === 5;
  return (
    <div
      ref={ref}
      className="aspect-square rounded-[4px] w-full transition-[transform,box-shadow] duration-100 hover:scale-110"
      style={{
        backgroundImage: isMax ? (LEVEL_BG[5] as string) : undefined,
        background: !isMax ? (LEVEL_BG[lvl] as string) : undefined,
        boxShadow: lvl >= 4 ? "0 0 8px var(--acc-soft)" : undefined,
        cursor: "pointer",
      }}
      onMouseEnter={() => {
        if (ref.current) onHover({ cell, rect: ref.current.getBoundingClientRect() });
      }}
      onMouseLeave={() => onHover(null)}
      onFocus={() => {
        if (ref.current) onHover({ cell, rect: ref.current.getBoundingClientRect() });
      }}
      onBlur={() => onHover(null)}
      tabIndex={0}
      aria-label={`${cell.key}: ${cell.v}`}
    />
  );
}

export function HeatmapGrid() {
  const { t, i18n } = useTranslation();
  const { data, isLoading } = useActivityDaily(DAYS);
  const isFr = i18n.resolvedLanguage?.startsWith("fr");
  const days = isFr ? DAYS_FR : DAYS_EN;
  const months = isFr ? MONTHS_FR : MONTHS_EN;
  const lang: "fr" | "en" = isFr ? "fr" : "en";

  const containerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<HoverInfo | null>(null);

  const { weeks, max, total, peak } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totals = new Map<string, number>();
    if (data) for (const r of data.daily) totals.set(r.date, r.v);

    const cells: DayCell[] = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86_400_000);
      const key = d.toISOString().slice(0, 10);
      cells.push({ date: d, key, v: totals.get(key) ?? 0 });
    }

    const dowMonFirst = (d: Date) => (d.getDay() + 6) % 7;
    const firstDow = dowMonFirst(cells[0].date);
    const padded: SlotCell[] = Array(firstDow).fill(null).concat(cells);
    const weeks: SlotCell[][] = [];
    for (let i = 0; i < padded.length; i += 7) {
      const col = padded.slice(i, i + 7);
      while (col.length < 7) col.push(null);
      weeks.push(col);
    }

    let total = 0;
    let peak = cells[0];
    for (const c of cells) {
      total += c.v;
      if (c.v > peak.v) peak = c;
    }
    const max = Math.max(0, ...cells.map((c) => c.v));
    return { weeks, max, total, peak };
  }, [data]);

  const monthLabels = useMemo(() =>
    weeks.map((col) => {
      const firstDay = col.find((c): c is DayCell => c?.date.getDate() === 1);
      return firstDay ? months[firstDay.date.getMonth()] : "";
    }),
  [weeks, months]);

  const GAP = 3;

  // Tooltip position relative to the container, anchored above the cell.
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
            {t("Activité quotidienne (1 an)")}
          </h3>
        </div>
        {!isLoading && data && (
          <span className="mono text-[10px] text-ink-mute uppercase tracking-[0.10em]">
            {total > 0 ? `${fmtCompact(total)} ${t("tokens")} · ${t("pic")} ${peak.key}` : t("aucune activité")}
          </span>
        )}
      </div>
      <div className="card-body relative" ref={containerRef}>
        {isLoading ? (
          <Skeleton className="h-[180px]" />
        ) : (
          <div
            className="grid"
            style={{
              gridTemplateColumns: `32px repeat(${weeks.length}, minmax(0, 1fr))`,
              gridAutoRows: "auto",
              columnGap: `${GAP}px`,
              rowGap: `${GAP}px`,
            }}
          >
            <div />
            {monthLabels.map((m, i) => (
              <div
                key={`m-${i}`}
                className="mono text-[9px] text-ink-faint leading-none self-end whitespace-nowrap"
                style={{ visibility: m ? "visible" : "hidden", gridColumn: i + 2 }}
              >
                {m}
              </div>
            ))}

            {[0, 1, 2, 3, 4, 5, 6].map((dow) => (
              <RowFragment
                key={dow}
                dow={dow}
                label={dow === 0 || dow === 2 || dow === 4 ? days[dow] : ""}
                weeks={weeks}
                max={max}
                onHover={setHovered}
              />
            ))}
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
                {formatLongDate(hovered.cell.date, lang)}
              </div>
              <div className="text-[12.5px] tnum mono mt-0.5">
                <span className="font-semibold">{fmtCompact(hovered.cell.v)}</span>
                <span className="text-ink-soft"> {t("tokens")}</span>
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

        <div className="mt-4 flex items-center gap-2 text-[10.5px] mono text-ink-mute">
          <span>{t("calme")}</span>
          {[0, 1, 2, 3, 4, 5].map((l) => {
            const isMax = l === 5;
            return (
              <span
                key={l}
                className="w-2.5 h-2.5 rounded-[2px]"
                style={{
                  backgroundImage: isMax ? (LEVEL_BG[5] as string) : undefined,
                  background: !isMax ? (LEVEL_BG[l] as string) : undefined,
                }}
              />
            );
          })}
          <span>{t("intense")}</span>
        </div>
      </div>
    </Card>
  );
}

function RowFragment({
  dow, label, weeks, max, onHover,
}: { dow: number; label: string; weeks: SlotCell[][]; max: number; onHover: (info: HoverInfo | null) => void }) {
  return (
    <>
      <div className="mono text-[10px] uppercase tracking-[0.10em] text-ink-mute self-center justify-self-start">
        {label}
      </div>
      {weeks.map((col, w) => {
        const cell = col[dow];
        if (!cell) return <div key={w} className="aspect-square" aria-hidden />;
        const lvl = quantize(cell.v, max);
        return <HeatCell key={w} cell={cell} lvl={lvl} onHover={onHover} />;
      })}
    </>
  );
}
