/** SPEC-06 limits. */

export const DAY_MS = 86_400_000;
export const WEEK_MS = 7 * DAY_MS;
/** Open critical findings listed (AC-3). */
export const MAX_CRITICALS = 5;
/** Agents and title lengths in the facts text (AC-7). */
export const MAX_AGENTS_IN_PROMPT = 20;
export const TITLE_MAX_CHARS = 120;
/** Highlights kept and their length (AC-6, AC-7). */
export const MAX_HIGHLIGHTS = 5;
export const HIGHLIGHT_MAX_CHARS = 200;
export const HIGHLIGHTS_DEADLINE_MS = 60_000;
export const HIGHLIGHTS_SCHEMA_NAME = 'WeeklyDigestHighlights';
export const OPENROUTER_FALLBACK_MODEL = 'deepseek/deepseek-v4-flash';
/** Number words by stem, each also with `-fold` (AC-7). */
const NUMBER_STEMS =
  'zero|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen' +
  '|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|dozens?|hundreds?|thousands?|millions?|billions?|trillions?';
/**
 * Words a model might use instead of digits — a line with one is dropped (AC-7).
 * Letters on either side end the match (`often`, `fortyish` are not number words); an
 * underscore or a digit does not, unlike `\b`.
 */
export const NUMBER_WORDS = new RegExp(
  String.raw`(?<![a-z])(?:(?:${NUMBER_STEMS})(?:-?fold)?|half|halves|halved|halving|twice|thrice|(?:doubl|tripl|quadrupl)(?:e|ed|es|ing))(?![a-z])`,
  'i',
);
/** A multiplier after a digit — `3×`, `3 x`, `3 times`, `3-fold`, `9 K`, `9 bn`, `9 mil`, `10^3` (AC-7). */
export const MULTIPLIER = /\d\s*(?:[×^]|x(?![\w-])|times\b|-?fold\b|(?:[kmbt]|mn|bn|tn|mil|mln)(?![\w-]))/i;
/** The first ISO week-year the digest answers for; year 0 is not a Postgres date (AC-5). */
export const FIRST_YEAR = 1970;
