import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, Command, Layers, Plus, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";

interface Action {
  id: string;
  label: string;
  hint?: string;
  icon: typeof Command;
  run: () => void;
}

function fuzzyScore(q: string, target: string): number {
  q = q.toLowerCase(); target = target.toLowerCase();
  if (!q) return 1;
  if (target.includes(q)) return 5 - target.indexOf(q) / target.length;
  // crude fuzzy: count matching chars in order
  let i = 0, j = 0, hits = 0;
  while (i < q.length && j < target.length) {
    if (q[i] === target[j]) { hits++; i++; }
    j++;
  }
  return hits === q.length ? 0.5 : 0;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();

  useEffect(() => { if (open) { setQuery(""); setActive(0); setTimeout(() => inputRef.current?.focus(), 30); } }, [open]);

  const allActions: Action[] = useMemo(() => [
    { id: "nav-command",  label: t("Go to Command"),     icon: Command,  run: () => { navigate({ to: "/" }); onClose(); } },
    { id: "nav-activity", label: t("Go to Activity"),    icon: Activity, run: () => { navigate({ to: "/activity" }); onClose(); } },
    { id: "nav-skills",   label: t("Go to Skills & MCP"), icon: Layers,   run: () => { navigate({ to: "/skills" }); onClose(); } },
    { id: "queue-task",   label: t("Queue a task…"),     hint: t("open task composer"), icon: Plus,
      run: () => { window.dispatchEvent(new CustomEvent("cc:queue-task")); onClose(); } },
  ], [navigate, onClose, t]);

  const filtered = useMemo(() => {
    return allActions
      .map((a) => ({ a, s: Math.max(fuzzyScore(query, a.label), fuzzyScore(query, a.hint || "")) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.a);
  }, [allActions, query]);

  useEffect(() => { if (active >= filtered.length) setActive(0); }, [filtered, active]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center pt-[14vh] px-4"
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.99 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.99 }}
            transition={{ duration: 0.18 }}
            className="relative w-full max-w-xl rounded-2xl border border-border bg-surface shadow-glow gradient-border overflow-hidden"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(filtered.length - 1, a + 1)); }
              if (e.key === "ArrowUp")   { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
              if (e.key === "Enter")     { e.preventDefault(); filtered[active]?.run(); }
              if (e.key === "Escape")    onClose();
            }}
          >
            <div className="flex items-center gap-3 px-4 h-12 border-b border-border/70">
              <Search className="h-4 w-4 text-text-subtle" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("Type a command or page name…")}
                className="flex-1 bg-transparent border-0 outline-none text-sm placeholder:text-text-subtle"
              />
              <kbd className="mono text-[10px] text-text-subtle px-1.5 py-0.5 rounded border border-border bg-bg">esc</kbd>
            </div>
            <ul className="max-h-[50vh] overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-4 py-6 text-center text-xs text-text-subtle">{t("No matches.")}</li>
              ) : filtered.map((a, i) => {
                const Icon = a.icon;
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => a.run()}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors",
                        i === active ? "bg-surface-2 text-text" : "text-text-dim hover:text-text"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 text-text-subtle" />
                      <span className="flex-1">{a.label}</span>
                      {a.hint && <span className="text-[11px] text-text-subtle">{a.hint}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
