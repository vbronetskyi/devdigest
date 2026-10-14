import { describe, it, expect } from 'vitest';
import type { DigestFacts, WeeklyDigest } from '@devdigest/shared';
import { changeOf, checkHighlight, costText, factsText, formatWeek, numbersIn, parseWeek, previousSpan, weekBounds, weekOf, weeksInYear } from '../src/modules/digest/helpers.js';

const facts = (over: Partial<DigestFacts> = {}): DigestFacts => ({
  prs_opened: 2,
  prs_reviewed: 3,
  runs: 9,
  failed: 1,
  cost_usd: 0.0049,
  runs_without_cost: 0,
  findings: { CRITICAL: 4, WARNING: 10, SUGGESTION: 3 },
  accepted: 10,
  dismissed: 6,
  accept_rate: 0.625,
  ...over,
});

// SPEC-06 — weeks, facts text, number check.
describe('ISO weeks', () => {
  it('AC-5: week-year rules — W01 can start in December; W53 exists only in long years', () => {
    expect(weekBounds({ year: 2026, week: 1 }).from.toISOString()).toBe('2025-12-29T00:00:00.000Z');
    expect(weeksInYear(2026)).toBe(53); // Jan 1 2026 is a Thursday
    expect(weeksInYear(2025)).toBe(52);
    expect(parseWeek('2026-W53')).toEqual({ year: 2026, week: 53 });
    expect(parseWeek('2025-W53')).toBeNull();
    for (const bad of ['2026-W00', '2026-W5', '2026W05', '26-W05', '2026-w05', '']) expect(parseWeek(bad)).toBeNull();
  });

  it('knows which week an instant is in, across a year boundary', () => {
    expect(formatWeek(weekOf(new Date('2026-10-14T19:30:00Z')))).toBe('2026-W42');
    expect(formatWeek(weekOf(new Date('2025-12-30T10:00:00Z')))).toBe('2026-W01');
    expect(formatWeek(weekOf(new Date('2027-01-01T10:00:00Z')))).toBe('2026-W53');
  });

  it('AC-2: a week in progress is compared with the same elapsed span of the week before', () => {
    const { from, to } = weekBounds({ year: 2026, week: 42 });
    const wednesday = new Date('2026-10-14T19:30:00Z');
    const prev = previousSpan(from, to, wednesday);
    expect(prev.from.toISOString()).toBe('2026-10-05T00:00:00.000Z');
    expect(prev.to.toISOString()).toBe('2026-10-07T19:30:00.000Z');
    const past = previousSpan(from, to, new Date('2026-11-01T00:00:00Z'));
    expect(past.to.toISOString()).toBe('2026-10-12T00:00:00.000Z'); // a finished week: the whole previous week
  });
});

describe('facts and the number check (AC-7)', () => {
  const base = {
    week: '2026-W42',
    from: '2026-10-12T00:00:00.000Z',
    to: '2026-10-19T00:00:00.000Z',
    in_progress: true,
    empty: false,
    facts: facts(),
    prev: facts({ prs_opened: 0, runs: 26, cost_usd: 0.0179, accept_rate: null, accepted: 0, dismissed: 0 }),
    open_criticals: [
      { finding_id: 'f', repo_id: 'r', repo_full_name: 'acme/api', pr_number: 3, pr_title: 'Share a review', pr_state: null, file: 'server/src/routes.ts', line: 153, title: 'SSRF via the webhook URL', agent_name: 'Security Reviewer', ran_at: '' },
    ],
    open_criticals_total: 4,
    agents: [{ agent_id: 'a', name: 'General Reviewer', runs: 3, cost_usd: 0.0016, accept_rate: 0.5714, decided: 7 }],
  } as Omit<WeeklyDigest, 'change' | 'highlights'>;
  const digest = { ...base, change: changeOf(base.facts, base.prev) };
  const text = factsText(digest);
  const allowed = numbersIn(text);

  it('writes changes in words and costs in the display form; unknown is null', () => {
    expect(text).toContain('Review runs: 9 [26], change down 17');
    expect(text).toContain('PRs opened: 2 [0], change up 2');
    expect(text).toContain('Cost of finished runs: $0.0049 [$0.0179], change down $0.013');
    expect(text).toContain('accept rate 63% [null]');
    expect(text).toContain('- PR #3 "Share a review": SSRF via the webhook URL — server/src/routes.ts:153 (Security Reviewer)');
    expect(costText(1.234)).toBe('$1.23');
    expect(costText(0)).toBe('$0');
  });

  it('numbers: $, % and separators dropped, trailing zeros ignored; dates, versions and code spans are not numbers', () => {
    expect([...numbersIn('$1,234.50 and 63% of 7 runs, PR #3')].sort()).toEqual(['1234.5', '3', '63', '7']);
    expect([...numbersIn('gpt-4.1 on 2026-10-12 in W42, v2 and `x = 99`')]).toEqual([]);
  });

  it('keeps a line whose numbers are all in the facts; drops invented numbers and number words', () => {
    expect(checkHighlight('Runs fell to 9 from 26 while the accept rate reached 63%.', allowed)).toBe('Runs fell to 9 from 26 while the accept rate reached 63%.');
    expect(checkHighlight('PR #3 still has an open SSRF finding at server/src/routes.ts:153.', allowed)).not.toBeNull();
    expect(checkHighlight('Cost dropped by $0.013 to $0.0049.', allowed)).not.toBeNull();
    expect(checkHighlight('Runs fell by 65%.', allowed)).toBeNull(); // 65 is not in the facts
    expect(checkHighlight('Twice as many findings were accepted.', allowed)).toBeNull();
    expect(checkHighlight('Three PRs were reviewed.', allowed)).toBeNull();
  });

  it('strips links and HTML first and cuts the line to 200 characters', () => {
    expect(checkHighlight('See [the PR](https://evil.example/3) <b>now</b>', allowed)).toBe('See the PR now');
    const long = checkHighlight(`PR #3 ${'is still open '.repeat(30)}`, allowed)!;
    expect(long.length).toBeLessThanOrEqual(200);
    expect(long.endsWith('…')).toBe(true);
  });
});
