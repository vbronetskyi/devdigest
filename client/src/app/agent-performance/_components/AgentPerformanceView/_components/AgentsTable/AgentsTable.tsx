/* AgentsTable — one row per agent with runs in the window (SPEC-05 AC-12, AC-13): runs,
   averages, accept rate with its trend, last run. A native table, so every value is read
   under its column; the agent cell's button opens the agent's last five runs. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { AgentPerfRow, AgentPerfRun } from "@devdigest/shared";
import { formatCost } from "@/lib/format-cost";
import { relativeTime } from "@/lib/relative-time";
import { formatDuration, percent, runHref } from "../../helpers";
import { Unknown } from "../Unknown";
import { COLUMN_WIDTHS } from "./constants";
import { s } from "./styles";

export function AgentsTable({ agents }: { agents: AgentPerfRow[] }) {
  const t = useTranslations("performance");
  const [open, setOpen] = React.useState<string | null>(null);
  const headers = [t("table.agent"), t("table.runs"), t("table.avgCost"), t("table.avgDuration"), t("table.accept"), t("table.lastRun")];
  return (
    <div style={s.frame}>
      <table style={s.table}>
        <caption style={s.caption}>{t("table.caption")}</caption>
        <colgroup>
          {COLUMN_WIDTHS.map((w, i) => (
            <col key={i} style={{ width: w }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {headers.map((c) => (
              <th key={c} scope="col" style={s.th}>
                {c}
              </th>
            ))}
            <td style={s.th} />
          </tr>
        </thead>
        <tbody>
          {agents.map((a) => {
            const key = a.agent_id ?? "deleted";
            return <AgentRow key={key} id={key} agent={a} expanded={open === key} onToggle={() => setOpen(open === key ? null : key)} />;
          })}
        </tbody>
      </table>
    </div>
  );
}

function AgentRow({ id, agent, expanded, onToggle }: { id: string; agent: AgentPerfRow; expanded: boolean; onToggle: () => void }) {
  const t = useTranslations("performance");
  const name = agent.name ?? t("table.deletedAgent");
  const rate = percent(agent.accept_rate);
  const duration = formatDuration(agent.avg_duration_ms);
  const allFailed = agent.runs > 0 && agent.failed === agent.runs;
  const panelId = `agent-runs-${id}`;
  const trend = agent.accept_trend;
  const TrendIcon = trend === "up" ? Icon.ArrowUp : trend === "down" ? Icon.ArrowDown : trend === "flat" ? Icon.ArrowRight : null;
  return (
    <>
      {/* The whole row toggles for a pointer; keyboard and screen readers use the button. */}
      <tr style={s.row} onClick={onToggle}>
        <th scope="row" style={s.cell}>
          <button
            type="button"
            style={s.toggle}
            aria-expanded={expanded}
            aria-controls={expanded ? panelId : undefined}
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
          >
            <span style={agent.name ? s.name : s.deleted}>{name}</span>
          </button>
        </th>
        <td className="tnum" style={{ ...s.cell, ...s.num }}>
          {agent.runs}
        </td>
        <td className="mono tnum" style={{ ...s.cell, ...s.num }}>
          {agent.avg_cost_usd == null ? <Unknown reason={allFailed ? t("unknown.allFailed") : t("unknown.cost")} /> : formatCost(agent.avg_cost_usd)}
        </td>
        <td className="tnum" style={{ ...s.cell, ...s.num }}>
          {duration ?? <Unknown reason={allFailed ? t("unknown.allFailed") : t("unknown.duration")} />}
        </td>
        <td style={s.cell}>
          <span style={s.accept}>
            <span className="tnum" style={rate == null ? undefined : agent.accept_rate! >= 0.6 ? s.good : s.weak}>
              {rate ?? <Unknown reason={allFailed ? t("unknown.allFailed") : t("unknown.decided")} />}
            </span>
            {TrendIcon && trend && (
              <span title={t(`table.trend.${trend}`)} style={s.trendWrap}>
                <TrendIcon size={12} role="img" aria-label={t(`table.trend.${trend}`)} style={s.trend[trend]} />
              </span>
            )}
            <span style={s.muted}>{t("table.decided", { count: agent.decided })}</span>
            {agent.low_sample && agent.decided > 0 && (
              <span style={s.low} title={t("table.lowSampleHint")}>
                {t("table.lowSample")}
              </span>
            )}
          </span>
        </td>
        <td style={{ ...s.cell, ...s.muted }}>{t("table.ago", { ago: relativeTime(agent.last_run_at) })}</td>
        <td style={s.cell}>
          <Icon.ChevronDown size={15} aria-hidden style={s.chevron(expanded)} />
        </td>
      </tr>
      {expanded && (
        <tr id={panelId}>
          <td colSpan={COLUMN_WIDTHS.length} style={s.recent}>
            <div style={s.recentTitle}>{t("table.recent", { name })}</div>
            <ul style={s.runs}>
              {agent.recent.map((r) => (
                <RecentRun key={r.run_id} run={r} />
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}

function RecentRun({ run }: { run: AgentPerfRun }) {
  const t = useTranslations("performance");
  const href = runHref(run);
  const failed = run.status === "failed";
  // A failed run records none of these; a finished one may still lack one.
  const missing = failed ? t("unknown.failed") : t("unknown.notRecorded");
  const duration = formatDuration(run.duration_ms);
  return (
    <li style={s.run} data-testid="recent-run">
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
      <span className="tnum">{run.score == null ? <Unknown reason={missing} /> : t("table.score", { score: run.score })}</span>
      <span className="tnum">{run.findings_count == null ? <Unknown reason={missing} /> : t("table.findings", { count: run.findings_count })}</span>
      <span className="tnum">{duration ?? <Unknown reason={missing} />}</span>
      <span className="mono tnum">{run.cost_usd == null ? <Unknown reason={failed ? missing : t("unknown.runCost")} /> : formatCost(run.cost_usd)}</span>
      <span style={s.muted}>{t("table.ago", { ago: relativeTime(run.ran_at) })}</span>
    </li>
  );
}
