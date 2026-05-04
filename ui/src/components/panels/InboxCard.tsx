import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useInbox, useInboxRead, useInboxReply } from "@/hooks/useQueries";
import { Card, CardContent, CardHeader, CardKicker, CardTitle, Skeleton, EmptyState, Button, Badge, ExplainButton } from "@/components/ui";
import { Inbox, Send, Check } from "lucide-react";
import { fmtRel } from "@/lib/format";

export function InboxCard() {
  const { t } = useTranslation();
  const { data, isLoading } = useInbox({ unread: 1 });
  const markRead = useInboxRead();
  const reply = useInboxReply();
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  return (
    <Card>
      <CardHeader>
        <div>
          <CardKicker>{t("HITL")}</CardKicker>
          <CardTitle className="flex items-center gap-2">
            <Inbox className="h-3.5 w-3.5 text-info" />
            {t("Inbox")}
            <ExplainButton
              topic="inbox"
              label={t("Explain inbox")}
              hint={t("Explain what shows up in this inbox and how to triage it.")}
              data={{ unread_count: data?.rows.length ?? 0, sample: data?.rows.slice(0, 3).map((m) => ({ direction: m.direction, body: m.body?.slice(0, 200), created_at: m.created_at })) }}
            />
          </CardTitle>
        </div>
        <Badge tone={data && data.rows.length > 0 ? "info" : "muted"}>{data?.rows.length ?? 0}</Badge>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">{[0,1].map((i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : !data || data.rows.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={t("Inbox is clear")}
            description={t("Agents post non-blocking notes here via INBOX: markers. Reply, mark read, or dismiss.")}
          />
        ) : (
          <ul className="space-y-2">
            {data.rows.filter((m) => m.direction === "agent_to_user").map((m) => (
              <li key={m.id} className="rounded-lg border border-border bg-surface-2/40 p-3">
                <p className="text-[12px] text-text whitespace-pre-wrap">{m.body}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px] mono text-text-subtle">
                    {m.session_id ? m.session_id.slice(0, 8) : t("no-session")} · {fmtRel(m.created_at)}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm" variant="ghost"
                      onClick={() => markRead.mutate(m.id)}
                      disabled={markRead.isPending}
                    >
                      <Check className="h-3 w-3" /> {t("Mark read")}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => { setReplyTo(m.id); setDraft(""); }}
                    >
                      {t("Reply")}
                    </Button>
                  </div>
                </div>
                {replyTo === m.id && (
                  <div className="mt-2 flex gap-2 items-stretch">
                    <textarea
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      className="flex-1 min-h-[44px] rounded-md bg-bg border border-border px-3 py-2 text-sm focus-ring resize-y"
                    />
                    <Button
                      size="sm" variant="primary"
                      disabled={!draft.trim() || reply.isPending}
                      onClick={async () => {
                        await reply.mutateAsync({ id: m.id, body: draft });
                        setReplyTo(null);
                      }}
                    >
                      <Send className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
