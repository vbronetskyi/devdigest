# Verification: SPEC-04 git-why

By the `plan-verifier` role: a separate agent (Opus), read-only, judging the code and
tests on `lab-5/context-onboarding..HEAD` against `spec.md` and `plan.md` — not commit
messages.

## Pass 1 — at `76b0806`

**Verdict: not ready.** One contradiction with the spec, several real defects.

| Finding | Kind | Resolution | Commit |
|---|---|---|---|
| A malformed request (zod, before the handler) was a 422 before the spec's 404/409 | deviation | spec: malformed input is refused first, as on every route; then AC-1, AC-2, AC-4, AC-5 | `f24a9c6` |
| `oldSideLines` counted the empty string after a final newline as a line | bug | bounded by the hunk header's counts | `045373c` |
| The client numbered `\ No newline at end of file` — "why" offered, server 404 | bug | the marker is not a line | `045373c` |
| "Oldest merge" relied on rev-list's date order | risk | `--topo-order` (no fixture shows the difference; git's docs guarantee only this) | `045373c` |
| Any blame failure said "new or renamed" | deviation | `missing: 'file' \| 'line'` in `WhyAnswer` (both copies) | `045373c` |
| `mergedVia` / `isShallow` threw on git errors → 500 | bug | null, as the other methods | `045373c` |
| The `(#N)` fallback also ran when the merge named no PR | spec gap | AC-7 says so | `f24a9c6` |
| File limit 500 characters | extra | 4,096, stated in AC-3 | `045373c` |
| Untested: validation order and "no git before AC-4", the fetch-head retry, merge-base arguments, merge vs squash precedence, the oldest of two merges, removed lines, author and date | untested | tests added, mutation-checked | `045373c` |

## Pass 2 — at `405a85c`

**Verdict: not ready.**

| Finding | Kind | Resolution | Commit |
|---|---|---|---|
| "why" only on hover vs AC-11 "shall offer" | spec gap | per-line actions are hover-only across the diff viewer (the comment "+" too): a non-goal, AC-11 says "on hover" | `2a91c72` |
| The new existence check passed the file as `<base>:<path>`, not after `--` (AC-10) | deviation | `GitClient.hasFile`: `ls-tree -z --name-only <rev> -- <path>` | `419b935` |
| The client's `parsePatch` was not bounded by hunk counts | minor | bounded, like the server | `419b935` |
| "No local clone" for a clone git cannot read | wording | "no usable local clone"; AC-5 names it | `419b935`, `2a91c72` |
| Untested: `merges[0]` instead of the first mainline merge, the base revision of the check, empty and over-long paths, an unreadable clone | untested | a sync merge off the mainline in the fixture, the rest as tests | `419b935` |

Still unprovable by a test: dropping `--topo-order` — git already returns ancestry order
for every topology tried; the flag stays because only it is documented to.

## Pass 3 — at `419b935`

**Verdict: ready.** Hover-only actions agree with the spec and the code; every git call
on the why path gets the file only after `--` (`blameLine`, `hasFile`); the client
parser is bounded like the server's; the AC-5 message names an unreadable clone; each
pass-2 test gap has a test. The provenance list now names every git call (`322c417`).
