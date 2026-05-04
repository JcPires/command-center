import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useTheme, usePalette, useDensity, useDecor, useGrid, useMotion,
  type Theme, type Palette, type Density,
} from "@/hooks/useTheme";
import { Toggle, Segmented } from "@/components/ui";
import { cn } from "@/lib/cn";

function IconSliders() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 6h10" /><path d="M18 6h2" /><circle cx={16} cy={6} r={2} />
      <path d="M4 12h2" /><path d="M10 12h10" /><circle cx={8} cy={12} r={2} />
      <path d="M4 18h12" /><path d="M20 18h0" /><circle cx={18} cy={18} r={2} />
    </svg>
  );
}
function IconClose() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 6 18 18 M18 6 6 18" />
    </svg>
  );
}

/* ───── Reusable controls ───── */

function Slider({
  label, value, min, max, step = 1, suffix = "", onChange,
}: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[12px] text-ink-soft">{label}</span>
        <span className="mono tnum text-[11px] text-ink-mute">{value}{suffix}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 appearance-none cursor-pointer rounded-full
                   [&::-webkit-slider-thumb]:appearance-none
                   [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5
                   [&::-webkit-slider-thumb]:rounded-full
                   [&::-webkit-slider-thumb]:bg-acc
                   [&::-webkit-slider-thumb]:cursor-pointer
                   [&::-webkit-slider-thumb]:shadow-[0_0_0_2px_var(--bg-card)]"
        style={{ background: "var(--surface-2)" }}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="kicker mb-2">{title}</div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function PaletteSwatches({
  palette, setPalette, options,
}: {
  palette: Palette;
  setPalette: (p: Palette) => void;
  options: { value: Palette; label: string; gradient: string }[];
}) {
  const active = options.find((o) => o.value === palette);
  return (
    <>
      <div className="text-[12px] text-ink-soft flex items-center justify-between">
        <span>{active?.label}</span>
        <span className="kicker">{options.length} dispos</span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {options.map((s) => {
          const isActive = palette === s.value;
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => setPalette(s.value)}
              className={cn(
                "h-10 rounded-[8px] transition-all border-[0.5px] relative",
                isActive ? "border-transparent" : "border-hairline hover:border-hairline-strong",
              )}
              style={{
                backgroundImage: s.gradient,
                boxShadow: isActive ? "0 0 0 2px var(--bg-card), 0 0 0 3px var(--acc)" : undefined,
              }}
              title={s.label}
              aria-label={s.label}
            />
          );
        })}
      </div>
    </>
  );
}

/* ───── Persistent state hooks for tweak vars ───── */

function usePersistedNumber(key: string, defaultV: number, apply: (v: number) => void) {
  const [v, setV] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? Number(stored) : defaultV;
    } catch { return defaultV; }
  });
  useEffect(() => {
    apply(v);
    try { localStorage.setItem(key, String(v)); } catch { /* noop */ }
  }, [v, apply, key]);
  return [v, setV] as const;
}

function usePersistedString<T extends string>(key: string, defaultV: T, apply: (v: T) => void) {
  const [v, setV] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return (stored as T) || defaultV;
    } catch { return defaultV; }
  });
  useEffect(() => {
    apply(v);
    try { localStorage.setItem(key, v); } catch { /* noop */ }
  }, [v, apply, key]);
  return [v, setV] as const;
}

function usePersistedBool(key: string, defaultV: boolean, apply: (v: boolean) => void) {
  const [v, setV] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored === null ? defaultV : stored === "1";
    } catch { return defaultV; }
  });
  useEffect(() => {
    apply(v);
    try { localStorage.setItem(key, v ? "1" : "0"); } catch { /* noop */ }
  }, [v, apply, key]);
  return [v, setV] as const;
}

const setRootVar = (name: string, value: string) => document.body.style.setProperty(name, value);
const setBodyAttr = (name: string, value: string) => document.body.setAttribute(name, value);

/* ───── Panel ───── */

type Elev = "flat" | "soft" | "strong";
type Borders = "none" | "hairline" | "strong";
type BadgeVar = "soft" | "outline" | "solid";

export function TweaksPanel() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { theme, setTheme } = useTheme();
  const { palette, setPalette } = usePalette();
  const { density, setDensity } = useDensity();
  const decor = useDecor();
  const grid = useGrid();
  const motion = useMotion();

  // Sliders
  const [textSize, setTextSize] = usePersistedNumber("cc-fs-body", 14, (v) => {
    setRootVar("--fs-body", `${v}px`);
    document.documentElement.style.fontSize = `${v}px`;
  });
  const [cardRadius, setCardRadius] = usePersistedNumber("cc-radius-card", 16, (v) => setRootVar("--radius-card", `${v}px`));
  const [kpiScale, setKpiScale] = usePersistedNumber("cc-kpi-scale", 56, (v) => {
    setRootVar("--kpi-hero-fs", `${v}px`);
    setRootVar("--kpi-fs", `${Math.round(v * 0.71)}px`);
  });
  const [grain, setGrain] = usePersistedNumber("cc-grain", 0, (v) => setRootVar("--grain", String(v / 100)));

  // Card style
  const [elev, setElev] = usePersistedString<Elev>("cc-elev", "soft", (v) => setBodyAttr("data-elev", v));
  const [borders, setBorders] = usePersistedString<Borders>("cc-borders", "hairline", (v) => setBodyAttr("data-borders", v));
  const [badgeVar, setBadgeVar] = usePersistedString<BadgeVar>("cc-badge", "soft", (v) => setBodyAttr("data-badge", v));
  const [heroGradient, setHeroGradient] = usePersistedBool("cc-hero-gradient", true, (v) => setBodyAttr("data-hero-gradient", v ? "on" : "off"));
  const [zebra, setZebra] = usePersistedBool("cc-zebra", false, (v) => setBodyAttr("data-zebra", v ? "on" : "off"));

  const paletteOptions = useMemo(() => ([
    { value: "indigo"   as Palette, label: t("Aurora"),   gradient: "linear-gradient(135deg, oklch(0.58 0.20 280), oklch(0.66 0.16 260))" },
    { value: "slate"    as Palette, label: t("Citrus"),   gradient: "linear-gradient(135deg, oklch(0.66 0.16 42), oklch(0.72 0.13 60))" },
    { value: "mono"     as Palette, label: t("Forest"),   gradient: "linear-gradient(135deg, oklch(0.70 0.16 148), oklch(0.78 0.14 130))" },
    { value: "ocean"    as Palette, label: t("Ocean"),    gradient: "linear-gradient(135deg, oklch(0.55 0.16 240), oklch(0.72 0.12 190))" },
    { value: "sunset"   as Palette, label: t("Sunset"),   gradient: "linear-gradient(135deg, oklch(0.62 0.22 350), oklch(0.76 0.16 50))" },
    { value: "lavender" as Palette, label: t("Lavender"), gradient: "linear-gradient(135deg, oklch(0.62 0.18 290), oklch(0.76 0.12 340))" },
    { value: "ember"    as Palette, label: t("Ember"),    gradient: "linear-gradient(135deg, oklch(0.58 0.22 18), oklch(0.74 0.14 50))" },
    { value: "arctic"   as Palette, label: t("Arctic"),   gradient: "linear-gradient(135deg, oklch(0.66 0.12 240), oklch(0.82 0.08 200))" },
  ]), [t]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="fixed bottom-12 right-6 z-40">
      {open ? (
        <div
          className="rounded-[14px] border-[0.5px] border-hairline shadow-card w-[320px] max-h-[80vh] backdrop-blur-xl flex flex-col"
          style={{ background: "color-mix(in oklab, var(--bg-card) 92%, transparent)" }}
        >
          <div className="flex items-center justify-between p-4 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-ink"><IconSliders /></span>
              <span className="font-display font-semibold text-[13.5px]">{t("Tweaks")}</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-6 w-6 grid place-items-center rounded-md text-ink-mute hover:text-ink hover:bg-surface focus-ring"
              aria-label={t("Close")}
            >
              <IconClose />
            </button>
          </div>

          <div className="px-4 pb-4 overflow-y-auto space-y-5">
            <Section title={t("Thème")}>
              <div>
                <div className="text-[12px] text-ink-soft mb-1">{t("Mode")}</div>
                <Segmented<Theme>
                  value={theme}
                  onChange={setTheme}
                  options={[
                    { value: "dark",  label: t("Sombre") },
                    { value: "light", label: t("Clair") },
                  ]}
                  variant="subtle"
                  fullWidth
                />
              </div>
              <div>
                <div className="text-[12px] text-ink-soft mb-1">{t("Densité")}</div>
                <Segmented<Density>
                  value={density}
                  onChange={setDensity}
                  options={[
                    { value: "compact", label: t("Compact") },
                    { value: "regular", label: t("Régulier") },
                    { value: "comfy",   label: t("Aéré") },
                  ]}
                  variant="subtle"
                  fullWidth
                />
              </div>
              <Slider label={t("Taille de texte")} value={textSize}   min={12} max={17}  step={1} suffix="px" onChange={setTextSize} />
              <Slider label={t("Rayon des cartes")} value={cardRadius} min={0}  max={28}  step={1} suffix="px" onChange={setCardRadius} />
              <Slider label={t("Échelle des chiffres KPI")} value={kpiScale} min={36} max={84} step={1} suffix="px" onChange={setKpiScale} />
            </Section>

            <Section title={t("Palette")}>
              <PaletteSwatches palette={palette} setPalette={setPalette} options={paletteOptions} />
            </Section>

            <Section title={t("Style des cartes")}>
              <div>
                <div className="text-[12px] text-ink-soft mb-1">{t("Élévation")}</div>
                <Segmented<Elev>
                  value={elev}
                  onChange={setElev}
                  options={[
                    { value: "flat",   label: t("Plat") },
                    { value: "soft",   label: t("Soft") },
                    { value: "strong", label: t("Marqué") },
                  ]}
                  variant="subtle"
                  fullWidth
                />
              </div>
              <div>
                <div className="text-[12px] text-ink-soft mb-1">{t("Bordures")}</div>
                <Segmented<Borders>
                  value={borders}
                  onChange={setBorders}
                  options={[
                    { value: "none",     label: t("Aucune") },
                    { value: "hairline", label: t("Fine") },
                    { value: "strong",   label: t("Marquée") },
                  ]}
                  variant="subtle"
                  fullWidth
                />
              </div>
              <div>
                <div className="text-[12px] text-ink-soft mb-1">{t("Badges")}</div>
                <Segmented<BadgeVar>
                  value={badgeVar}
                  onChange={setBadgeVar}
                  options={[
                    { value: "soft",    label: "Soft" },
                    { value: "outline", label: "Outline" },
                    { value: "solid",   label: "Solid" },
                  ]}
                  variant="subtle"
                  fullWidth
                />
              </div>
              <Toggle on={heroGradient} onToggle={() => setHeroGradient(!heroGradient)} label={t("Hero KPI en gradient")} />
              <Toggle on={zebra}        onToggle={() => setZebra(!zebra)}               label={t("Lignes alternées (zebra)")} />
            </Section>

            <Section title={t("Décor de fond")}>
              <Toggle on={decor.on}  onToggle={decor.toggle}  label={t("Halo de couleur")} />
              <Toggle on={grid.on}   onToggle={grid.toggle}   label={t("Grille de fond")} />
              <Slider label={t("Grain (bruit)")} value={grain} min={0} max={50} step={1} onChange={setGrain} />
              <Toggle on={motion.on} onToggle={motion.toggle} label={t("Animations")} />
            </Section>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="h-10 w-10 grid place-items-center rounded-full border-[0.5px] border-hairline shadow-card text-ink-soft hover:text-ink transition-colors focus-ring backdrop-blur-xl"
          style={{ background: "color-mix(in oklab, var(--bg-card) 90%, transparent)" }}
          aria-label={t("Ouvrir les tweaks")}
          title={t("Tweaks")}
        >
          <IconSliders />
        </button>
      )}
    </div>
  );
}
