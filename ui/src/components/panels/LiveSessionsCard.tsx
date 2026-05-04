import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLiveSessions, useSessionDetails, useLiveMessage, useLiveSessionStream } from "@/hooks/useQueries";
import { Card, CardContent, CardHeader, CardTitle, CardKicker, Sheet, Badge, EmptyState, Button, Skeleton, ExplainButton } from "@/components/ui";
import { Cpu, Terminal, Send, Hash, Wifi } from "lucide-react";
import { fmtCompact, fmtMs, fmtRel, projectName, shortenCwd } from "@/lib/format";
import type { LiveSession } from "@/lib/api";

export function LiveSessionsCard() {
  const { t } = useTranslation();
  const { data, isLoading } = useLiveSessions();
  const [openSid, setOpenSid] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardKicker>{t("Active")}</CardKicker>
          <CardTitle className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-ok dot-pulse" />
            {t("Live sessions")}
            <ExplainButton
              topic="live_sessions"
              label={t("Explain live sessions")}
              hint={t("Explain what counts as a live session and how to read the per-session metrics.")}
              data={{ count: data?.count ?? 0, sample: data?.rows.slice(0, 5).map((s) => ({ model: s.model, effective_tokens: s.effective_tokens, mtime_age_seconds: s.mtime_age_seconds, started_at: s.started_at })) }}
            />
          </CardTitle>
        </div>
        <Badge tone="muted">{data?.count ?? 0}</Badge>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[0,1].map((i) => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : !data || data.rows.length === 0 ? (
          <EmptyState
            icon={Wifi}
            title={t("No active sessions")}
            description={t("Start a Claude Code session and it will appear here within seconds.")}
          />
        ) : (
          <ul className="divide-y divide-border/50">
            {data.rows.map((s) => (
              <li key={s.session_id}>
                <button
                  type="button"
                  onClick={() => setOpenSid(s.session_id)}
                  className="w-full text-left py-2.5 flex items-center gap-3 group"
                >
                  <div className="h-8 w-8 rounded-lg bg-surface-2 border border-border grid place-items-center shrink-0">
                    <Terminal className="h-3.5 w-3.5 text-text-dim group-hover:text-text" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-text truncate">{s.title || s.session_id.slice(0, 8)}</div>
                    <div className="text-[11px] text-text-subtle mono truncate">
                      {projectName(s.cwd)} · {s.model || "—"} · {fmtRel(s.started_at)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-xs mono text-text">{fmtCompact(s.effective_tokens)}</div>
                    <div className="text-[10px] mono text-text-subtle">{s.mtime_age_seconds}s</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <LiveSessionDetail
        sid={openSid}
        liveRow={data?.rows.find((r) => r.session_id === openSid) ?? null}
        onClose={() => setOpenSid(null)}
      />
    </Card>
  );
}

function LiveSessionDetail({ sid, liveRow, onClose }: { sid: string | null; liveRow: LiveSession | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { data, isLoading } = useSessionDetails(sid);
  const { lastEventAt, done } = useLiveSessionStream(sid);
  const isLiveStreaming = lastEventAt !== null && !done && Date.now() - lastEventAt < 5000;
  const [reply, setReply] = useState("");
  const send = useLiveMessage();
  // Follow-ups are only delivered if the dispatcher spawned and is actively
  // draining the per-session queue file. Sessions started outside Mission
  // Control (IDE / terminal) won't see the messages we enqueue.
  const isStream = liveRow?.dispatcher_managed === true;

  return (
    <Sheet
      open={!!sid}
      onClose={onClose}
      title={liveRow?.title?.slice(0, 80) || sid?.slice(0, 8) || t("Session")}
      description={liveRow ? `${shortenCwd(liveRow.cwd)} · ${liveRow.model}` : undefined}
      width={520}
    >
      <div className="px-6 py-4 space-y-4">
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-lg border border-border bg-surface-2/50 px-3 py-2">
            <div className="kicker">{t("Tokens")}</div>
            <div className="text-base mono mt-1">{fmtCompact(data?.session.effective_tokens ?? liveRow?.effective_tokens ?? 0)}</div>
          </div>
          <div className="rounded-lg border border-border bg-surface-2/50 px-3 py-2">
            <div className="kicker">{t("Errors")}</div>
            <div className="text-base mono mt-1">{data?.session.error_count ?? "—"}</div>
          </div>
          <div className="rounded-lg border border-border bg-surface-2/50 px-3 py-2">
            <div className="kicker">{t("Started")}</div>
            <div className="text-xs text-text mt-1">{fmtRel(liveRow?.started_at)}</div>
          </div>
        </div>

        <div>
          <div className="kicker mb-2 flex items-center gap-2">
            <Hash className="h-3 w-3" />
            {t("Tool timeline")}
            {isLiveStreaming && (
              <span className="inline-flex items-center gap-1 ml-1">
                <span className="h-1.5 w-1.5 rounded-full bg-ok dot-pulse" />
                <span className="text-[10px] text-ok normal-case tracking-normal">{t("live")}</span>
              </span>
            )}
            {done && (
              <span className="text-[10px] text-text-subtle normal-case tracking-normal ml-1">{t("ended")}</span>
            )}
          </div>
          {isLoading ? (
            <div className="space-y-2">{[0,1,2].map((i) => <Skeleton key={i} className="h-8" />)}</div>
          ) : !data || data.tool_calls.length === 0 ? (
            <p className="text-xs text-text-subtle">{t("No tool calls yet.")}</p>
          ) : (
            <ul className="space-y-1 max-h-[36vh] overflow-y-auto pr-2 mono text-[11px]">
              {data.tool_calls.slice(-100).reverse().map((tc) => (
                <li key={tc.tool_use_id} className="flex items-center justify-between gap-3 py-1 border-b border-border/30">
                  <span className="text-text">{tc.tool_name}</span>
                  <span className={tc.error ? "text-err" : "text-text-subtle"}>
                    {tc.error ? t("✗ error") : tc.duration_ms !== null ? fmtMs(tc.duration_ms) : "…"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-border/60 pt-4">
          {isStream ? (
            <>
              <div className="kicker mb-2 flex items-center gap-2">
                <Cpu className="h-3 w-3" />
                {t("Send a follow-up")}
              </div>
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder={t("Add context, redirect, ask a question…")}
                className="w-full min-h-[88px] rounded-lg bg-surface-2 border border-border px-3 py-2 text-sm placeholder:text-text-subtle focus-ring resize-y"
              />
              <div className="flex justify-end mt-2">
                <Button
                  size="sm" variant="primary"
                  disabled={!reply.trim() || !sid || send.isPending}
                  onClick={async () => {
                    if (!sid) return;
                    await send.mutateAsync({ sid, body: reply });
                    setReply("");
                  }}
                >
                  <Send className="h-3 w-3" /> {t("Queue message")}
                </Button>
              </div>
            </>
          ) : (
            <div className="rounded-lg border-[0.5px] border-hairline p-3 text-[11.5px] text-ink-soft" style={{ background: "var(--surface)" }}>
              <p className="font-medium text-ink mb-1">{t("Lecture seule")}</p>
              <p>{t("Cette session n'a pas été lancée par Mission Control — les suivis envoyés ici ne seront pas délivrés. Pour piloter une session depuis le dashboard, mets-la en file via le Centre de contrôle (« Mettre une tâche en file ») et le dispatcher la spawnera.")}</p>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
