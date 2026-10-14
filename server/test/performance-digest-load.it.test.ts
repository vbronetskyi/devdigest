import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import type { AgentPerf, WeeklyDigest } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockEmbedder, MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const RUNS = 10_000;
const FINDINGS = 50_000;
const BUDGET_MS = 1_000;

/** Median wall time of `n` requests after one warm-up (plans cached, pool connected). */
async function median(n: number, call: () => Promise<{ statusCode: number }>): Promise<number> {
  expect((await call()).statusCode).toBe(200);
  const times: number[] = [];
  for (let i = 0; i < n; i++) {
    const start = performance.now();
    expect((await call()).statusCode).toBe(200);
    times.push(performance.now() - start);
  }
  return times.sort((a, b) => a - b)[Math.floor(n / 2)]!;
}

// SPEC-05 and SPEC-06 non-functional: aggregates in SQL, an answer under 1 s with
// 10,000 runs and 50,000 findings.
d('HW L08 agent performance and weekly digest under load (Testcontainers pg)', () => {
  let pg: PgFixture;
  let app: FastifyInstance;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const db = pg.handle.db;
    const workspaceId = (await db.select().from(t.workspaces))[0]!.id;
    const repoId = (await db.select().from(t.repos))[0]!.id;
    const agents = await db
      .insert(t.agents)
      .values(['Security', 'Performance', 'General', 'Style', 'Docs'].map((n) => ({ workspaceId, name: `${n} Reviewer`, provider: 'openrouter' as const, model: 'm', systemPrompt: 'p' })))
      .returning({ id: t.agents.id });
    const pulls = await db
      .insert(t.pullRequests)
      .values(Array.from({ length: 50 }, (_, i) => ({ workspaceId, repoId, number: 1000 + i, title: `PR ${i}`, author: 'a', branch: 'b', base: 'main', headSha: 'h', openedAt: new Date(Date.now() - i * 43_200_000) })))
      .returning({ id: t.pullRequests.id });
    const agentIds = sql.raw(`array[${agents.map((a) => `'${a.id}'::uuid`).join(',')}]`);
    const prIds = sql.raw(`array[${pulls.map((p) => `'${p.id}'::uuid`).join(',')}]`);

    // Runs over the last 90 days, one in ten failed; one review per done run.
    await db.execute(sql`
      insert into agent_runs (workspace_id, agent_id, pr_id, ran_at, model, status, cost_usd, duration_ms, score, findings_count)
      select ${workspaceId}, (${agentIds})[1 + g % 5], (${prIds})[1 + g % 50],
        now() - (g * interval '777 seconds'), 'deepseek/deepseek-v4-flash',
        case when g % 10 = 0 then 'failed' else 'done' end,
        case when g % 10 = 0 then null else 0.0005 + (g % 7) * 0.0001 end,
        case when g % 10 = 0 then null else 20000 + g % 40000 end,
        case when g % 10 = 0 then null else 50 + g % 50 end,
        case when g % 10 = 0 then null else 5 end
      from generate_series(1, ${RUNS}) g`);
    await db.execute(sql`
      insert into reviews (workspace_id, pr_id, run_id, kind)
      select r.workspace_id, r.pr_id, r.id, 'review' from agent_runs r where r.workspace_id = ${workspaceId} and r.status = 'done'`);
    // Findings spread over the reviews; a third accepted, a third dismissed, at their run's time.
    await db.execute(sql`
      insert into findings (review_id, file, start_line, end_line, severity, category, title, rationale, confidence, accepted_at, dismissed_at)
      select v.id, 'src/file-' || (g % 300) || '.ts', 1 + g % 400, 1 + g % 400,
        (array['CRITICAL', 'WARNING', 'SUGGESTION'])[1 + g % 3], 'bug', 'Finding ' || g, 'r', 0.8,
        case when g % 3 = 0 then r.ran_at + interval '1 hour' end,
        case when g % 3 = 1 then r.ran_at + interval '1 hour' end
      from generate_series(1, ${FINDINGS}) g
        join (select v.id, v.run_id, row_number() over (order by v.id) as n, count(*) over () as total from reviews v where v.workspace_id = ${workspaceId}) v
          on v.n = 1 + g % v.total
        join agent_runs r on r.id = v.run_id`);
    await db.execute(sql`analyze`);

    app = await buildApp({
      config: config(),
      db,
      overrides: { embedder: new MockEmbedder(), git: new MockGitClient(), github: new MockGitHubClient({ pulls: [] }), llm: { openai: new MockLLMProvider('openai') } },
    });
  }, 300_000);

  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  it('SPEC-05: GET /agents/performance over 90 days answers in under 1 s', async () => {
    const call = () => app.inject({ method: 'GET', url: '/agents/performance?days=90' });
    const body = (await call()).json() as AgentPerf;
    expect(body.totals.runs).toBeGreaterThan(9_000); // the data is really there
    expect(body.totals.decided).toBeGreaterThan(30_000);
    const ms = await median(5, call);
    console.info(`agent performance, 90 days, ${RUNS} runs / ${FINDINGS} findings: median ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it('SPEC-06: GET /digest for the current week answers in under 1 s', async () => {
    const call = () => app.inject({ method: 'GET', url: '/digest' });
    const body = (await call()).json() as WeeklyDigest;
    expect(body.facts.runs).toBeGreaterThan(0);
    const ms = await median(5, call);
    console.info(`weekly digest, current week, ${RUNS} runs / ${FINDINGS} findings: median ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(BUDGET_MS);
  });
});
