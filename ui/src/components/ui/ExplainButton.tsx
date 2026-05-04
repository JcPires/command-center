import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { HelpCircle, Send, Sparkles, User } from "lucide-react";
import { Sheet } from "./Sheet";
import { Skeleton } from "./Skeleton";
import { cn } from "@/lib/cn";

interface Props {
  topic: string;
  data?: unknown;
  hint?: string;
  label?: string;
  className?: string;
}

interface Turn { role: "user" | "assistant"; content: string; }

interface InitResponse { explanation: string; cached: boolean; session_id: string | null; }
interface ContinueResponse { explanation: string; session_id: string | null; }

export function ExplainButton({ topic, data, hint, label, className }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [cachedFromDb, setCachedFromDb] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<"initial" | "follow" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const sendInitial = async () => {
    setPending("initial");
    setError(null);
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, data, hint }),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const json: InitResponse = await res.json();
      setTurns([{ role: "assistant", content: json.explanation }]);
      setSessionId(json.session_id);
      setCachedFromDb(json.cached);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setPending(null);
    }
  };

  const sendFollowUp = async () => {
    const text = draft.trim();
    if (!text || pending) return;
    setDraft("");
    setError(null);
    setTurns((ts) => [...ts, { role: "user", content: text }]);
    setPending("follow");
    try {
      // If the initial call was served from cache, we don't have a
      // session_id — restart a fresh conversation transparently.
      const endpoint = sessionId ? "/api/explain/continue" : "/api/explain";
      const body = sessionId
        ? { session_id: sessionId, message: text }
        : { topic, data, hint: `${hint || ""}\n\nQuestion de suivi: ${text}` };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const json: ContinueResponse = await res.json();
      setTurns((ts) => [...ts, { role: "assistant", content: json.explanation }]);
      if (json.session_id) setSessionId(json.session_id);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setPending(null);
    }
  };

  const onOpen = () => {
    setOpen(true);
    if (turns.length === 0 && pending === null) sendInitial();
  };

  // Auto-scroll to the newest turn.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns, pending]);

  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        aria-label={t("Explain")}
        title={t("Explain")}
        className={cn(
          "inline-flex items-center justify-center h-5 w-5 rounded-md text-text-subtle",
          "hover:text-accent hover:bg-accent/10 transition-colors focus-ring",
          className,
        )}
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={
          <span className="inline-flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            {label || topic}
          </span>
        }
        description={t("Explained by Claude (Haiku, your subscription)")}
        width={560}
      >
        <div className="flex flex-col h-full">
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {data !== undefined && (
              <details className="text-[11px] text-text-subtle">
                <summary className="cursor-pointer hover:text-text-dim mono">{t("data inspected")}</summary>
                <pre className="mt-2 p-2 rounded bg-surface-2/60 border border-border/40 overflow-x-auto mono">
                  {JSON.stringify(data, null, 2)}
                </pre>
              </details>
            )}

            {turns.map((turn, i) => (
              <Bubble key={i} role={turn.role}>{turn.content}</Bubble>
            ))}

            {pending === "initial" && (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-3/4" />
                <p className="text-[11px] text-text-subtle italic mt-3">{t("Asking Claude (~5–15s)…")}</p>
              </div>
            )}
            {pending === "follow" && (
              <div className="flex items-center gap-2 text-[12px] text-text-subtle italic">
                <span className="h-1.5 w-1.5 rounded-full bg-accent dot-pulse" />
                {t("Claude is thinking…")}
              </div>
            )}
            {turns.length > 0 && cachedFromDb && pending === null && (
              <p className="text-[10px] kicker text-text-subtle">{t("Initial answer from cache (24h)")}</p>
            )}
            {error && (
              <div className="rounded-md border border-err/40 bg-err/5 p-3 text-xs text-err">
                {error}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); sendFollowUp(); }}
            className="border-t border-border/60 p-3 flex items-end gap-2 bg-surface/50"
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendFollowUp();
                }
              }}
              placeholder={t("Ask a follow-up… (Shift+Enter for newline)")}
              disabled={pending !== null}
              rows={2}
              className="flex-1 resize-none rounded-lg bg-surface-2 border border-border px-3 py-2 text-sm placeholder:text-text-subtle focus-ring disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!draft.trim() || pending !== null}
              className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-gradient-to-br from-accent to-accent2 text-white shadow-[0_4px_24px_-8px_rgba(77,124,255,0.5)] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed focus-ring"
              aria-label={t("Send")}
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      </Sheet>
    </>
  );
}

function Bubble({ role, children }: { role: "user" | "assistant"; children: React.ReactNode }) {
  const isUser = role === "user";
  return (
    <div className={cn("flex gap-2.5", isUser ? "flex-row-reverse" : "flex-row")}>
      <div className={cn(
        "h-6 w-6 shrink-0 rounded-md grid place-items-center mt-0.5",
        isUser ? "bg-surface-2 text-text-dim" : "bg-accent/15 text-accent"
      )}>
        {isUser ? <User className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
      </div>
      <div className={cn(
        "rounded-xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap max-w-[85%]",
        isUser ? "bg-accent/10 text-text" : "bg-surface-2/60 text-text border border-border/40"
      )}>
        {children}
      </div>
    </div>
  );
}
