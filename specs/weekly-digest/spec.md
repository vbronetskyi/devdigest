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
  the latest `done` run per PR and agent in the week, ordered by run time (newest first),
  then file and line, with repository, PR number and title, file:line, finding title,
  agent ("deleted agent" when gone) and the PR's GitHub state when it is merged or
  closed; and the total count ("5 of 12").
- **AC-4** The system shall list the agents with runs in the week: runs, known cost, and
  the accept rate of the week's decisions on their findings.
- **AC-5** `GET /digest?week=` (default: the current week) shall answer for the caller's
  workspace, reject a malformed, non-existent (e.g. `2025-W53`) or future week with 422,
  mark the current week as in progress, and make no model call.

Highlights (one model call)
- **AC-6** WHEN asked (`POST /digest/highlights {week}`), the system shall validate the
  week as AC-5, answer 409 for an empty week without a call, else make one model call (no
  re-prompt, 60 s deadline — not cancelled past it, as on every model call here) whose input
  is the facts text of the week (AC-7) in an untrusted block under fixed instructions, and
  ask for at most 5 one-line highlights.
- **AC-7** The facts text shall list the week's numbers, the previous week's and the
  changes in display form (costs as `$0.0123`, rates as whole percents, unknowns as
  `null`), the PR numbers and titles (titles cut to 120 characters, at most 20 agents and
  the 5 criticals). A highlight shall be kept only if every number in it, after removing
  `$`, `%` and thousands separators and ignoring trailing zeros, is one of the numbers of
  that text; digits inside code spans, paths or identifiers (`v2`, `gpt-4.1`) are not
  numbers; a line with a number word from two to twenty, "dozen", "half", "twice" or
  "double" is dropped. Links, images and HTML are removed first and each line is cut to
  200 characters before the check.
- **AC-8** The kept highlights shall be stored per workspace and week with the model,
  cost, time and a hash of the facts used; `GET /digest` returns them with `stale: true`
  when the facts changed since. Asking again replaces them. IF the call fails, the
  resolved provider has no key, or no line survives AC-7, THEN the request fails with the
  reason (502) and stored highlights stay.
- **AC-9** IF a highlights request for the same workspace and week is running, THEN a
  second one shall get 409.

UI
- **AC-10** A "Weekly Digest" page in the sidebar shall show the week (`from`–`to`, UTC)
  with previous / next navigation (no next past the current week), the facts as cards with
  the change against the previous week, the open critical findings each opening its PR's
  Files changed at that line, and the agents of the week.
- **AC-11** The page shall show stored highlights labelled "AI-written, numbers checked"
  with model, cost and time (and "stale" when the facts moved), or a "Write highlights"
  button — disabled while a request runs, showing the server's reason on failure. Opening
  the page never calls a model.
- **AC-12** "Copy as Markdown" shall put the digest (facts, changes, open criticals,
  agents, highlights if any) on the clipboard as Markdown: titles and names escaped,
  whitespace collapsed, `@` mentions, `#N` references and `<!…>` neutralised; PR links are
  GitHub URLs built from owner, name and number.
- **AC-13** Unknown numbers shall show as "—", never 0; an empty week shall say "No review
  activity this week" (PRs opened, if any, still shown).

## Edge cases

- A week with runs but no findings: severity counts 0 (known zero), accept rate "—".
- The current week: numbers so far, marked "in progress"; highlights may be written.
- A finding decided this week from an older run counts as decided this week (AC-1).

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
