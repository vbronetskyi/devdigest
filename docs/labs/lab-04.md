# L04: devdigest-mcp

Before this lesson a DevDigest review could only be started with the Run button on the
PR page. Now an agent can do the same right from the Claude Code terminal: the app's
Fastify API is exposed as an MCP server (the official TypeScript SDK, stdio transport).

## Five tools

| Tool | What it does |
|---|---|
| `list_agents` | which reviewers are set up and what each one checks; this is where the agent gets ids |
| `run_agent_on_pr` | starts a review, waits and returns the finished findings; the only one that changes anything |
| `get_findings` | reads a finished run, by `run_id` or the latest one on a PR |
| `get_conventions` | the repository's house rules from L02, only the ones a person accepted |
| `get_blast_radius` | the PR's impact map; while the server cannot build it, the tool says so (homework) |

There is no `list_repos` or `list_prs` on purpose: `gh pr list` already does that, and
one tool per endpoint only bloats the context.

How the four design principles from the lab are applied:

- **Outcome, not operation.** `run_agent_on_pr` creates the run, polls its status and
  collects the findings itself. If the review takes longer than `wait_seconds` (240 s by
  default), the tool returns the `run_id` with a hint to call `get_findings` instead of
  hanging.
- **Flat arguments.** `repo` (`owner/name`), `pr` (a number), `agent` (name or id). The
  agent name can be written any way you like: security-reviewer, Security Reviewer or
  just security, as long as the match is unambiguous.
- **Compact answer.** Verdict, score, counts by severity, summary and findings from the
  most critical down: `file:line`, why (up to 400 characters), how to fix (up to 240).
  No raw dumps.
- **Errors with a next step.** Not a bare 404, but "no agent named perf, call
  `list_agents`" or "there is no PR #9, DevDigest has #3, #1".

![Tools in MCP Inspector](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/lab-4/inspector-tools.png)

## Setup

The server is registered in `.mcp.json` at the repo root as `devdigest`. Claude Code
starts it on its own as soon as you open a session in the repository. The API just
has to be running (`./scripts/dev.sh`) and `node` has to be on PATH.

## Checks

MCP Inspector sees all five tools with their descriptions and annotations (read-only
everywhere except `run_agent_on_pr`), and `list_agents` returns the agents.

![list_agents in Inspector](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/lab-4/inspector-list-agents.png)

I ran the same chain an agent would follow, live, on demo PR #3:

1. `list_agents` -> Security Reviewer;
2. `run_agent_on_pr(repo, 3, "security", wait_seconds=45)` -> after 45 s,
   `status: running` and a `run_id`;
3. `get_findings(run_id)` -> `request_changes`, score 17: a **CRITICAL** SSRF in
   `server/src/modules/reviews/routes.ts:174-185` and four WARNINGs (79 s, $0.0008).

The package tests use a real MCP client over the SDK's in-memory transport against a
fake API: 11 tests for discovery, waiting, progress, errors and the compact answer
shape.

## Token audit

How much room the tool descriptions take (`tools/list`, tokens taken as characters / 4).
GitHub MCP is the official image, version 2.0.2:

| Server | Tools | Tokens, approx. |
|---|---|---|
| GitHub MCP, `GITHUB_TOOLSETS=all` | 91 | 66 600 |
| GitHub MCP, default | 46 | 32 500 |
| GitHub MCP, `pull_requests,repos` + `GITHUB_READ_ONLY=1` | 16 | 10 300 |
| devdigest-mcp | 5 | 1 000 |

Trimming through the server's own config gives 3-6 times less, but not every server
supports that. Tool Search works for any server: in Claude Code it is on by default,
and at startup only the tool names and the server's `instructions` go into the
context. So the devdigest-mcp instructions explain **when** to look for its tools, not
just what they do. Tools needed on every turn can use `alwaysLoad: true` in `.mcp.json`.

The `/context` numbers depend on the session, so you take them yourself: base session
-> +GitHub MCP -> trimmed -> Tool Search (`ENABLE_TOOL_SEARCH`) -> the same with
devdigest-mcp.

## Found along the way

- **A review started through the API looked at an empty diff.** The bug from L01
  became a blocker: an agent starts a review over MCP, nobody has opened the PR page,
  the PR files are not in the database, and the local clone does not have the head
  commit. The model got zero changes and approved with 100. Now in that case `loadDiff`
  fetches the files from GitHub and stores them, and if there are no changes anywhere,
  the run fails with an explanation.
- **MCP Inspector cuts a call off after 60 s.** Claude Code waits for a stdio tool for
  up to 30 minutes of silence, so 240 s is fine there. In Inspector it is better to set
  `wait_seconds=45` and then call `get_findings`.
- **Same agent, same PR:** once 79 s and a CRITICAL SSRF, once 346 s and zero findings.
  In the second run the model found the SSRF but pointed to a file that does not
  exist, and the grounding gate dropped it. The summary still describes the SSRF, so
  the tools return the summary too, and the agent can see it.

## Домашка: Blast Radius

Вкладка Overview на сторінці PR показує, що PR може зламати: які символи він
змінює, хто їх викликає далі по коду і які ендпоінти та cron-задачі за ними
стоять. Той самий результат віддає MCP-інструмент `get_blast_radius`.

**Відео (52 с):** [hw4-blast-radius.mp4](https://github.com/vbronetskyi/devdigest/blob/pr-assets/hw-4/hw4-blast-radius.mp4)
— дерево й граф на PR #5, вісім ендпоінтів за одним обробником на demo-PR #3.

![Blast radius PR #5](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/hw-4/blast-tree.png)

Дві провокації з лаби виконано буквально:

- **Тут немає AI.** Відповідь складається з готового індексу `repo-intel`:
  символи, посилання, ранги файлів, факти про ендпоінти. Якщо індексу ще немає,
  сервер одразу каже «not indexed», а не біжить сканувати клон.
- **Нуль аналізу під час рев'ю.** 30 запитів на PR #3 і #5: p95 — 7–8 мс на
  сервері, до 25 мс по HTTP, при бюджеті 200 мс. Кожна відповідь несе свій
  `duration_ms`, а тест перевіряє, що до моделі не було жодного звернення.

Головна тонкість — **які символи насправді змінені.** Індекс описує `main`, а
номери рядків у диффі належать новій версії. Тому ханк перекладається на рядки
бази: видалений рядок — це його старий номер, вставлений — рядок, після якого
він став. Зачепленим вважається символ, у діапазон якого потрапив такий рядок.
Для PR #5 з 52 змінених файлів це дає 6 символів замість усіх, що лежать у тих
файлах. Нові файли PR у базі ще не існують, тож викликів у них немає — і це
правда.

![Граф для одного символу](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/hw-4/blast-graph.png)

Для demo-PR #3 видно чесне обмеження: `reviewsRoutes` має 0 викликів, бо модулі
реєструються через default-імпорт під коротким іменем, і індексатор такий
виклик не резолвить. Ендпоінти файлу при цьому видно.

![Blast radius PR #3](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/hw-4/blast-pr3.png)

## How to check it yourself

1. `./scripts/dev.sh`, with `node` on PATH (`export PATH="$HOME/.local/node/bin:$PATH"`).
2. In the repository: `cd mcp && npm ci` (if not installed yet).
3. Open Claude Code at the repository root and confirm the `devdigest` server in `/mcp`.
4. Ask: review PR #3 in vbronetskyi/devdigest with the security-reviewer agent, are
   there any critical findings.
5. Inspector on its own: `cd mcp && npm run inspect`.
6. Any PR -> Overview -> Blast radius; or `get_blast_radius` in Claude Code.

Tests: `cd mcp && npm test`, `cd server && pnpm exec vitest run .it.test`.
