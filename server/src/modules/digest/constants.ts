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
/** Words a model might use instead of digits — a line with one is dropped (AC-7). */
export const NUMBER_WORDS = new RegExp(
  String.raw`\b(?:two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty` +
    String.raw`|dozens?|half|halves|halved|halving|twice|thrice|(?:doubl|tripl|quadrupl)(?:e|ed|es|ing)` +
    String.raw`|(?:two|three|four|five|six|seven|eight|nine|ten)-?fold|hundreds?|thousands?|millions?)\b`,
  'i',
);
