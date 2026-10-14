import { sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';

/**
 * SPEC-05 aggregates. Runs count when `done` or `failed`; cost is over `done` runs
 * only (a failed run records none by design); findings belong to a run through
 * `reviews.run_id` (one review per run). Everything is scoped to the workspace.
 */

export interface AgentAgg {
  agent_id: string | null;
  name: string | null;
  runs: number;
  failed: number;
  cost: number | null;
  cost_n: number;
  no_cost: number;
  avg_duration: number | null;
  last_run: Date | null;
}

export interface DecisionAgg {
  agent_id: string | null;
  accepted: number;
  decided: number;
}

export interface RecentRun {
  id: string;
  agent_id: string | null;
  ran_at: Date;
  status: 'done' | 'failed';
  score: number | null;
  findings_count: number | null;
  duration_ms: number | null;
  cost_usd: number | null;
  repo_id: string | null;
  pr_number: number | null;
  pr_title: string | null;
}

const counted = sql.raw(`r.status in ('done', 'failed')`);
/** Raw `sql` parameters go to the driver as text: a Date must be serialised first. */
const ts = (d: Date) => d.toISOString();

export class PerformanceRepository {
  constructor(private db: Db) {}

  private rows<T>(query: ReturnType<typeof sql>): Promise<T[]> {
    return this.db.execute(query) as unknown as Promise<T[]>;
  }

  agents(workspaceId: string, from: Date, to: Date): Promise<AgentAgg[]> {
    return this.rows<AgentAgg>(sql`
      select r.agent_id, a.name,
        count(*)::int as runs,
        (count(*) filter (where r.status = 'failed'))::int as failed,
        (sum(r.cost_usd) filter (where r.status = 'done'))::float8 as cost,
        (count(*) filter (where r.status = 'done' and r.cost_usd is not null))::int as cost_n,
        (count(*) filter (where r.status = 'done' and r.cost_usd is null))::int as no_cost,
        (avg(r.duration_ms) filter (where r.status = 'done' and r.duration_ms is not null))::float8 as avg_duration,
        max(r.ran_at) as last_run
      from agent_runs r left join agents a on a.id = r.agent_id
      where r.workspace_id = ${workspaceId} and r.ran_at >= ${ts(from)}::timestamptz and r.ran_at < ${ts(to)}::timestamptz and ${counted}
      group by r.agent_id, a.name`);
  }

  /** A finding is accepted or dismissed, never both (setting one clears the other). */
  decisions(workspaceId: string, from: Date, to: Date): Promise<DecisionAgg[]> {
    return this.rows<DecisionAgg>(sql`
      select r.agent_id,
        (count(*) filter (where f.accepted_at is not null))::int as accepted,
        (count(*) filter (where f.accepted_at is not null or f.dismissed_at is not null))::int as decided
      from agent_runs r
        join reviews v on v.run_id = r.id and v.workspace_id = r.workspace_id
        join findings f on f.review_id = v.id
      where r.workspace_id = ${workspaceId} and r.ran_at >= ${ts(from)}::timestamptz and r.ran_at < ${ts(to)}::timestamptz and ${counted}
      group by r.agent_id`);
  }

  perDay(workspaceId: string, from: Date, to: Date): Promise<{ day: string; n: number }[]> {
    return this.rows(sql`
      select to_char(r.ran_at at time zone 'UTC', 'YYYY-MM-DD') as day, count(*)::int as n
      from agent_runs r
      where r.workspace_id = ${workspaceId} and r.ran_at >= ${ts(from)}::timestamptz and r.ran_at < ${ts(to)}::timestamptz and ${counted}
      group by 1`);
  }

  costByModel(workspaceId: string, from: Date, to: Date): Promise<{ model: string | null; cost: number }[]> {
    return this.rows(sql`
      select r.model, sum(r.cost_usd)::float8 as cost
      from agent_runs r
      where r.workspace_id = ${workspaceId} and r.ran_at >= ${ts(from)}::timestamptz and r.ran_at < ${ts(to)}::timestamptz
        and r.status = 'done' and r.cost_usd is not null
      group by r.model`);
  }

  /** Known cost of `done` runs in [from, to); null when none has a cost. */
  async cost(workspaceId: string, from: Date, to: Date): Promise<number | null> {
    const [row] = await this.rows<{ cost: number | null }>(sql`
      select (sum(r.cost_usd) filter (where r.cost_usd is not null))::float8 as cost
      from agent_runs r
      where r.workspace_id = ${workspaceId} and r.ran_at >= ${ts(from)}::timestamptz and r.ran_at < ${ts(to)}::timestamptz and r.status = 'done'`);
    return row?.cost ?? null;
  }

  recent(workspaceId: string, from: Date, to: Date, perAgent: number): Promise<RecentRun[]> {
    return this.rows<RecentRun>(sql`
      select * from (
        select r.id, r.agent_id, r.ran_at, r.status, r.score, r.findings_count, r.duration_ms, r.cost_usd,
          p.repo_id, p.number as pr_number, p.title as pr_title,
          row_number() over (partition by r.agent_id order by r.ran_at desc, r.id) as rn
        from agent_runs r left join pull_requests p on p.id = r.pr_id
        where r.workspace_id = ${workspaceId} and r.ran_at >= ${ts(from)}::timestamptz and r.ran_at < ${ts(to)}::timestamptz and ${counted}
      ) x
      where x.rn <= ${perAgent}
      order by x.ran_at desc`);
  }
}
