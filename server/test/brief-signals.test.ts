import { describe, it, expect } from 'vitest';
import { historyItems, prNumberOf, riskSignals } from '../src/modules/reviews/brief/signals.js';

const f = (path: string, deletions = 0) => ({ path, additions: 3, deletions, patch: null });

// SPEC-03 — signals and history are rules: no model involved.
describe('riskSignals', () => {
  it('AC-2: raises each rule of the table with its kind and severity', () => {
    const signals = riskSignals([
      f('server/src/db/migrations/0013_x.sql'),
      f('server/src/db/schema/agents.ts'),
      f('server/package.json'),
      f('server/pnpm-lock.yaml'),
      f('.github/workflows/ci.yml'),
      f('server/src/modules/auth/session.ts'),
      f('server/.env.example'),
      f('server/src/modules/reviews/routes.ts', 4),
      f('server/src/vendor/shared/contracts/brief.ts'),
    ]);
    expect(signals.map((s) => [s.kind, s.severity, s.files])).toEqual([
      ['db_migration', 'high', ['server/src/db/migrations/0013_x.sql']],
      ['db_migration', 'medium', ['server/src/db/schema/agents.ts']],
      ['deps', 'medium', ['server/package.json']],
      ['security', 'high', ['.github/workflows/ci.yml']],
      ['security', 'high', ['server/src/modules/auth/session.ts', 'server/.env.example']],
      ['breaking_api', 'medium', ['server/src/modules/reviews/routes.ts']],
      ['breaking_api', 'low', ['server/src/vendor/shared/contracts/brief.ts']],
    ]);
    expect(signals.every((s) => s.title && s.reason)).toBe(true);
  });

  it('AC-2: a lockfile alone is a low deps signal; tests and docs raise nothing', () => {
    expect(riskSignals([f('client/pnpm-lock.yaml')]).map((s) => [s.kind, s.severity])).toEqual([['deps', 'low']]);
    expect(riskSignals([f('server/test/auth.test.ts'), f('docs/README.md'), f('src/tokenizer.ts')])).toEqual([]);
  });
});

describe('prNumberOf', () => {
  it('AC-4: reads merge and squash subjects, taking the trailing (#N)', () => {
    expect(prNumberOf('Merge pull request #4 from acme/lab-1')).toBe(4);
    expect(prNumberOf('Merge pull request #4: Lab 1')).toBe(4);
    expect(prNumberOf('Fix #12 crash in parser (#31)')).toBe(31);
    expect(prNumberOf('tweak config')).toBeNull();
  });
});

describe('historyItems', () => {
  const c = (subject: string, files = ['src/a.ts']) => ({ sha: subject, subject, author: 'merger', date: '2026-10-01T10:00:00+02:00', files });

  it('AC-3/AC-4/AC-5: merged PRs DevDigest knows only, newest first, the PR itself left out, a number once', () => {
    const merged = new Map([
      [12, 'Rate limit public routes'],
      [9, 'This PR'],
      [7, 'Add caching'],
      [5, 'Known title from DevDigest'],
    ]);
    const items = historyItems(
      [
        c('Merge pull request #12 from acme/x'),
        c('direct fix'),
        c('Merge pull request #9 from acme/self'),
        c('Add caching (#7)'),
        c('Merge pull request #7 from acme/again'),
        c('chore: cleanup (#11)'), // the upstream's #11 in a fork: unknown here
        c('Merge pull request #5 from acme/y'),
      ],
      merged,
      9,
    );
    expect(items.map((i) => [i.pr_number, i.title])).toEqual([
      [12, 'Rate limit public routes'],
      [7, 'Add caching'],
      [5, 'Known title from DevDigest'],
    ]);
    expect(items[0]).toMatchObject({ author: 'merger', files_overlap: ['src/a.ts'], notes: '' });
  });

  it('AC-3: stops at eight', () => {
    const many = Array.from({ length: 12 }, (_, i) => c(`Merge pull request #${100 - i} from acme/b${i}`));
    const merged = new Map(Array.from({ length: 12 }, (_, i) => [100 - i, `PR ${100 - i}`] as const));
    expect(historyItems(many, merged, 0)).toHaveLength(8);
  });
});
