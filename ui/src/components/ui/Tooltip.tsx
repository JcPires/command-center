import { type ReactNode, useState } from "react";
import { cn } from "@/lib/cn";

export function Tooltip({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          className={cn(
            "absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full",
            "z-50 whitespace-nowrap rounded-md border border-border bg-surface-2 px-2 py-1",
            "text-[11px] text-text shadow-lg",
            "before:content-[''] before:absolute before:left-1/2 before:-translate-x-1/2 before:top-full",
            "before:h-1.5 before:w-1.5 before:rotate-45 before:bg-surface-2 before:border-r before:border-b before:border-border before:-mt-1"
          )}
        >
          {label}
        </span>
      )}
    </span>
  );
}
