# Plan: Agent performance dashboard (SPEC-05)

**Goal** — a workspace page comparing reviewer agents over 7 / 30 / 90 days from stored
runs and findings. **Non-goals** — CI runs, per-repo/author splits, exports.

## Placement

A `performance` module (`routes`, `service`, `repository`, `helpers`): SQL aggregates in
the repository, window/trend/shares math as pure helpers, no other module imported.
Route `GET /agents/performance`. Client: a global route `/agent-performance` (not under a repo), hook
`lib/hooks/performance.ts`, components colocated, text in `messages/en/performance.json`,
a "GLOBAL" nav group.

## Contract and schema changes

- `AgentPerf` / `AgentPerfRow` / `PerfCostSegment` in `contracts/productionize.ts` (both
  copies): the starter's unused stub, replaced by the SPEC-05 shape.
- Migration (generated): indexes `agent_runs (workspace_id, ran_at)` and
  `reviews (run_id)` — neither exists, and every query here walks them.

## Tasks

- [ ] T1 Helpers: window bounds (UTC days), `runs_per_day` fill, trend with threshold and
  sample, shares, sort, most active → AC-5, AC-7, AC-8, AC-12 → `performance-helpers.test.ts`
- [ ] T2 Repository + service + route: per-agent and total aggregates over `done`/`failed`,
  cost over `done` only, decided findings via `reviews.run_id`, previous window, recent
  runs, deleted agent / PR, `days` validation → AC-1 – AC-4, AC-6, AC-9, AC-10 →
  `performance.it.test.ts`
- [ ] T3 Indexes migration → NFR
- [ ] T4 Client: page, cards, table with expandable rows, cost donuts, window selector,
  unknown "—" with reasons, "<$0.01", empty and error states, nav → AC-11 – AC-15 →
  `agent-performance/page.test.tsx`, helpers test
- [ ] T5 Docs: `server/specs/performance.md`, `client/specs/pages.md`, AGENTS read-when,
  insights

## Traceability matrix

| AC | Tasks | Tests | Commit |
|---|---|---|---|
| AC-1 … AC-15 | T1 – T4 | filled in when the tests exist | |

## Risks

- Accept rates move when someone re-decides a finding later (spec definition).
- A window with few decisions: trend null and "low sample" rather than a noisy arrow.

## Verification

`cd server && pnpm typecheck && pnpm depcruise && pnpm exec vitest run` · `cd client && pnpm typecheck && pnpm test`
