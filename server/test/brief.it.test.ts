import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { StructuredRequest, StructuredResult, HistoryCommit } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockEmbedder, MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = [
  'diff --git a/server/src/routes.ts b/server/src/routes.ts', '--- a/server/src/routes.ts', '+++ b/server/src/routes.ts',
  '@@ -10,2 +10,3 @@', ' const app = x;', '-old();', '+fetch(req.body.url);', '+next();',
  'diff --git a/server/package.json b/server/package.json', '--- a/server/package.json', '+++ b/server/package.json',
  '@@ -1,1 +1,2 @@', ' {', '+  "ioredis": "5"',
  'diff --git a/server/pnpm-lock.yaml b/server/pnpm-lock.yaml', '--- a/server/pnpm-lock.yaml', '+++ b/server/pnpm-lock.yaml',
  '@@ -1,1 +1,2 @@', ' a', '+b',
].join('\n');
const HISTORY: HistoryCommit[] = [
  { sha: 'm1', subject: 'Merge pull request #4 from acme/rate-limit', body: 'Rate limit public routes', author: 'merger', date: '2026-10-01T10:00:00Z', files: ['server/src/routes.ts', 'server/pnpm-lock.yaml'] },
  { sha: 'c1', subject: 'tweak', body: '', author: 'dev', date: '2026-09-30T10:00:00Z', files: ['server/src/routes.ts'] },
];
const OUTPUT = (title: string) => ({
  risks: [{ kind: 'security', severity: 'high', title, explanation: 'The URL from the body is fetched.', file_refs: ['server/src/routes.ts:11'] }],
  review_focus: [{ file: 'server/src/routes.ts', line: 11, reason: 'The fetch.' }],
  history_notes: [{ pr_number: 4, note: 'Added the limiter.' }],
});

/** Holds its first call until `release()` — a generation in flight. */
class GatedLLM extends MockLLMProvider {
  release!: () => void;
  private gate = new Promise<void>((r) => (this.release = r));
  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const res = super.completeStructured(req);
    await this.gate;
    return res;
  }
}

d('HW L05 risk brief — SPEC-03 (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  const apps: FastifyInstance[] = [];
  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    workspaceId = (await pg.handle.db.select().from(t.workspaces))[0]!.id;
  }, 120_000);
  afterAll(async () => {
    await Promise.all(apps.map((a) => a.close()));
    await pg?.stop();
  });

  async function appWith(llm: MockLLMProvider | null, git = new MockGitClient({ diff: DIFF, history: HISTORY }), github = new MockGitHubClient({ pulls: [] })) {
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { embedder: new MockEmbedder(), git, github, llm: llm ? { openai: llm, openrouter: llm } : {} },
    });
    apps.push(app);
    return app;
  }

  async function pr() {
    const db = pg.handle.db;
    const name = `brief-${randomUUID().slice(0, 8)}`;
    const [repo] = await db.insert(t.repos).values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` }).returning();
    const row = (number: number, title: string) => ({ workspaceId, repoId: repo!.id, number, title, author: 'a', branch: 'b', base: 'main', headSha: 'head1', status: 'needs_review' });
    await db.insert(t.pullRequests).values(row(4, 'Rate limit public API routes'));
    const [pull] = await db.insert(t.pullRequests).values(row(9, 'Share reviews')).returning();
    return pull!.id;
  }

  const briefCalls = (llm: MockLLMProvider) => llm.calls.filter((c) => (c.req as { schemaName?: string }).schemaName === 'RiskBrief');

  it('AC-1/AC-3/AC-5/AC-8/AC-16: one call over the review diff; history with known titles; GET is free and reports staleness', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { RiskBrief: OUTPUT('SSRF via the webhook URL') } });
    const git = new MockGitClient({ diff: DIFF, history: HISTORY });
    const history = vi.spyOn(git, 'history');
    const app = await appWith(llm, git);
    const prId = await pr();
    expect((await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` })).json()).toEqual({ brief: null, stale: false });

    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    expect(res.statusCode).toBe(200);
    const { brief } = res.json();
    expect(briefCalls(llm)).toHaveLength(1);
    expect((briefCalls(llm)[0]!.req as { maxRetries?: number }).maxRetries).toBe(0);
    expect(brief.meta).toMatchObject({ source: 'model', model: 'gpt-4.1', cost_usd: 0.001, head_sha: 'head1' });
    // The model's security risk is another kind, so the routes signal stays (AC-12).
    expect(brief.risks.map((r: { kind: string }) => r.kind)).toEqual(['security', 'deps', 'breaking_api']);
    expect(brief.review_focus).toEqual([{ file: 'server/src/routes.ts', line: 11, reason: 'The fetch.' }]);
    // The lockfile is noise for history; PR #4 keeps DevDigest's title; the direct commit is skipped.
    expect(history.mock.calls[0]![1]).toEqual(['server/src/routes.ts', 'server/package.json']);
    expect(brief.history).toEqual([
      { pr_number: 4, title: 'Rate limit public API routes', merged_at: '2026-10-01T10:00:00Z', author: 'merger', files_overlap: ['server/src/routes.ts'], notes: 'Added the limiter.' },
    ]);
    expect(brief.history_state).toBe('ok');

    const again = (await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` })).json();
    expect(again).toEqual({ brief, stale: false });
    await pg.handle.db.update(t.pullRequests).set({ headSha: 'head2' }).where(eq(t.pullRequests.id, prId));
    expect((await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` })).json().stale).toBe(true);
    expect(briefCalls(llm)).toHaveLength(1);
  });

  it('AC-7: says the history is limited on a shallow clone and unavailable without one', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { RiskBrief: OUTPUT('x') } });
    const shallow = await appWith(llm, new MockGitClient({ diff: DIFF, history: HISTORY, shallow: true }));
    expect((await shallow.inject({ method: 'POST', url: `/pulls/${await pr()}/brief` })).json().brief.history_state).toBe('limited');
    const none = await appWith(llm, new MockGitClient({ diff: DIFF, history: HISTORY, noClone: true }));
    const brief = (await none.inject({ method: 'POST', url: `/pulls/${await pr()}/brief` })).json().brief;
    expect(brief.history_state).toBe('unavailable');
    expect(brief.history).toEqual([]);
  });

  it('AC-15/AC-17: signals-only on failure; a model brief of the same head is kept, one of an older head is replaced', async () => {
    const prId = await pr();
    const broken = await appWith(new MockLLMProvider('openai', { structuredBySchema: { RiskBrief: { nonsense: true } } }));
    const first = (await broken.inject({ method: 'POST', url: `/pulls/${prId}/brief` })).json().brief;
    expect(first.meta).toMatchObject({ source: 'signals', model: null, cost_usd: null });
    expect(first.risks.map((r: { kind: string }) => r.kind)).toEqual(['deps', 'breaking_api']);

    const good = await appWith(new MockLLMProvider('openai', { structuredBySchema: { RiskBrief: OUTPUT('model risk') } }));
    expect((await good.inject({ method: 'POST', url: `/pulls/${prId}/brief` })).json().brief.meta.source).toBe('model');

    const failed = await broken.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    expect(failed.statusCode).toBe(502);
    expect(failed.json().error.message).toMatch(/previous brief is kept/);
    expect((await broken.inject({ method: 'GET', url: `/pulls/${prId}/brief` })).json().brief.risks[0].title).toBe('model risk');

    await pg.handle.db.update(t.pullRequests).set({ headSha: 'head2' }).where(eq(t.pullRequests.id, prId));
    const replaced = await broken.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    expect(replaced.statusCode).toBe(200);
    expect(replaced.json().brief.meta).toMatchObject({ source: 'signals', head_sha: 'head2' });
  });

  it('AC-15: with no provider key the brief is signals-only and says why', async () => {
    const app = await appWith(null);
    const brief = (await app.inject({ method: 'POST', url: `/pulls/${await pr()}/brief` })).json().brief;
    expect(brief.meta.source).toBe('signals');
    expect(brief.meta.reason).toMatch(/key/i);
  });

  it('AC-18: refuses a second generation while one runs, and a PR with no diff anywhere', async () => {
    const llm = new GatedLLM('openai', { structuredBySchema: { RiskBrief: OUTPUT('gated') } });
    const app = await appWith(llm);
    const prId = await pr();
    const first = app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    for (let i = 0; i < 50 && briefCalls(llm).length === 0; i++) await new Promise((r) => setTimeout(r, 20));
    expect((await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` })).statusCode).toBe(409);
    llm.release();
    expect((await first).statusCode).toBe(200);

    // No diff from git, none stored, and GitHub returns the PR without files.
    const empty = await appWith(new MockLLMProvider('openai'), new MockGitClient({ diff: '' }), new MockGitHubClient({ pulls: [], detail: { files: [] } }));
    const res = await empty.inject({ method: 'POST', url: `/pulls/${await pr()}/brief` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.message).toMatch(/No diff to brief/);
  });
});
