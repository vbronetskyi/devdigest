# Verification: SPEC-06 Weekly digest

By the `plan-verifier` role: a separate agent (Opus), read-only, judging the code and
tests against the spec and the course design — not commit messages.

## Pass 1 — at `45b6b2e`

**Verdict: not ready.**

| Finding | Kind | Resolution | Commit |
|---|---|---|---|
| The number check could be bypassed: `-42`, `.95`, `3-5`, `10-day`, `3/4`, `42x`, `10k`, `3rd`, `42pct`, `1e3`, `1_000`, `_42_`, `４２`, code spans, "doubled", "halved", "dozens" | security | tokens with a digit; a number must be a trusted one, anything else verbatim in the facts or a range of trusted numbers; non-ASCII digits and inflected number words drop the line (AC-7 rewritten) | `dbb4000`, `23f8267` |
| A stray backtick in a title hid the fact numbers up to the next one, forcing a 502 | bug | no code-span handling left on either side | `23f8267` |
| Numbers in titles and paths entered the allowed set; a newline in a title could forge a fact line | security | trusted numbers from the facts text with untrusted strings redacted; untrusted text collapsed to one line | `23f8267` |
| Copy as Markdown escaped the backticks of code-spanned URLs, turning them back into links | security | URLs split out first and kept in code spans (AC-12 amended) | `dbb4000`, `b489c4b` |
| An unknown change showed as "no change" | deviation | "—" with its reason (AC-10, AC-13) | `b489c4b` |
| The Markdown had no changes or previous week; criticals lacked PR title and agent; the Decisions card had no change | gap | all added (AC-10, AC-12 amended) | `dbb4000`, `b489c4b` |
| Highlights could land in another week's cache when the page moved mid-request; pending and error carried across weeks | bug | the week in `mutationKey`, the cache target from the request's variables, `useIsMutating` after a remount (AC-11 amended) | `dbb4000`, `b489c4b` |
| `0026-W42` answered with 1926 data (`Date.UTC` maps 0–99 to 1900+) | bug | `setUTCFullYear`, four-digit years, server and client | `23f8267`, `b489c4b` |
| Every highlight of the current week goes stale at its close | by design | written into the spec's edge cases | `dbb4000` |
| The failure message carried its prefix twice; deleted agents on one PR merged in `distinct on`; the Markdown path not collapsed | bug | the server's sentence shown once; grouping by `coalesce(agent_id, reviews.agent_id, run id)`; one-line path (AC-3 amended) | `23f8267`, `b489c4b` |
| Untested: replace on conflict, the no-key 502, a released week after a failure, null vs zero cost, week edges, workspace filters, the severities status filter, the in-progress end, number words, `mdSafe` escapes | untested | tests added; 39 mutations checked, all fail a test | `23f8267`, `b489c4b` |

Not mutation-checked: removing `withDeadline` (a 60 s wait; the same wrapper is tested in
the brief and onboarding modules).

## Pass 2 — at `106e145`

**Verdict: not ready — AC-7 only.** Every other criterion held, and all pass-1 items were
confirmed fixed or accepted in the spec: the redacted facts text excludes every untrusted
string, the hook behaves correctly in TanStack Query 5.101 (checked in its source), and
the deleted-agent grouping is sound.

| Finding | Kind | Resolution | Commit |
|---|---|---|---|
| Thousands grouped by a space or an apostrophe split into stated tokens: "9 000" passed as 9 and 0 | security | groups joined into one number before tokenizing | `fd60e1e`, `e2cd1b6` |
| Invisible characters between digits: "4​2" read as 42 and passed as 4 and 2 | security | NFC, then format and combining characters removed | `fd60e1e`, `e2cd1b6` |
| Non-ASCII numerals without a decimal digit (`④②`, `²`, `½`) never reached the check | security | any numeral outside ASCII drops the line | `fd60e1e`, `e2cd1b6` |
| Multipliers and more number words: `3×`, `3 times`, `9 K`, `10^3`, `thirty`, `zero`, `billion`, `hundredfold` | security | `MULTIPLIER` and a longer `NUMBER_WORDS` | `fd60e1e`, `e2cd1b6` |
| "5 of 12" could not pass: the listed count was not stated | honest line dropped | "Open critical findings: 12 (5 listed)" | `e2cd1b6` |
| `?week=0001-W01` reached Postgres with year 0 and answered 500 | bug | weeks before 1970 are a 422 (AC-5 amended) | `fd60e1e`, `e2cd1b6` |
| The week in progress: facts ended at now, agents and criticals at the week's end | inconsistency | one end for all | `e2cd1b6` |
| Bare domains (`evil.com/login`) and `GH-12` reached a channel live | security | domains on common TLDs in code spans, `GH-N` neutralised (AC-12 amended) | `fd60e1e`, `e2cd1b6` |
| Untested: the 5-line cap, the 20-agent cap and the title cut, workspace filters in `prsOpened` and the criticals' CTE, a week with decisions but no runs, the file order, the upsert's time, the agents table's dashes, the PRs card on an empty week; a hook test that depended on order | untested | tests added; 18 more mutations, all fail a test | `e2cd1b6` |

Accepted as is, written into the spec or the plan's risks: identifier-like tokens that a
title carries as written (`250k`) may be quoted; "week 42" and dates are dropped unless
stated as written; backslash escapes show literally in Slack; letting failed runs into
the criticals' CTE is an equivalent mutation (a failed run has no review). Three live
calls after the change kept 5 of 5 lines each.
