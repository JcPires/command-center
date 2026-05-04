import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "text-white bg-gradient-to-br from-accent to-accent2 hover:brightness-110 shadow-[0_4px_24px_-8px_rgba(77,124,255,0.5)]",
  secondary:
    "text-text bg-surface-2 border border-border hover:border-border-glow hover:bg-surface",
  ghost:
    "text-text-dim hover:text-text hover:bg-surface-2/60",
  danger:
    "text-white bg-err hover:brightness-110 shadow-[0_4px_24px_-8px_rgb(239_68_68/0.5)]",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-9 px-4 text-sm gap-2",
};

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ className, variant = "secondary", size = "md", ...rest }, ref) => (
    <button ref={ref}
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium",
        "transition-[background,color,box-shadow,transform] duration-150",
        "active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed focus-ring",
        VARIANTS[variant], SIZES[size],
        className
      )}
      {...rest}
    />
  )
);
Button.displayName = "Button";
