import { createHash } from 'node:crypto';
import type { DigestChange, DigestFacts, WeeklyDigest } from '@devdigest/shared';
import { stripLinks } from '../_shared/markdown.js';
import { DAY_MS, HIGHLIGHT_MAX_CHARS, LETTER_MULTIPLIER, LOOKALIKE_LETTER_MULTIPLIER, MAX_AGENTS_IN_PROMPT, MULTIPLIER, NUMBER_WORDS, TITLE_MAX_CHARS, WEEK_MS } from './constants.js';

/**
 * SPEC-06 — the pure part: ISO weeks, the facts text the model sees, the
 * number check on its highlights. Nothing here touches the database.
 */

export interface IsoWeek {
  year: number;
  week: number;
}

/** Midnight UTC of a date; unlike `Date.UTC`, years 0–99 stay themselves (not 1900–1999). */
function utcDay(year: number, month: number, day: number): number {
  const d = new Date(0);
  d.setUTCFullYear(year, month, day);
  return d.getTime();
}

/** Monday 00:00 UTC of ISO week 1 of `year` (the week with the year's first Thursday). */
function week1Monday(year: number): number {
  const jan4 = utcDay(year, 0, 4);
  const dow = (new Date(jan4).getUTCDay() + 6) % 7; // Monday = 0
  return jan4 - dow * DAY_MS;
}

/** ISO weeks in a year: 53 when Jan 1 is a Thursday, or a Wednesday in a leap year. */
export function weeksInYear(year: number): number {
  return (week1Monday(year + 1) - week1Monday(year)) / WEEK_MS;
}

/** `YYYY-Www` → the week, or null when malformed or non-existent (2025-W53). */
export function parseWeek(text: string): IsoWeek | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(text);
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  return week >= 1 && week <= weeksInYear(year) ? { year, week } : null;
}

export const formatWeek = ({ year, week }: IsoWeek) => `${String(year).padStart(4, '0')}-W${String(week).padStart(2, '0')}`;

/** The ISO week (by ISO week-year) an instant falls in. */
export function weekOf(at: Date): IsoWeek {
  const day = utcDay(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
  const thursday = day + (3 - ((new Date(day).getUTCDay() + 6) % 7)) * DAY_MS;
  const year = new Date(thursday).getUTCFullYear();
  return { year, week: Math.floor((thursday - week1Monday(year)) / WEEK_MS) + 1 };
}

/** Monday 00:00 UTC to the next Monday (exclusive). */
export function weekBounds({ year, week }: IsoWeek): { from: Date; to: Date } {
  const from = week1Monday(year) + (week - 1) * WEEK_MS;
  return { from: new Date(from), to: new Date(from + WEEK_MS) };
}

/**
 * AC-2: the previous week's span. For the week in progress, the same elapsed
 * span (Monday 00:00 to the same weekday and time) — a Wednesday is compared with
 * last Monday–Wednesday, not with a whole week.
 */
export function previousSpan(from: Date, to: Date, now: Date): { from: Date; to: Date } {
  const end = now.getTime() < to.getTime() ? now.getTime() : to.getTime();
  return { from: new Date(from.getTime() - WEEK_MS), to: new Date(end - WEEK_MS) };
}

const diff = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b);

export function changeOf(facts: DigestFacts, prev: DigestFacts): DigestChange {
  return {
    prs_opened: facts.prs_opened - prev.prs_opened,
    prs_reviewed: facts.prs_reviewed - prev.prs_reviewed,
    runs: facts.runs - prev.runs,
    cost_usd: diff(facts.cost_usd, prev.cost_usd),
    critical: facts.findings.CRITICAL - prev.findings.CRITICAL,
    accepted: facts.accepted - prev.accepted,
    dismissed: facts.dismissed - prev.dismissed,
  };
}

/** Costs in display form: three significant digits below $1 (as the UI), cents above. */
export function costText(usd: number | null): string {
  if (usd === null) return 'null';
  if (usd === 0) return '$0';
  return usd < 1 ? `$${Number(usd.toPrecision(3))}` : `$${usd.toFixed(2)}`;
}
const rateText = (r: number | null) => (r === null ? 'null' : `${Math.round(r * 100)}%`);
/** A change in words — "down 2", not "-2": a digit glued to a hyphen is not a number to the check. */
const signed = (n: number | null, fmt: (n: number) => string = String) =>
  n === null ? 'unknown' : n === 0 ? 'no change' : `${n > 0 ? 'up' : 'down'} ${fmt(Math.abs(n))}`;
/** Untrusted text in the facts: one line (a newline could forge a fact line), cut. */
const clip = (text: string) => {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > TITLE_MAX_CHARS ? `${line.slice(0, TITLE_MAX_CHARS - 1)}…` : line;
};
/** Titles, names and paths left out: what remains is what DevDigest itself states. */
const REDACTED = '…';

/**
 * AC-7: the facts as the model sees them — numbers in display form (costs `$0.0123`,
 * rates whole percents, unknown `null`), titles cut, at most 20 agents and the
 * listed criticals. `redact` leaves out the untrusted text (titles, names, paths):
 * the numbers the check trusts come from that version only.
 */
export function factsText(d: Omit<WeeklyDigest, 'highlights'>, redact = false): string {
  const text = (s: string) => (redact ? REDACTED : clip(s));
  const f = d.facts;
  const p = d.prev;
  const c = d.change;
  const lines = [
    `Week ${d.week} (${d.from.slice(0, 10)} to ${new Date(Date.parse(d.to) - DAY_MS).toISOString().slice(0, 10)}, UTC)${d.in_progress ? ', in progress' : ''}`,
    `Previous week${d.in_progress ? ' over the same elapsed days' : ''}: shown in brackets.`,
    `PRs opened: ${f.prs_opened} [${p.prs_opened}], change ${signed(c.prs_opened)}`,
    `PRs reviewed: ${f.prs_reviewed} [${p.prs_reviewed}], change ${signed(c.prs_reviewed)}`,
    `Review runs: ${f.runs} [${p.runs}], change ${signed(c.runs)}; failed: ${f.failed} [${p.failed}]`,
    `Cost of finished runs: ${costText(f.cost_usd)} [${costText(p.cost_usd)}], change ${signed(c.cost_usd, (n) => costText(n))}; finished runs without a cost: ${f.runs_without_cost}`,
    `New findings: CRITICAL ${f.findings.CRITICAL} [${p.findings.CRITICAL}], WARNING ${f.findings.WARNING} [${p.findings.WARNING}], SUGGESTION ${f.findings.SUGGESTION} [${p.findings.SUGGESTION}]`,
    `Decisions this week: accepted ${f.accepted} [${p.accepted}], dismissed ${f.dismissed} [${p.dismissed}], accept rate ${rateText(f.accept_rate)} [${rateText(p.accept_rate)}]`,
    `Open critical findings: ${d.open_criticals_total} (${d.open_criticals.length} listed)`,
    ...d.open_criticals.map(
      (x) => `- PR #${x.pr_number} "${text(x.pr_title)}"${x.pr_state ? ` (${x.pr_state})` : ''}: ${text(x.title)} — ${text(x.file)}:${x.line} (${x.agent_name === null ? 'deleted agent' : text(x.agent_name)})`,
    ),
    'Agents this week:',
    ...d.agents
      .slice(0, MAX_AGENTS_IN_PROMPT)
      .map((a) => `- ${a.name === null ? 'deleted agent' : text(a.name)}: ${a.runs} runs, cost ${costText(a.cost_usd)}, accept rate ${rateText(a.accept_rate)} of ${a.decided} decided`),
  ];
  return lines.join('\n');
}

export const factsHash = (text: string) => createHash('sha256').update(text).digest('hex');

/** A run of token characters with a digit in it: letters, digits, `_ $ % . , / - − +`. */
const TOKEN = /[\p{L}\p{N}_$%.,/+\-\u2212]*\p{Nd}[\p{L}\p{N}_$%.,/+\-\u2212]*/gu;
/** A plain number: sign, `$`, thousands separators, decimals (`.5` too), `%`. */
const NUMBER = /^[+\-\u2212]?\$?(?:(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?|\.(\d+))%?$/;
/** Any numeral that is not an ASCII digit: `４`, `④`, `²`, `½`. */
const NON_ASCII_NUMERAL = /[^\P{N}0-9]/u;
/** Control, invisible and combining characters: they can hide between digits ("4\u200b2", "4⃣2⃣"). */
const HIDDEN = /[\p{C}\p{M}\p{Default_Ignorable_Code_Point}\u2800]/gu; // + Hangul fillers (letters, yet invisible) and the braille blank
/** Markdown emphasis: `*` and `~` anywhere, `_` at a word's edge — not inside `user_id` or a path's `_shared/`. */
const EMPHASIS = /[*~]+|(?<![\p{L}\p{N}/._])_+|(?<![/.])_+(?![\p{L}\p{N}/_]|\.[\p{L}\p{N}])/gu;
/** An HTML comment: `4<!-- -->2` reads as 42 once it is gone. */
const HTML_COMMENT = /<!--[\s\S]*?(?:-->|$)/g;
/** An HTML character reference renders as something else: `3&times;`, `9&nbsp;000`. */
const CHAR_REFERENCE = /&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i;
/** Outside ASCII, this typography and Latin letters that fold to ASCII (`naïve`) need no source; any other character must come from the facts. */
const TYPOGRAPHY = new Set(['—', '–', '‐', '‑', '‘', '’', '“', '”', '…', '−', '→', '←', '↑', '↓', '≈', '«', '»']);
const LATIN_LETTER = /\p{Script=Latin}/u;
/** `é`, `ﬁ`, `ｔ` fold to ASCII; `ᴛ`, `ĸ`, `ı` do not, so they must come from the facts. */
const foldsToAscii = (c: string) => /^[\x00-\x7f]+$/.test(c.normalize('NFKD').replace(/\p{M}/gu, ''));
/**
 * Letters that look Latin: Cyrillic, Greek and Latin small capitals. Letters only — `з`
 * is not a 3, or every Ukrainian title with "з" would hold a digit.
 */
/** Latin variants that look like a plain letter: always read as it, whatever the word. */
const LATIN_VARIANTS: Record<string, string> = {
  ı: 'i', ɡ: 'g', ɑ: 'a', ɛ: 'e', ŋ: 'n', ĸ: 'k', ꞏ: '—',
  ᴀ: 'a', ʙ: 'b', ᴄ: 'c', ᴅ: 'd', ᴇ: 'e', ꜰ: 'f', ɢ: 'g', ʜ: 'h', ɪ: 'i', ᴊ: 'j', ᴋ: 'k', ʟ: 'l', ᴍ: 'm', ɴ: 'n', ᴏ: 'o', ᴘ: 'p', ʀ: 'r', ꜱ: 's', ᴛ: 't', ᴜ: 'u', ᴠ: 'v', ᴡ: 'w', ʏ: 'y', ᴢ: 'z',
};
const LOOK_ALIKES: Record<string, string> = {
  а: 'a', в: 'b', г: 'r', е: 'e', ё: 'e', і: 'i', ї: 'i', ј: 'j', к: 'k', м: 'm', н: 'h', о: 'o', п: 'n', р: 'p', с: 'c', т: 't', у: 'y', х: 'x', ѕ: 's', ь: 'b',
  һ: 'h', ԁ: 'd', ӏ: 'l', ԝ: 'w',
  α: 'a', β: 'b', ε: 'e', η: 'n', ι: 'i', κ: 'k', μ: 'u', ν: 'v', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x',
  // Greek capitals that look like a different Latin letter than their small form (Ν is N, ν is v).
  Η: 'h', Μ: 'm', Ν: 'n', Υ: 'y', Ζ: 'z',
};
const lookAlike = (c: string): string | undefined => LOOK_ALIKES[c] ?? LOOK_ALIKES[c.toLowerCase()];
/**
 * A word whose look-alikes read as Latin: one that mixes ASCII letters with them
 * (`twеnty`), one of Latin variants only (`ᴛᴡᴇɴᴛʏ`), or one of two letters or more made only
 * of look-alikes (`ММ`, `тімеѕ`). Other Cyrillic words stay Cyrillic ("В логах" is not
 * "B"); a lone look-alike letter is `LOOKALIKE_LETTER_MULTIPLIER`'s to judge.
 */
const readsAsLatin = (w: string) =>
  /[^\x00-\x7f]/.test(w) && (/[a-z]/i.test(w) || ([...w].length > 1 && [...w].every((c) => lookAlike(c) !== undefined)));
/**
 * Compatibility forms (`ｔ`) and accents (`é`) folded; letters that look like punctuation —
 * modifier letters (`ʼ ʻ ˈ ꓸ ꓹ`), the clicks (`ǀ ǁ ǂ ǃ`) and the saltillo (`ꞌ Ꞌ`) — read as spaces, so `ʼtwentyʼ`
 * is a word on its own. (Only for matching: the Ukrainian `обʼєкт` stays as written.)
 */
const folded = (text: string) =>
  text
    // Before the fold, a modifier letter that folds to no letter (`ﾞ` becomes a mark and would
    // vanish); `ʰ`, `ˣ`, `ᴹ` fold to their letter and stay one.
    .replace(/\p{Lm}/gu, (c) => (/\p{L}/u.test(c.normalize('NFKD').replace(/\p{M}/gu, '')) ? c : ' '))
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[\p{Lm}ǀǁǂǃꞌꞋ]/gu, ' ');
/** A letter of a script other than Latin, Cyrillic or Greek. */
const OTHER_LETTER = String.raw`(?![\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}])\p{L}`;
/**
 * A lone such letter, with none beside it, is a separator in an English line — read as an
 * em dash, not a hyphen (`3 ㅡtimesㅡ`, `9 K一up` is `9 K—up`; `一`, `ㅣ`, `ㄧ`, `ⵏ`, `ا`). A
 * run of them is a word (`修复`, `認証`) and stays one: `修复3个x轴` is a title.
 */
const LONE_OTHER_LETTER = new RegExp(String.raw`(?<!${OTHER_LETTER})${OTHER_LETTER}(?!${OTHER_LETTER})`, 'gu');
/**
 * The text the number words and multipliers are matched on: folded, dash-like letters read
 * as dashes, look-alikes read as Latin where `readsAsLatin`. Other letters of any script
 * stay letters — `修复3个x轴` and `"認証…" times out` are a title, not a multiplier.
 */
const asLatin = (text: string) =>
  folded(text)
    .replace(LONE_OTHER_LETTER, '—')
    .replace(/./gu, (c) => LATIN_VARIANTS[c] ?? c)
    // Words of the Latin, Cyrillic and Greek scripts; a CJK run beside one does not join it.
    .replace(/[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}]+/gu, (w) => (readsAsLatin(w) ? w.replace(/./gu, (c) => lookAlike(c) ?? c) : w));
/**
 * GitHub inline math (`$9 . 26)$` renders as 9.26), LaTeX braces or backslashes, and a
 * whole emoji shortcode (`:x:` — not the `::sync::` of a Rust path or `ws:pr:sha`).
 */
const MARKUP = /\$(?=\S)[^$]*?[^\s$]\$(?!\d)|[{}\\]|(?<![\p{L}_:]):[a-z][a-z0-9_+-]*:(?![\p{L}\p{N}_:])/iu;
/** Digits split only by a space, an apostrophe or a look-alike comma or dot read as one number: "9 000", "1'000", "9‚000", "9·26". */
const GROUP_SEPARATOR = /(\d)[ '‘’′`‚·]+(?=\d)/g;

/** The tokens of a text that hold a digit, without sentence punctuation around them. */
export function tokensIn(text: string): string[] {
  return [...text.matchAll(TOKEN)].map((m) => m[0].replace(/[.,/+\-\u2212]+$/u, '').replace(/^[,/]+/, ''));
}

/**
 * A plain number token, canonical as written (`$1,200.50` → "1200.5", `.5` → "0.5",
 * `009` → "9"); null otherwise. Not through `Number()`: 8.9999999999999999 is not 9.
 */
export function asNumber(token: string): string | null {
  const m = NUMBER.exec(token);
  if (!m) return null;
  const whole = (m[1] ?? '0').replace(/,/g, '').replace(/^0+(?=\d)/, '');
  const frac = (m[2] ?? m[3] ?? '').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
}

/** What a highlight is checked against (AC-7). */
export interface FactsCheck {
  /** Numbers DevDigest states — from the facts text without titles, names and paths. */
  numbers: ReadonlySet<string>;
  /** Every token with a digit in the facts text, as written (`2026-W42`, `gpt-4.1`). */
  tokens: ReadonlySet<string>;
  /** The non-ASCII characters of the facts text — a title may be in any language. */
  chars: ReadonlySet<string>;
}

export function factsCheck(d: Omit<WeeklyDigest, 'highlights'>): FactsCheck {
  const numbers = tokensIn(factsText(d, true))
    .map(asNumber)
    .filter((n): n is string => n !== null);
  const text = factsText(d);
  const chars = [...text.normalize('NFC')].filter((c) => c > '\x7f');
  return { numbers: new Set(numbers), tokens: new Set(tokensIn(text)), chars: new Set(chars) };
}

/** AC-7: a token checks out when it is a stated number, appears in the facts as written, or splits into stated numbers. */
function tokenChecks(token: string, facts: FactsCheck): boolean {
  const n = asNumber(token);
  if (n !== null) return facts.numbers.has(n);
  if (facts.tokens.has(token)) return true;
  // A range or ratio of stated numbers (3-9, 3/4); "10-day" is not one.
  return token.split(/[-/\u2212]/).every((part) => {
    const p = asNumber(part);
    return p !== null && facts.numbers.has(p);
  });
}

/**
 * Digits split only by non-ASCII marks that are neither letters, digits, spaces nor listed
 * typography read as one number: `9⋅26`, `9・26`, `9٬000`, `9¸000`. Such a mark can only
 * have come from the facts, and it reads as a separator. `4–12` and `26→9` stay apart.
 */
function joinSplitDigits(text: string): string {
  // Spaces may stand around the mark (`9 ⋅000`), but a mark there must be.
  return text.replace(/(\d)([^\x00-\x7f]+|\s+[^\x00-\x7f]+\s*|[^\x00-\x7f]+\s+)(?=\d)/gu, (whole, digit: string, run: string) => {
    const marks = [...run].filter((c) => !/\s/u.test(c));
    return marks.length > 0 && marks.every((c) => !/[\p{L}\p{N}]/u.test(c) && !TYPOGRAPHY.has(c)) ? digit : whole;
  });
}

/**
 * AC-7: a highlight survives only if, after its links, images, HTML, emphasis and hidden
 * characters are removed and it is cut to 200 characters, it has no HTML character
 * reference, no non-ASCII character the facts do not carry, no non-ASCII numeral, number
 * word or multiplier, and every token with a digit — split digit runs joined — checks
 * out against the facts. Returns the cleaned line or null.
 */
export function checkHighlight(raw: string, facts: FactsCheck): string | null {
  const stripped = stripLinks(raw).replace(HTML_COMMENT, '');
  if (CHAR_REFERENCE.test(stripped)) return null;
  let line = stripped
    .normalize('NFC')
    .replace(/\s+/g, ' ') // before removing controls, so a newline still separates words
    .replace(HIDDEN, '')
    .replace(/^\s*[-*•]\s+/, '')
    .replace(EMPHASIS, '')
    .replace(/ {2,}/g, ' ')
    .trim();
  if (!line) return null;
  // The clean-up can rebuild a reference or a comment: `3&*times;` → `3&times;`.
  line = line.replace(HTML_COMMENT, '');
  if (CHAR_REFERENCE.test(line) || MARKUP.test(line)) return null;
  if (line.length > HIGHLIGHT_MAX_CHARS) line = `${line.slice(0, HIGHLIGHT_MAX_CHARS - 1).trimEnd()}…`;
  if ([...line].some((c) => c > '\x7f' && !TYPOGRAPHY.has(c) && !(LATIN_LETTER.test(c) && foldsToAscii(c)) && !facts.chars.has(c))) return null;
  // Backticks do not separate a digit from its multiplier; look-alike letters read as Latin.
  // A backtick inside a word is dropped (`` ti`mes ``); any other is a word boundary, so
  // `` `USD`9 M `` and `` `USD`.0049 M `` are not identifiers.
  const plain = line.replace(/(?<=\p{L})`+(?=\p{L})/gu, '').replace(/`/g, ' ');
  const words = asLatin(plain);
  if (NON_ASCII_NUMERAL.test(line) || NUMBER_WORDS.test(words)) return null;
  if (MULTIPLIER.test(words) || LETTER_MULTIPLIER.test(words)) return null;
  // A lone look-alike letter is judged by what follows it as written: "В тестах" is Ukrainian.
  if (LOOKALIKE_LETTER_MULTIPLIER.test(folded(plain).replace(LONE_OTHER_LETTER, '—'))) return null;
  // Compatibility forms count as their plain form here too (`9，000` is 9,000), with the marks
  // the fold leaves (`ͺ` becomes a space and a mark) removed.
  // True hyphens (U+2010, U+2011) are `-` here: `9‑K` is checked like `9-K`.
  const numbers = joinSplitDigits(line.normalize('NFKC').replace(/\p{M}/gu, '').replace(/[\u2010\u2011]/g, '-').replace(GROUP_SEPARATOR, '$1'));
  return tokensIn(numbers).every((t) => tokenChecks(t, facts)) ? line : null;
}
