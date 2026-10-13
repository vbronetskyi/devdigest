import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockEmbedder, MockGitClient, MockGitHubClient, MockLLMProvider, type MockGitOptions } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const PATCH = ['@@ -10,3 +10,4 @@', ' const app = x;', '-old();', '+fetch(url);', '+next();', ' return app;'].join('\n');
const FILE = 'server/src/routes.ts';
const BLAME = { sha: 'c0ffee0000000000000000000000000000000000', author: 'dev', date: '2026-09-01T10:00:00.000Z', summary: 'Wire the routes', boundary: false };

d('HW L05 git-why — SPEC-04 (Testcontainers pg)', () => {
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

  async function setup(git: MockGitOptions = {}, base = 'main') {
    const mock = new MockGitClient({ blame: { [`${FILE}:11`]: BLAME }, mergedVia: { [BLAME.sha]: { sha: 'm1', subject: 'Merge pull request #4 from acme/routes' } }, ...git });
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { embedder: new MockEmbedder(), git: mock, github: new MockGitHubClient({ pulls: [] }), llm: { openai: new MockLLMProvider('openai') } },
    });
    apps.push(app);
    const db = pg.handle.db;
    const name = `why-${randomUUID().slice(0, 8)}`;
    const [repo] = await db.insert(t.repos).values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, defaultBranch: 'main' }).returning();
    const row = (number: number, title: string) => ({ workspaceId, repoId: repo!.id, number, title, author: 'a', branch: 'b', base, headSha: 'head1', status: 'needs_review' });
    await db.insert(t.pullRequests).values(row(4, 'Add the routes module'));
    const [pull] = await db.insert(t.pullRequests).values(row(9, 'Share reviews')).returning();
    await db.insert(t.prFiles).values({ prId: pull!.id, path: FILE, additions: 2, deletions: 1, patch: PATCH });
    const why = (file: string, line: string | number, id = pull!.id) =>
      app.inject({ method: 'GET', url: `/pulls/${id}/why`, query: { file, line: String(line) } });
    return { why, mock, name };
  }

  it('AC-6/AC-7: blames the line at the merge base and names the PR that brought the commit in', async () => {
    const { why, mock, name } = await setup();
    const res = await why(FILE, 11);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      file: FILE,
      line: 11,
      commit: { sha: BLAME.sha, author: 'dev', date: BLAME.date, subject: 'Wire the routes' },
      boundary: false,
      pr: { number: 4, title: 'Add the routes module', url: `https://github.com/acme/${name}/pull/4` },
      note: null,
    });
    expect(mock.blameRevs).toEqual(['base000']);
  });

  it('AC-7/AC-8/AC-9: squash subject when no merge; boundary note; no history for a new file', async () => {
    const squash = await setup({ mergedVia: {}, blame: { [`${FILE}:11`]: { ...BLAME, summary: 'Add rate limits (#7)' } } });
    expect((await squash.why(FILE, 11)).json().pr).toMatchObject({ number: 7, title: null });
    const root = await setup({ blame: { [`${FILE}:11`]: { ...BLAME, boundary: true } } });
    expect((await root.why(FILE, 11)).json()).toMatchObject({ boundary: true, note: expect.stringMatching(/earlier history is not available/) });
    const fresh = await setup({ blame: {} });
    expect((await fresh.why(FILE, 11)).json()).toMatchObject({ commit: null, pr: null, note: expect.stringMatching(/new or renamed/) });
  });

  it('AC-1–AC-5: 404 PR, 409 non-default base, 422 bad line, 404 file or line, 409 no clone or unknown merge base — before any blame', async () => {
    const ok = await setup();
    expect((await ok.why(FILE, 11, randomUUID())).statusCode).toBe(404);
    for (const bad of ['abc', '0', '-3', '1.5']) expect((await ok.why(FILE, bad)).statusCode).toBe(422);
    expect((await ok.why('server/src/other.ts', 11)).statusCode).toBe(404);
    expect((await ok.why(FILE, 13)).statusCode).toBe(404); // added on the new side only
    expect((await ok.why('--output=/tmp/x', 11)).statusCode).toBe(404);
    expect(ok.mock.blameRevs).toEqual([]);

    const develop = await setup({}, 'develop');
    const res = await develop.why(FILE, 11);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.message).toMatch(/default branch/);

    expect((await (await setup({ noClone: true })).why(FILE, 11)).statusCode).toBe(409);
    const unknown = await setup({ mergeBase: null });
    const r = await unknown.why(FILE, 11);
    expect(r.statusCode).toBe(409);
    expect(r.json().error.message).toMatch(/could not be fetched/);
  });
});
