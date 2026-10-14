# Verification: SPEC-07 Conventions extractor

By the `plan-verifier` role: a separate agent (Opus), read-only, judging the code and
tests against the spec, the package docs and the course design — not commit messages.

## Pass 1 — before the spec, at `hw-5/brief` (`cde9458`)

**Verdict: not ready, but close.** Everything `server/specs/conventions.md` described was
built; the check found defects the description did not cover. SPEC-07 was written from
this report.

| Finding | Kind | Resolution | Commit |
|---|---|---|---|
| The model's rule went unbounded into `# <rule>` of a trusted skill — newlines made new sections; Accept skipped the 500-char limit; quotes up to a whole file | security | `normalizeRule` on model and edited rules (one line, no leading Markdown, ≤ 300); quotes matched on 8 lines (AC-7, AC-8) | `227115b` |
| `dropped` counted repeats and overflow; the UI said "quote not found" | misleading | `dropped` and `skipped` apart (AC-11) | `227115b` |
| Skill names check-then-insert, no unique index — concurrent accepts could share a name | race | unique index (0012), retry with the next suffix, 409 for other violations (AC-17) | `dd0588c`, `227115b` |
| A re-scan re-proposed accepted rules (accepting again made `-2` copies) | bug | accepted rules skipped (AC-10) | `227115b` |
| Concurrent scans both survived (delete-then-insert) | race | per-repo advisory lock (AC-12) | `227115b` |
| Files cut mid-line; confidence unknown stored as 0; GitHub links at the default head | correctness | cut at a line; null; commit per candidate (AC-5, AC-9, AC-12, AC-21) | `227115b` |
| `</untrusted>` escaped only in lower case; the label attribute unescaped | security | shared `wrapUntrusted`, label sanitised (AC-6) | `227115b` |
| Root-level `test/`, `migrations/` offered as samples | deviation | path prefixed with `/` before matching (AC-2) | `227115b` |
| Subtitle lost on reload; two Run extraction buttons; owner/name heading | design | stored scan record; one empty-state button; repo name (AC-13, AC-19, AC-20) | `dd0588c`, `227115b` |
| "Accept all" left the card buttons live | race | `locked` cards during bulk (AC-23) | `227115b` |
| Untested: the unoffered-path invariant, fallback, multi-line ranges, cap and sort, lock, the page | untested | tests added, each mutation-checked | `227115b` |

## Pass 2 — at `a905f3d`

**Verdict: not ready.**

| Finding | Kind | Resolution | Commit |
|---|---|---|---|
| MCP `get_conventions` still expected the old array; its fake API returned it, so its test passed | regression | tool and fake take `{ candidates, last_scan }` | `34c6823` |
| The model schema required a number, so "unknown confidence" (AC-9) could never happen | deviation | schema allows null | `34c6823` |
| Reject deleted accepted rows too, and AC-10 then forgot the rule | bug | only pending rows; accepted → 409 (AC-18 amended) | `2fc33ac`, `34c6823` |
| The accepted card's skill link existed only in the session that accepted it | gap | `conventions.skill_id` (0013), link from the stored id (AC-21 amended) | `34c6823` |
| A quote containing ``` and ~~~ could close the example fence early | security | a backtick fence longer than any run in the quote | `34c6823` |
| Migration 0012 fails if a workspace already has duplicate skill names; 23505 answered unlogged | ops | precondition and the query stated in the spec and package docs; logged as a warning | `34c6823`, `13abed2` |
| A sliver of the 60,000 budget added half a line of another file | deviation | mid-line cut only with a whole file's budget (AC-5 amended) | `34c6823` |
| Untested: nulls-last order, root-level filter, the counts line, the total budget | untested | tests added; total budget mutation-checked | `34c6823` |

Accepted as is: `also_seen_in` stays the model's claim (spec non-goal); three attempts
at a free derived name; the lock position is checked by a test that holds the lock, not
by one that proves it precedes the DELETE.
