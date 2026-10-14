# Spec: Agent performance dashboard | Spec ID: SPEC-05 | Status: approved

## Problem and why

A workspace runs several reviewer agents on several models. Nobody can tell today which
of them earn their keep: how often each runs, what it costs, how long it takes, and —
the quality signal — how many of its findings people accept rather than dismiss. The
data is already stored per run and per finding; it is never put side by side.

## Goals / Non-goals

Goals
- One page that compares the workspace's reviewer agents over a window: runs, cost,
  duration, accept rate and its trend, last run.
- Totals for the window with the change against the window before it.
- Where the money goes: cost by agent and by model.
- Every number computed from stored runs and findings, with no model call.

Non-goals
- Per-repository or per-author breakdowns, exports, alerts.
- CI runs (`ci_runs`) — only reviews run by DevDigest itself.
- Judging a finding's correctness: the accept rate is what people decided, not truth.
- Changing how runs or findings are recorded.

## Definitions

- **`ran_at`** is a run's start (set once on insert).
- **Window**: the last `days` (7, 30 — default — or 90) UTC calendar days ending today,
  today included and partial. The **previous window** is the `days` days before it.
- **Run**: an `agent_runs` row of the workspace whose `ran_at` falls in the window and whose
  status is `done` or `failed`. `running` and `cancelled` runs do not count.
- **Cost** covers reviewer runs only (`agent_runs.cost_usd`) — intent, brief and other
  feature calls are stored elsewhere and excluded. A failed run records no cost by design.
- **Finding of a run**: a finding of a review whose `run_id` is that run (one review per
  run; reviews without `run_id` are not attributed).
- **Decided finding**: one with `accepted_at` or `dismissed_at` set — its current decision
  (a later click can change it).
- **Accept rate**: accepted ÷ decided; unknown (null) when nothing was decided.

## Acceptance criteria (EARS)

Data
- **AC-1** The system shall count, per agent and in total, the window's runs and how many
  of them failed. An agent gets a row when it has at least one run in the window.
- **AC-2** The system shall sum `cost_usd` over the window's `done` runs and count the `done`
  runs without a cost; IF no `done` run has a cost, THEN the cost is null — never 0.
  Failed runs add nothing and are not counted as "without cost".
- **AC-3** The average cost per run shall be over `done` runs with a cost; the average
  duration over `done` runs with a duration; each null when there is none.
- **AC-4** The accept rate shall be accepted ÷ decided findings of the window's runs, with
  the decided count beside it, per agent and in total (pooled, not a mean of agents).
- **AC-5** An agent's trend shall be up or down when its accept rate moved by more than
  1.0 percentage point against the previous window (unrounded), flat within that, and
  null when either window has fewer than 5 decided findings; such a row is marked "low
  sample".
- **AC-6** Runs whose agent was deleted shall count in the totals and appear as one
  "deleted agent" row; it is never the most active agent.
- **AC-7** The system shall give `runs_per_day` with exactly `days` entries (0 for days
  without runs), the previous window's cost, the change in cost as a USD difference (null
  unless both windows have a known cost), and the most active agent — most runs, ties by
  name then id, null without runs — with its runs and accept rate.
- **AC-8** The system shall give the cost by agent and by run model (null model → "unknown
  model"), known costs only, each with its share of the window's known cost (null when
  that is 0).
- **AC-9** For each agent the system shall return its last five runs of the window: PR
  (repository id, PR number, title — null fields for a deleted PR), status, and for `done`
  runs score, findings count, duration and cost (null otherwise), and time.
- **AC-10** `GET /agents/performance?days=` shall answer for the caller's workspace only,
  make no model call, take 30 when `days` is absent, and answer 422 for any value other
  than `7`, `30` or `90`.

UI
- **AC-11** An "Agent Performance" page in the sidebar shall show four summary cards —
  runs with a daily sparkline, cost with its change, accept rate (pooled) with the decided
  count, most active agent with its runs and accept rate — a 7 / 30 / 90 days selector,
  the agents table and the cost breakdown by agent and by model, each slice with its
  share; an agent keeps its colour when the window changes.
- **AC-12** The agents table shall list agent, runs, average cost, average duration,
  accept rate with its trend (an arrow with a text label) and decided count, and last run,
  sorted by accept rate (unknown last), then runs, then name. It shall be a table to
  assistive technology too: every row has its cells under the column headers, and the
  row's runs open from a button in the agent cell that states whether it is expanded.
- **AC-13** A row shall expand to the agent's last five runs, each opening the PR's Agent
  runs tab; a run of a deleted PR is shown, unlinked. (The design's sparkline of the
  expanded row is replaced by this list: a reviewer asked for the runs themselves.)
- **AC-14** Every unknown value shall show as "—" with its reason on hover and to screen
  readers: no cost reported; nothing decided yet; a failed run; all of an agent's runs
  failed; a value a finished run did not record; no cost known in this window or in the
  previous one (the cost change); no run by a current agent (most active). A known cost
  uses the app's cost format
  (`client/specs/run-cost-display.md`: three significant digits below $1, `$0` only for a
  genuinely free run).
- **AC-15** WHILE the window has no runs, the page shall say so and link to the pull
  requests; IF the request fails, THEN it shall show the error with a retry.

## Edge cases

- An agent with runs but no decided findings: accept rate "—" (nothing decided).
- All runs failed: runs and failures counted; cost, duration and accept rate "—".
- A run whose PR was deleted counts; its findings went with the PR.
- The current window ends now and the previous one is whole days, so early in the day
  the cost change leans negative. Accepted: the window is defined in days, and the card
  says "vs previous N days".
- One review per run is how the executor writes them (`reviews.run_id` is not unique in
  the schema); a second review for a run would count its findings twice.
- The design's "average accept rate" is a mean of agents (0.61 of 78, 64, 41); here it is
  pooled, so a busy agent weighs more — deliberately.

## Non-functional

- Aggregates in SQL; the answer in under 1 s with 10,000 runs and 50,000 findings.
- Opening the page never calls a model.

## Inputs (provenance)

- [deterministic: DB] `agent_runs`, `reviews`, `findings`, `agents`, `pull_requests` of the
  workspace (joins `reviews.run_id = agent_runs.id`, both of the workspace).

## Untrusted inputs

Agent names, PR titles and model ids are user, GitHub or provider text: rendered as plain
text; links are built from ids and numbers only.

## Contract

`AgentPerf` in `contracts/productionize.ts` (both copies) — the starter's unimplemented stub
for this endpoint, replaced by: `window` (`days`, `from`, `to`), `totals` (`runs`,
`failed`, `cost_usd`, `runs_without_cost`, `prev_cost_usd`, `cost_change_usd`,
`accept_rate`, `decided`, `runs_per_day[]`, `most_active` | null), `agents[]`
(`agent_id` | null, `name`, `runs`, `failed`, `cost_usd`, `avg_cost_usd`,
`avg_duration_ms`, `accept_rate`, `decided`, `accept_trend` | null, `low_sample`,
`last_run_at`, `recent[]`), `cost_by_agent[]`, `cost_by_model[]` (`label`, `cost_usd`,
`share`) — `PerfCostSegment`; runs are `AgentPerfRun`.

## Changelog

- 2026-10-14 — first version (HW L08).
- 2026-10-14 — revised after an independent review (second agent, different model):
  `ran_at` and the window as UTC calendar days; cost over `done` runs only (a failed run
  records none by design); stub zeros of failed runs not shown; pooled accept rate (the
  design averages agents); trend threshold and a minimum sample; most active, cost change,
  shares and model groups defined; `days` validation; CI runs out of scope; sub-cent costs;
  failure state; row rules and tie-breaks.
- 2026-10-14 — aligned with the starter's stub before code: the endpoint is
  `GET /agents/performance` and the contract keeps the stub's names (`AgentPerf`,
  `AgentPerfRow`, `PerfCostSegment`), its fields replaced by this spec's.
- 2026-10-14 — AC-14 before the UI: "<$0.01" would print the same for every row of a
  workspace whose runs cost ~$0.0006; the app's cost format keeps three significant digits
  and never prints $0.00 for a non-zero cost.
- 2026-10-14 — after the first verification: AC-11 shows each slice's share with a stable
  colour; AC-12 is a table to assistive technology (cells, a disclosure button); AC-14
  lists every reason, including the cost change, all-failed agents, fields a finished
  run did not record and the most active agent; two accepted edge cases written down.
