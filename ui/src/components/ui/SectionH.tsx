import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export function SectionH({
  title, meta, children, defaultOpen = true, id,
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section id={id} className="mb-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 py-1.5 group focus-ring rounded"
        aria-expanded={open}
      >
        <span
          className="h-1.5 w-1.5 rounded-full transition-colors"
          style={{ background: open ? "var(--acc)" : "var(--ink-faint)" }}
          aria-hidden
        />
        <h2 className="font-display font-semibold text-[16px] tracking-[-0.012em] text-ink m-0">
          {title}
        </h2>
        <span className="flex-1 h-px bg-gradient-to-r from-hairline to-transparent" />
        {meta && <span className="mono text-[10px] tracking-[0.10em] uppercase text-ink-mute">{meta}</span>}
        <svg
          width={11} height={11} viewBox="0 0 12 12"
          className={cn("text-ink-faint transition-transform ml-1", open ? "rotate-90" : "")}
          aria-hidden
        >
          <path d="M4 2.5 L8 6 L4 9.5" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && <div className="mt-3 space-y-[var(--gap-xl)]">{children}</div>}
    </section>
  );
}
