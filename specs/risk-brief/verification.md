# Verification: SPEC-03 Risk brief and PR history

By the `plan-verifier` role: a separate agent (Opus), read-only, judging the code and
tests on `lab-5/context-onboarding..HEAD` against `spec.md` and `plan.md` — not commit
messages. Each pass had the previous pass's list to re-check.

## Pass 1 — at `76b0806`

**Verdict: not ready.** AC-2 and the binary-file edge case were broken in the real diff
path, and the tests did not see it.

| Finding | Kind | Resolution | Commit |
|---|---|---|---|
| The diff parser took a path only from `+++ b/…`: a deleted file (`+++ /dev/null`) got an empty path and vanished — no signal for a deleted route or migration; reviews never saw deleted files either | bug | the parser keeps a deleted file under its old path; files without a text diff (binary, pure rename) named in the spec's edge cases | `c5fce8b`, spec `f24a9c6` |
| Migrations matched only as direct children with a few extensions — Prisma's `migrations/<ts>/migration.sql` missed | deviation | anything under `migration(s)/`, any depth | `c5fce8b` |
| "Schema without a migration" was raised next to a migration | deviation | schema files join the migration signal | `c5fce8b` |
| `db/schema.rb`, `*.controller.ts`, routes in other languages missed | deviation | `db/schema*`, route/controller/handler by name in common languages; the word rule's false positives stated in AC-2 | `c5fce8b` |
| A range whose two ends were shown in different hunks was kept | deviation | every line of a range must be shown | `c5fce8b` |
| "merged by" showed `%an`, the PR author for a squash | wording | AC-3 says "the merge commit's author"; the UI says "{author} · merged {date}" | `c5fce8b`, `f24a9c6` |
| The adapter's transport retries and a deadline that does not cancel the request vs "one call" | spec gap | AC-8 states both; cancelling needs an AbortSignal through the LLM port — a follow-up for every model feature | `f24a9c6` |
| Signals only from the first 100 files | deviation | signals from every file; the prompt lists 100 | `c5fce8b` |
| Any `loadDiff` failure became a 409; a git error in history a 500 | deviation | only `EmptyDiffError` is a 409; git's failure is `unavailable` | `c5fce8b` |
| `</UNTRUSTED>` or `< / untrusted >` closed an untrusted block | security | case- and space-insensitive escaping, skills too | `3d7a8db` |
| Untested: the 100-path cap, the diff and file-list caps, the 600/240 caps, history noise, several rule rows, the deep-link URL, limited/unavailable/no-risks renders, a shallow clone | untested | a test for each; mutation-checked | `c5fce8b`, `045373c` |

Accepted as is: colours and icons per kind are asserted only through `data-severity`;
the 60-commit scan is stated in AC-3.

## Pass 2 — at `405a85c`

**Verdict: not ready.** Every pass-1 item resolved or stated in the spec; two new
defects.

| Finding | Kind | Resolution | Commit |
|---|---|---|---|
| Go / Python / Ruby test files (`_test.go`, `test_*.py`, `*_spec.rb`) raised signals | deviation | the test rule covers them | `e0e33c7` |
| `git diff` printed non-ASCII paths quoted and escaped; signals, grounding and history used a path no other source has (older than this branch) | bug | `core.quotepath=off` for `diff` and `diff --name-only`; test on a real repo | `e0e33c7` |
| Deleted files in the diff gave reviewers one map call each, with nothing groundable | regression | map-reduce skips files without new-side lines; `review-flow.md` says so | `0b571ac` |
| `numberedDiff` did not reset at a file header; a DB error read as "history unavailable" | minor | reset; only git's failure is caught | `e0e33c7` |
| Untested: range inside the size bound, the 60-commit scan, a failing history, signals past 100 files, author vs committer, lower bounds of the caps | untested | tests added, each mutation-checked | `e0e33c7` |

Found by a live run between the passes: the model cited `routes.ts:175` for the `fetch`
on 173 — it counts lines from the hunk header. AC-9 now gives the diff with new-side
line numbers (`255e422`, `2eaf5b7`); two runs then cited 173 exactly.

## Pass 3 — at `2eaf5b7`…`e0e33c7`

**Verdict: not ready, one item.** Every pass-2 item resolved, each with a test that
fails under the old behaviour.

| Finding | Kind | Resolution | Commit |
|---|---|---|---|
| The pass-2 test rule took any `spec/` folder and any `*.spec.*` file for tests: `spec/openapi.yaml`, `contracts/x.spec.json` stopped raising `breaking_api` | regression | no bare `spec/` folder (Ruby specs are `*_spec.rb`); `.test` / `.spec` only for source files; test for both, mutation-checked | `ef2acdf` |

After `ef2acdf` the item is closed by that test; no fourth pass was run for a one-line
rule change.
