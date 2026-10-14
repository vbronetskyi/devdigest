import type { AgentPerf, AgentPerfRow, AgentPerfRun } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { PerformanceRepository, type DecisionAgg, type RecentRun } from './repository.js';
import { DELETED_AGENT_LABEL, RECENT_RUNS, UNKNOWN_MODEL_LABEL } from './constants.js';
import { costChange, fillDays, lowSample, mostActive, rate, shares, sortAgents, trend, windowBounds } from './helpers.js';

const keyOf = (agentId: string | null) => agentId ?? '';
const iso = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString());

/**
 * SPEC-05 — how the workspace's reviewer agents did over a window: runs, cost,
 * duration, accept rate and its trend, recent runs. Stored data only, no model call.
 */
export class PerformanceService {
  private repo: PerformanceRepository;

  constructor(container: Container) {
    this.repo = new PerformanceRepository(container.db);
  }

  async get(workspaceId: string, days: number, now = new Date()): Promise<AgentPerf> {
    const { from, to, prevFrom } = windowBounds(days, now);
    const [aggs, decisions, prevDecisions, perDay, byModel, prevCost, recent] = await Promise.all([
      this.repo.agents(workspaceId, from, to),
      this.repo.decisions(workspaceId, from, to),
      this.repo.decisions(workspaceId, prevFrom, from),
      this.repo.perDay(workspaceId, from, to),
      this.repo.costByModel(workspaceId, from, to),
      this.repo.cost(workspaceId, prevFrom, from),
      this.repo.recent(workspaceId, from, to, RECENT_RUNS),
    ]);
    const dec = new Map(decisions.map((d) => [keyOf(d.agent_id), d]));
    const prevDec = new Map(prevDecisions.map((d) => [keyOf(d.agent_id), d]));
    const none: DecisionAgg = { agent_id: null, accepted: 0, decided: 0 };
    const runsOf = new Map<string, AgentPerfRun[]>();
    for (const r of recent) {
      const list = runsOf.get(keyOf(r.agent_id)) ?? [];
      list.push(toRun(r));
      runsOf.set(keyOf(r.agent_id), list);
    }

    const agents: AgentPerfRow[] = aggs.map((a) => {
      const cur = dec.get(keyOf(a.agent_id)) ?? none;
      const prev = prevDec.get(keyOf(a.agent_id)) ?? none;
      const cost = a.cost_n > 0 ? a.cost : null;
      return {
        agent_id: a.agent_id,
        name: a.agent_id === null ? null : a.name,
        runs: a.runs,
        failed: a.failed,
        cost_usd: cost,
        avg_cost_usd: cost !== null ? cost / a.cost_n : null,
        avg_duration_ms: a.avg_duration,
        accept_rate: rate(cur.accepted, cur.decided),
        decided: cur.decided,
        accept_trend: trend(cur, prev),
        low_sample: lowSample(cur, prev),
        last_run_at: iso(a.last_run),
        recent: runsOf.get(keyOf(a.agent_id)) ?? [],
      };
    });

    const known = agents.filter((a) => a.cost_usd !== null);
    const cost = known.length > 0 ? known.reduce((n, a) => n + a.cost_usd!, 0) : null;
    const accepted = decisions.reduce((n, d) => n + d.accepted, 0);
    const decided = decisions.reduce((n, d) => n + d.decided, 0);
    return {
      window: { days, from: from.toISOString(), to: to.toISOString() },
      totals: {
        runs: aggs.reduce((n, a) => n + a.runs, 0),
        failed: aggs.reduce((n, a) => n + a.failed, 0),
        cost_usd: cost,
        runs_without_cost: aggs.reduce((n, a) => n + a.no_cost, 0),
        prev_cost_usd: prevCost,
        cost_change_usd: costChange(cost, prevCost),
        accept_rate: rate(accepted, decided),
        decided,
        runs_per_day: fillDays(perDay, from, days),
        most_active: mostActive(agents),
      },
      agents: sortAgents(agents),
      cost_by_agent: shares(known.map((a) => ({ label: a.name ?? DELETED_AGENT_LABEL, key: a.agent_id, cost: a.cost_usd! }))),
      cost_by_model: shares(byModel.map((m) => ({ label: m.model ?? UNKNOWN_MODEL_LABEL, key: m.model, cost: m.cost }))),
    };
  }
}

/** AC-9: a failed run's score, findings, duration and cost are stubs — shown as unknown. */
function toRun(r: RecentRun): AgentPerfRun {
  const done = r.status === 'done';
  return {
    run_id: r.id,
    ran_at: new Date(r.ran_at).toISOString(),
    status: r.status,
    repo_id: r.repo_id,
    pr_number: r.pr_number,
    pr_title: r.pr_title,
    score: done ? r.score : null,
    findings_count: done ? r.findings_count : null,
    duration_ms: done ? r.duration_ms : null,
    cost_usd: done ? r.cost_usd : null,
  };
}
