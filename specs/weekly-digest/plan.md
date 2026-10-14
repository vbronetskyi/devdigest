# Plan: Weekly digest (SPEC-06)

**Goal** — one ISO week of review activity for the workspace, from stored data, with
optional model-written highlights whose numbers the server checks, copyable as safe
Markdown. **Non-goals** — sending, scheduling, merged-PR counts.

## Placement

A `digest` module (`routes`, `service`, `repository`, `helpers`, `constants`): week
math, facts text and the number check are pure helpers; the model
call follows the brief's pattern (`resolveFeatureLlm`, `withDeadline`, `maxRetries: 0`,
in-memory running set). Client: global route `/digest`, hook `lib/hooks/digest.ts`, text in
`messages/en/digest.json`, nav item in the "GLOBAL" group. Markdown is built on the client
from the digest (no server endpoint needed).

## Contract and schema changes

- `WeeklyDigest` and its parts in `contracts/productionize.ts` (both copies), next to
  the starter's unused sent-digest stubs; `FeatureModelId` + registry gain
  `weekly_digest` (both copies).
- Migration (generated): table `digest_highlights (workspace_id, week, lines, model,
  cost_usd, facts_hash, generated_at)`, primary key `(workspace_id, week)`. The starter's
  `digests` table (`body_md`, `delivered_to`) is for sending, a non-goal here.

## Tasks

- [x] T1 Week helpers: parse/validate ISO week (week-year, W53 existence, future, years
  below 100), bounds, elapsed span of the previous week → AC-2, AC-5 → `digest-helpers.test.ts`
- [x] T2 Facts: repository queries (opened, reviewed, runs, cost, severities, decisions,
  open criticals deduplicated by latest run — deleted agents told apart by their review —
  agents) + previous week → AC-1 – AC-4 → `digest.it.test.ts`
- [x] T3 Highlights: facts text (untrusted text on one line), prompt, the number check by
  tokens against the trusted numbers, link stripping, cut, storage with facts hash, stale,
  409 / 502 / empty week → AC-6 – AC-9 → `digest-helpers.test.ts`, `digest.it.test.ts`
- [x] T4 Client: page, week navigation, cards with changes ("—" when unknown), criticals
  linking to Files changed, agents, highlights with label/state tied to their week, Copy as
  Markdown (escaped, URLs in code spans, changes included) → AC-10 – AC-13 →
  `DigestView.test.tsx`, `helpers.test.ts`, `lib/hooks/digest.test.tsx`
- [x] T5 Docs: `server/specs/digest.md`, `client/specs/pages.md`, AGENTS read-when, insights

## Traceability matrix

Tests: **H** `server/test/digest-helpers.test.ts`, **I** `server/test/digest.it.test.ts`,
**L** `server/test/performance-digest-load.it.test.ts`, **V** `DigestView.test.tsx`,
**C** the view's `helpers.test.ts`, **K** `client/src/lib/hooks/digest.test.tsx`.

| AC | Tasks | Tests | Commits |
|---|---|---|---|
| AC-1 | T2 | I "AC-1/AC-2/AC-4: the week's numbers…", I "AC-1/AC-3/AC-4: week edges, unknown cost, cancelled runs, another workspace, two deleted agents", I "AC-1/AC-13: a week with decisions but no runs is not empty" | bef32b3, 23f8267, e2cd1b6 |
| AC-2 | T1, T2 | H "AC-2: a week in progress is compared with the same elapsed span…", I "AC-1/AC-2/AC-4…", I "AC-2/AC-5: the week in progress counts up to now…" | bef32b3, 23f8267 |
| AC-3 | T2 | I "AC-3: open criticals of the latest run per PR and agent…", I "AC-1/AC-3/AC-4… two deleted agents" | bef32b3, 23f8267 |
| AC-4 | T2 | I "AC-1/AC-2/AC-4…", I "AC-1/AC-3/AC-4…" | bef32b3, 23f8267 |
| AC-5 | T1, T2 | H "AC-5: week-year rules…", H "AC-5: a year below 100…", I "AC-5: the current week by default…", I "AC-2/AC-5…" | bef32b3, 23f8267 |
| AC-6 | T3 | I "AC-6 – AC-8: one call…", I "AC-6/AC-8: an empty week is a 409…" (with no key: a 502), I "AC-6: at most 5 lines are kept…" | bef32b3, 23f8267, e2cd1b6 |
| AC-7 | T3 | H "writes changes in words…", H "numbers: $, %, signs…", H "trusts only the numbers DevDigest states…", H "keeps a line whose numbers are all in the facts…", H "drops lines that hide an invented number in another shape" (149 shapes), H "keeps honest lines through the clean-up…", H "names the last day of the week…", H "a thousands group split by a space is one number…", H "states how many criticals it lists, caps agents at 20 and cuts titles at 120", H "strips links and HTML first…" | bef32b3, 23f8267, e2cd1b6, 365d182, 911eb1e, 3d3206d |
| AC-8 | T3 | I "AC-6 – AC-8…" (stored, stale), I "AC-6/AC-8…" (502 keeps the lines), I "AC-9…" (asking again replaces) | bef32b3, 23f8267 |
| AC-9 | T3 | I "AC-9: a second request for the same week while one runs is a 409"; I "AC-6/AC-8…" (a failed request lets go of the week) | bef32b3, 23f8267 |
| AC-10 | T4 | V "AC-10/AC-13: the week's cards with their change…", V "AC-10: previous / next week…", V "AC-10: an open critical opens Files changed…", C "AC-10/AC-13: … changes are signed…" | 2e81d47, b489c4b |
| AC-11 | T4 | V "AC-11: opening never writes…", V "AC-11: a request belongs to its week…", K all four | 2e81d47, b489c4b |
| AC-12 | T4 | C "AC-12: untrusted text cannot ping…", C "AC-12: a URL stays readable…", C "AC-12: the Markdown has the facts…", C "AC-12/AC-13: a finished week…", V "AC-12/AC-13: Copy as Markdown…" | 2e81d47, b489c4b |
| AC-13 | T4 | V "AC-10/AC-13…", V "AC-12/AC-13…", C "AC-12/AC-13…" | 2e81d47, b489c4b |
| NFR | T2 | L "SPEC-06: GET /digest for the current week answers in under 1 s" | fff186b |

Spec amendments: e558585, dbb4000, fd60e1e, 71b8e76, 47e793f, 1d6d0a7. Second-check fixes and tests: e2cd1b6.

## Risks

- The number check can drop a correct line that writes a number in an unusual form; it
  errs on the side of dropping. Three live calls on 2026-W42 kept 5 of 5 lines each.
- The 60 s deadline does not cancel the request (platform behaviour).

## Verification

`cd server && pnpm typecheck && pnpm depcruise && pnpm exec vitest run` · `cd client && pnpm typecheck && pnpm test`
