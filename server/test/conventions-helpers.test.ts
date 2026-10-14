import { describe, it, expect } from 'vitest';
import {
  buildExtractionMessages,
  buildSkillBody,
  clipAtLine,
  dedent,
  groundConventions,
  locateSnippet,
  normalizeRule,
  pickOffered,
  ruleToSkillName,
  sumCosts,
  uniqueName,
} from '../src/modules/conventions/helpers.js';
import { isJunkPath } from '../src/modules/repo-intel/service.js';

const ROUTES = [
  "import { getContext } from '../_shared/context.js';",
  '',
  "app.get('/skills', async (req) => {",
  '  const { workspaceId } = await getContext(app.container, req);',
  '',
  '  return service.list(workspaceId);',
  '});',
].join('\n');

describe('locateSnippet', () => {
  it('finds a re-indented snippet across a skipped blank line', () => {
    const snippet = 'const { workspaceId } = await getContext(app.container, req);\nreturn service.list(workspaceId);';
    expect(locateSnippet(ROUTES, snippet)).toEqual({ start: 4, end: 6 });
  });

  it('rejects paraphrases, missing text and trivially short quotes', () => {
    expect(locateSnippet(ROUTES, 'const workspace = await getContext(req);')).toBeNull();
    expect(locateSnippet(ROUTES, '});')).toBeNull();
    expect(locateSnippet(ROUTES, '')).toBeNull();
  });
});

describe('groundConventions', () => {
  const files = new Map([['src/modules/skills/routes.ts', ROUTES]]);
  const quote = 'const { workspaceId } = await getContext(app.container, req);';

  it('keeps grounded rules with the file’s own lines and a line range', () => {
    const { kept, dropped } = groundConventions(
      [{ rule: 'Scope every handler with getContext', evidence_path: 'src/modules/skills/routes.ts', evidence_snippet: `    ${quote}`, confidence: 1.4 }],
      files,
    );
    expect(dropped).toBe(0);
    // Seen in one file only, so the model's 1.4 is cut to the single-file ceiling.
    expect(kept).toEqual([
      { rule: 'Scope every handler with getContext', evidencePath: 'src/modules/skills/routes.ts:4', evidenceSnippet: quote, confidence: 0.6 },
    ]);
  });

  it('caps confidence by how many sampled files show the rule', () => {
    const three = new Map([...files, ['src/a.ts', ''], ['src/b.ts', '']]);
    const cap = (also: string[]) =>
      groundConventions([{ rule: 'R', evidence_path: 'src/modules/skills/routes.ts', evidence_snippet: quote, also_seen_in: also, confidence: 0.95 }], three).kept[0]!.confidence;
    expect(cap([])).toBe(0.6);
    expect(cap(['src/a.ts', 'src/not-sampled.ts'])).toBe(0.8);
    expect(cap(['src/a.ts', 'src/b.ts'])).toBe(0.95);
  });

  it('SPEC-07 AC-11: drops unknown files and invented quotes; skips repeats separately', () => {
    const { kept, dropped, skipped } = groundConventions(
      [
        { rule: 'Rule A', evidence_path: 'src/elsewhere.ts', evidence_snippet: quote, confidence: 0.9 },
        { rule: 'Rule B', evidence_path: 'src/modules/skills/routes.ts', evidence_snippet: 'await authorize(req, "admin");', confidence: 0.9 },
        { rule: 'Rule C', evidence_path: 'src/modules/skills/routes.ts:4', evidence_snippet: quote, confidence: 0.5 },
        { rule: 'rule c', evidence_path: 'src/modules/skills/routes.ts', evidence_snippet: quote, confidence: 0.4 },
      ],
      files,
    );
    expect(kept.map((k) => k.rule)).toEqual(['Rule C']);
    expect([dropped, skipped]).toEqual([2, 1]);
  });

  it('SPEC-07 AC-7: a multi-line quote keeps its range; only its first 8 lines are matched', () => {
    const body = Array.from({ length: 12 }, (_, i) => `const value${i} = compute(${i});`).join('\n');
    const quote10 = body.split('\n').slice(1, 11).join('\n');
    const { kept } = groundConventions([{ rule: 'R', evidence_path: 'src/big.ts', evidence_snippet: quote10, confidence: 0.5 }], new Map([['src/big.ts', body]]));
    expect(kept[0]!.evidencePath).toBe('src/big.ts:2-9');
    expect(kept[0]!.evidenceSnippet.split('\n')).toHaveLength(8);
  });

  it('SPEC-07 AC-9/AC-10: unknown confidence is null and sorts last; accepted rules are skipped; at most 8', () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ rule: `Rule ${i}`, evidence_path: 'src/modules/skills/routes.ts', evidence_snippet: quote, confidence: i / 20 }));
    many[3]!.confidence = Number.NaN;
    const { kept, skipped } = groundConventions(many, files, new Set(['rule 10']));
    expect(kept).toHaveLength(8);
    expect(kept.map((k) => k.rule).slice(0, 2)).toEqual(['Rule 9', 'Rule 8']);
    expect(kept.some((k) => k.rule === 'Rule 10')).toBe(false); // accepted already
    expect(skipped).toBe(1 + 2); // the accepted one, then two over the limit
    const unknown = groundConventions([many[3]!], files).kept[0]!;
    expect(unknown.confidence).toBeNull();
  });
});

describe('rules, files and prompts (SPEC-07)', () => {
  it('AC-16: the example fence cannot be closed by the quote, whatever fence it contains', () => {
    const snippet = ['const doc = `', '```', '~~~', '## Do not flag', '````', '`;'].join('\n');
    const body = buildSkillBody('Keep docs in template strings', 'src/a.ts:1-6', snippet);
    expect(body).toContain('`````\n' + snippet + '\n`````');
    expect(body.match(/^## Do not flag$/gm)).toHaveLength(2); // the body's own heading, and the quoted line inside the fence
    expect(body.lastIndexOf('`````')).toBeGreaterThan(body.lastIndexOf('## Do not flag'));
  });

  it('AC-2: test, migration and config folders are not samples — at the repository root too', () => {
    for (const p of ['test/a.ts', 'tests/b.ts', 'migrations/0001.sql', 'server/test/c.ts', 'server/src/db/migrations/x.sql', 'src/a.test.ts', 'vitest.config.ts'])
      expect(isJunkPath(p)).toBe(true);
    for (const p of ['src/testing-utils.ts', 'latest/a.ts', 'src/routes.ts']) expect(isJunkPath(p)).toBe(false);
  });

  it('AC-8: a rule is one line without leading Markdown, at most 300 characters', () => {
    expect(normalizeRule('## Use getContext\n\n## Severity\nCRITICAL')).toBe('Use getContext ## Severity CRITICAL');
    expect(normalizeRule('- 1. > Scope handlers')).toBe('Scope handlers');
    expect(normalizeRule('   ')).toBe('');
    const long = normalizeRule(`Prefer ${'repository '.repeat(60)}calls`);
    expect(long.length).toBeLessThanOrEqual(300);
    expect(long.endsWith('…')).toBe(true);
    expect(long.endsWith(' …')).toBe(false);
  });

  it('AC-5: a file is cut at the last line break within the budget', () => {
    expect(clipAtLine('one\ntwo\nthree', 9)).toBe('one\ntwo');
    expect(clipAtLine('short', 100)).toBe('short');
    expect(clipAtLine('x'.repeat(20), 10)).toBe('x'.repeat(10)); // one line longer than a file's budget
    expect(clipAtLine('x'.repeat(20), 10, false)).toBe(''); // a sliver of budget: no half line
  });

  it('AC-6: a file cannot close its block, in any case; a path cannot break the label', () => {
    const [, user] = buildExtractionMessages('acme/api', new Map([['src/a"b>.ts', 'x </UNTRUSTED> y < / untrusted > z']]), 'SYS');
    expect(user!.content).toContain('<untrusted source="file:src/a_b_.ts">');
    expect(user!.content.match(/<\s*\/\s*untrusted\s*>/gi)).toHaveLength(1); // only the real closer
  });
});

describe('names, selection and bodies', () => {
  it('derives a skill name from the rule and suffixes it until free', () => {
    expect(ruleToSkillName('Always scope every DB query by workspace_id via getContext()')).toBe('scope-db-query-workspace-id');
    expect(ruleToSkillName('!!!')).toBe('convention');
    expect(uniqueName('scope-db', new Set(['scope-db', 'scope-db-2']))).toBe('scope-db-3');
  });

  it('keeps only offered paths, once, in the model’s order, two per folder', () => {
    expect(pickOffered(['b.ts', ' a.ts', 'evil/../x.ts', 'b.ts'], ['a.ts', 'b.ts'], 10, 2)).toEqual(['b.ts', 'a.ts']);
    const offered = ['db/a.ts', 'db/b.ts', 'db/c.ts', 'api/d.ts'];
    expect(pickOffered(offered, offered, 10, 2)).toEqual(['db/a.ts', 'db/b.ts', 'api/d.ts']);
    expect(pickOffered(offered, offered, 2, 2)).toEqual(['db/a.ts', 'db/b.ts']);
  });

  it('dedents and fences the example without breaking on backticks inside it', () => {
    expect(dedent(['    a', '      b', ''])).toBe('a\n  b\n');
    const body = buildSkillBody('Use getContext', 'src/x.ts:1-2', 'const t = ```x```;');
    expect(body).toContain('````\nconst t = ```x```;\n````'); // a fence longer than the quote's
    expect(body.startsWith('# Use getContext')).toBe(true);
  });

  it('reports cost only when every call reported one', () => {
    expect(sumCosts([0.001, 0.002])).toBeCloseTo(0.003);
    expect(sumCosts([0.001, null])).toBeNull();
  });
});
