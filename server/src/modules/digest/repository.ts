import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * SPEC-06 queries. Runs count when `done` or `failed` (by `ran_at`, their start);
 * cost is over `done` runs; findings belong to a run through `reviews.run_id`;
 * decisions are counted by when they were made. All scoped to the workspace.
 */

export interface RunFacts {
  runs: number;
  failed: number;
  cost: number | null;
  no_cost: number;
  prs_reviewed: number;
}

export interface CriticalRow {
  finding_id: string;
  file: string;
  line: number;
  title: string;
  ran_at: Date;
  agent_name: string | null;
  agent_id: string | null;
  pr_number: number;
  pr_title: string;
  pr_status: string;
  repo_id: string;
  repo_full_name: string;
}

export interface AgentWeek {
  agent_id: string | null;
  name: string | null;
  runs: number;
  cost: number | null;
  cost_n: number;
}

/** Raw `sql` parameters go to the driver as text: a Date must be serialised first. */
const ts = (d: Date) => d.toISOString();
const counted = sql.raw(`r.status in ('done', 'failed')`);

export class DigestRepository {
  constructor(private db: Db) {}

  private rows<T>(query: ReturnType<typeof sql>): Promise<T[]> {
    return this.db.execute(query) as unknown as Promise<T[]>;
  }

  async prsOpened(ws: string, from: Date, to: Date): Promise<number> {
    const [row] = await this.rows<{ n: number }>(sql`
      select count(*)::int as n from pull_requests
      where workspace_id = ${ws} and opened_at >= ${ts(from)}::timestamptz and opened_at < ${ts(to)}::timestamptz`);
    return row?.n ?? 0;
  }

  async runs(ws: string, from: Date, to: Date): Promise<RunFacts> {
    const [row] = await this.rows<RunFacts>(sql`
      select count(*)::int as runs,
        (count(*) filter (where r.status = 'failed'))::int as failed,
        (sum(r.cost_usd) filter (where r.status = 'done' and r.cost_usd is not null))::float8 as cost,
        (count(*) filter (where r.status = 'done' and r.cost_usd is null))::int as no_cost,
        (count(distinct r.pr_id) filter (where r.status = 'done'))::int as prs_reviewed
      from agent_runs r
      where r.workspace_id = ${ws} and r.ran_at >= ${ts(from)}::timestamptz and r.ran_at < ${ts(to)}::timestamptz and ${counted}`);
    return row ?? { runs: 0, failed: 0, cost: null, no_cost: 0, prs_reviewed: 0 };
  }

  severities(ws: string, from: Date, to: Date): Promise<{ severity: string; n: number }[]> {
    return this.rows(sql`
      select f.severity, count(*)::int as n
      from agent_runs r
        join reviews v on v.run_id = r.id and v.workspace_id = r.workspace_id
        join findings f on f.review_id = v.id
      where r.workspace_id = ${ws} and r.ran_at >= ${ts(from)}::timestamptz and r.ran_at < ${ts(to)}::timestamptz and ${counted}
      group by f.severity`);
  }

  /** Findings decided in the span — by the time of the decision, whatever run made them. */
  async decisions(ws: string, from: Date, to: Date): Promise<{ accepted: number; dismissed: number }> {
    const [row] = await this.rows<{ accepted: number; dismissed: number }>(sql`
      select
        (count(*) filter (where f.accepted_at >= ${ts(from)}::timestamptz and f.accepted_at < ${ts(to)}::timestamptz))::int as accepted,
        (count(*) filter (where f.dismissed_at >= ${ts(from)}::timestamptz and f.dismissed_at < ${ts(to)}::timestamptz))::int as dismissed
      from findings f join reviews v on v.id = f.review_id
      where v.workspace_id = ${ws}`);
    return row ?? { accepted: 0, dismissed: 0 };
  }

  /**
   * AC-3: undecided CRITICAL findings of the latest done run per PR and agent in the
   * week. A deleted agent leaves `agent_runs.agent_id` null, so the agent its review
   * recorded tells two deleted agents apart (the run itself when neither is known).
   */
  openCriticals(ws: string, from: Date, to: Date): Promise<CriticalRow[]> {
    return this.rows<CriticalRow>(sql`
      with latest as (
        select distinct on (r.pr_id, coalesce(r.agent_id, v.agent_id, r.id)) r.id, r.pr_id, r.agent_id, r.ran_at, v.id as review_id
        from agent_runs r join reviews v on v.run_id = r.id and v.workspace_id = r.workspace_id
        where r.workspace_id = ${ws} and r.status = 'done' and r.pr_id is not null
          and r.ran_at >= ${ts(from)}::timestamptz and r.ran_at < ${ts(to)}::timestamptz
        order by r.pr_id, coalesce(r.agent_id, v.agent_id, r.id), r.ran_at desc
      )
      select f.id as finding_id, f.file, f.start_line as line, f.title, l.ran_at, a.name as agent_name, l.agent_id,
        p.number as pr_number, p.title as pr_title, p.status as pr_status, p.repo_id, rp.full_name as repo_full_name
      from latest l
        join findings f on f.review_id = l.review_id
        join pull_requests p on p.id = l.pr_id
        join repos rp on rp.id = p.repo_id
        left join agents a on a.id = l.agent_id
      where f.severity = 'CRITICAL' and f.accepted_at is null and f.dismissed_at is null
      order by l.ran_at desc, f.file, f.start_line`);
  }

  agents(ws: string, from: Date, to: Date): Promise<AgentWeek[]> {
    return this.rows<AgentWeek>(sql`
      select r.agent_id, a.name, count(*)::int as runs,
        (sum(r.cost_usd) filter (where r.status = 'done' and r.cost_usd is not null))::float8 as cost,
        (count(*) filter (where r.status = 'done' and r.cost_usd is not null))::int as cost_n
      from agent_runs r left join agents a on a.id = r.agent_id
      where r.workspace_id = ${ws} and r.ran_at >= ${ts(from)}::timestamptz and r.ran_at < ${ts(to)}::timestamptz and ${counted}
      group by r.agent_id, a.name`);
  }

  /** AC-4: the week's decisions on each agent's findings. */
  agentDecisions(ws: string, from: Date, to: Date): Promise<{ agent_id: string | null; accepted: number; decided: number }[]> {
    return this.rows(sql`
      select r.agent_id,
        (count(*) filter (where f.accepted_at >= ${ts(from)}::timestamptz and f.accepted_at < ${ts(to)}::timestamptz))::int as accepted,
        (count(*) filter (where (f.accepted_at >= ${ts(from)}::timestamptz and f.accepted_at < ${ts(to)}::timestamptz)
          or (f.dismissed_at >= ${ts(from)}::timestamptz and f.dismissed_at < ${ts(to)}::timestamptz)))::int as decided
      from findings f
        join reviews v on v.id = f.review_id
        join agent_runs r on r.id = v.run_id and r.workspace_id = v.workspace_id
      where v.workspace_id = ${ws}
      group by r.agent_id`);
  }

  async highlights(ws: string, week: string) {
    const [row] = await this.db
      .select()
      .from(t.digestHighlights)
      .where(and(eq(t.digestHighlights.workspaceId, ws), eq(t.digestHighlights.week, week)));
    return row;
  }

  async saveHighlights(row: typeof t.digestHighlights.$inferInsert): Promise<void> {
    const set = { lines: row.lines, model: row.model, costUsd: row.costUsd ?? null, factsHash: row.factsHash, generatedAt: new Date() };
    await this.db.insert(t.digestHighlights).values(row).onConflictDoUpdate({ target: [t.digestHighlights.workspaceId, t.digestHighlights.week], set });
  }
}
