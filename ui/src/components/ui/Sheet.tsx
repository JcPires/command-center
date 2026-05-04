import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  width?: number; // px
}

export function Sheet({ open, onClose, title, description, children, width = 460 }: Props) {
  const { t } = useTranslation();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 backdrop-blur-md"
            style={{ background: "color-mix(in oklab, var(--bg) 15%, transparent)" }}
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
            style={{
              width,
              background: "color-mix(in oklab, var(--bg-card) 78%, transparent)",
            }}
            className={cn(
              "relative h-full max-w-full border-l-[0.5px] border-hairline-strong",
              "backdrop-blur-2xl flex flex-col shadow-2xl",
            )}
          >
            {(title || description) && (
              <header className="flex items-start justify-between gap-3 px-6 py-5 border-b-[0.5px] border-hairline">
                <div className="min-w-0">
                  {title && <h2 className="text-base font-semibold tracking-tight truncate">{title}</h2>}
                  {description && <p className="text-xs text-text-dim mt-1">{description}</p>}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t("Close")}
                  className="p-1.5 rounded-md text-text-dim hover:bg-surface-2 hover:text-text focus-ring"
                >
                  <X className="h-4 w-4" />
                </button>
              </header>
            )}
            <div className="flex-1 overflow-y-auto">{children}</div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
