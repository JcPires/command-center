import { cn } from "@/lib/cn";

type Tone = "ok" | "warn" | "err" | "info" | "muted";

const TONE_COLORS: Record<Tone, { dot: string; text: string }> = {
  ok:    { dot: "bg-ok",    text: "text-ok" },
  warn:  { dot: "bg-warn",  text: "text-warn" },
  err:   { dot: "bg-err",   text: "text-err" },
  info:  { dot: "bg-info",  text: "text-info" },
  muted: { dot: "bg-text-subtle", text: "text-text-dim" },
};

export function StatePill({
  label, tone, value, pulse,
}: { label: string; tone: Tone; value?: string; pulse?: boolean }) {
  const c = TONE_COLORS[tone];
  return (
    <div className="inline-flex items-center gap-2 rounded-md border-[0.5px] border-hairline bg-surface-2 px-2.5 py-1">
      <span className={cn("h-1.5 w-1.5 rounded-full", c.dot, pulse && "dot-pulse")} />
      <span className="kicker !text-[10px] !text-text-dim">{label}</span>
      {value !== undefined && (
        <span className={cn("mono text-xs font-medium", c.text)}>{value}</span>
      )}
    </div>
  );
}
