import { cn } from "@/lib/cn";

export type SegmentedOption<T extends string> = { value: T; label: string };

type Variant = "primary" | "subtle";
type Size = "sm" | "md";

type Props<T extends string> = {
  value: T;
  onChange: (v: T) => void;
  options: SegmentedOption<T>[];
  /** "primary" → active uses accent color (default). "subtle" → active is bg-card. */
  variant?: Variant;
  /** "sm" = compact (h-7), "md" = normal (h-8). */
  size?: Size;
  /** Stretch buttons to fill the container. */
  fullWidth?: boolean;
  className?: string;
};

const PRIMARY_ACTIVE_STYLE: React.CSSProperties = {
  backgroundImage: "var(--acc-grad)",
  color: "var(--on-acc)",
  boxShadow:
    "0 0 0 0.5px color-mix(in oklab, var(--acc) 60%, black) inset, 0 1px 0 rgb(255 255 255 / 0.22) inset",
};

const SUBTLE_ACTIVE_STYLE: React.CSSProperties = {
  background: "var(--bg-card)",
  color: "var(--ink)",
};

const HEIGHT: Record<Size, string> = {
  sm: "h-7",
  md: "h-8",
};

const TEXT: Record<Size, string> = {
  sm: "text-[10.5px]",
  md: "text-[11.5px]",
};

const FONT_STYLES: Record<Variant, string> = {
  primary: "mono uppercase tracking-[0.10em] font-medium",
  subtle:  "font-medium",
};

export function Segmented<T extends string>({
  value, onChange, options, variant = "primary", size = "sm", fullWidth = false, className,
}: Props<T>) {
  return (
    <div
      className={cn(
        "inline-flex items-center p-0.5 rounded-[8px] border-[0.5px] border-hairline",
        fullWidth && "w-full",
        className,
      )}
      style={{ background: "var(--surface)" }}
      role="tablist"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-[6px] px-2.5 transition-colors",
              HEIGHT[size],
              TEXT[size],
              FONT_STYLES[variant],
              fullWidth && "flex-1",
              !active && "text-ink-mute hover:text-ink-soft",
            )}
            style={active
              ? (variant === "primary" ? PRIMARY_ACTIVE_STYLE : SUBTLE_ACTIVE_STYLE)
              : undefined
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
