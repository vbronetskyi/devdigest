# Spec: weekly digest (HW L08)

Feature spec and acceptance criteria: `../../specs/weekly-digest/spec.md` (SPEC-06). This
file is how it works today. Code: `src/modules/digest/`.

## `GET /digest?week=YYYY-Www`

`week` absent → the current ISO week. Malformed, non-existent (`2025-W53`) or future →
422 `invalid_week`. ISO weeks by week-year (`helpers.parseWeek` / `weekOf` / `weekBounds`),
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
  span (`previousSpan`), not the whole week;
- open criticals: CRITICAL, undecided findings of the latest `done` run per PR and agent
  (`distinct on (pr_id, agent_id)`), newest run first, then file and line; 5 listed with
  the total; PR state shown when merged or closed;
- agents of the week: runs, known cost, accept rate of the week's decisions on their
  findings.

No model call.

## `POST /digest/highlights {week}`

Same validation; an empty week (no runs, no decisions) → 409 without a call; one in
flight for the workspace and week → 409. One call to the feature model `weekly_digest`
(Settings → registry default OpenAI `gpt-4.1` → OpenRouter `deepseek/deepseek-v4-flash`),
template `src/prompts/weekly-digest.system.md`, `maxRetries: 0`, 60 s deadline. Input: the
facts text (`factsText`) in one untrusted block — numbers in display form (costs as the UI
shows them, rates whole percents, unknown `null`), changes in words ("down 2": a digit
glued to a hyphen is not a number to the check), titles cut to 120, ≤ 20 agents.

Each returned line: links/images/HTML stripped, whitespace collapsed, cut to 200; dropped
if it has a number word (two–twenty, dozen, half, twice, double) or any number that is not
a number of the facts text (`numbersIn` — `$`, `%` and separators removed, trailing zeros
ignored; digits glued to letters, `-`, `.`, `/`, `_` or inside code spans are not numbers,
on both sides). At most 5 kept; none → 502 and the stored lines stay. Stored in
`digest_highlights` (migration 0017) with the model, cost and a SHA-256 of the facts text;
`GET` reports `stale` when today's facts text hashes differently.

The starter's `Digest` / `DigestRunRequest` stubs and `digests` table (a *sent* digest)
are unused — sending is out of scope.

Tests: `test/digest-helpers.test.ts`, `test/digest.it.test.ts`.
