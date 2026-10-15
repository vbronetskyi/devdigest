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
/** Number words by stem, each also glued to `fold` (`twentyfold`; `twenty-fold` matches by the stem) (AC-7). */
const NUMBER_STEMS =
  'zero|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen' +
  '|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|dozens?|hundreds?|thousands?|millions?|billions?|trillions?';
/**
 * Words a model might use instead of digits — a line with one is dropped (AC-7). Stems may
 * run together (`fortytwo`, `onehundred`). A letter of any script on either side ends the
 * match (`often`, `fortyish` are not number words); an underscore or a digit does not,
 * unlike `\b`.
 */
export const NUMBER_WORDS = new RegExp(
  String.raw`(?<!\p{L})(?:(?:one)?(?:(?:${NUMBER_STEMS})(?:one)?)+(?:fold)?|half|halves|halved|halving|twice|thrice|(?:doubl|tripl|quadrupl)(?:e|ed|es|ing))(?!\p{L})`,
  'iu',
);
/**
 * A number, not the digits of an identifier glued to a letter before it (`B2B`, `Y2K`,
 * `OAuth2`, `v1.2`). A leading dot is still a number: `$.0049 M` is 0.0049 M.
 */
const NUMBER_START = String.raw`(?<![\p{L}\p{N}_])(?<![\p{L}\p{N}_][.,])\d+(?:[.,]\d+)*`;
/** What may sit between a digit and a word multiplier: spaces, brackets, quotes, dashes, an ellipsis. */
const BETWEEN = String.raw`[\s()[\]{}<>"'“”‘’«»\-–—−….]*`;
/**
 * A word multiplier after a digit — `(3) times`, `«3» times`, `3–fold`, `3 x-fold`,
 * `9 bln`, `$9 grand` — or `×` / `^` (`3×`, `10^3`) (AC-7).
 */
export const MULTIPLIER = new RegExp(
  String.raw`${NUMBER_START}${BETWEEN}(?:[×^]|(?:x[-–—]?fold|times|fold|mm|mn|bn|tn|trn|mils?|mln|bln|bil|mill|grand|thou|mio|mrd|lakhs?|lacs?|crores?)(?![\p{L}\p{N}_]))`,
  'iu',
);
/**
 * A one-letter multiplier right after a digit and its closing marks — `3x`, `9 K`,
 * `«9» K`, `(3) x`. `3 "X API client"` starts a quoted title instead, and `x-axis` is a word.
 */
export const LETTER_MULTIPLIER = new RegExp(String.raw`${NUMBER_START}[)\]}>"'”’»]*\s*[xkmbt](?![\p{L}\p{N}_&-])`, 'iu');
/**
 * The same with a Cyrillic or Greek look-alike (`3 х.`, `9 К runs`) — unless a Cyrillic
 * or Greek word follows, or an apostrophe and a letter: `3 К релізу`, `М’яке`.
 */
export const LOOKALIKE_LETTER_MULTIPLIER = new RegExp(
  String.raw`${NUMBER_START}[)\]}>"'”’»]*\s*[хкмвтχκμβτ](?![\p{L}\p{N}_-])(?!\s+[\p{Script=Cyrillic}\p{Script=Greek}])(?![’'ʼ]\p{L})`,
  'iu',
);
/** The first ISO week-year the digest answers for; year 0 is not a Postgres date (AC-5). */
export const FIRST_YEAR = 1970;
