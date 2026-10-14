# Spec: agent performance (HW L08)

Feature spec and acceptance criteria: `../../specs/agent-performance/spec.md` (SPEC-05).
This file is how it works today. Code: `src/modules/performance/`. No model call.

## `GET /agents/performance?days=7|30|90`

`days` absent → 30; anything else (empty, `07`, repeated) → 422 (zod enum).

Window (`helpers.windowBounds`): the last `days` UTC calendar days ending today (today
partial); the previous window is the `days` days before it. A run counts when its
`ran_at` (start) is in the window and its status is `done` or `failed` — `running` and
`cancelled` do not (a stale `running` row is reaped as `failed` at start-up and then
counts).

Aggregates (`repository.ts`, raw SQL; dates go in as ISO text with `::timestamptz`):

| Number | Rule |
|---|---|
| runs, failed | counted runs per `agent_id` (null = deleted agent, one row) |
| cost | `sum(cost_usd)` of `done` runs with a cost; null when none — a failed run records none by design, and even a recorded one is not summed |
| avg cost, avg duration | over `done` runs with a cost / a duration (a failed run's `duration_ms = 0` stub is not averaged) |
| accept rate | accepted ÷ (accepted + dismissed) of findings whose review's `run_id` is a counted run; null when nothing is decided |
| trend | vs the previous window: up/down past 1.0 pp (inclusive band), flat within, null under 5 decisions on either side (`low_sample`) |
| runs per day | exactly `days` numbers, 0 for empty days |
| cost by agent / model | known costs with shares of the known total; model null → "unknown model" |
| recent | last 5 counted runs per agent (`row_number()`), PR repo/number/title (null for a deleted PR); a failed run's score/findings/duration/cost are null |

Sorting: accept rate (unknown last), runs, name, id. Most active: most runs among existing
agents (the deleted-agent row never), ties by name then id.

Indexes (migration 0016): `agent_runs (workspace_id, ran_at)`, `reviews (run_id)`. A
30-day answer on this database: ~3 ms; 90 days over 10,000 runs and 50,000 findings: a
13 ms median (`test/performance-digest-load.it.test.ts`), so `findings.review_id` needs
no index of its own.

Findings belong to a run through `reviews.run_id`, which is not unique in the schema: the
executor writes one review per run. A second review for a run would count its findings
twice.

The contract keeps the starter's stub names — `AgentPerf`, `AgentPerfRow`, `AgentPerfRun`,
`PerfCostSegment` in `contracts/productionize.ts`.

Tests: `test/performance-helpers.test.ts`, `test/performance.it.test.ts`,
`test/performance-digest-load.it.test.ts`.
