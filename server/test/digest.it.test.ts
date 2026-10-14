import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { StructuredRequest, StructuredResult, WeeklyDigest } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockEmbedder, MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** Holds its first call until `release()` — a request in flight. */
class GatedLLM extends MockLLMProvider {
  release!: () => void;
  private gate = new Promise<void>((r) => (this.release = r));
  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const res = super.completeStructured(req);
    await this.gate;
    return res;
  }
}

// 2026-W40 is Monday 2026-09-28 to Sunday 2026-10-04 (UTC); W39 the week before.
const W40 = (day: number, hour = 12) => new Date(Date.UTC(2026, 8, 28 + day, hour));
const W39 = (day: number) => new Date(Date.UTC(2026, 8, 21 + day, 12));

d('HW L08 weekly digest — SPEC-06 (Testcontainers pg)', () => {
  let pg: PgFixture;
  const apps: FastifyInstance[] = [];
  let workspaceId: string;
  let extraRun: () => Promise<void>;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const db = pg.handle.db;
    workspaceId = (await db.select().from(t.workspaces))[0]!.id;
    const [repo] = await db.select().from(t.repos);
    const agent = async (name: string) =>
      (await db.insert(t.agents).values({ workspaceId, name, provider: 'openrouter', model: 'm', systemPrompt: 'p' }).returning({ id: t.agents.id }))[0]!.id;
    const sec = await agent('Security Reviewer');
    const gen = await agent('General Reviewer');
    const pr = async (number: number, openedAt: Date | null, status = 'needs_review') =>
      (await db
        .insert(t.pullRequests)
        .values({ workspaceId, repoId: repo!.id, number, title: `PR ${number} title`, author: 'a', branch: 'b', base: 'main', headSha: 'h', status, openedAt })
        .returning({ id: t.pullRequests.id }))[0]!.id;
    const p1 = await pr(1, W40(1));
    const p2 = await pr(2, W40(2), 'merged');
    await pr(3, null); // opened at an unknown time: not counted
    await pr(4, W39(3));
    const run = async (agentId: string | null, prId: string, ranAt: Date, status: string, cost: number | null) =>
      (await db.insert(t.agentRuns).values({ workspaceId, agentId, prId, ranAt, status, costUsd: cost }).returning({ id: t.agentRuns.id }))[0]!.id;
    const findings = async (runId: string, prId: string, rows: { sev: string; file?: string; line?: number; accepted?: Date; dismissed?: Date }[]) => {
      const [rv] = await db.insert(t.reviews).values({ workspaceId, prId, runId, kind: 'review' }).returning({ id: t.reviews.id });
      await db.insert(t.findings).values(
        rows.map((r, i) => ({
          reviewId: rv!.id,
          file: r.file ?? 'src/a.ts',
          startLine: r.line ?? i + 1,
          endLine: r.line ?? i + 1,
          severity: r.sev,
          category: 'security',
          title: `${r.sev} finding ${i}`,
          rationale: 'r',
          confidence: 0.9,
          acceptedAt: r.accepted ?? null,
          dismissedAt: r.dismissed ?? null,
        })),
      );
    };
    // W39: one done run on PR 4 with a finding decided only in W40.
    const old = await run(sec, p1, W39(4), 'done', 0.002);
    await findings(old, p1, [{ sev: 'WARNING', accepted: W40(0) }]);
    // W40: PR 1 reviewed twice by Security — the older run's critical is superseded by the newer run's.
    const early = await run(sec, p1, W40(1), 'done', 0.01);
    await findings(early, p1, [{ sev: 'CRITICAL', file: 'src/old.ts', line: 9 }]);
    const late = await run(sec, p1, W40(3), 'done', 0.02);
    await findings(late, p1, [
      { sev: 'CRITICAL', file: 'src/b.ts', line: 7 },
      { sev: 'CRITICAL', file: 'src/a.ts', line: 3, accepted: W40(3) },
      { sev: 'WARNING', dismissed: W40(4) },
      { sev: 'SUGGESTION' },
    ]);
    // W40: PR 2 (merged) by General, then by a deleted agent; a failed run; a done run without cost.
    const genRun = await run(gen, p2, W40(2), 'done', 0.005);
    await findings(genRun, p2, Array.from({ length: 5 }, (_, i) => ({ sev: 'CRITICAL', file: 'src/z.ts', line: 20 + i })));
    const ghost = await run(null, p2, W40(4), 'done', null);
    await findings(ghost, p2, [{ sev: 'CRITICAL', file: 'src/g.ts', line: 1 }]);
    await run(gen, p2, W40(5), 'failed', null);
    // Inserted later to make the facts move.
    extraRun = async () => {
      await run(gen, p1, W40(6), 'done', 0.001);
    };
  }, 120_000);

  afterAll(async () => {
    await Promise.all(apps.map((a) => a.close()));
    await pg?.stop();
  });

  async function appWith(llm: MockLLMProvider) {
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { embedder: new MockEmbedder(), git: new MockGitClient(), github: new MockGitHubClient({ pulls: [] }), llm: { openai: llm } },
    });
    apps.push(app);
    return app;
  }
  const get = async (app: FastifyInstance, week?: string) =>
    app.inject({ method: 'GET', url: `/digest${week === undefined ? '' : `?week=${week}`}` });
  const write = async (app: FastifyInstance, week: string) =>
    app.inject({ method: 'POST', url: '/digest/highlights', payload: { week } });

  it('AC-1/AC-2/AC-4: the week\'s numbers, the week before, and the agents', async () => {
    const app = await appWith(new MockLLMProvider('openai'));
    const res = await get(app, '2026-W40');
    expect(res.statusCode).toBe(200);
    const dg = res.json() as WeeklyDigest;
    expect([dg.from, dg.to, dg.in_progress, dg.empty]).toEqual(['2026-09-28T00:00:00.000Z', '2026-10-05T00:00:00.000Z', false, false]);
    const f = dg.facts;
    expect([f.prs_opened, f.prs_reviewed, f.runs, f.failed]).toEqual([2, 2, 5, 1]);
    expect(f.cost_usd).toBeCloseTo(0.035); // done runs: 0.01 + 0.02 + 0.005; the failed and the cost-less one add nothing
    expect(f.runs_without_cost).toBe(1);
    expect(f.findings).toEqual({ CRITICAL: 9, WARNING: 1, SUGGESTION: 1 });
    // Decided in W40: the W39 warning accepted on Monday, the accepted critical, the dismissed warning.
    expect([f.accepted, f.dismissed]).toEqual([2, 1]);
    expect(f.accept_rate).toBeCloseTo(2 / 3);
    expect([dg.prev.prs_opened, dg.prev.runs, dg.prev.cost_usd, dg.prev.accept_rate]).toEqual([1, 1, 0.002, null]);
    expect(dg.change).toMatchObject({ prs_opened: 1, runs: 4, critical: 9, accepted: 2 });
    expect(dg.change.cost_usd).toBeCloseTo(0.033);
    expect(dg.agents.map((a) => [a.name, a.runs, a.decided])).toEqual([
      ['General Reviewer', 2, 0],
      ['Security Reviewer', 2, 3],
      [null, 1, 0],
    ]);
    expect(dg.agents[1]!.accept_rate).toBeCloseTo(2 / 3);
  });

  it('AC-3: open criticals of the latest run per PR and agent, five listed of the total, newest first', async () => {
    const app = await appWith(new MockLLMProvider('openai'));
    const dg = (await get(app, '2026-W40')).json() as WeeklyDigest;
    // Security's older run is superseded; the accepted critical is not open.
    expect(dg.open_criticals.some((c) => c.file === 'src/old.ts')).toBe(false);
    expect(dg.open_criticals.some((c) => c.file === 'src/a.ts')).toBe(false);
    expect(dg.open_criticals_total).toBe(7); // 1 (Security, latest) + 5 (General) + 1 (deleted agent)
    expect(dg.open_criticals).toHaveLength(5);
    expect(dg.open_criticals[0]).toMatchObject({ file: 'src/g.ts', agent_name: null, pr_number: 2, pr_state: 'merged' });
    expect(dg.open_criticals[1]).toMatchObject({ file: 'src/b.ts', line: 7, agent_name: 'Security Reviewer', pr_state: null });
    expect(dg.open_criticals.slice(2).map((c) => c.line)).toEqual([20, 21, 22]);
  });

  it('AC-5: the current week by default, in progress; malformed, non-existent and future weeks are 422; no model call', async () => {
    const llm = new MockLLMProvider('openai');
    const app = await appWith(llm);
    const now = (await get(app)).json() as WeeklyDigest;
    expect(now.in_progress).toBe(true);
    for (const bad of ['2025-W53', '2026-W00', '2026-40', 'soon', '2099-W01']) expect((await get(app, bad)).statusCode).toBe(422);
    expect(llm.calls).toHaveLength(0);
  });

  it('AC-6 – AC-8: one call; only lines whose numbers are in the facts are kept; stored, then stale when the facts move', async () => {
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: {
        WeeklyDigestHighlights: {
          highlights: [
            '7 critical findings are still open; PR #2 is merged with 5 of them.',
            'Cost reached $0.035, up $0.033.',
            'Runs grew 400% week over week.', // invented
            'Twice as many runs as last week.', // a number word
            'See [the dashboard](https://evil.example) for details.',
          ],
        },
      },
    });
    const app = await appWith(llm);
    const res = await write(app, '2026-W40');
    expect(res.statusCode).toBe(200);
    const h = (res.json() as WeeklyDigest).highlights!;
    expect(h.lines).toEqual([
      '7 critical findings are still open; PR #2 is merged with 5 of them.',
      'Cost reached $0.035, up $0.033.',
      'See the dashboard for details.',
    ]);
    expect(h.stale).toBe(false);
    const calls = llm.calls.filter((c) => c.method === 'completeStructured');
    expect(calls).toHaveLength(1);
    const req = calls[0]!.req as StructuredRequest<unknown>;
    expect(req.maxRetries).toBe(0);
    expect(req.messages[1]!.content).toContain('<untrusted source="digest-facts">');
    // Reading is free; the stored lines come back until the facts change.
    expect(((await get(app, '2026-W40')).json() as WeeklyDigest).highlights).toMatchObject({ lines: h.lines, stale: false });
    await extraRun();
    expect(((await get(app, '2026-W40')).json() as WeeklyDigest).highlights!.stale).toBe(true);
  });

  it('AC-6/AC-8: an empty week is a 409 without a call; a failed call or nothing that checks out is a 502 that keeps the stored lines', async () => {
    const empty = new MockLLMProvider('openai');
    expect((await write(await appWith(empty), '2026-W30')).statusCode).toBe(409);
    expect(empty.calls).toHaveLength(0);

    const offSchema = await appWith(new MockLLMProvider('openai', { structuredBySchema: { WeeklyDigestHighlights: { lines: 'nope' } } }));
    const failed = await write(offSchema, '2026-W40');
    expect(failed.statusCode).toBe(502);
    const nothing = await appWith(new MockLLMProvider('openai', { structuredBySchema: { WeeklyDigestHighlights: { highlights: ['Runs grew 400%.'] } } }));
    const dropped = await write(nothing, '2026-W40');
    expect(dropped.statusCode).toBe(502);
    expect(dropped.json().error.message).toMatch(/number check/);
    // The lines of the previous test are still there.
    expect(((await get(nothing, '2026-W40')).json() as WeeklyDigest).highlights!.lines).toHaveLength(3);
  });

  it('AC-9: a second request for the same week while one runs is a 409', async () => {
    const gated = new GatedLLM('openai', { structuredBySchema: { WeeklyDigestHighlights: { highlights: ['PR #2 is merged.'] } } });
    const app = await appWith(gated);
    const first = write(app, '2026-W40');
    await new Promise((r) => setTimeout(r, 50));
    expect((await write(app, '2026-W40')).statusCode).toBe(409);
    gated.release();
    expect((await first).statusCode).toBe(200);
  });
});
