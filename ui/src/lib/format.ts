// Display formatters. All small, all pure.

export function fmtCompact(n: number | null | undefined, fixed = 1): string {
  if (n === null || n === undefined) return "—";
  const v = Math.abs(n);
  if (v >= 1e9) return (n / 1e9).toFixed(fixed).replace(/\.0$/, "") + "B";
  if (v >= 1e6) return (n / 1e6).toFixed(fixed).replace(/\.0$/, "") + "M";
  if (v >= 1e3) return (n / 1e3).toFixed(fixed).replace(/\.0$/, "") + "K";
  return String(Math.round(n));
}

export function fmtMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 10_000) return `${(ms / 1000).toFixed(2)}s`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m${String(s).padStart(2, "0")}`;
}

export function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

export function fmtRel(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const sec = Math.max(0, Math.round((now - t) / 1000));
  if (sec < 5)   return "just now";
  if (sec < 60)  return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60)  return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24)   return `${hr} hr ago`;
  const day = Math.round(hr / 24);
  if (day < 14)  return `${day}d ago`;
  return new Date(t).toLocaleDateString();
}

export function fmtAge(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

export function shortenCwd(cwd: string | null | undefined): string {
  if (!cwd) return "—";
  return cwd.replace(/^\/Users\/[^/]+/, "~");
}

export function projectName(cwd: string | null | undefined): string {
  if (!cwd) return "—";
  const parts = cwd.replace(/\/$/, "").split("/");
  return parts[parts.length - 1] || cwd;
}
