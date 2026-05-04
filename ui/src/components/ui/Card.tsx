import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...rest }, ref) => (
    <div ref={ref}
      className={cn(
        "relative rounded-card bg-bg-card",
        "border-[0.5px] border-hairline shadow-card",
        "transition-colors duration-150",
        className
      )}
      {...rest}
    />
  )
);
Card.displayName = "Card";

export function CardHeader({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-[var(--pad-card)] pt-[14px] pb-3 flex items-start justify-between gap-3", className)} {...rest} />;
}

export function CardTitle({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-[14.5px] font-semibold tracking-[-0.005em] font-display", className)} {...rest} />;
}

export function CardKicker({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("kicker block mb-1", className)} {...rest} />;
}

export function CardDescription({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-xs text-ink-soft mt-1", className)} {...rest} />;
}

export function CardContent({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-[var(--pad-card)] pb-[var(--pad-card)]", className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-[var(--pad-card)] py-4 border-t-[0.5px] border-hairline flex items-center gap-2", className)} {...rest} />;
}
