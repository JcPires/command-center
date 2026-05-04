import { useEffect, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/cn";

interface Props {
  id: string;
  title: string;
  subtitle?: ReactNode;
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

export function CollapsibleSection({
  id, title, subtitle, summary, defaultOpen = true, children, className,
}: Props) {
  const storageKey = `cc:section:${id}`;
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return defaultOpen;
    const v = window.localStorage.getItem(storageKey);
    return v === null ? defaultOpen : v === "1";
  });

  useEffect(() => {
    try { window.localStorage.setItem(storageKey, open ? "1" : "0"); }
    catch { /* ignore */ }
  }, [open, storageKey]);

  return (
    <section className={cn("space-y-3", className)}>
      <header className="flex items-center justify-between gap-3 px-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={`section-${id}`}
          className={cn(
            "group inline-flex items-center gap-2 -ml-1 px-1 py-1 rounded-md",
            "hover:bg-surface-2/60 transition-colors focus-ring"
          )}
        >
          <ChevronRight
            className={cn(
              "h-4 w-4 text-text-subtle transition-transform duration-200",
              open && "rotate-90"
            )}
            strokeWidth={2.5}
          />
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {subtitle && (
            <span className="text-xs text-text-subtle ml-1">{subtitle}</span>
          )}
        </button>
        {summary && (
          <div className="text-xs text-text-dim">{summary}</div>
        )}
      </header>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={`section-${id}`}
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
