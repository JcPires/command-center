import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { useBodyAttr } from "@/hooks/useBodyAttr";

type Tone = "default" | "ok" | "warn" | "err" | "info" | "accent" | "muted";
type Variant = "soft" | "outline" | "solid";

const TONE_COLOR: Record<Tone, string> = {
  default: "var(--ink-soft)",
  ok:      "var(--pos)",
  warn:    "var(--warn)",
  err:     "var(--neg)",
  info:    "var(--info)",
  accent:  "var(--acc)",
  muted:   "var(--ink-mute)",
};

export function Badge({
  className, tone = "default", variant, style, ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone; variant?: Variant }) {
  const bodyVariant = useBodyAttr("data-badge");
  const fallback: Variant =
    bodyVariant === "outline" || bodyVariant === "solid" ? bodyVariant : "soft";
  const v: Variant = variant ?? fallback;
  const c = TONE_COLOR[tone];
  const variantStyle =
    v === "solid"
      ? { background: c, color: "var(--hero-ink)", borderColor: c }
      : v === "outline"
        ? { background: "transparent", color: c, borderColor: `color-mix(in oklab, ${c} 45%, transparent)` }
        : { background: `color-mix(in oklab, ${c} 14%, transparent)`, color: c, borderColor: `color-mix(in oklab, ${c} 30%, transparent)` };

  return (
    <span
      style={{ ...variantStyle, ...style }}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border-[0.5px] px-2 py-0.5",
        "text-[10.5px] font-medium uppercase tracking-[0.10em] mono tnum",
        className
      )}
      {...rest}
    />
  );
}
