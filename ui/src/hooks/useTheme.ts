import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";
export type Palette = "indigo" | "slate" | "mono" | "ocean" | "sunset" | "lavender" | "ember" | "arctic";

export const PALETTE_VALUES: Palette[] = ["indigo", "slate", "mono", "ocean", "sunset", "lavender", "ember", "arctic"];
export type Density = "compact" | "regular" | "comfy";

const KEY_THEME = "cc-theme";
const KEY_PALETTE = "cc-palette";
const KEY_DENSITY = "cc-density";

function readStored<T extends string>(key: string, allowed: readonly T[]): T | null {
  try {
    const v = localStorage.getItem(key);
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : null;
  } catch {
    return null;
  }
}

function systemPrefersDark(): boolean {
  return typeof window !== "undefined"
    && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.body.setAttribute("data-theme", theme);
}
function applyPalette(p: Palette) {
  document.body.setAttribute("data-palette", p);
}
function applyDensity(d: Density) {
  document.body.setAttribute("data-density", d);
}

function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  const v = document.body.getAttribute("data-theme");
  return v === "light" ? "light" : "dark";
}
function currentPalette(): Palette {
  if (typeof document === "undefined") return "indigo";
  const v = document.body.getAttribute("data-palette") as Palette | null;
  return v ?? "indigo";
}
function currentDensity(): Density {
  if (typeof document === "undefined") return "regular";
  const v = document.body.getAttribute("data-density") as Density | null;
  return v ?? "regular";
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => currentTheme());

  useEffect(() => {
    applyTheme(theme);
    try { localStorage.setItem(KEY_THEME, theme); } catch { /* noop */ }
  }, [theme]);

  useEffect(() => {
    if (readStored(KEY_THEME, ["light", "dark"] as const)) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setThemeState(e.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggle = useCallback(() => setThemeState((t) => (t === "dark" ? "light" : "dark")), []);

  return { theme, setTheme, toggle };
}

export function usePalette() {
  const [palette, setPaletteState] = useState<Palette>(() => currentPalette());
  useEffect(() => {
    applyPalette(palette);
    try { localStorage.setItem(KEY_PALETTE, palette); } catch { /* noop */ }
  }, [palette]);
  return { palette, setPalette: setPaletteState };
}

export function useDensity() {
  const [density, setDensityState] = useState<Density>(() => currentDensity());
  useEffect(() => {
    applyDensity(density);
    try { localStorage.setItem(KEY_DENSITY, density); } catch { /* noop */ }
  }, [density]);
  return { density, setDensity: setDensityState };
}

function useBodyToggle(key: string, attr: string, defaultOn = true) {
  const [on, setOn] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? defaultOn : v === "1";
    } catch {
      return defaultOn;
    }
  });
  useEffect(() => {
    document.body.setAttribute(attr, on ? "on" : "off");
    try { localStorage.setItem(key, on ? "1" : "0"); } catch { /* noop */ }
  }, [on, attr, key]);
  return { on, setOn, toggle: () => setOn((v) => !v) };
}

export const useDecor    = () => useBodyToggle("cc-decor",    "data-decor",    true);
export const useGrid     = () => useBodyToggle("cc-grid",     "data-grid",     true);

export function useMotion() {
  const [on, setOn] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem("cc-motion");
      return v === null ? true : v === "1";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    document.body.classList.toggle("no-motion", !on);
    try { localStorage.setItem("cc-motion", on ? "1" : "0"); } catch { /* noop */ }
  }, [on]);
  return { on, setOn, toggle: () => setOn((v) => !v) };
}

export function initTheme(): { theme: Theme; palette: Palette; density: Density } {
  const stored = readStored(KEY_THEME, ["light", "dark"] as const);
  const theme: Theme = stored ?? (systemPrefersDark() ? "dark" : "light");
  const palette = readStored(KEY_PALETTE, PALETTE_VALUES) ?? "indigo";
  const density = readStored(KEY_DENSITY, ["compact", "regular", "comfy"] as const) ?? "regular";
  applyTheme(theme);
  applyPalette(palette);
  applyDensity(density);
  return { theme, palette, density };
}
