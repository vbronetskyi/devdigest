/* AgentsTable — one row per agent with runs in the window (SPEC-05 AC-12, AC-13): runs,
   averages, accept rate with its trend, last run; a row opens its last five runs. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { AgentPerfRow, AgentPerfRun } from "@devdigest/shared";
import { formatCost } from "@/lib/format-cost";
import { relativeTime } from "@/lib/relative-time";
import { formatDuration, percent, runHref } from "../../helpers";
import { s } from "./styles";

export function AgentsTable({ agents }: { agents: AgentPerfRow[] }) {
  const t = useTranslations("performance");
  const [open, setOpen] = React.useState<string | null>(null);
  return (
    <div style={s.table} role="table" aria-label={t("page.title")}>
      <div style={s.head} role="row">
        {[t("table.agent"), t("table.runs"), t("table.avgCost"), t("table.avgDuration"), t("table.accept"), t("table.lastRun"), ""].map((c, i) => (
          <div key={i} role="columnheader">
            {c}
          </div>
        ))}
      </div>
      {agents.map((a) => {
        const key = a.agent_id ?? "deleted";
        return <AgentRow key={key} agent={a} expanded={open === key} onToggle={() => setOpen(open === key ? null : key)} />;
      })}
    </div>
  );
}

function AgentRow({ agent, expanded, onToggle }: { agent: AgentPerfRow; expanded: boolean; onToggle: () => void }) {
  const t = useTranslations("performance");
  const dash = t("card.none");
  const name = agent.name ?? t("table.deletedAgent");
  const rate = percent(agent.accept_rate);
  const duration = formatDuration(agent.avg_duration_ms);
  const TrendIcon = agent.accept_trend === "up" ? Icon.ArrowUp : agent.accept_trend === "down" ? Icon.ArrowDown : agent.accept_trend === "flat" ? Icon.ArrowRight : null;
  return (
    <div style={s.rowWrap} role="rowgroup">
      <button type="button" style={s.row} role="row" aria-expanded={expanded} aria-label={t("table.expand", { name })} onClick={onToggle}>
        <span style={agent.name ? s.name : s.deleted}>{name}</span>
        <span className="tnum" style={s.num}>
          {agent.runs}
        </span>
        <span className="mono tnum" style={s.num} title={agent.avg_cost_usd == null ? t("unknown.cost") : undefined}>
          {agent.avg_cost_usd == null ? dash : formatCost(agent.avg_cost_usd)}
        </span>
        <span className="tnum" style={s.num} title={duration == null ? t("unknown.duration") : undefined}>
          {duration ?? dash}
        </span>
        <span style={s.accept} title={rate == null ? t("unknown.decided") : undefined}>
          <span className="tnum" style={rate == null ? undefined : agent.accept_rate! >= 0.6 ? s.good : s.weak}>
            {rate ?? dash}
          </span>
          {TrendIcon && agent.accept_trend && (
            <TrendIcon size={12} role="img" aria-label={t(`table.trend.${agent.accept_trend}`)} style={agent.accept_trend === "down" ? s.weak : s.good} />
          )}
          <span style={s.muted}>{t("table.decided", { count: agent.decided })}</span>
          {agent.low_sample && agent.decided > 0 && (
            <span style={s.low} title={t("table.lowSampleHint")}>
              {t("table.lowSample")}
            </span>
          )}
        </span>
        <span style={s.muted}>{t("table.ago", { ago: relativeTime(agent.last_run_at) })}</span>
        <Icon.ChevronDown size={15} aria-hidden style={s.chevron(expanded)} />
      </button>
      {expanded && (
        <div style={s.recent}>
          <div style={s.recentTitle}>{t("table.recent")}</div>
          {agent.recent.map((r) => (
            <RecentRun key={r.run_id} run={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function RecentRun({ run }: { run: AgentPerfRun }) {
  const t = useTranslations("performance");
  const dash = t("card.none");
  const href = runHref(run);
  const failed = run.status === "failed";
  const why = failed ? t("unknown.failed") : undefined;
  const duration = formatDuration(run.duration_ms);
  return (
    <div style={s.run} data-testid="recent-run">
      <Badge color={failed ? "var(--crit)" : "var(--ok)"} bg={failed ? "var(--crit-bg)" : "var(--ok-bg)"}>
        {failed ? t("table.failed") : t("table.done")}
      </Badge>
      {href ? (
        <Link href={href} style={s.link}>
          #{run.pr_number} {run.pr_title}
        </Link>
      ) : (
        <span style={s.unlinked}>{t("table.deletedPr")}</span>
      )}
      <span className="tnum" title={why}>
        {run.score == null ? dash : t("table.score", { score: run.score })}
      </span>
      <span className="tnum" title={why}>
        {run.findings_count == null ? dash : t("table.findings", { count: run.findings_count })}
      </span>
      <span className="tnum" title={why}>
        {duration ?? dash}
      </span>
      <span className="mono tnum" title={why ?? (run.cost_usd == null ? t("unknown.cost") : undefined)}>
        {run.cost_usd == null ? dash : formatCost(run.cost_usd)}
      </span>
      <span style={s.muted}>{t("table.ago", { ago: relativeTime(run.ran_at) })}</span>
    </div>
  );
}
