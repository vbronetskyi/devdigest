/* BriefCard — the PR's risk brief (HW L05 SPEC-03): risk pills that expand to
   why, a "read these first" list, other PRs on the same files, and who wrote it.
   Opening the PR is free; Generate / Regenerate is the one model call. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, Markdown, SectionLabel, Skeleton } from "@devdigest/ui";
import type { Risk, RiskBrief } from "@devdigest/shared";
import { useBrief, useGenerateBrief } from "@/lib/hooks/brief";
import { ApiError } from "@/lib/api";
import { formatCost } from "@/lib/format-cost";
import { githubPrUrl } from "@/lib/github-urls";
import { KIND_ICON, SEVERITY_COLOR } from "./constants";
import { refTarget } from "./helpers";
import { s, pillFor } from "./styles";

interface BriefCardProps {
  prId: string;
  repo: string | null;
  onOpenFile: (file: string, line: number | null) => void;
  /** The default branch, when the PR targets another one: its history is still the default branch's. */
  historyBranch?: string | null;
}

export function BriefCard({ prId, repo, onOpenFile, historyBranch = null }: BriefCardProps) {
  const t = useTranslations("brief");
  const { data, isLoading } = useBrief(prId);
  const generate = useGenerateBrief(prId);
  const brief = data?.brief ?? null;
  const failure = generate.isError ? (generate.error instanceof ApiError ? generate.error.message : String(generate.error)) : null;

  return (
    <section>
      <SectionLabel
        icon="AlertTriangle"
        right={
          brief ? (
            <Button kind="ghost" size="sm" icon="RefreshCw" loading={generate.isPending} onClick={() => generate.mutate()}>
              {generate.isPending ? t("risk.generating") : t("risk.regenerate")}
            </Button>
          ) : undefined
        }
      >
        {t("risk.title")}
      </SectionLabel>
      <div style={s.card}>
        {failure && (
          <div role="alert" style={s.error}>
            {t("risk.failed", { message: failure })}
          </div>
        )}
        {isLoading ? (
          <Skeleton height={120} />
        ) : !brief ? (
          <div style={s.empty}>
            <div style={s.emptyTitle}>{t("risk.emptyTitle")}</div>
            <p style={s.emptyBody}>{t("risk.emptyBody")}</p>
            <Button kind="primary" size="sm" icon="Sparkles" loading={generate.isPending} onClick={() => generate.mutate()}>
              {generate.isPending ? t("risk.generating") : t("risk.generate")}
            </Button>
          </div>
        ) : (
          <BriefBody brief={brief} stale={data?.stale ?? false} repo={repo} historyBranch={historyBranch} onOpenFile={onOpenFile} />
        )}
      </div>
    </section>
  );
}

function BriefBody({
  brief,
  stale,
  repo,
  historyBranch,
  onOpenFile,
}: {
  brief: RiskBrief;
  stale: boolean;
  repo: string | null;
  historyBranch: string | null;
  onOpenFile: BriefCardProps["onOpenFile"];
}) {
  const t = useTranslations("brief");
  const [open, setOpen] = React.useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const meta = brief.meta;
  const sha = meta.head_sha.slice(0, 7);
  const openRef = (ref: string) => {
    const target = refTarget(ref);
    onOpenFile(target.file, target.line);
  };

  return (
    <>
      {stale && (
        <div role="status" style={s.stale}>
          {t("risk.stale")}
        </div>
      )}

      <h3 style={s.h3}>{t("risk.risks")}</h3>
      {brief.risks.length === 0 ? (
        <p style={s.none}>{t("risk.noRisks")}</p>
      ) : (
        <div style={s.pills}>
          {brief.risks.map((r, i) => (
            <RiskPill key={`${r.kind}-${i}`} risk={r} expanded={open === i} onToggle={() => setOpen(open === i ? null : i)} onOpen={openRef} />
          ))}
        </div>
      )}
      {open !== null && brief.risks[open] && (
        <div style={s.explain} data-testid="risk-explanation">
          <Markdown safe links="none">
            {brief.risks[open]!.explanation}
          </Markdown>
          <div style={s.refs}>
            {brief.risks[open]!.file_refs.map((ref) => (
              <button key={ref} type="button" className="mono" style={s.refBtn} onClick={() => openRef(ref)}>
                {ref}
              </button>
            ))}
          </div>
        </div>
      )}

      {brief.review_focus.length > 0 && (
        <>
          <h3 style={s.h3}>
            {t("risk.focus")} <Badge color="var(--accent-text)" bg="var(--accent-bg)">{brief.review_focus.length}</Badge>
          </h3>
          <ol style={s.focus}>
            {brief.review_focus.map((f) => (
              <li key={`${f.file}:${f.line}`}>
                <button type="button" style={s.focusBtn} onClick={() => onOpenFile(f.file, f.line)}>
                  <span className="mono" style={s.focusRef}>
                    {f.file}:{f.line}
                  </span>
                  <span style={s.focusReason}>— {f.reason}</span>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}

      <div style={s.history}>
        <button type="button" style={s.historyHead} onClick={() => setHistoryOpen((o) => !o)} aria-expanded={historyOpen}>
          <Icon.History size={14} aria-hidden style={{ color: "var(--text-muted)" }} />
          <span>{t("risk.history")}</span>
          <Badge color="var(--text-secondary)">{brief.history.length}</Badge>
          <Icon.ChevronDown size={15} aria-hidden style={s.chevron(historyOpen)} />
        </button>
        {historyOpen && (
          <div style={s.historyBody}>
            {historyBranch && <p style={s.none}>{t("risk.historyOtherBase", { branch: historyBranch })}</p>}
            {brief.history_state !== "ok" && (
              <p style={s.none}>{t(brief.history_state === "limited" ? "risk.historyLimited" : "risk.historyUnavailable")}</p>
            )}
            {brief.history.length === 0 && brief.history_state === "ok" && <p style={s.none}>{t("risk.noHistory")}</p>}
            {brief.history.map((h) => (
              <div key={h.pr_number} style={s.historyRow}>
                <div style={s.historyTitle}>
                  {repo ? (
                    <a href={githubPrUrl(repo, h.pr_number)} target="_blank" rel="noreferrer" className="mono" style={s.prLink}>
                      #{h.pr_number}
                    </a>
                  ) : (
                    <span className="mono">#{h.pr_number}</span>
                  )}
                  <span>{h.title}</span>
                </div>
                <div style={s.historyMeta}>{t("risk.mergeMeta", { author: h.author, date: new Date(h.merged_at).toLocaleDateString() })}</div>
                {h.notes && <div style={s.historyNote}>{h.notes}</div>}
                <div className="mono" style={s.overlap}>
                  {h.files_overlap.join(", ")}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p style={s.footer(meta.source === "signals")} data-testid="brief-footer">
        {meta.source === "model"
          ? t("risk.metaModel", { model: meta.model ?? "—", cost: formatCost(meta.cost_usd), sha })
          : t("risk.metaSignals", { reason: meta.reason ?? "—", sha })}
      </p>
    </>
  );
}

function RiskPill({ risk, expanded, onToggle, onOpen }: { risk: Risk; expanded: boolean; onToggle: () => void; onOpen: (ref: string) => void }) {
  const t = useTranslations("brief");
  const I = Icon[KIND_ICON[risk.kind] ?? "AlertTriangle"];
  const color = SEVERITY_COLOR[risk.severity];
  const first = risk.file_refs[0];
  return (
    <div style={pillFor(color, expanded)} data-severity={risk.severity}>
      <button type="button" style={s.pillMain} onClick={() => (first ? onOpen(first) : onToggle())} title={first}>
        <span style={s.pillTitle}>
          <I size={13} style={{ color, flexShrink: 0 }} aria-hidden />
          {risk.title}
        </span>
        <span style={s.pillMeta}>
          {t(`risk.kind.${risk.kind}`)} · {t(`risk.severity.${risk.severity}`)}
          {first && <span className="mono"> · {first}</span>}
        </span>
      </button>
      <button type="button" style={s.pillToggle} onClick={onToggle} aria-expanded={expanded} aria-label={t("risk.whyRisk")} title={t("risk.whyRisk")}>
        <Icon.ChevronDown size={14} aria-hidden style={s.chevron(expanded)} />
      </button>
    </div>
  );
}
