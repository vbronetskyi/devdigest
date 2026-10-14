# Verification: SPEC-05 Agent performance dashboard

By the `plan-verifier` role: a separate agent (Opus), read-only, judging the code and
tests against the spec and the course design — not commit messages.

## Pass 1 — at `45b6b2e`

**Verdict: not ready, but close.** The numbers were right: UTC windows, counted
statuses, exclusive decisions, one review per run, deleted agents as one null group,
workspace scoping, parameterised SQL. The gaps were in the UI and the tests.

| Finding | Kind | Resolution | Commit |
|---|---|---|---|
| The agents table was `<button role="row">` with no cells; `aria-expanded` on a row; the label hid every value | accessibility | a native `<table>`; the agent cell holds a disclosure button (`aria-expanded`, `aria-controls`) (AC-12 amended) | `244d786`, `46c0085` |
| The cost card said "no cost known for the previous N days" when this window's cost was the unknown one | misleading | separate texts for this window and the previous one (AC-14) | `46c0085` |
| "—" without a reason: most active, an all-failed agent, fields a finished run did not record; `title` is not announced | gap | `Unknown`: the reason in `title` and in visually hidden text (AC-14 amended) | `244d786`, `46c0085` |
| Shares computed but not shown; "unknown model" untranslated; slice colours by position; a green "flat" arrow | design | shares in the legend, a translated label, colours by key (`sliceColors`), a muted flat arrow (AC-11 amended) | `244d786`, `46c0085` |
| The plan's T4 still said "<$0.01"; the matrix was empty; no test for the 1 s target | process | plan traced to tests and commits; a load test with 10,000 runs and 50,000 findings (13 ms median) | `fff186b`, `106e145` |
| Mutations that passed every test: recent runs order, limit and workspace; the decisions join's workspace check; `no_cost` and the model cost without `status = 'done'`; `max`→`min` last run; PR title; client sparkline, low sample, retry, Donut format, the down arrow's label | untested | tests added; all 22 mutations now fail a test | `46c0085`, `fff186b` |

Accepted as is, written into the spec's edge cases: the current window ends now while the
previous one is whole days; `reviews.run_id` is not unique (the executor writes one review
per run). The `at time zone 'UTC'` in the per-day query cannot be mutation-checked in a
container that runs in UTC; per-day placement itself is tested.

## Pass 2 — at `106e145`

**Verdict: not ready — one criterion.** Every pass-1 item was confirmed fixed (native
table, the cost card's reasons, every unknown's reason, shares, plan traced to tests, a
1 s load test at a 12 ms median); the matrix's tests exist and exercise their criteria.

| Finding | Kind | Resolution | Commit |
|---|---|---|---|
| AC-11: colours still moved between windows — the deleted-agent key took a palette slot, so its coming and going shifted other agents (about half of 4-agent workspaces) | deviation | the deleted agent and the unknown model are grey and take no slot; AC-11 states what stays stable | `0d26eeb`, `fae4095` |
| A row with nothing decided is not "low sample" — tested, but not in the spec | spec gap | AC-5 amended | `0d26eeb` |
| Mutations that passed: an unknown previous or current cost as 0; no workspace filter in `decisions()` or `cost()`; no status filter in `recent()` or `decisions()`; "low sample" weakened; no known cost change rendered | untested | an empty previous window, another workspace's decisions and earlier cost, a cancelled run's decisions, a quiet workspace with no known cost, the change's sign and colour; 14 more mutations, all fail a test | `fae4095` |
| An all-failed agent's accept rate said "accept or dismiss findings"; one run's cost said "these runs"; ±$0 shown green; the trend label only for screen readers; six card landmarks; the starter's unused `agentPerformance.json` | nit | the failed-run reason, a one-run wording, a plain zero, a hover title, `role="group"` cards, the file removed | `fae4095` |

Accepted as is: the cost change's reason is a sentence ("no cost known in this window"),
which already says why.

## Pass 3 — at `fae4095`

**Verdict: not ready — one palette problem.** The amended AC-11 was met as written and
every pass-2 item was confirmed fixed, each mutation failing a named test; no regressions
across AC-1 – AC-15 (179 client tests, 14 server tests, a 12.7 ms load median).

| Finding | Kind | Resolution | Commit |
|---|---|---|---|
| Two palette tokens repeated others: `--sugg` is `--accent`'s blue and `--info` is grey, next to the grey unknown slice — in about half of 3-agent workspaces a live agent drew grey | design | six `--chart-*` tokens with distinct hues in both themes; a test reads `styles.css` and checks no repeat and no grey | `0265617` |
| Nothing tested that the breakdown passes the key, not the label, into `sliceColors` | untested | the deleted agent's swatch is checked to be the unknown grey | `0265617` |
| The API still said `low_sample: true` when nothing was decided; only the UI hid it | deviation | the server rule follows AC-5 (`decided > 0`), the UI shows the flag as is | `0265617` |
| `title` on the wrapper and `aria-label` on the icon could announce the trend twice | nit | one `role="img"` element with the label; the icon is hidden | `0265617` |

## Pass 4 — at `061fb3e`

**Verdict: ready.** The pass-3 items are resolved: six chart tokens in both themes, a
palette test that fails on a grey, a repeat, a token equal to the unknown grey or a
missing token in either theme (checked against altered copies of the stylesheet); the
deleted agent's swatch proves the key reaches `sliceColors`; the server's `low_sample`
follows AC-5; one announced trend label. No regressions across AC-1 – AC-15; contract
copies identical; 14 server, 181 client tests.

Nits taken after the verdict (`cd798b3`): emerald and teal were close and green/red read
as good/bad in a cost chart — the palette is now blue, violet, amber, pink, cyan, lime and
the test also rejects near duplicates; the zero-decided rule is in the contract comment
and both package specs; a test fixture the server could not produce was replaced; the
plan's AC-5 and AC-11 rows name their new tests.
