import { describe, it, expect } from 'vitest';
import { githubPrUrl, oldSideLines } from '../src/modules/why/helpers.js';

describe('oldSideLines', () => {
  it('SPEC-04 AC-4: removed and context lines by their base numbers, never added ones', () => {
    const patch = ['@@ -10,3 +10,4 @@ fn()', ' a', '-b', '+c', '+d', ' e', '@@ -40,1 +42,1 @@', '-x', '+y', '\\ No newline at end of file'].join('\n');
    expect([...oldSideLines(patch)]).toEqual([10, 11, 12, 40]);
    expect(oldSideLines(null).size).toBe(0);
  });
});

describe('githubPrUrl', () => {
  it('SPEC-04 AC-7: built from repo coordinates and an integer only', () => {
    expect(githubPrUrl('acme', 'api', 12)).toBe('https://github.com/acme/api/pull/12');
    expect(githubPrUrl('a/../b', 'x?y', 1)).toBe('https://github.com/a%2F..%2Fb/x%3Fy/pull/1');
  });
});
