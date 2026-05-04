import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        /* Surfaces / inks via RGB triplet for <alpha-value> support */
        bg:           "rgb(var(--bg-rgb) / <alpha-value>)",
        "bg-elev":    "rgb(var(--bg-elev-rgb) / <alpha-value>)",
        "bg-card":    "rgb(var(--bg-card-rgb) / <alpha-value>)",
        ink:          "rgb(var(--ink-rgb) / <alpha-value>)",
        text:         "rgb(var(--ink-rgb) / <alpha-value>)",

        /* Tokens served as colors directly (no alpha modifier needed) */
        surface:      "var(--surface)",
        "surface-2":  "var(--surface-2)",
        hairline:     "var(--hairline)",
        "hairline-strong": "var(--hairline-strong)",
        "ink-soft":   "var(--ink-soft)",
        "ink-mute":   "var(--ink-mute)",
        "ink-faint":  "var(--ink-faint)",

        /* Palette accents */
        acc:          "var(--acc)",
        "acc-2":      "var(--acc-2)",
        "acc-3":      "var(--acc-3)",
        "acc-soft":   "var(--acc-soft)",
        pos:          "var(--pos)",
        neg:          "var(--neg)",
        warn:         "var(--warn)",
        info:         "var(--info)",
        "mdl-opus":   "var(--mdl-opus)",
        "mdl-sonnet": "var(--mdl-sonnet)",
        "mdl-haiku":  "var(--mdl-haiku)",

        /* Legacy aliases */
        border:        "var(--hairline)",
        "border-glow": "var(--hairline-strong)",
        "text-dim":    "var(--ink-soft)",
        "text-subtle": "var(--ink-mute)",
        accent:        "var(--acc)",
        accent2:       "var(--acc-3)",
        ok:            "var(--pos)",
        err:           "var(--neg)",

        /* Special surfaces/2 for /60 etc. — fall back to direct value */
        "surface-rgb": "rgb(255 255 255 / <alpha-value>)",
      },
      fontFamily: {
        sans:    ["Geist", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        display: ["Geist", "ui-sans-serif", "system-ui", "sans-serif"],
        mono:    ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: { lg: "12px", xl: "14px", "2xl": "18px", card: "var(--radius-card)" },
      boxShadow: {
        card: "var(--shadow-card)",
        soft: "0 1px 0 rgba(255,255,255,0.04) inset, 0 1px 2px rgba(0,0,0,0.18)",
        glow: "0 0 0 0.5px var(--hairline-strong), 0 8px 32px -16px var(--acc-soft)",
      },
      letterSpacing: { kicker: "0.10em", display: "-0.025em" },
      animation: {
        "fade-in": "fadeIn 220ms cubic-bezier(0.2, 0, 0, 1)",
        "slide-in-right": "slideInRight 220ms cubic-bezier(0.2, 0, 0, 1)",
      },
      keyframes: {
        fadeIn: { from: { opacity: "0", transform: "translateY(2px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        slideInRight: { from: { transform: "translateX(100%)" }, to: { transform: "translateX(0)" } },
      },
    },
  },
  plugins: [],
} satisfies Config;
