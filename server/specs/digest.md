# Spec: weekly digest (HW L08)

Feature spec and acceptance criteria: `../../specs/weekly-digest/spec.md` (SPEC-06). This
file is how it works today. Code: `src/modules/digest/`.

## `GET /digest?week=YYYY-Www`

`week` absent → the current ISO week. Malformed, non-existent (`2025-W53`), before 1970
(year 0 is not a Postgres date) or future → 422 `invalid_week`. ISO weeks by week-year
(`helpers.parseWeek` / `weekOf` / `weekBounds`),
Monday 00:00 UTC to the next Monday.

Facts (`repository.ts`, raw SQL, workspace-scoped):

- PRs opened: `pull_requests.opened_at` in the week (unknown not counted);
- PRs reviewed: distinct PRs with a `done` run of the week;
- runs and failed runs (`done` / `failed` by `ran_at`); cost of `done` runs (null when none
  has a cost) and `done` runs without cost;
- new findings by severity: findings of reviews whose `run_id` is a run of the week;
- decisions: findings with `accepted_at` / `dismissed_at` in the week, whatever run made
  them (a later click moves a decision, so past weeks can change); their accept rate;
- the previous week on the same basis — for the week in progress, over the same elapsed
  span (`previousSpan`), not the whole week. The week in progress ends at now for the
  facts, the agents and the open criticals alike;
- open criticals: CRITICAL, undecided findings of the latest `done` run per PR and agent,
  newest run first, then file and line; 5 listed with the total; PR state shown when
  merged or closed. A deleted agent leaves `agent_runs.agent_id` null, so runs are grouped
  by `coalesce(agent_runs.agent_id, reviews.agent_id, run id)` — `reviews.agent_id` has no
  foreign key and keeps the id after the agent is gone;
- agents of the week: runs, known cost, accept rate of the week's decisions on their
  findings.

No model call.

## `POST /digest/highlights {week}`

Same validation; an empty week (no runs, no decisions) → 409 without a call; one in
flight for the workspace and week → 409. One call to the feature model `weekly_digest`
(Settings → registry default OpenAI `gpt-4.1` → OpenRouter `deepseek/deepseek-v4-flash`),
template `src/prompts/weekly-digest.system.md`, `maxRetries: 0`, 60 s deadline. No key
for any candidate provider → 502 with the reason. Input: the facts text (`factsText`) in
one untrusted block — numbers in display form (costs as the UI shows them, rates whole
percents, unknown `null`), changes in words ("down 2"), titles, names and paths collapsed
to one line (a newline cannot forge a fact line) and cut to 120, ≤ 20 agents.

Each returned line is cleaned first: links/images/HTML and HTML comments stripped, NFC,
whitespace collapsed, every control, format, combining and default-ignorable character
(Hangul fillers `ㅤ` are letters, yet invisible) and the braille blank removed (`4\u200b2`,
`4⃣2⃣` would read as 42), Markdown emphasis removed (`*`, `~`, `_` at a word's edge —
`user_id` and `src/_shared/` keep theirs), cut to 200. An HTML character reference
before or after the clean-up drops it (`3&*times;` would become `3&times;`). It is then
dropped if it has a non-ASCII character that is neither a Latin letter folding to ASCII
(`é`, `ｔ` — not `ᴛ`, `ĸ`), common typography (— – ‘ ’ “ ” … − → « ») nor in the facts text
(a title may be Ukrainian;
`四十二`, `✕` or a Cyrillic `х` cannot come from nowhere), a numeral outside ASCII (`４`,
`④`, `²`, `½`), a number word (`NUMBER_WORDS`: stems zero … trillion, also glued to
`fold`; half, twice, thrice, doubled…) or a multiplier after a digit with spaces,
brackets, quotes, dashes or an ellipsis between for a word multiplier (`MULTIPLIER`:
`3×`, `(3) times`, `«3» times`, `3–fold`, `9 bln`, `9 MM`, `$9 grand`, `10^3`); a
one-letter multiplier (`LETTER_MULTIPLIER`: x, k, m, b, t; `LOOKALIKE_LETTER_MULTIPLIER`:
х, к, м, в, т and Greek) counts only right after the digit and its closing marks (`3x`,
`9 K`, `«9» K`, `3 х.`) — `3 "X API client"`, `3 "В логах…"` and `3 К релізу` start a
title or a Cyrillic word. Number words may run together (`fortytwo`). For these tests
backticks are ignored, compatibility and accented forms are folded (NFKD), and
look-alikes read as Latin only inside a word that mixes them with ASCII letters
(`twеnty`), is all Latin variants (`ᴛᴡᴇɴᴛʏ`) or has two letters or more that are all
look-alikes (`ММ`, `тімеѕ`); Greek capitals read as the Latin letter they look like (`Ν`
is N). Other Cyrillic words stay Cyrillic, `з` is a letter, and a lone look-alike letter
is judged against the next word as written ("В тестах…" is Ukrainian). Digits glued to a
letter before them are an identifier, not a number with a multiplier (`B2B`, `Y2K`); a
leading dot (`$.0049 M`) and a code span before the digit (`` `USD`9 M ``,
`` `USD`.0049 M ``) do not make one: for these rules a backtick is a space, unless it sits
inside a word (`` ti`mes `` is "times"). For the token check, compatibility forms are
folded (`9，000`) with the marks the fold leaves removed, and digits split only by
non-ASCII marks that are neither letters, digits, spaces nor listed typography are joined
(`joinSplitDigits`: `9‚000`, `9·26`, `9・26`, `9٬000`; `26→9` and `4–12` stay apart). GitHub inline math (`$9 . 26)$`), LaTeX braces or backslashes and a whole
emoji shortcode (`:x:`, not `std::sync::` or `ws:pr:sha`) drop a line. Last, every token
with a digit must check out
(`checkHighlight`, `factsCheck`); numbers compare as written, not through `Number()`
(`8.9999999999999999` is not 9). Digit runs split only by a space or an
apostrophe (`9 000`, `1'000`, `9 0000`) are joined into one number first. The facts text
names the week's last day (Sunday), not the next Monday. The facts text says how many
criticals it lists ("4 (1 listed)"), so "1 of 4" checks out.

| Token | Kept when |
|---|---|
| a number — sign, `$`, separators, decimals, `.5`, `%` (`asNumber`) | it is a number of the **redacted** facts text — `factsText(d, true)` without titles, names and paths, so untrusted text adds no number |
| anything else with a digit (`gpt-4.1`, `2026-W42`, `10k`, `3rd`, `1_000`) | it appears as written in the facts text, or splits at `-` / `/` into numbers that are each kept (`3-9`; not `10-day`) |
| a non-ASCII digit (`４２`) | never |

Code spans are not exempt. At most 5 kept; none → 502 and the stored lines stay. A
failed request releases its week (`finally`), so the next one is not a 409. Stored in
`digest_highlights` (migration 0017) with the model, cost and a SHA-256 of the facts text;
`GET` reports `stale` when today's facts text hashes differently — including at the
close of the week, when the comparison moves from the same elapsed days to the whole
previous week. Asking again replaces the stored lines.

The starter's `Digest` / `DigestRunRequest` stubs and `digests` table (a *sent* digest)
are unused — sending is out of scope.

Facts and the agents answer in a 15 ms median with 10,000 runs and 50,000 findings.

Tests: `test/digest-helpers.test.ts`, `test/digest.it.test.ts`,
`test/performance-digest-load.it.test.ts`.
