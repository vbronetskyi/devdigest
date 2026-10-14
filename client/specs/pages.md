# Spec: pages and the data they load

| Route | What it shows | Data (hook → endpoint) |
|---|---|---|
| `/` | Redirects to the first repo's PR list; empty state links to onboarding | `useRepos` → `GET /repos` |
| `/onboarding` | Add-repository form | `POST /repos` |
| `/repos/:repoId/pulls` | PR list with status filters, sort and refresh | `usePulls` → `GET /repos/:id/pulls`; index badge → `GET /repos/:id/index-state` |
| `/repos/:repoId/pulls/:number` | PR detail: Overview · Agent runs · Files changed, plus the trace drawer | see below |
| `/agents` | Reviewer agents | `GET /agents` |
| `/agents/:id` | Agent editor: Config · Skills · Context (`?tab=`) | `GET/PUT /agents/:id`; Skills tab → `GET/POST /agents/:id/skills`, `GET /skills`; Context tab → `GET/PUT /agents/:id/context`, `GET /repos/:activeRepo/context` |
| `/skills` | Skills Lab: library + editor (`?skill=`, `?tab=`) | `useSkills` → `GET /skills`; editor → `GET/PUT/DELETE /skills/:id`, `/versions`, `/stats`; import → `POST /skills/import[/file]/preview`, `POST /skills/import[/file]` |
| `/repos/:repoId/context` | Project Context: the repo's specs/docs/insights Markdown, read-only (`?doc=`) | `useContextDocs` → `GET /repos/:id/context`; preview → `GET /repos/:id/context/file?path=` |
| `/repos/:repoId/onboarding` | Onboarding Tour | `useOnboarding` → `GET /repos/:id/onboarding`; Generate / Regenerate → `POST` (one model call) |
| `/repos/:repoId/conventions` | Conventions extractor | `useConventions` → `GET /repos/:id/conventions`; scan → `POST /repos/:id/conventions/extract`; `POST /conventions/:id/accept`, `DELETE /conventions/:id` |
| `/agent-performance` | Agent Performance: cards, agents table with recent runs, cost by agent and model (7 / 30 / 90 days) | `useAgentPerformance` → `GET /agents/performance?days=` |
| `/digest` | Weekly Digest (`?week=YYYY-Www`): the week vs the week before, open criticals, agents, highlights | `useDigest` → `GET /digest?week=`; Write highlights → `POST /digest/highlights` (one model call) |
| `/settings/:section` | API keys, models | `GET /settings`, `GET /settings/secrets-status`, `PUT /settings`; model lists → `GET /providers/:id/models` |

## PR list — `/repos/:repoId/pulls`

Columns: Pull request · Author · Size · Score · Findings · Status · Cost · Updated.

- **Score** — latest review's score, `—` when never reviewed.
- **Status** — derived on the server: needs review / reviewed / stale for open
  PRs, GitHub state otherwise.
- **Findings** — severity icons of the latest review; hover opens a read-only
  preview of its findings (`findings-by-severity.md`).
- **Cost** — `PrMeta.cost_usd`, rendered per `run-cost-display.md`.
- Opening the list syncs PRs from GitHub when a token is set; without one it
  serves what is persisted.

## PR detail — `/repos/:repoId/pulls/:number`

The PR id is resolved from `:number` through the repo's PR list (`usePulls`),
then:

- `usePullDetail` → `GET /pulls/:id` — body, files, commits. Opening this page is
  also what persists `pr_files` on the server.
- `usePrReviews` → `GET /pulls/:id/reviews` — review runs with their findings.
- `usePrRuns` → `GET /pulls/:id/runs` — the timeline (every run, any status).
- `usePrActiveRuns` → `GET /pulls/:id/runs/active` — polled while runs are live.
- Trace drawer (`?trace=<runId>`) → `GET /runs/:id/trace`, live log over SSE.
- Files changed tab → `useSmartDiff` → `GET /pulls/:id/smart-diff`.
- Brief card → `useBrief` → `GET /pulls/:id/brief`; Generate → `POST` (one model call).
- git-why panel → `useWhy` → `GET /pulls/:id/why?file=&line=`, only while it is open.

**Overview tab** — the PR description, the intent card, the Brief card and the blast
radius card (`blast-radius.md`), loaded after the PR detail. The intent card reads
`GET /pulls/:id/intent` (free) and derives only on click (`POST`, one model call):
intent quote, in/out of scope, "Derived by <model> · <cost> · for <sha>", and a
note when the PR head moved since.

**Agent runs tab** (`?tab=findings`) has two sections:

- **Timeline** — runs and commits interleaved, newest first. A run tile shows
  its outcome badge, score ring, agent and model, severity icons, run time and
  cost; clicking the agent jumps to its review run, the file icon opens the trace.
- **Review runs** — one collapsible card per review run: verdict banner with PR
  score, the severity count row and filter buttons, then the findings with
  Accept / Dismiss and a "hide low confidence" toggle. The newest run is expanded
  by default.

**Files changed tab** (`?tab=diff`) — Smart order or Original order, finding
markers and the split banner (`smart-diff.md`), plus GitHub comments.
`?file=<path>&line=<n>` opens that file (unfolding it) and scrolls to the new-side
line with a focus ring; without `line` it scrolls to the file.

## Risk brief and git-why (HW L05)

- **Brief card** (Overview) — empty state with Generate. Then risk pills (kind icon,
  severity colour, title, first file reference): the pill opens Files changed at its
  first reference, the chevron expands the explanation (safe Markdown, no links) and
  every reference. "Review focus — read these first" lists `file:line` spots; the
  history accordion lists other merged PRs on the same files, each linked on GitHub,
  with the merge commit's author and date, the model's note and the overlapping files.
  It says when the history is limited (shallow clone), unavailable (no clone, or git
  could not read it) or from the default branch while the PR targets another
  (`baseBranchView` in the page's `helpers.ts`, which also gates git-why). Footer: model, cost and head — or "signals only" and
  why; a warning when the head moved since. A failed regeneration shows its message
  above the kept brief.
- **git-why** (Files changed) — removed and context lines get a "why" button on hover
  (not added lines; no button at all when the PR's base is not the default branch). It
  opens a panel under the line: short sha, subject, author, date, the PR linked on
  GitHub when the server names one, the "earlier history" note, "no history" for a file
  the merge base lacks or a line it lacks (`missing`), or the server's error message.
  The button shows on hover, like the comment "+"; the keyboard cannot reach either.

## Project Context and Onboarding (L05)

- **Project Context** — documents grouped by folder kind (specs, docs, insights); the
  selected one shows its path, "used by N agents", token estimate, a GitHub link at the
  default branch and its content in the kit's `Markdown safe` mode (no raw HTML, http(s)
  links only, no images).
- **Agent → Context tab** — the active repo's documents: tick to attach, untick to
  detach, drag or arrows to reorder, eye to preview; saved at once. Token total with a
  warning above 4K; an attached path the active repo lacks is marked missing.
- **Onboarding Tour** — empty state with Generate; then an "on this page" index, five
  sections (safe Markdown, the architecture diagram via `MermaidDiagram`, files linked
  on GitHub at the indexed commit, numbered reading path) and a footer naming model,
  cost and index commit, or the skeleton's reason.

## Agent Performance and Weekly Digest (HW L08)

Both pages sit in the sidebar's **GLOBAL** group (`g m`, `g w`) and are workspace-wide,
not under a repository.

- **Agent Performance** — a 7 / 30 / 90 days selector; cards: runs with a daily
  sparkline and failures, cost with its change against the previous window ("no cost
  known" for this window or the previous one, whichever it is), the pooled accept rate
  with the decided count, the most active agent. The table is a native `<table>` (accept
  rate first, unknown last): runs, average cost and duration, the accept rate with a
  trend arrow (text label) and "low sample" under 5 decisions, the last run. The agent
  cell's button (`aria-expanded`) opens the last five runs, each linking the PR's Agent
  runs tab (a deleted PR's run is unlinked). Every unknown is `Unknown` — "—" with its
  reason in `title` and in visually hidden text. Cost donuts by agent and by model show
  cost and share in the app's cost format; a slice's colour follows its key
  (`sliceColors`), the deleted agent and the unknown model are grey, so an agent keeps
  its colour across windows while the same agents appear.
- **Weekly Digest** — previous / next week through `?week=` (no next past the current
  week, which is marked "in progress" and compared with the same elapsed days of last
  week). Cards: PRs opened, PRs reviewed, runs, cost, new findings by severity, decisions
  — each with its change; an unknown change is "— vs last week" with its reason, never
  "no change". Highlights are labelled "AI-written, numbers checked", written only on
  **Write highlights / Rewrite**, with model, cost, time and a "stale" note. A request
  belongs to its week: the mutation key holds the week and the answer goes to the cache of
  the week it asked for; coming back to a week whose request still runs shows "Writing…"
  (`useIsMutating`). A failure shows the server's sentence as is. Open critical findings
  ("N of M") open Files changed at their line. **Copy as Markdown** has each number with
  last week's and the change, criticals with PR title, file:line and agent; untrusted text
  is escaped for a team channel and URLs stay inside code spans; PRs link to GitHub.

No page triggers an LLM call by being opened. Model calls happen only from
**Run Review**, the intent card's **Derive**, the tour's **Generate / Regenerate**,
the Brief card's **Generate / Regenerate** and the digest's **Write highlights**.
