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

- [x] T1 Helpers: window bounds (UTC days), `runs_per_day` fill, trend with threshold and
  sample, shares, sort, most active → AC-5, AC-7, AC-8, AC-12 → `performance-helpers.test.ts`
- [x] T2 Repository + service + route: per-agent and total aggregates over `done`/`failed`,
  cost over `done` only, decided findings via `reviews.run_id`, previous window, recent
  runs, deleted agent / PR, `days` validation → AC-1 – AC-4, AC-6, AC-9, AC-10 →
  `performance.it.test.ts`
- [x] T3 Indexes migration (0016) and a load test: 10,000 runs and 50,000 findings answer
  in a 13 ms median over 90 days, so `findings.review_id` needs no index of its own → NFR →
  `performance-digest-load.it.test.ts`
- [x] T4 Client: page, cards, a native table with a disclosure button per agent, cost
  donuts with shares and stable colours, window selector, unknown "—" with its reason
  (hover and screen reader), the app's cost format, empty and error states, nav →
  AC-11 – AC-15 → `AgentPerformanceView.test.tsx`, `helpers.test.ts`
- [x] T5 Docs: `server/specs/performance.md`, `client/specs/pages.md`, AGENTS read-when,
  insights

## Traceability matrix

Tests: **H** `server/test/performance-helpers.test.ts`, **I** `server/test/performance.it.test.ts`,
**L** `server/test/performance-digest-load.it.test.ts`, **V** `AgentPerformanceView.test.tsx`,
**C** the view's `helpers.test.ts`.

| AC | Tasks | Tests | Commits |
|---|---|---|---|
| AC-1 | T2 | I "AC-1/AC-2/AC-4/AC-6/AC-7: totals…" | 2481d5f |
| AC-2 | T2 | I "totals…", I "AC-2/AC-9: the last five runs… a failed run without cost is not without cost", I "AC-2/AC-3/AC-7: a window whose runs report no cost…" | 2481d5f, fff186b, fae4095 |
| AC-3 | T2 | I "AC-3/AC-5/AC-9/AC-12: per-agent rows…" | 2481d5f |
| AC-4 | T1, T2 | H "AC-4/AC-5: rate is unknown without decisions…", I "totals…" (other workspace's review on our run) | 2481d5f, fff186b |
| AC-5 | T1, T2, T4 | H "AC-4/AC-5…" (nothing decided is not a low sample), I "per-agent rows…", V "AC-12: a table… a low sample is marked" | 2481d5f, 46c0085, 0265617 |
| AC-6 | T1, T2 | H "AC-6/AC-7: the most active agent is never the deleted-agent row…", I "per-agent rows…" (one null-agent row) | 2481d5f |
| AC-7 | T1, T2 | H "AC-7: runs per day…", I "totals…" (each run on its UTC day) | 2481d5f, fff186b |
| AC-8 | T1, T2, T4 | H "AC-8: shares…", I "AC-8: cost by agent and by model…", V "AC-8/AC-11: the breakdown…" | 2481d5f, fff186b, 46c0085 |
| AC-9 | T2 | I "per-agent rows…", I "AC-2/AC-9: the last five runs, newest first; a deleted PR's run is unlinked…" | 2481d5f, fff186b |
| AC-10 | T2 | I "AC-10: 30 days by default, 422 for any other window, no model call" | 2481d5f |
| AC-11 | T4 | V "AC-11/AC-14: four cards with the daily sparkline…", V "AC-11: the window selector…", V "AC-8/AC-11: the breakdown…" (the deleted agent's grey swatch), C "AC-11: in both themes the palette's colours are distinct…", C "AC-11: a slice keeps its colour…" | a3ebe2c, 46c0085, fae4095, 0265617 |
| AC-12 | T1, T4 | H "AC-12: accept rate first…", V "AC-12: a table with every value under its column…" | 2481d5f, a3ebe2c, 46c0085 |
| AC-13 | T4 | V "AC-13: the agent's button opens its runs…", C "AC-13: a run links its PR's Agent runs tab…" | a3ebe2c, 46c0085 |
| AC-14 | T4 | V "AC-11/AC-14…", V "AC-14: an unknown cost this window is not a missing previous one…", C "AC-14: a cost change keeps the app's cost format" | 472d2d1, a3ebe2c, 46c0085 |
| AC-15 | T4 | V "AC-15: an empty window points to the pull requests; a failed request offers a retry that refetches" | a3ebe2c, 46c0085 |
| NFR | T3 | L "SPEC-05: GET /agents/performance over 90 days answers in under 1 s" | 2481d5f, fff186b |

Spec amendments: e558585, 472d2d1, 244d786, 0d26eeb. Third-check fixes: 0265617.

## Risks

- Accept rates move when someone re-decides a finding later (spec definition).
- A window with few decisions: trend null and "low sample" rather than a noisy arrow.

## Verification

`cd server && pnpm typecheck && pnpm depcruise && pnpm exec vitest run` · `cd client && pnpm typecheck && pnpm test`
