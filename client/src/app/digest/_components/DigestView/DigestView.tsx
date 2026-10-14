/* /digest — one ISO week of code review (HW L08, SPEC-06): the week's numbers against the
   week before, the open critical findings, the agents, and optional AI-written highlights
   whose numbers the server checked. Opening the page calls no model. */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Icon, SectionLabel, Skeleton } from "@devdigest/ui";
import type { WeeklyDigest } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { useDigest, useWriteHighlights } from "@/lib/hooks/digest";
import { ApiError } from "@/lib/api";
import { formatCost } from "@/lib/format-cost";
import { relativeTime } from "@/lib/relative-time";
import { notify } from "@/lib/toast";
import { changeText, criticalHref, digestMarkdown, lastDay, neighbourWeeks, shortDate } from "./helpers";
import { s } from "./styles";

export function DigestView() {
  const t = useTranslations("digest");
  const router = useRouter();
  const params = useSearchParams();
  const week = params.get("week");
  const { data, isLoading, isError, error, refetch } = useDigest(week);
  const goTo = (w: string) => router.replace(`/digest?week=${w}`);

  const copy = async (d: WeeklyDigest) => {
    try {
      await navigator.clipboard.writeText(digestMarkdown(d));
      notify.success(t("page.copied"));
    } catch {
      notify.error(t("page.copyFailed"));
    }
  };

  return (
    <AppShell crumb={[{ label: t("page.crumb") }]}>
      <div style={s.page}>
        <div style={s.head}>
          <div>
            <h1 style={s.h1}>{t("page.title")}</h1>
            <p style={s.subtitle}>{t("page.subtitle")}</p>
          </div>
          {data && (
            <span style={s.copy}>
              <Button kind="secondary" size="sm" icon="Copy" onClick={() => copy(data)}>
                {t("page.copy")}
              </Button>
            </span>
          )}
        </div>

        {isLoading ? (
          <Skeleton height={260} />
        ) : isError || !data ? (
          <ErrorState title={t("page.loadError")} body={error instanceof ApiError ? error.message : undefined} onRetry={() => refetch()} />
        ) : (
          <Digest digest={data} queryWeek={week} onWeek={goTo} />
        )}
      </div>
    </AppShell>
  );
}

function Digest({ digest: d, queryWeek, onWeek }: { digest: WeeklyDigest; queryWeek: string | null; onWeek: (week: string) => void }) {
  const t = useTranslations("digest");
  const { prev, next } = neighbourWeeks(d.from);
  return (
    <>
      <div style={s.weekBar}>
        <Button kind="tertiary" size="sm" icon="ChevronLeft" aria-label={t("page.prev")} onClick={() => onWeek(prev)} />
        <span style={s.range} className="tnum">
          {t("page.range", { week: d.week, from: shortDate(d.from), to: shortDate(lastDay(d.to)) })}
        </span>
        {/* AC-10: no next past the current week. */}
        <Button kind="tertiary" size="sm" icon="ChevronRight" aria-label={t("page.next")} disabled={d.in_progress} onClick={() => onWeek(next)} />
        {d.in_progress && <Badge color="var(--accent-text)" bg="var(--accent-bg)">{t("page.inProgress")}</Badge>}
      </div>

      {d.empty && <p style={{ ...s.muted, marginBottom: 14 }}>{t("page.empty")}</p>}
      <FactsCards digest={d} />
      <div style={s.section}>
        {/* Keyed by week: another week's request shows neither its progress nor its failure here. */}
        <Highlights key={d.week} digest={d} queryWeek={queryWeek} />
      </div>
      <div style={s.section}>
        <Criticals digest={d} />
      </div>
      {d.agents.length > 0 && (
        <div style={s.section}>
          <Agents digest={d} />
        </div>
      )}
    </>
  );
}

function FactsCards({ digest: d }: { digest: WeeklyDigest }) {
  const t = useTranslations("digest");
  const f = d.facts;
  const basis = d.in_progress ? t("page.comparedSpan") : t("page.comparedWeek");
  // AC-13: an unknown change is a dash with its reason, never "no change".
  const change = (n: number | null, fmt?: (v: number) => string): React.ReactNode => {
    const text = changeText(n, fmt);
    if (text === null) return <span title={t("facts.unknownChangeReason")}>{t("facts.unknownChange", { basis })}</span>;
    return n === 0 ? t("facts.noChange", { basis }) : t("facts.change", { change: text, basis });
  };
  const card = (label: string, value: React.ReactNode, sub: React.ReactNode, ch?: React.ReactNode, title?: string) => (
    <section style={s.card} aria-label={label}>
      <div style={s.label}>{label}</div>
      <div className="tnum" style={s.value} title={title}>
        {value}
      </div>
      {sub && <div style={s.sub}>{sub}</div>}
      {ch && <div style={s.sub}>{ch}</div>}
    </section>
  );
  return (
    <div style={s.cards}>
      {card(t("facts.prsOpened"), f.prs_opened, null, change(d.change.prs_opened))}
      {card(t("facts.prsReviewed"), f.prs_reviewed, null, change(d.change.prs_reviewed))}
      {card(t("facts.runs"), f.runs, t("facts.runsSub", { failed: f.failed }), change(d.change.runs))}
      {card(
        t("facts.cost"),
        f.cost_usd == null ? t("facts.unknown") : formatCost(f.cost_usd),
        t("facts.costSub", { count: f.runs_without_cost }),
        change(d.change.cost_usd, (v) => formatCost(v)),
        f.cost_usd == null ? t("facts.unknownCost") : undefined,
      )}
      <section style={s.card} aria-label={t("facts.findings")}>
        <div style={s.label}>{t("facts.findings")}</div>
        <div style={s.sev} className="tnum">
          <span style={{ color: "var(--crit)" }}>
            <Icon.AlertOctagon size={13} aria-hidden /> {f.findings.CRITICAL}
          </span>
          <span style={{ color: "var(--warn)" }}>
            <Icon.AlertTriangle size={13} aria-hidden /> {f.findings.WARNING}
          </span>
          <span style={{ color: "var(--sugg)" }}>
            <Icon.Lightbulb size={13} aria-hidden /> {f.findings.SUGGESTION}
          </span>
        </div>
        <div style={s.sub}>{t("facts.criticalChange", { change: changeText(d.change.critical) ?? "", basis })}</div>
      </section>
      {card(
        t("facts.decisions"),
        f.accept_rate == null ? t("facts.unknown") : `${Math.round(f.accept_rate * 100)}%`,
        t("facts.decisionsSub", { accepted: f.accepted, dismissed: f.dismissed }),
        t("facts.decisionsChange", { accepted: changeText(d.change.accepted) ?? "", dismissed: changeText(d.change.dismissed) ?? "", basis }),
        f.accept_rate == null ? t("facts.acceptRate", { rate: "—" }) : undefined,
      )}
    </div>
  );
}

/** `queryWeek` is the page's `?week=` (null for the current week): the cache entry the answer replaces. */
function Highlights({ digest: d, queryWeek }: { digest: WeeklyDigest; queryWeek: string | null }) {
  const t = useTranslations("digest");
  const write = useWriteHighlights(d.week);
  const h = d.highlights;
  // The server's message is a whole sentence; the fallback covers a network failure.
  const failure = write.isError ? (write.error instanceof ApiError && write.error.message ? write.error.message : t("highlights.failed")) : null;
  return (
    <section style={s.panel} aria-label={t("highlights.title")}>
      <div style={s.panelHead}>
        <SectionLabel icon="Sparkles">{t("highlights.title")}</SectionLabel>
        <span style={s.aiLabel}>{t("highlights.label")}</span>
        <span style={{ marginLeft: "auto" }}>
          <Button kind={h ? "ghost" : "primary"} size="sm" icon="Sparkles" loading={write.writing} disabled={write.writing || d.empty} onClick={() => write.mutate({ week: d.week, queryWeek })}>
            {write.writing ? t("highlights.writing") : h ? t("highlights.rewrite") : t("highlights.write")}
          </Button>
        </span>
      </div>
      {h ? (
        <>
          <ul style={s.list}>
            {h.lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
          {h.stale && (
            <div role="status" style={s.stale}>
              {t("highlights.stale")}
            </div>
          )}
          <div style={s.meta}>{t("highlights.meta", { model: h.model, cost: formatCost(h.cost_usd), ago: relativeTime(h.generated_at) })}</div>
        </>
      ) : (
        <p style={s.muted}>{t("highlights.none")}</p>
      )}
      {failure && (
        <div role="alert" style={s.error}>
          {failure}
        </div>
      )}
    </section>
  );
}

function Criticals({ digest: d }: { digest: WeeklyDigest }) {
  const t = useTranslations("digest");
  return (
    <section style={s.panel} aria-label={t("criticals.title")}>
      <div style={s.panelHead}>
        <SectionLabel icon="AlertOctagon">{t("criticals.title")}</SectionLabel>
        {d.open_criticals_total > 0 && <Badge color="var(--crit)" bg="var(--crit-bg)">{t("criticals.count", { shown: d.open_criticals.length, total: d.open_criticals_total })}</Badge>}
      </div>
      {d.open_criticals.length === 0 ? (
        <p style={s.muted}>{t("criticals.none")}</p>
      ) : (
        d.open_criticals.map((c) => (
          <div key={c.finding_id} style={s.critical}>
            <div>
              <Link href={criticalHref(c)} style={s.critLink}>
                {c.title}
              </Link>
              <div style={s.critFile} className="mono">
                {c.repo_full_name} #{c.pr_number} · {c.file}:{c.line}
              </div>
            </div>
            <div style={s.critFile}>
              {c.pr_state && <Badge color="var(--text-secondary)">{t(`criticals.${c.pr_state}`)}</Badge>} {c.agent_name ?? t("criticals.deletedAgent")}
            </div>
          </div>
        ))
      )}
    </section>
  );
}

function Agents({ digest: d }: { digest: WeeklyDigest }) {
  const t = useTranslations("digest");
  return (
    <section style={s.panel} aria-label={t("agents.title")}>
      <SectionLabel icon="Cpu">{t("agents.title")}</SectionLabel>
      <table style={s.table}>
        <thead>
          <tr>
            {[t("agents.agent"), t("agents.runs"), t("agents.cost"), t("agents.accept")].map((h) => (
              <th key={h} style={s.th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {d.agents.map((a) => (
            <tr key={a.agent_id ?? "deleted"}>
              <td style={s.td}>{a.name ?? t("agents.deletedAgent")}</td>
              <td style={s.td} className="tnum">
                {a.runs}
              </td>
              <td style={s.td} className="mono tnum">
                {a.cost_usd == null ? t("facts.unknown") : formatCost(a.cost_usd)}
              </td>
              <td style={s.td} className="tnum">
                {a.accept_rate == null ? t("facts.unknown") : `${Math.round(a.accept_rate * 100)}%`} <span style={s.critFile}>{t("agents.decided", { count: a.decided })}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
