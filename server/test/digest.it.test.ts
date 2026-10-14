import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { StructuredRequest, StructuredResult, WeeklyDigest } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockEmbedder, MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { weekBounds, weekOf } from '../src/modules/digest/helpers.js';

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
// 2026-W37 is Monday 2026-09-07 to Sunday 2026-09-13: the boundary cases.
const W37_FROM = new Date('2026-09-07T00:00:00.000Z');
const W37_TO = new Date('2026-09-14T00:00:00.000Z');
const WEEK = 7 * 86_400_000;

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

    // W37, at its edges: the first and the last millisecond are in, the neighbours' are not.
    // Its done runs report no cost; one is by a deleted agent; a cancelled run's findings do not count.
    await run(gen, p1, new Date(W37_FROM.getTime() - 1), 'done', 0.5);
    const first = await run(gen, p1, W37_FROM, 'done', null);
    await findings(first, p1, [{ sev: 'WARNING', accepted: W37_FROM }, { sev: 'WARNING', dismissed: W37_TO }]);
    await run(null, p2, new Date(W37_TO.getTime() - 1), 'done', null);
    await run(gen, p1, W37_TO, 'done', 0.5);
    const cancelled = await run(gen, p1, W37_FROM, 'cancelled', 1);
    await findings(cancelled, p1, [{ sev: 'CRITICAL' }]);
    // Two deleted agents on one PR in W37: each latest run keeps its own open critical.
    for (const [hour, line] of [[10, 1], [11, 2]] as const) {
      const id = await run(null, p2, new Date(W37_FROM.getTime() + hour * 3_600_000), 'done', null);
      const [rv] = await db.insert(t.reviews).values({ workspaceId, prId: p2, runId: id, agentId: crypto.randomUUID(), kind: 'review' }).returning({ id: t.reviews.id });
      await db.insert(t.findings).values({ reviewId: rv!.id, file: 'src/ghost.ts', startLine: line, endLine: line, severity: 'CRITICAL', category: 'security', title: `ghost ${line}`, rationale: 'r', confidence: 1 });
      // Same run, an earlier file at a later line: the file orders before the line.
      if (line === 2) await db.insert(t.findings).values({ reviewId: rv!.id, file: 'src/a.ts', startLine: 9, endLine: 9, severity: 'CRITICAL', category: 'security', title: 'ghost a', rationale: 'r', confidence: 1 });
    }
    // Another workspace: its run, review and decisions in W37 belong to it alone.
    const [other] = await db.insert(t.workspaces).values({ name: 'other' }).returning({ id: t.workspaces.id });
    const [foreignRun] = await db.insert(t.agentRuns).values({ workspaceId: other!.id, prId: p1, ranAt: W37_FROM, status: 'done', costUsd: 7 }).returning({ id: t.agentRuns.id });
    const [foreign] = await db.insert(t.reviews).values({ workspaceId: other!.id, prId: p1, runId: foreignRun!.id, kind: 'review' }).returning({ id: t.reviews.id });
    await db.insert(t.findings).values([
      ...[1, 2].map((line) => ({ reviewId: foreign!.id, file: 'x.ts', startLine: line, endLine: line, severity: 'CRITICAL', category: 'bug', title: 'x', rationale: 'r', confidence: 1, acceptedAt: W37_FROM })),
      { reviewId: foreign!.id, file: 'x.ts', startLine: 3, endLine: 3, severity: 'CRITICAL', category: 'bug', title: 'foreign open', rationale: 'r', confidence: 1 },
    ]);
    await db.insert(t.pullRequests).values({ workspaceId: other!.id, repoId: repo!.id, number: 900, title: 'foreign', author: 'a', branch: 'b', base: 'main', headSha: 'h', openedAt: W37_FROM });

    // W34: a decision on a W33 run's finding, and no run — not an empty week.
    const w33 = await run(gen, p1, new Date('2026-08-12T12:00:00.000Z'), 'done', 0.001);
    await findings(w33, p1, [{ sev: 'WARNING', dismissed: new Date('2026-08-19T12:00:00.000Z') }]);

    // The week in progress: a run stamped later this week is not counted yet; last week counts
    // only up to the same elapsed time.
    const now = Date.now();
    const { from, to } = weekBounds(weekOf(new Date(now)));
    const elapsed = now - from.getTime();
    const later = await run(gen, p1, new Date(now + (to.getTime() - now) / 2), 'done', 0.1);
    await findings(later, p1, [{ sev: 'CRITICAL', file: 'src/later.ts', line: 1 }]);
    await run(gen, p1, new Date(from.getTime() - WEEK + elapsed / 2), 'done', 0.01);
    await run(gen, p1, new Date(from.getTime() - WEEK + elapsed + (WEEK - elapsed) / 2), 'done', 0.01);
  }, 120_000);

  afterAll(async () => {
    await Promise.all(apps.map((a) => a.close()));
    await pg?.stop();
  });

  /** `null`: no provider at all — no key for the registry default nor the OpenRouter fallback. */
  async function appWith(llm: MockLLMProvider | null) {
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { embedder: new MockEmbedder(), git: new MockGitClient(), github: new MockGitHubClient({ pulls: [] }), llm: llm ? { openai: llm } : {} },
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

  it('AC-1/AC-3/AC-4: week edges, unknown cost, cancelled runs, another workspace, two deleted agents', async () => {
    const app = await appWith(new MockLLMProvider('openai'));
    const dg = (await get(app, '2026-W37')).json() as WeeklyDigest;
    expect(dg.facts.runs).toBe(4); // first and last millisecond, the two deleted agents' runs; not the cancelled one
    expect(dg.facts.cost_usd).toBeNull(); // no done run reported a cost: unknown, not $0
    expect(dg.facts.runs_without_cost).toBe(4);
    expect(dg.facts.prs_opened).toBe(0); // not the other workspace's PR
    expect(dg.facts.findings).toEqual({ CRITICAL: 3, WARNING: 2, SUGGESTION: 0 }); // the cancelled run's critical is not new here
    expect([dg.facts.accepted, dg.facts.dismissed]).toEqual([1, 0]); // dismissed at the next Monday 00:00; not the other workspace's 2
    expect(dg.change.cost_usd).toBeNull();
    expect(dg.agents.map((a) => [a.name, a.runs, a.cost_usd, a.decided])).toEqual([
      [null, 3, null, 0],
      ['General Reviewer', 1, null, 1],
    ]);
    // Newest run first, then file, then line; not the other workspace's open critical.
    expect(dg.open_criticals.map((c) => c.title)).toEqual(['ghost a', 'ghost 2', 'ghost 1']);
    expect(dg.open_criticals_total).toBe(3);
  });

  it('AC-1/AC-13: a week with decisions but no runs is not empty', async () => {
    const app = await appWith(new MockLLMProvider('openai'));
    const dg = (await get(app, '2026-W34')).json() as WeeklyDigest;
    expect([dg.facts.runs, dg.facts.dismissed, dg.empty]).toEqual([0, 1, false]);
  });

  it('AC-2/AC-5: the week in progress counts up to now and compares with the same elapsed time last week', async () => {
    const app = await appWith(new MockLLMProvider('openai'));
    const dg = (await get(app)).json() as WeeklyDigest;
    expect(dg.in_progress).toBe(true);
    expect(dg.facts.cost_usd).toBeNull(); // the run stamped later this week is not here yet
    expect(dg.agents).toEqual([]); // nor among the agents
    expect(dg.open_criticals_total).toBe(0); // nor its critical
    expect(dg.prev.cost_usd).toBeCloseTo(0.01); // the second run of last week is past the same elapsed time
  });

  it('AC-5: the current week by default, in progress; malformed, non-existent and future weeks are 422; no model call', async () => {
    const llm = new MockLLMProvider('openai');
    const app = await appWith(llm);
    const now = (await get(app)).json() as WeeklyDigest;
    expect(now.in_progress).toBe(true);
    for (const bad of ['2025-W53', '2026-W00', '2026-40', 'soon', '2099-W01', '0001-W01', '0026-W42', '1969-W52']) expect((await get(app, bad)).statusCode).toBe(422);
    expect((await get(app, '1970-W01')).statusCode).toBe(200);
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
    expect(failed.json().error.message).not.toMatch(/highlights:.*highlights:/i);
    expect((await write(offSchema, '2026-W40')).statusCode).toBe(502); // the failed request let go of the week: not a 409
    const noKey = await write(await appWith(null), '2026-W40');
    expect(noKey.statusCode).toBe(502);
    expect(noKey.json().error.message).toMatch(/key|configured/i);
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
    const before = ((await get(app, '2026-W40')).json() as WeeklyDigest).highlights!;
    const first = write(app, '2026-W40');
    await new Promise((r) => setTimeout(r, 50));
    expect((await write(app, '2026-W40')).statusCode).toBe(409);
    gated.release();
    expect((await first).statusCode).toBe(200);
    // AC-8: asking again replaced the stored lines and when they were written.
    const after = ((await get(app, '2026-W40')).json() as WeeklyDigest).highlights!;
    expect(after.lines).toEqual(['PR #2 is merged.']);
    expect(Date.parse(after.generated_at)).toBeGreaterThan(Date.parse(before.generated_at));
  });

  it('AC-6: at most 5 lines are kept, however many check out', async () => {
    const lines = ['PR #1 had a review.', 'PR #2 is merged.', 'PR #1 has an open critical finding.', 'PR #2 has open critical findings.', 'PR #2 was reviewed.', 'PR #1 was reviewed.'];
    const app = await appWith(new MockLLMProvider('openai', { structuredBySchema: { WeeklyDigestHighlights: { highlights: lines } } }));
    expect(((await write(app, '2026-W40')).json() as WeeklyDigest).highlights!.lines).toEqual(lines.slice(0, 5));
  });
});
