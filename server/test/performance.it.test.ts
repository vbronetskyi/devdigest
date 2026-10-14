import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { AgentPerf } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockAuthProvider, MockEmbedder, MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

d('HW L08 agent performance — SPEC-05 (Testcontainers pg)', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let llm: MockLLMProvider;
  let alpha: string;
  let beta: string;
  let gamma: string;
  let prId: string;
  let repoId: string;
  let now: number;
  let quietWorkspace: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const db = pg.handle.db;
    const [ws] = await db.select().from(t.workspaces);
    const workspaceId = ws!.id;
    const [repo] = await db.select().from(t.repos);
    repoId = repo!.id;
    const agent = (name: string) => ({ workspaceId, name, provider: 'openrouter' as const, model: 'm', systemPrompt: 'p' });
    [{ id: alpha }] = (await db.insert(t.agents).values(agent('Alpha')).returning({ id: t.agents.id })) as [{ id: string }];
    [{ id: beta }] = (await db.insert(t.agents).values(agent('Beta')).returning({ id: t.agents.id })) as [{ id: string }];
    [{ id: gamma }] = (await db.insert(t.agents).values(agent('Gamma')).returning({ id: t.agents.id })) as [{ id: string }];
    [{ id: prId }] = (await db
      .insert(t.pullRequests)
      .values({ workspaceId, repoId, number: 42, title: 'Add the limiter', author: 'a', branch: 'b', base: 'main', headSha: 'h' })
      .returning({ id: t.pullRequests.id })) as [{ id: string }];

    now = Date.now();
    const run = async (over: Partial<typeof t.agentRuns.$inferInsert>) =>
      (await db.insert(t.agentRuns).values({ workspaceId, prId, model: 'deepseek/deepseek-v4-flash', ...over }).returning({ id: t.agentRuns.id }))[0]!.id;
    const review = async (runId: string | null, decisions: ('a' | 'd' | null)[]) => {
      const [rv] = await db.insert(t.reviews).values({ workspaceId, prId, runId, kind: 'review' }).returning({ id: t.reviews.id });
      if (decisions.length)
        await db.insert(t.findings).values(
          decisions.map((x, i) => ({
            reviewId: rv!.id,
            file: 'src/a.ts',
            startLine: i + 1,
            endLine: i + 1,
            severity: 'WARNING',
            category: 'bug',
            title: `f${i}`,
            rationale: 'r',
            confidence: 0.9,
            acceptedAt: x === 'a' ? new Date() : null,
            dismissedAt: x === 'd' ? new Date() : null,
          })),
        );
    };

    // Alpha, this window: a done run with 5 decisions (4 accepted), a failed run with stub zeros, a done run without cost.
    const a1 = await run({ agentId: alpha, ranAt: new Date(now - 2 * HOUR), status: 'done', costUsd: 0.01, durationMs: 1000, score: 80, findingsCount: 6 });
    await review(a1, ['a', 'a', 'a', 'a', 'd', null]);
    // A failed run with stub zeros — and a cost, should one ever be recorded: it is not summed (AC-2).
    await run({ agentId: alpha, ranAt: new Date(now - 3 * HOUR), status: 'failed', costUsd: 0.5, durationMs: 0, findingsCount: 0 });
    await run({ agentId: alpha, ranAt: new Date(now - 4 * HOUR), status: 'done', costUsd: null, durationMs: 3000, score: 70, findingsCount: 0 });
    // Alpha, previous window: 5 decisions, 2 accepted.
    const p1 = await run({ agentId: alpha, ranAt: new Date(now - 9 * DAY), status: 'done', costUsd: 0.02, durationMs: 500 });
    await review(p1, ['a', 'a', 'd', 'd', 'd']);
    // Beta and a deleted agent (agent_id null), this window; a run with an unknown model.
    await run({ agentId: beta, ranAt: new Date(now - 1 * HOUR), status: 'done', costUsd: 0.03, durationMs: 2000 });
    await run({ agentId: null, ranAt: new Date(now - 5 * HOUR), status: 'done', costUsd: 0.005, durationMs: 100, model: null });
    // Not counted: running, cancelled, another workspace; a review without a run is not attributed.
    const cancelled = await run({ agentId: beta, ranAt: new Date(now - HOUR), status: 'cancelled', costUsd: 9 });
    await review(cancelled, ['a', 'd']); // decisions on a cancelled run's findings are not Beta's
    const [other] = await db.insert(t.workspaces).values({ name: 'other' }).returning({ id: t.workspaces.id });
    const otherRun = async (ago: number, costUsd: number) =>
      (await db.insert(t.agentRuns).values({ workspaceId: other!.id, ranAt: new Date(now - ago), status: 'done', costUsd }).returning({ id: t.agentRuns.id }))[0]!.id;
    const otherNow = await otherRun(HOUR, 100);
    await otherRun(9 * DAY, 100); // the previous 7-day window of another workspace
    const [otherReview] = await db.insert(t.reviews).values({ workspaceId: other!.id, prId, runId: otherNow, kind: 'review' }).returning({ id: t.reviews.id });
    await db.insert(t.findings).values(
      [1, 2, 3].map((line) => ({ reviewId: otherReview!.id, file: 'y.ts', startLine: line, endLine: line, severity: 'WARNING', category: 'bug', title: 'y', rationale: 'r', confidence: 1, dismissedAt: new Date() })),
    );
    // A quiet workspace: runs, but no cost known anywhere.
    const [quiet] = await db.insert(t.workspaces).values({ name: 'quiet' }).returning({ id: t.workspaces.id });
    quietWorkspace = quiet!.id;
    const [quietAgent] = await db.insert(t.agents).values({ ...agent('Quiet'), workspaceId: quietWorkspace }).returning({ id: t.agents.id });
    await db.insert(t.agentRuns).values([
      { workspaceId: quietWorkspace, agentId: quietAgent!.id, ranAt: new Date(now - HOUR), status: 'done', costUsd: null, durationMs: 1000 },
      { workspaceId: quietWorkspace, agentId: quietAgent!.id, ranAt: new Date(now - 2 * HOUR), status: 'failed', costUsd: null },
    ]);
    await review(null, ['a', 'a', 'a']);
    // Another workspace's review pointing at this workspace's run: its decisions are not Alpha's.
    const [foreign] = await db.insert(t.reviews).values({ workspaceId: other!.id, prId, runId: a1, kind: 'review' }).returning({ id: t.reviews.id });
    await db.insert(t.findings).values(
      [1, 2].map((line) => ({ reviewId: foreign!.id, file: 'x.ts', startLine: line, endLine: line, severity: 'WARNING', category: 'bug', title: 'x', rationale: 'r', confidence: 1, acceptedAt: new Date() })),
    );

    // Gamma, 15–16 days ago (outside the 7-day window and the one before it): seven done
    // runs inserted out of order, the newest scoring 10, one on a deleted PR; and a failed
    // run without a cost, as the executor records it.
    for (const i of [3, 0, 6, 1, 5, 2, 4])
      await run({ agentId: gamma, prId: i === 1 ? null : prId, ranAt: new Date(now - 15 * DAY - i * HOUR), status: 'done', costUsd: 0.001, durationMs: 1000, score: 10 * (i + 1), findingsCount: i });
    await run({ agentId: gamma, ranAt: new Date(now - 16 * DAY), status: 'failed', costUsd: null });

    llm = new MockLLMProvider('openai');
    app = await buildApp({
      config: config(),
      db,
      overrides: { embedder: new MockEmbedder(), git: new MockGitClient(), github: new MockGitHubClient({ pulls: [] }), llm: { openai: llm } },
    });
    // A run in flight right now (inserted after start-up, which reaps stale `running` rows as failed).
    await run({ agentId: beta, ranAt: new Date(), status: 'running' });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  const get = async (days?: string) => app.inject({ method: 'GET', url: `/agents/performance${days === undefined ? '' : `?days=${days}`}` });

  it('AC-1/AC-2/AC-4/AC-6/AC-7: totals over done and failed runs, cost over done runs only, pooled accept rate', async () => {
    const res = await get('7');
    expect(res.statusCode).toBe(200);
    const { totals, window } = res.json() as AgentPerf;
    expect(window.days).toBe(7);
    expect([totals.runs, totals.failed]).toEqual([5, 1]); // running, cancelled and the other workspace left out
    expect(totals.cost_usd).toBeCloseTo(0.045); // 0.01 + 0.03 + 0.005 — not the cancelled 9, not the other workspace's 100
    expect(totals.runs_without_cost).toBe(1); // the done run without cost; the failed one is not "without cost"
    expect(totals.prev_cost_usd).toBeCloseTo(0.02);
    expect(totals.cost_change_usd).toBeCloseTo(0.025);
    expect([totals.accept_rate, totals.decided]).toEqual([0.8, 5]); // the unattributed review's 3 accepts do not count
    // Each run on its own UTC day, today last.
    const perDay = Array<number>(7).fill(0);
    const today = Math.floor(now / DAY);
    for (const ago of [1, 2, 3, 4, 5]) perDay[6 - (today - Math.floor((now - ago * HOUR) / DAY))]! += 1;
    expect(totals.runs_per_day).toEqual(perDay);
    expect(totals.most_active).toEqual({ agent_id: alpha, name: 'Alpha', runs: 3, accept_rate: 0.8 });
  });

  it('AC-3/AC-5/AC-9/AC-12: per-agent rows — averages over done runs, trend against the previous window, recent runs with stubs hidden', async () => {
    const { agents } = (await get('7')).json() as AgentPerf;
    expect(agents.map((a) => a.name)).toEqual(['Alpha', 'Beta', null]); // by accept rate, unknown last; then runs
    const a = agents[0]!;
    expect([a.runs, a.failed, a.cost_usd, a.avg_cost_usd, a.avg_duration_ms]).toEqual([3, 1, 0.01, 0.01, 2000]); // the failed run's 0 ms is not averaged
    expect([a.accept_rate, a.decided, a.accept_trend, a.low_sample]).toEqual([0.8, 5, 'up', false]);
    expect(a.recent.map((r) => r.status)).toEqual(['done', 'failed', 'done']);
    expect(a.recent[1]).toMatchObject({ score: null, findings_count: null, duration_ms: null, cost_usd: null, pr_number: 42, repo_id: repoId });
    expect(a.recent[0]).toMatchObject({ pr_title: 'Add the limiter', score: 80, findings_count: 6, duration_ms: 1000, cost_usd: 0.01 });
    expect(a.last_run_at).toBe(new Date(now - 2 * HOUR).toISOString());
    const b = agents[1]!;
    expect([b.accept_rate, b.decided, b.accept_trend, b.low_sample]).toEqual([null, 0, null, false]); // nothing decided
    expect(b.recent.map((r) => r.status)).toEqual(['done']); // not the running nor the cancelled run
    expect(agents[2]).toMatchObject({ agent_id: null, name: null, runs: 1 });
    expect(agents[2]!.recent).toHaveLength(1); // the other workspace's deleted-agent run is not here
  });

  it('AC-8: cost by agent and by model with shares of the known cost', async () => {
    const { cost_by_agent, cost_by_model } = (await get('7')).json() as AgentPerf;
    expect(cost_by_agent.map((s) => [s.label, s.key, Number(s.cost_usd.toFixed(3)), Number(s.share!.toFixed(3))])).toEqual([
      ['Beta', beta, 0.03, 0.667],
      ['Alpha', alpha, 0.01, 0.222],
      ['deleted agent', null, 0.005, 0.111],
    ]);
    // Known cost of done runs only: not the cancelled 9 nor the failed 0.5 on the same model.
    expect(cost_by_model.map((s) => [s.label, s.key, Number(s.cost_usd.toFixed(3)), Number(s.share!.toFixed(3))])).toEqual([
      ['deepseek/deepseek-v4-flash', 'deepseek/deepseek-v4-flash', 0.04, 0.889],
      ['unknown model', null, 0.005, 0.111],
    ]);
  });

  it('AC-2/AC-9: the last five runs, newest first; a deleted PR\'s run is unlinked; a failed run without cost is not "without cost"', async () => {
    const { agents, totals } = (await get('30')).json() as AgentPerf;
    const g = agents.find((a) => a.agent_id === gamma)!;
    expect([g.runs, g.failed]).toEqual([8, 1]);
    expect(g.recent.map((r) => r.score)).toEqual([10, 20, 30, 40, 50]);
    expect(g.last_run_at).toBe(new Date(now - 15 * DAY).toISOString());
    expect(g.recent[1]).toMatchObject({ repo_id: null, pr_number: null, pr_title: null, status: 'done', score: 20 });
    expect(totals.runs_without_cost).toBe(1); // Alpha's done run only
    // Nothing ran 30–60 days ago: the previous cost is unknown, not $0, and so is the change.
    expect([totals.prev_cost_usd, totals.cost_change_usd]).toEqual([null, null]);
  });

  it('AC-2/AC-3/AC-7: a window whose runs report no cost has an unknown cost, never 0', async () => {
    const quiet = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        auth: new MockAuthProvider(undefined, { id: quietWorkspace, name: 'quiet' }),
        embedder: new MockEmbedder(),
        git: new MockGitClient(),
        github: new MockGitHubClient({ pulls: [] }),
        llm: { openai: llm },
      },
    });
    try {
      const { totals, agents, cost_by_agent } = (await quiet.inject({ method: 'GET', url: '/agents/performance?days=7' })).json() as AgentPerf;
      expect([totals.runs, totals.failed, totals.cost_usd, totals.runs_without_cost, totals.cost_change_usd]).toEqual([2, 1, null, 1, null]);
      expect([agents[0]!.cost_usd, agents[0]!.avg_cost_usd, agents[0]!.avg_duration_ms]).toEqual([null, null, 1000]);
      expect(cost_by_agent).toEqual([]);
    } finally {
      await quiet.close();
    }
  });

  it('AC-10: 30 days by default, 422 for any other window, no model call', async () => {
    expect(((await get()).json() as AgentPerf).window.days).toBe(30);
    expect(((await get('90')).json() as AgentPerf).window.days).toBe(90);
    for (const bad of ['8', '07', '', '7.0', 'abc']) expect((await get(bad)).statusCode).toBe(422);
    expect((await app.inject({ method: 'GET', url: '/agents/performance?days=7&days=30' })).statusCode).toBe(422);
    expect(llm.calls).toHaveLength(0);
  });
});
