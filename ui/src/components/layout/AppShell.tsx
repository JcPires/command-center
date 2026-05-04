import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { CommandPalette } from "./CommandPalette";
import { BrandMark } from "./Brand";
import { StatusBar } from "./StatusBar";
import { TweaksPanel } from "./TweaksPanel";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/cn";

function IconCommand() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x={3.5} y={4.5} width={17} height={15} rx={2.5} />
      <path d="M3.5 9 H20.5" />
      <path d="M7 13 L9 15 L7 17" />
    </svg>
  );
}
function IconActivity() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 12c2-3 3.5-3 5 0s3 3 5 0 3.5-3 5 0 3 3 3 0" />
    </svg>
  );
}
function IconLayers() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /><path d="m3 18 9 5 9-5" />
    </svg>
  );
}
function IconSearch() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx={11} cy={11} r={7} /><path d="m20 20-3.5-3.5" />
    </svg>
  );
}
function IconSun() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx={12} cy={12} r={4} />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}
function IconMoon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79Z" />
    </svg>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { location } = useRouterState();
  const { t, i18n } = useTranslation();
  const isFr = i18n.resolvedLanguage?.startsWith("fr");
  const toggleLang = () => i18n.changeLanguage(isFr ? "en" : "fr");
  const { theme, toggle: toggleTheme } = useTheme();
  const isDark = theme === "dark";

  const NAV = useMemo(() => [
    { to: "/",         label: t("Command"),     Icon: IconCommand },
    { to: "/activity", label: t("Activity"),    Icon: IconActivity },
    { to: "/skills",   label: t("Skills & MCP"), Icon: IconLayers },
  ] as const, [t]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-screen flex flex-col relative">
      <div className="bg-deco" />
      <div className="bg-grid" />
      <div className="bg-grain" />

      <header
        className="sticky top-0 z-30 backdrop-blur-xl border-b-[0.5px] border-hairline"
        style={{ background: "color-mix(in oklab, var(--bg) 70%, transparent)" }}
      >
        <div className="mx-auto max-w-[1480px] px-7 h-[60px] flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2.5">
            <BrandMark />
            <span className="font-display font-semibold tracking-[-0.012em] text-[15.5px]">
              Command <span className="text-ink-mute font-medium">Centre</span>
            </span>
          </Link>

          <nav
            className="ml-2 flex items-center gap-0.5 p-0.5 rounded-[10px] border-[0.5px] border-hairline"
            style={{ background: "var(--surface)" }}
          >
            {NAV.map(({ to, label, Icon }) => {
              const active = location.pathname === to;
              return (
                <Link
                  key={to}
                  to={to}
                  className={cn(
                    "inline-flex items-center gap-2 h-8 px-3 rounded-[8px] text-[13px] font-medium transition-colors",
                    active
                      ? "bg-bg-card text-ink shadow-[0_1px_0_rgba(255,255,255,0.05)_inset,0_1px_2px_rgba(0,0,0,0.18)]"
                      : "text-ink-soft hover:text-ink",
                  )}
                >
                  <Icon />
                  {label}
                  {active && (
                    <span
                      className="h-1.5 w-1.5 rounded-full ml-0.5"
                      style={{ background: "var(--pos)", boxShadow: "0 0 6px var(--pos)" }}
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex items-center justify-center h-8 w-8 rounded-[8px] border-[0.5px] border-hairline text-ink-soft hover:text-ink transition-colors focus-ring"
              style={{ background: "var(--surface)" }}
              aria-label={isDark ? t("Switch to light theme") : t("Switch to dark theme")}
              title={isDark ? t("Switch to light theme") : t("Switch to dark theme")}
            >
              {isDark ? <IconSun /> : <IconMoon />}
            </button>
            <button
              type="button"
              onClick={toggleLang}
              className="inline-flex items-center justify-center h-8 px-2.5 rounded-[8px] border-[0.5px] border-hairline text-ink-soft hover:text-ink transition-colors text-[10.5px] mono uppercase tracking-[0.10em] focus-ring"
              style={{ background: "var(--surface)" }}
              aria-label={isFr ? t("Switch to English") : t("Switch to French")}
              title={isFr ? t("Switch to English") : t("Switch to French")}
            >
              {isFr ? "EN" : "FR"}
            </button>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="inline-flex items-center gap-2 h-8 px-3 rounded-[8px] border-[0.5px] border-hairline text-ink-soft hover:text-ink transition-colors text-[12.5px] focus-ring"
              style={{ background: "var(--surface)" }}
              aria-label={t("Open command palette")}
            >
              <IconSearch />
              <span>{t("Quick jump")}</span>
              <kbd
                className="ml-1 mono text-[10px] text-ink-mute px-1.5 py-0.5 rounded border-[0.5px] border-hairline"
                style={{ background: "var(--bg)" }}
              >
                ⌘K
              </kbd>
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-[1] flex-1 mx-auto w-full max-w-[1480px] px-7 pt-6 pb-20 animate-fade-in">
        {children}
      </main>

      <StatusBar />
      <TweaksPanel />

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
