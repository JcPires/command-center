import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useDecisions, useDecisionAnswer } from "@/hooks/useQueries";
import { Card, CardContent, CardHeader, CardKicker, CardTitle, Skeleton, EmptyState, Button, Badge, ExplainButton } from "@/components/ui";
import { MessageSquare, Check } from "lucide-react";
import { fmtRel } from "@/lib/format";

export function DecisionsCard() {
  const { t } = useTranslation();
  const { data, isLoading } = useDecisions("pending");
  const answer = useDecisionAnswer();
  const [openId, setOpenId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  return (
    <Card>
      <CardHeader>
        <div>
          <CardKicker>{t("HITL")}</CardKicker>
          <CardTitle className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-warn dot-pulse" />
            {t("Pending decisions")}
            <ExplainButton
              topic="pending_decisions"
              label={t("Explain decisions queue")}
              hint={t("Explain how the pending decisions queue works and when each item should be answered.")}
              data={{ pending_count: data?.rows.length ?? 0, sample: data?.rows.slice(0, 3).map((d) => ({ session_id: d.session_id, prompt: d.prompt?.slice(0, 200), created_at: d.created_at })) }}
            />
          </CardTitle>
        </div>
        <Badge tone={data && data.rows.length > 0 ? "warn" : "muted"}>{data?.rows.length ?? 0}</Badge>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">{[0,1].map((i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : !data || data.rows.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title={t("No decisions queued")}
            description={t("Dispatcher injects DECISION: markers from streaming sessions. Replies are wired into the queue automatically.")}
          />
        ) : (
          <ul className="space-y-2">
            {data.rows.map((d) => {
              const open = openId === d.id;
              return (
                <li key={d.id} className="rounded-lg border border-border bg-surface-2/40 p-3">
                  <div className="flex items-start gap-3">
                    <MessageSquare className="h-3.5 w-3.5 text-warn mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] text-text whitespace-pre-wrap line-clamp-3">{d.prompt}</p>
                      <div className="text-[10px] mono text-text-subtle mt-1">
                        {d.session_id ? d.session_id.slice(0, 8) : t("no-session")} · {fmtRel(d.created_at)}
                      </div>
                    </div>
                    {!open && (
                      <Button size="sm" onClick={() => { setOpenId(d.id); setDraft(""); }}>{t("Answer")}</Button>
                    )}
                  </div>
                  {open && (
                    <div className="mt-3 flex gap-2 items-stretch">
                      <textarea
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        className="flex-1 min-h-[60px] rounded-md bg-bg border border-border px-3 py-2 text-sm focus-ring resize-y"
                        placeholder={t("Your answer…")}
                      />
                      <div className="flex flex-col gap-2 shrink-0">
                        <Button
                          size="sm" variant="primary"
                          disabled={!draft.trim() || answer.isPending}
                          onClick={async () => {
                            await answer.mutateAsync({ id: d.id, answer: draft });
                            setOpenId(null);
                          }}
                        >
                          <Check className="h-3 w-3" /> {t("Send")}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setOpenId(null)}>{t("Cancel")}</Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
