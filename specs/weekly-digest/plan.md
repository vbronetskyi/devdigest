# Plan: Weekly digest (SPEC-06)

**Goal** — one ISO week of review activity for the workspace, from stored data, with
optional model-written highlights whose numbers the server checks, copyable as safe
Markdown. **Non-goals** — sending, scheduling, merged-PR counts.

## Placement

A `digest` module (`routes`, `service`, `repository`, `helpers`, `highlights`): week
math, facts text, the number check and the Markdown builder are pure helpers; the model
call follows the brief's pattern (`resolveFeatureLlm`, `withDeadline`, `maxRetries: 0`,
in-memory running set). Client: global route `/digest`, hook `lib/hooks/digest.ts`, text in
`messages/en/digest.json`, nav item in the "GLOBAL" group. Markdown is built on the client
from the digest (no server endpoint needed).

## Contract and schema changes

- `WeeklyDigest` in `contracts/digest.ts` (both copies); `FeatureModelId` + registry gain
  `weekly_digest` (both copies).
- Migration (generated): table `digest_highlights (workspace_id, week, lines, model,
  cost_usd, facts_hash, generated_at)`, primary key `(workspace_id, week)`. The starter's
  `digests` table (`body_md`, `delivered_to`) is for sending, a non-goal here.

## Tasks

- [ ] T1 Week helpers: parse/validate ISO week (week-year, W53 existence, future), bounds,
  elapsed span of the previous week → AC-2, AC-5 → `digest-helpers.test.ts`
- [ ] T2 Facts: repository queries (opened, reviewed, runs, cost, severities, decisions,
  open criticals deduplicated by latest run, agents) + previous week → AC-1 – AC-4 →
  `digest.it.test.ts`
- [ ] T3 Highlights: facts text, prompt, number check table, link stripping, cut, storage
  with facts hash, stale, 409 / 502 / empty week → AC-6 – AC-9 → `digest-helpers.test.ts`,
  `digest.it.test.ts`
- [ ] T4 Client: page, week navigation, cards with changes, criticals linking to Files
  changed, agents, highlights with label/state, Copy as Markdown (escaped) → AC-10 – AC-13
  → `digest/page.test.tsx`, `digest/helpers.test.ts`
- [ ] T5 Docs: `server/specs/digest.md`, `client/specs/pages.md`, AGENTS read-when, insights

## Traceability matrix

| AC | Tasks | Tests | Commit |
|---|---|---|---|
| AC-1 … AC-13 | T1 – T4 | filled in when the tests exist | |

## Risks

- The number check can drop a correct line that writes a number in an unusual form; it
  errs on the side of dropping.
- The 60 s deadline does not cancel the request (platform behaviour).

## Verification

`cd server && pnpm typecheck && pnpm depcruise && pnpm exec vitest run` · `cd client && pnpm typecheck && pnpm test`
