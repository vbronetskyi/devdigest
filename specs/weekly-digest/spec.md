# Spec: Weekly digest | Spec ID: SPEC-06 | Status: approved

## Problem and why

Review activity is spread over PR pages and run traces. A lead who wants "how did code
review go this week" has to click through every PR. A weekly digest puts the week in one
place — what was reviewed, what was found, what is still open, what it cost — in a form
that can be pasted into a team channel.

## Goals / Non-goals

Goals
- A digest of one ISO week (Monday–Sunday, UTC) for the workspace, from stored data, $0.
- The change against the week before.
- The open critical findings that still need someone.
- Optional "highlights" — a few lines written by one model call over the digest's facts,
  each number checked by the server.
- Copy as Markdown, safe to paste into a channel.

Non-goals
- Sending the digest (Slack, e-mail) or scheduling it.
- Merged-PR counts: DevDigest stores no merge time.
- Per-author statistics. CI runs (`ci_runs`).
- The starter's `Digest` / `DigestRunRequest` stubs and the `digests` table describe a
  digest that is *sent* (`body_md`, `delivered_to`) — they stay unused here.

## Definitions

- **Week**: ISO week `YYYY-Www` by ISO week-year (2026-W01 starts 2025-12-29), UTC.
- **Run of the week**: an `agent_runs` row whose `ran_at` (start) is in the week, status
  `done` or `failed` (as SPEC-05).
- **Decision**: a finding's current `accepted_at` / `dismissed_at` (a later click moves it,
  so a past week's decision counts can change).
- **Empty week**: no runs and no decisions in it.

## Acceptance criteria (EARS)

Facts (no model)
- **AC-1** For a week the system shall give: PRs known to DevDigest opened in it
  (`opened_at` in the week; unknown `opened_at` not counted); PRs reviewed in it (distinct
  PRs with a `done` run of the week); runs and failed runs; the known cost of `done` runs
  with the count of `done` runs without cost (null when none is known); findings of the
  week's runs by severity (CRITICAL, WARNING, SUGGESTION); findings accepted and dismissed
  in the week; the accept rate of those decisions (null when none).
- **AC-2** The system shall give the previous week's numbers on the same basis; for the
  current week, over the same elapsed span of the previous week (Monday 00:00 to the same
  weekday and time). The change shown is the absolute difference, null when either side
  is unknown.
- **AC-3** The system shall list up to 5 open critical findings — CRITICAL, undecided — of
  the latest `done` run per PR and agent in the week (a deleted agent is told apart by the
  agent its review recorded), ordered by run time (newest first),
  then file and line, with repository, PR number and title, file:line, finding title,
  agent ("deleted agent" when gone) and the PR's GitHub state when it is merged or
  closed; and the total count ("5 of 12").
- **AC-4** The system shall list the agents with runs in the week: runs, known cost, and
  the accept rate of the week's decisions on their findings.
- **AC-5** `GET /digest?week=` (default: the current week) shall answer for the caller's
  workspace, reject a malformed, non-existent (e.g. `2025-W53`), pre-1970 or future week
  with 422,
  mark the current week as in progress, and make no model call.

Highlights (one model call)
- **AC-6** WHEN asked (`POST /digest/highlights {week}`), the system shall validate the
  week as AC-5, answer 409 for an empty week without a call, else make one model call (no
  re-prompt, 60 s deadline — not cancelled past it, as on every model call here) whose input
  is the facts text of the week (AC-7) in an untrusted block under fixed instructions, and
  ask for at most 5 one-line highlights.
- **AC-7** The facts text shall list the week's numbers, the previous week's and the
  changes in display form (costs as `$0.0123`, rates as whole percents, unknowns as
  `null`), the PR numbers and titles (titles, names and paths collapsed to one line and
  cut to 120 characters, at most 20 agents and the 5 criticals). Links, images and HTML
  are removed from a highlight and it is cut to 200 characters; then it is kept only if
  every token with a digit checks out:
  - a number (optional sign, `$`, thousands separators, decimals, `%`; `.5` is 0.5,
    trailing zeros ignored) must be one the facts state — a number of the facts text
    outside titles, names and paths, so untrusted text cannot add numbers;
  - any other token (`gpt-4.1`, `2026-W42`, `10k`, `3rd`, `1_000`, `3-5`) must appear
    as it is in the facts text, or split at `-` and `/` into numbers that each check out;
  - first, Markdown emphasis (`*`, `~`, `_` at a word's edge, not inside a path), HTML
    comments and invisible, control and combining characters are removed; an HTML
    character reference (`&times;`) before or after that drops the line; code spans are
    checked like the rest, and backticks do not separate a digit from its multiplier;
    digits split only by a space or an apostrophe (`9 000`, `1'000`, `9 0000`) are one
    number, compared as written (`8.9999999999999999` is not 9);
  - a character outside ASCII, Latin letters and common typography (— – ‘ ’ “ ” … − → «
    ») must appear in the facts text — a title may be in any language, but `四十二`, `✕`
    or a Cyrillic `х` cannot come from nowhere — and a numeral outside ASCII (`４２`, `④`,
    `²`, `½`) drops the line; Cyrillic and Greek letters that look Latin are read as
    Latin for the number words and multipliers below;
  - so does a number word — zero, two to twenty, the tens to ninety, dozen(s),
    hundred(s), thousand(s), million(s), billion(s), trillion(s), each also with `-fold`;
    half / halves / halved, twice, thrice, double / triple / quadruple and their -d / -s /
    -ing forms — or a multiplier after a digit, with spaces, brackets, quotes or dashes
    between (`3×`, `3 x`, `(3) times`, `3–fold`, `9 K`, `9 bn`, `9 bln`, `9 mil`, `$9
    grand`, `10^3`).
  The facts text states how many open criticals it lists ("5 listed"), so "5 of 12" can
  be checked.
- **AC-8** The kept highlights shall be stored per workspace and week with the model,
  cost, time and a hash of the facts used; `GET /digest` returns them with `stale: true`
  when the facts changed since. Asking again replaces them. IF the call fails, the
  resolved provider has no key, or no line survives AC-7, THEN the request fails with the
  reason (502) and stored highlights stay.
- **AC-9** IF a highlights request for the same workspace and week is running, THEN a
  second one shall get 409.

UI
- **AC-10** A "Weekly Digest" page in the sidebar shall show the week (`from`–`to`, UTC)
  with previous / next navigation (no next past the current week, no previous before
  1970-W01), the facts as cards with
  the change against the previous week (decisions included; an unknown change is "—"
  with its reason, never "no change"), the open critical findings each opening its PR's
  Files changed at that line, and the agents of the week.
- **AC-11** The page shall show stored highlights labelled "AI-written, numbers checked"
  with model, cost and time (and "stale" when the facts moved), or a "Write highlights"
  button — disabled while a request runs, showing the server's reason on failure. A
  request belongs to its week: moving to another week while it runs shows neither its
  progress, its failure nor its answer there. Opening the page never calls a model.
- **AC-12** "Copy as Markdown" shall put the digest (facts with the previous week and the
  change, open criticals with PR, title, file:line and agent, agents, highlights if any)
  on the clipboard as Markdown: titles, names and paths escaped, whitespace collapsed,
  `&`, `@` mentions, `#N` / `GH-N` references and `<!…>` neutralised; URLs, any `host.tld/path`
  and bare domains on common TLDs (`evil.com`) kept inside code spans so no channel turns
  them into links;
  PR links are GitHub URLs built from owner, name and number.
- **AC-13** Unknown numbers shall show as "—", never 0; an empty week shall say "No review
  activity this week" (PRs opened, if any, still shown).

## Edge cases

- A week with runs but no findings: severity counts 0 (known zero), accept rate "—".
- The current week: numbers so far, marked "in progress"; highlights may be written.
- A finding decided this week from an older run counts as decided this week (AC-1).
- The week in progress counts up to now everywhere — facts, agents and open criticals —
  so a run stamped later this week shows nowhere yet.
- Highlights written during the week go stale when it closes: the comparison moves from
  the same elapsed days to the whole previous week, so the facts they were checked
  against changed.

## Non-functional

- Facts in SQL, under 1 s. One model call only on request.

## Inputs (provenance)

- [deterministic: DB] `agent_runs`, `reviews`, `findings`, `agents`, `pull_requests`, `repos`.
- [new: 1 LLM call] feature model `weekly_digest` (registry default: OpenAI `gpt-4.1`,
  "Weekly Digest"; with no Settings choice and no key for it, OpenRouter
  `deepseek/deepseek-v4-flash`).

## Untrusted inputs

PR titles, finding titles, file paths and agent names come from repositories, GitHub and
models: in the prompt they sit inside the untrusted block (its closing marker defused);
in the UI and the Markdown they are plain or escaped text; PR links are built from owner,
name and number. The highlights are model text: links stripped, numbers checked (AC-7),
rendered as plain text and labelled as AI-written.

## Contract

New `WeeklyDigest` (both copies): `week`, `from`, `to`, `in_progress`, `empty`, `facts`,
`prev` (same shape), `change`, `open_criticals[]`, `open_criticals_total`, `agents[]`,
`highlights` (`lines[]`, `model`, `cost_usd`, `generated_at`, `stale`) | null. New feature
model id `weekly_digest`.

## Changelog

- 2026-10-14 — first version (HW L08).
- 2026-10-14 — revised after an independent review: current decisions (a later click moves
  them), the decisions' accept rate, terms of AC-1, open criticals deduplicated by latest
  run with a total, the in-progress week compared over the same elapsed span, ISO
  week-year, a 409 for an empty week, a concrete number-check table, staleness by facts
  hash, a 502 with the reason, the registry default, Markdown safe for channels, the UI's
  AI label and request states.
- 2026-10-14 — before code: the starter's sent-digest stubs named as out of scope.
- 2026-10-14 — after the first verification: AC-7's number check by tokens (signs,
  leading dots, unit suffixes, ranges, underscores, non-ASCII digits and inflected number
  words no longer slip through; numbers only from the trusted part of the facts; code
  spans not exempt; untrusted text collapsed to one line); AC-3 tells deleted agents
  apart; AC-10 unknown change as "—", decisions with a change; AC-11 a request tied to its
  week; AC-12 changes, previous week, criticals' titles and agents, URLs in code spans;
  stale highlights at the week's close written down.
- 2026-10-15 — after the second verification: AC-7 closes digit groups split by a space or
  an apostrophe, invisible characters between digits, non-ASCII numerals without a decimal
  digit, multipliers and more number words, and states the listed criticals' count; AC-5
  rejects weeks before 1970 (year 0 is not a Postgres date); the week in progress ends at
  now for agents and criticals too; AC-12 neutralises `GH-N` and bare domains.
- 2026-10-15 — after the third verification: AC-7 normalises before checking (emphasis,
  every control and combining character, HTML character references), takes non-ASCII
  characters only from the facts, joins any digit run split by a space or an apostrophe,
  and matches number words by stem with an optional `-fold`; AC-10 stops the previous
  week at 1970-W01; AC-12 wraps any `host.tld/path`. The facts text names the week's last
  day, not the next Monday.
- 2026-10-15 — after the fourth verification: a character reference is checked after the
  clean-up too (`3&*times;` rebuilt one) and `&` is escaped in the Markdown; backticks,
  brackets, quotes and dashes no longer separate a digit from a multiplier; more
  abbreviations; HTML comments removed; path underscores kept; Latin letters and arrows
  allowed; look-alike Cyrillic and Greek read as Latin for number words; numbers compared
  as written.
