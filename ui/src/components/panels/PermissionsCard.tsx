import { useTranslation } from "react-i18next";
import { useDecisions, useDecisionAnswer } from "@/hooks/useQueries";
import { Card, EmptyState, Skeleton } from "@/components/ui";
import { fmtRel } from "@/lib/format";

function IconShield() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" />
    </svg>
  );
}
function IconLock() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x={4} y={11} width={16} height={9} rx={2}/>
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12.5 10 17.5 19.5 7" />
    </svg>
  );
}
function IconX() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 6 18 18 M18 6 6 18" />
    </svg>
  );
}

const SUMMARY_MAX = 96;

function summarize(prompt: string): string {
  const trimmed = prompt.replace(/\s+/g, " ").trim();
  return trimmed.length > SUMMARY_MAX ? trimmed.slice(0, SUMMARY_MAX - 1) + "…" : trimmed;
}

export function PermissionsCard() {
  const { t } = useTranslation();
  const { data, isLoading } = useDecisions("pending");
  const answer = useDecisionAnswer();

  const rows = (data?.rows ?? []).slice(0, 6);

  return (
    <Card>
      <div className="card-head justify-between">
        <div>
          <div className="kicker">{t("Permissions")}</div>
          <h3 className="text-[14.5px] font-semibold tracking-[-0.005em] font-display mt-0.5">
            {t("Permissions système")}
          </h3>
        </div>
        {data && (
          <span className="kicker">
            {data.rows.length} {t("en attente")}
          </span>
        )}
      </div>
      <div className="card-body">
        {isLoading ? (
          <Skeleton className="h-[200px]" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={IconLock}
            title={t("Aucune permission en attente")}
            description={t("Quand un agent demande une élévation (Bash, Edit, WebFetch), elle apparaîtra ici pour validation rapide.")}
          />
        ) : (
          <ul className="divide-y divide-hairline">
            {rows.map((d) => (
              <li
                key={d.id}
                className="grid grid-cols-[28px_1fr_120px_auto] items-center gap-3 py-2.5"
              >
                <div
                  className="h-7 w-7 rounded-[8px] grid place-items-center"
                  style={{ background: "var(--acc-soft)", color: "var(--acc)" }}
                >
                  <IconShield />
                </div>
                <code className="mono text-[12px] text-ink truncate" title={d.prompt}>
                  {summarize(d.prompt)}
                </code>
                <span className="mono text-[10.5px] text-ink-mute uppercase tracking-[0.10em]">
                  {fmtRel(d.created_at)}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={answer.isPending}
                    onClick={() => answer.mutate({ id: d.id, answer: "approve" })}
                    className="h-7 w-7 grid place-items-center rounded-[8px] border-[0.5px] focus-ring disabled:opacity-50"
                    style={{
                      color: "var(--pos)",
                      borderColor: "color-mix(in oklab, var(--pos) 35%, transparent)",
                      background: "color-mix(in oklab, var(--pos) 10%, transparent)",
                    }}
                    aria-label={t("Approve")}
                    title={t("Approve")}
                  >
                    <IconCheck />
                  </button>
                  <button
                    type="button"
                    disabled={answer.isPending}
                    onClick={() => answer.mutate({ id: d.id, answer: "deny" })}
                    className="h-7 w-7 grid place-items-center rounded-[8px] border-[0.5px] focus-ring disabled:opacity-50"
                    style={{
                      color: "var(--neg)",
                      borderColor: "color-mix(in oklab, var(--neg) 35%, transparent)",
                      background: "color-mix(in oklab, var(--neg) 10%, transparent)",
                    }}
                    aria-label={t("Deny")}
                    title={t("Deny")}
                  >
                    <IconX />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
