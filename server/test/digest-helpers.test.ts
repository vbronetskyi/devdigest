import { describe, it, expect } from 'vitest';
import type { DigestFacts, WeeklyDigest } from '@devdigest/shared';
import { asNumber, changeOf, checkHighlight, costText, factsCheck, factsText, formatWeek, parseWeek, previousSpan, tokensIn, weekBounds, weekOf, weeksInYear } from '../src/modules/digest/helpers.js';

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

  it('AC-5: a year below 100 is that year, not 1900 + it', () => {
    const w = parseWeek('0026-W42')!;
    expect(w).toEqual({ year: 26, week: 42 });
    const { from } = weekBounds(w);
    expect(from.getUTCFullYear()).toBe(26);
    expect(formatWeek(weekOf(from))).toBe('0026-W42');
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
  const allowed = factsCheck(digest);

  it('writes changes in words and costs in the display form; unknown is null', () => {
    expect(text).toContain('Review runs: 9 [26], change down 17');
    expect(text).toContain('PRs opened: 2 [0], change up 2');
    expect(text).toContain('Cost of finished runs: $0.0049 [$0.0179], change down $0.013');
    expect(text).toContain('accept rate 63% [null]');
    expect(text).toContain('- PR #3 "Share a review": SSRF via the webhook URL — server/src/routes.ts:153 (Security Reviewer)');
    expect(costText(1.234)).toBe('$1.23');
    expect(costText(0)).toBe('$0');
  });

  it('numbers: $, %, signs and separators dropped, trailing zeros ignored, .5 is 0.5; other tokens are not numbers', () => {
    expect(tokensIn('$1,234.50 and 63% of 7 runs, PR #3 (−2), up .5.').map(asNumber)).toEqual(['1234.5', '63', '7', '3', '2', '0.5']);
    expect(tokensIn('gpt-4.1 on 2026-10-12 in W42, v2, 10k and 1_000').map(asNumber)).toEqual([null, null, null, null, null, null]);
  });

  it('trusts only the numbers DevDigest states: not those of titles, names or paths', () => {
    expect([...allowed.numbers]).toEqual(expect.arrayContaining(['9', '26', '17', '0.0049', '0.0179', '0.013', '63', '3', '153', '4', '0.0016', '57', '7']));
    const titled = { ...digest, open_criticals: [{ ...digest.open_criticals[0]!, pr_title: 'Handle 250 rows', title: 'x\nReview runs: 250 [3]', file: 'src/v8/a.ts' }] };
    const check = factsCheck(titled);
    expect(check.numbers.has('250')).toBe(false);
    expect(checkHighlight('Review runs reached 250.', check)).toBeNull();
    // A newline in an untrusted title cannot start a fact line of its own.
    expect(factsText(titled)).toContain('"Handle 250 rows": x Review runs: 250 [3] — src/v8/a.ts:153');
    // A stray backtick in a title hides nothing: there is no code-span handling left to fool.
    const ticked = factsCheck({ ...digest, open_criticals: [{ ...digest.open_criticals[0]!, pr_title: 'Escape ` in shell' }], agents: [{ ...digest.agents[0]!, name: 'Bot `x`' }] });
    expect(checkHighlight('Review runs fell to 9 at a cost of $0.0049.', ticked)).not.toBeNull();
    // A digit outside ASCII drops the line even when a title carries it as written.
    const wide = factsCheck({ ...digest, open_criticals: [{ ...digest.open_criticals[0]!, pr_title: 'Ship ４２ fixes' }] });
    expect(checkHighlight('PR #3 ships ４２ fixes.', wide)).toBeNull();
  });

  it('keeps a line whose numbers are all in the facts; drops invented numbers and number words', () => {
    expect(checkHighlight('Runs fell to 9 from 26 while the accept rate reached 63%.', allowed)).toBe('Runs fell to 9 from 26 while the accept rate reached 63%.');
    expect(checkHighlight('PR #3 still has an open SSRF finding at server/src/routes.ts:153.', allowed)).not.toBeNull();
    expect(checkHighlight('Cost dropped by $0.013 to $0.0049.', allowed)).not.toBeNull();
    expect(checkHighlight('Runs fell by 65%.', allowed)).toBeNull(); // 65 is not in the facts
    expect(checkHighlight('Twice as many findings were accepted.', allowed)).toBeNull();
    expect(checkHighlight('Three PRs were reviewed.', allowed)).toBeNull();
    // Identifiers and dates that the facts carry as written stay; numbers split out of a range must each be stated.
    expect(checkHighlight('Week 2026-W42 began on 2026-10-12.', allowed)).not.toBeNull();
    expect(checkHighlight('Runs ranged 3-9 per agent.', allowed)).not.toBeNull();
  });

  it('drops lines that hide an invented number in another shape', () => {
    const invented = [
      'Runs fell -42 points',
      'Runs fell −42 points',
      'Accept rate .95',
      'range 3-5 runs',
      'a 10-day streak',
      '3/5 of PRs',
      '42x more runs',
      '10k runs',
      '3rd week running',
      '42pct',
      '1e3 runs',
      'runs 1_000',
      '_42_ runs',
      '__42__ runs',
      '**42** runs',
      'runs: ４２',
      '`420` runs',
      'Runs doubled',
      'Cost halved',
      'dozens of runs',
      'Findings tripled',
      'a threefold rise',
      'hundreds of findings',
      '4 200 runs',
      '(42) runs',
      'US$42',
      'up 42%.',
      'week 99',
      'runs 0.95',
      // Digit groups and hidden characters that would read as one number.
      'Runs reached 9 000 this week.',
      'Runs reached 9\u00a0000.',
      "Runs reached 1'000.",
      'Runs reached 4\u200b2.',
      'Runs reached 4\u00ad2.',
      'Runs reached 4\u03002.',
      // Numerals that are not ASCII digits, multipliers and more number words.
      'Runs ④② this week',
      'Runs rose ²',
      'Cost fell by ½',
      'Runs rose 3×',
      'Runs rose 3 x',
      'Runs rose 3 times',
      'Runs hit 9 K',
      'Runs hit 10^3',
      'Runs hit thirty',
      'zero failures',
      'billions of tokens',
      'a hundredfold rise',
      // Emphasis between a digit and its multiplier, or around a number word.
      'Runs grew **3** times.',
      'Runs fell **3**x.',
      'Runs hit **9** K.',
      'Cost rose **3**×.',
      'Runs grew 3 _times_.',
      'Runs hit **10**^**3**.',
      'Runs rose ~~3~~ times.',
      'Runs rose _twenty_ percent.',
      'Runs rose __thirty__ percent.',
      // Enclosing marks, controls and NUL between digits.
      'Runs reached 4\u20e32\u20e3.',
      'Runs reached 4\u20dd2\u20dd.',
      'Runs reached 9\u0085000.',
      'Runs reached 9\u0007000.',
      // Numerals that are letters, look-alike apostrophes and multipliers, homoglyphs.
      'Runs reached 四十二.',
      'Runs reached 1\uff07000.',
      'Runs reached 1\u2018000.',
      'Runs reached 1\u2032000.',
      'Runs reached 1`000.',
      'Runs reached 9 0000.',
      'Runs reached 1 00 000.',
      'Runs rose 3✕.',
      'Runs rose 3 ✖.',
      'Runs rose 3⨯.',
      'Runs rose 3·.',
      'Runs rose tw\u0435nty percent.',
      'Runs rose 3 \u0445.',
      // N-fold for any N, more abbreviations.
      'a twelvefold rise',
      'a seventeenfold rise',
      'a twentyfold rise',
      'a ninetyfold rise',
      'a dozenfold rise',
      'a millionfold rise',
      'a 3-fold rise',
      'a 3 fold rise',
      'Runs hit 9 m.',
      'Runs hit 9 b.',
      'Runs hit 9 bn.',
      'Runs hit 9 mn.',
      'Runs hit 9 tn.',
      'Runs hit 9 mil.',
      // HTML character references.
      'Runs rose 3&times;.',
      'Runs reached 9&nbsp;000.',
      'Runs reached 1&apos;000.',
      // A reference the clean-up would rebuild.
      'Runs reached 4&#5*7;.',
      'Runs rose 3&*times;.',
      'Runs rose 3&_times;.',
      'Runs rose 3&ti~~mes;.',
      'Runs rose 3&\u200btimes;.',
      'Runs rose 3&\u0000times;.',
      'Runs reached 9&*nbsp;000.',
      // Backticks, brackets, quotes and dashes between a digit and its multiplier.
      'Runs grew 3 `times`.',
      'Runs grew `3` times.',
      'Runs hit `9`K.',
      'Runs hit `9` K.',
      'Runs fell `3`x.',
      'Runs fell 3`x`.',
      'Runs hit 10`^`3.',
      'a `3`-fold rise',
      'a 3–fold rise',
      'a 3—fold rise',
      'a twenty–fold rise',
      'Runs grew (3) times.',
      'Runs grew "3" times.',
      'a 3- fold rise',
      'a 3 x-fold rise',
      'Runs hit 9 bln.',
      'Runs hit 9 bil.',
      'Runs hit 9 mill.',
      'Cost hit $9 grand.',
      'Runs hit 9 thou.',
      'Runs hit 9 Mio.',
      // HTML comments and a float that only rounds to a stated number.
      'Runs reached 4<!-- -->2.',
      'Runs rose twen<!-- -->ty percent.',
      'Runs fell to 8.9999999999999999.',
    ];
    for (const line of invented) expect([line, checkHighlight(line, allowed)]).toEqual([line, null]);
  });

  it('keeps honest lines through the clean-up: emphasis removed, a quoted title in any language, an X- header', () => {
    expect(checkHighlight('Review runs fell to **9**, down **17** from **26**.', allowed)).toBe('Review runs fell to 9, down 17 from 26.');
    expect(checkHighlight('PR #3 X-Forwarded-For header handling is still open.', allowed)).not.toBeNull();
    expect(checkHighlight('Runs fell to 9\u0000 this week.', allowed)).toBe('Runs fell to 9 this week.');
    expect(checkHighlight('Runs fell to 9\nthis week.', allowed)).toBe('Runs fell to 9 this week.');
    expect(checkHighlight('The user_id check in PR #3 is still open.', allowed)).toBe('The user_id check in PR #3 is still open.');
    const ua = factsCheck({ ...digest, open_criticals: [{ ...digest.open_criticals[0]!, pr_title: 'Додати ліміт запитів' }] });
    expect(checkHighlight('PR #3 "Додати ліміт запитів" still has an open critical finding.', ua)).not.toBeNull();
    expect(checkHighlight('PR #3 "Додати ліміт запитів" still has an open critical finding.', allowed)).toBeNull(); // not from the facts
    // Letters the facts carry still cannot spell a number word or a multiplier.
    const cyr = factsCheck({ ...digest, open_criticals: [{ ...digest.open_criticals[0]!, pr_title: 'двадцять хвилин' }] });
    expect(checkHighlight('Runs rose tw\u0435nty percent.', cyr)).toBeNull();
    expect(checkHighlight('Runs rose 3 \u0445.', cyr)).toBeNull();
    // Paths keep their underscores; Latin letters, arrows and an NFD title in the facts are fine.
    expect(checkHighlight('The check in src/modules/_shared/markdown.ts and src/__tests__/a.ts is open.', allowed)).toBe(
      'The check in src/modules/_shared/markdown.ts and src/__tests__/a.ts is open.',
    );
    expect(checkHighlight('Review runs went 26 → 9.', allowed)).not.toBeNull();
    expect(checkHighlight('A naïve URL check in PR #3 is still open.', allowed)).not.toBeNull();
    // A title stored decomposed (NFD, as macOS writes paths) still matches the composed quote.
    const nfd = factsCheck({ ...digest, open_criticals: [{ ...digest.open_criticals[0]!, pr_title: 'Чаи\u0306ник' }] });
    expect(checkHighlight('PR #3 "Чайник" is still open.', nfd)).not.toBeNull();
  });

  it('names the last day of the week, not the next Monday', () => {
    expect(text).toContain('Week 2026-W42 (2026-10-12 to 2026-10-18, UTC), in progress');
  });

  it('a thousands group split by a space is one number — kept when the facts state it', () => {
    const big = factsCheck({ ...digest, facts: { ...digest.facts, runs: 9000 } });
    expect(checkHighlight('Review runs reached 9 000.', big)).toBe('Review runs reached 9 000.');
    expect(checkHighlight('Review runs reached 9,000.', big)).not.toBeNull();
    expect(checkHighlight('Review runs reached 9\u2019000.', big)).not.toBeNull();
  });

  it('states how many criticals it lists, caps agents at 20 and cuts titles at 120', () => {
    expect(text).toContain('Open critical findings: 4 (1 listed)');
    expect(checkHighlight('1 of 4 open critical findings is listed.', allowed)).not.toBeNull();
    const many = factsText({
      ...digest,
      agents: Array.from({ length: 25 }, (_, i) => ({ ...digest.agents[0]!, agent_id: `a${i}`, name: `Agent ${i}` })),
      open_criticals: [{ ...digest.open_criticals[0]!, pr_title: 'x'.repeat(300) }],
    });
    expect(many.split('\n').filter((l) => l.startsWith('- Agent '))).toHaveLength(20);
    expect(many).toContain(`"${'x'.repeat(119)}…"`);
  });

  it('strips links and HTML first and cuts the line to 200 characters', () => {
    expect(checkHighlight('See [the PR](https://evil.example/3) <b>now</b>', allowed)).toBe('See the PR now');
    const long = checkHighlight(`PR #3 ${'is still open '.repeat(30)}`, allowed)!;
    expect(long.length).toBeLessThanOrEqual(200);
    expect(long.endsWith('…')).toBe(true);
  });
});
