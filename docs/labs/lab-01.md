# L01: run cost and findings by severity

The first lesson brings two things back into the starter: how much each review run
costs, and a breakdown of findings by severity. On top of that comes the groundwork
for working with an agent: CLAUDE.md, package docs and a skill that keeps insights.

## Run cost (lab, [#4](https://github.com/AgentIvan/dev-digest/pull/4))

Cost shows up in the PR list (the sum of successful runs), on every Timeline tile
and as its own block in the Trace drawer.

![Cost column in the PR list](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/lab-1/pr-list-cost.png)

There was nothing to calculate: `reviewer-core` already got the real amount from
OpenRouter in `usage.cost`, and the server just threw it away. Now it is written to
`agent_runs.cost_usd` when the run finishes. I deliberately did not recompute it as
tokens times list price. On a live run OpenRouter charged $0.000153636, and that is
exactly the number that got stored. The price list would have given $0.000514,
three times more.

Unknown cost never turns into zero: the API returns `null` and the UI shows a dash.
Amounts under a dollar get three significant digits (`$0.000154`), because the
`toFixed(3)` from the design mockup would turn a typical run into `$0.000`.

## Docs for the agent

- Root `CLAUDE.md`: stack, layout, commands, naming conventions and the areas that
  must not be touched (migrations, lockfiles).
- A `CLAUDE.md` in every package with a **Read when** section that points to its
  `docs/` (how it works) and `specs/` (what has to stay true).
- The `.claude/skills/engineering-insights` skill: reads the package's
  `insights/INSIGHTS.md` before the work and appends dated entries with `file:line`
  after it. It never rewrites anything: a wrong belief is replaced by a new entry.

## Findings by severity (homework, [#5](https://github.com/AgentIvan/dev-digest/pull/5))

An expanded run card has a `N CRITICAL · N WARNING · N SUGGESTION` line under the
verdict and three filter buttons. The numbers are counted from the same list as the
cards, so they always match what you see below.

![Counters and filters in a run card](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/hw-1/run-card-counts.png)

The PR list has a FINDINGS column. Hovering it opens a read-only popover with the
findings of the latest run.

![Popover with the findings of the latest run](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/hw-1/pr-list-findings-preview.png)

None of the counters calls a model: they group findings that are already stored. On
the server it is a single `COUNT ... GROUP BY`, in the browser a count over the list
that is already loaded.

Video (43 s): [hw1-findings-by-severity.mp4](https://github.com/vbronetskyi/devdigest/blob/pr-assets/hw-1/hw1-findings-by-severity.mp4).

## Insights get written on their own

The description of the `engineering-insights` skill alone did not trigger it
reliably. So two Claude Code hooks in `.claude/settings.json` hold the protocol.
`SessionStart` remembers the commit the session started from and reminds the agent
to read the insights. `Stop` compares everything the session changed (committed work
included), and if a package's code changed but its `INSIGHTS.md` did not, it sends
the agent back to write an entry. Saying there is nothing worth recording is fine
too: the next stop then goes through.

## How to check it yourself

1. `./scripts/dev.sh`, then put `OPENROUTER_API_KEY` and `GITHUB_TOKEN` in `server/.env`.
2. Add a repository (your own or this fork), open a PR, **Run Review -> all agents**.
3. Look at the Cost and Findings columns in the list, the Timeline and the cards on
   the Agent runs tab, and the COST block in the trace (the document icon on a tile).

Tests: `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` and
`pnpm exec vitest run .it.test` (needs Docker), `cd client && pnpm test`.

## Found along the way

I ran the three built-in reviewers on the three demo PRs:

- All three found the **SSRF** in the webhook (#3).
- General and Security found the **N+1** in the activity summary (#2), Performance
  Reviewer did not. As it turned out in L02, it did not miss the problem, it never
  saw the diff: the stored run says "the diff is not present" although the diff is
  in the prompt.
- On the clean #1, General invented a CRITICAL about routing and failed the PR. A
  short addition to its prompt removed the false alarm, and it still catches the SSRF.

And two real bugs in DevDigest itself:

1. A review can run on an **empty diff** and approve the PR with score 100 if nobody
   opened the PR page before.
2. A **hung model call** keeps the run in `running` until the OS drops the
   connection (about 15 min). The SDK timeout only covers the response headers, and
   Cancel does not abort the request.

Details and evidence are in `server/insights/INSIGHTS.md` and `reviewer-core/insights/INSIGHTS.md`.
