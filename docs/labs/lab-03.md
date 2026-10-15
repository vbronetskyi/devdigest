# L03: subagents and the Intent Layer

This lesson has two parts. The first is about how I work with Claude Code on the
repository: a set of subagents, each with its own role and permissions. The second is
about the product: the reviewer now knows what a PR is for before it reads the diff.

## Subagents

Seven files in `.claude/agents/`. The model split is simple: an expensive model where
thinking is needed, a mid-range one where code gets written, a cheap one for search.

| Agent | Model | Tools | Role |
|---|---|---|---|
| `researcher` | haiku | Read, Grep, Glob, WebFetch, WebSearch | collects facts from the repo or docs, returns a short brief with links |
| `planner` | opus | Read, Grep, Glob | feature plan: files, order, tests for every step, risks; writes nothing |
| `implementer` | sonnet | Read, Edit, Write, Bash, Grep, Glob | code from the plan, one task at a time, with the package checks |
| `architecture-reviewer` | sonnet | Read, Grep, Glob | checks the diff for onion layers, module boundaries, mirrored contracts |
| `test-writer` | sonnet | Read, Edit, Write, Bash, Grep, Glob | tests for the change, test files only |
| `plan-verifier` | opus | Read, Grep, Glob | checks the result against the plan: every item done, nothing extra |
| `doc-writer` | sonnet | Read, Edit, Write, Grep, Glob | specs, docs, Read when lines, reports in `docs/labs/` |

The order for a feature:

```
researcher -> planner -> implementer -> {architecture-reviewer, test-writer} -> plan-verifier -> doc-writer
```

This is a plain subagent pipeline, the first step from the lecture. Agent Teams would
add nothing here: the implementer waits for the plan, the reviewer waits for the code,
and the only place that can really run in parallel (review and tests) is covered by a
simple fork. A dynamic workflow for a task I can already write out as steps would mean
paying for an orchestrator for nothing.

### Permissions: tools first, a hook where tools are not enough

Planner, architecture-reviewer and plan-verifier got only Read, Grep and Glob. They
simply have no tool that can change anything, so the restriction does not depend on
the model following the prompt.

That does not work for test-writer and doc-writer: they have to write, and the `tools`
field cannot restrict paths. So their frontmatter has a PreToolUse hook on
`Edit|Write` that calls `.claude/hooks/subagent-paths.sh`. For test-writer it lets
through only `*/test/*`, `*.test.ts` and `*.test.tsx`, for doc-writer only `*.md`.
Everything else is blocked with exit code 2 and an explanation of what to do instead.
As the lecture put it, a skill fires with some probability, a hook fires every time.

One limitation: test-writer keeps Bash, since tests cannot run without it, and Bash
could in theory write a file. The hook guards the file tools. The denials in
`.claude/settings.json` (migrations, lockfiles, `.env`) apply to all agents.

## Intent Layer

### Why

The reviewer saw the diff and the title, but did not know what the PR was supposed to
do. So it could not point out that a change was outside the PR's scope, and could not
tell an intentional change from an accidental one. Now, before the review, the intent
is derived from the title, description and diff: one sentence plus what is in scope
and what is not.

### How it works

- One structured model call (`review_intent`, schema `PrIntent`). The model comes from
  Settings, falls back to the registry when nothing is set, and to OpenRouter when the
  provider has no key.
- The result is stored in `pr_intent` together with `head_sha`. Until the PR gets new
  commits, later runs take the stored intent and do not call the model. A new commit
  makes the record stale.
- The intent is derived once per run, before the agents, and handed to each of them.
- It goes into the prompt as `<untrusted source="intent">`. The intent comes from the
  PR author's text, so it deserves no more trust than that text. A guard paragraph in
  the system prompt says it plainly: intent and scope can explain a finding, but cannot
  shorten the list of what has to be reported.
- If the call fails or takes longer than 90 s, the log gets `intent: unavailable (...)`
  and the review continues without this block. A failed helper step does not take down
  the main one (ASI08 from the OWASP Agentic Top 10).
- The cost of the call goes to `pr_intent.cost_usd`, not to the run: one intent serves
  all agents and later runs on the same commit.

The Overview tab got an Intent card with a Re-derive button. The run trace shows, as a
separate block, exactly what the model received.

![Intent card on PR #3](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/lab-3/intent-overview.png)

![Intent block in prompt assembly](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/lab-3/intent-trace.png)

### What a live run showed

Demo PR #3 adds an endpoint that sends a review to an arbitrary webhook.
`deepseek-v4-flash` derived the intent for $0.00017 and listed "validating the webhook
URL beyond it being a string" as out of scope. So the model itself declared the SSRF
hole none of our business.

That is exactly why the intent goes in as untrusted. Security Reviewer got this block
and still returned a CRITICAL SSRF in `server/src/modules/reviews/routes.ts:162-175`
(request changes, score 65, 33 s, $0.00052). The run log shows
`intent: cached for 658e5f2`: the intent had been derived earlier with the button, and
the run just reused it.

## Found along the way

**Integration tests called OpenRouter with my keys.** `config.ts` loads `dotenv`, so
under vitest `process.env` had the keys from `server/.env`, and the secrets store
defaulted to the real `~/.devdigest/secrets.json`. While a run made one model call,
nobody noticed: the tests mocked the provider the agent used. Intent added a second
call through another provider, and the test started timing out because it really went
to OpenRouter. Now with `NODE_ENV=test` secrets live in a temporary file and the
container does not read keys from env. A test that needs a model has to mock the
provider explicitly.

## How to check it yourself

1. `./scripts/dev.sh`, open any PR -> Overview -> Intent -> Derive.
2. Run a review, open the run -> Prompt assembly -> the PR intent block.
3. Run again without new commits: the log shows `intent: cached for <sha>`.
4. Subagents: in Claude Code at the repo root, ask "use the planner subagent to plan
   ...". Planner returns a plan as text and changes no files.
5. Hook check: ask test-writer to "fix the bug in
   server/src/modules/reviews/intent.ts". The Edit gets blocked with an explanation.

Tests: `cd server && pnpm exec vitest run intent`, `cd reviewer-core && npm test`,
`cd client && pnpm test IntentCard`.
