import { createHash } from 'node:crypto';
import type { DigestChange, DigestFacts, WeeklyDigest } from '@devdigest/shared';
import { stripLinks } from '../_shared/markdown.js';
import { DAY_MS, HIGHLIGHT_MAX_CHARS, MAX_AGENTS_IN_PROMPT, NUMBER_WORDS, TITLE_MAX_CHARS, WEEK_MS } from './constants.js';

/**
 * SPEC-06 — the pure part: ISO weeks, the facts text the model sees, the
 * number check on its highlights. Nothing here touches the database.
 */

export interface IsoWeek {
  year: number;
  week: number;
}

/** Monday 00:00 UTC of ISO week 1 of `year` (the week with the year's first Thursday). */
function week1Monday(year: number): number {
  const jan4 = Date.UTC(year, 0, 4);
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

export const formatWeek = ({ year, week }: IsoWeek) => `${year}-W${String(week).padStart(2, '0')}`;

/** The ISO week (by ISO week-year) an instant falls in. */
export function weekOf(at: Date): IsoWeek {
  const day = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
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
const clip = (text: string) => (text.length > TITLE_MAX_CHARS ? `${text.slice(0, TITLE_MAX_CHARS - 1)}…` : text);

/**
 * AC-7: the facts as the model sees them — numbers in display form (costs `$0.0123`,
 * rates whole percents, unknown `null`), titles cut, at most 20 agents and the
 * listed criticals. The number check accepts exactly the numbers of this text.
 */
export function factsText(d: Omit<WeeklyDigest, 'highlights'>): string {
  const f = d.facts;
  const p = d.prev;
  const c = d.change;
  const lines = [
    `Week ${d.week} (${d.from.slice(0, 10)} to ${d.to.slice(0, 10)}, UTC)${d.in_progress ? ', in progress' : ''}`,
    `Previous week${d.in_progress ? ' over the same elapsed days' : ''}: shown in brackets.`,
    `PRs opened: ${f.prs_opened} [${p.prs_opened}], change ${signed(c.prs_opened)}`,
    `PRs reviewed: ${f.prs_reviewed} [${p.prs_reviewed}], change ${signed(c.prs_reviewed)}`,
    `Review runs: ${f.runs} [${p.runs}], change ${signed(c.runs)}; failed: ${f.failed} [${p.failed}]`,
    `Cost of finished runs: ${costText(f.cost_usd)} [${costText(p.cost_usd)}], change ${signed(c.cost_usd, (n) => costText(n))}; finished runs without a cost: ${f.runs_without_cost}`,
    `New findings: CRITICAL ${f.findings.CRITICAL} [${p.findings.CRITICAL}], WARNING ${f.findings.WARNING} [${p.findings.WARNING}], SUGGESTION ${f.findings.SUGGESTION} [${p.findings.SUGGESTION}]`,
    `Decisions this week: accepted ${f.accepted} [${p.accepted}], dismissed ${f.dismissed} [${p.dismissed}], accept rate ${rateText(f.accept_rate)} [${rateText(p.accept_rate)}]`,
    `Open critical findings: ${d.open_criticals_total}`,
    ...d.open_criticals.map(
      (x) => `- PR #${x.pr_number} "${clip(x.pr_title)}"${x.pr_state ? ` (${x.pr_state})` : ''}: ${clip(x.title)} — ${x.file}:${x.line} (${x.agent_name ?? 'deleted agent'})`,
    ),
    'Agents this week:',
    ...d.agents
      .slice(0, MAX_AGENTS_IN_PROMPT)
      .map((a) => `- ${clip(a.name ?? 'deleted agent')}: ${a.runs} runs, cost ${costText(a.cost_usd)}, accept rate ${rateText(a.accept_rate)} of ${a.decided} decided`),
  ];
  return lines.join('\n');
}

export const factsHash = (text: string) => createHash('sha256').update(text).digest('hex');

/**
 * The numbers of a text, canonical: `$`, `%` and thousands separators removed,
 * trailing zeros ignored (0.50 → 0.5). Digits inside code spans or glued to a
 * letter, `-`, `.`, `/` or `_` (v2, gpt-4.1, 2026-10-12, W42) are not numbers.
 */
export function numbersIn(text: string): Set<string> {
  const plain = text.replace(/`[^`]*`/g, ' ');
  const out = new Set<string>();
  for (const m of plain.matchAll(/(?<![\w./\-])\$?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?%?(?![\w/\-]|\.\d)/g)) {
    const whole = m[1]!.replace(/,/g, '');
    out.add(String(Number(m[2] ? `${whole}.${m[2]}` : whole)));
  }
  return out;
}

/**
 * AC-7: a highlight survives only if its links, images and HTML are stripped, it
 * is cut to 200 characters, it has no number word, and every number in it is one
 * of the facts' numbers. Returns the cleaned line or null.
 */
export function checkHighlight(raw: string, allowed: ReadonlySet<string>): string | null {
  let line = stripLinks(raw).replace(/\s+/g, ' ').trim().replace(/^[-*•]\s+/, '');
  if (!line) return null;
  if (line.length > HIGHLIGHT_MAX_CHARS) line = `${line.slice(0, HIGHLIGHT_MAX_CHARS - 1).trimEnd()}…`;
  if (NUMBER_WORDS.test(line)) return null;
  for (const n of numbersIn(line)) if (!allowed.has(n)) return null;
  return line;
}
