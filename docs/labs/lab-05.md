# L05: Spec-Driven Development, Project Context and Onboarding

Both features of the lesson were built with SDD: first a spec with acceptance criteria,
then an independent review of the spec, a plan with traceability, the code, and a
separate check of the code against the spec. The product got two things. Reviewers now
read the specs/ and docs/ of the repository they review. Someone new to a project gets
an onboarding tour built from facts, not made up by a model.

## Pipeline

The subagent set from L03 was rebuilt for SDD:

```
spec-creator -> researcher -> (brainstorm) -> implementation-planner -> implementer -> {architecture-reviewer, security-reviewer, test-writer} -> plan-verifier -> doc-writer
```

- **spec-creator** (new) writes `specs/<feature>/spec.md`: the problem, goals and
  non-goals, numbered criteria in EARS, edge cases, where the inputs come from and how
  to treat foreign text.
- **planner -> implementation-planner** writes `plan.md`, where every task is tied to
  a criterion and a test, plus an AC -> task -> test -> commit matrix.
- **test-writer** derives tests from the spec's criteria, not from the code. A test
  written against a finished implementation passes on a wrong one too.
- spec-creator and implementation-planner can only write inside `specs/`: the same
  `subagent-paths.sh` hook from L03 guards that, now with a `specs` mode.

The spec is committed before the code, and `git log` shows it: `9580b66` (specs) comes
before `5c8e8be` (the first code).

### Reviewing the spec before the code

Before planning, a separate agent on a different model (Sonnet) read both specs with a
checklist: is every criterion atomic and testable, are there contradictions, does it
describe behavior and not implementation. It found about twenty problems, and each of
them would have become a bug. A few of them:

- a document `docs/x.md` could be a symlink to a file outside the repository, and
  reading went through the working copy;
- AC-9 required always adding a rule to the prompt, while AC-11 required the prompt to
  stay unchanged when there are no documents. The two criteria contradicted each other;
- a failed tour regeneration would have overwritten a good tour with a skeleton;
- nothing limited the amount of facts sent to the model, and nobody stripped links from
  the model's prose.

After the fixes there were 22 criteria instead of 13 and 23 instead of 11, and during
verification SPEC-02 got one more, AC-24. The history of changes is in the changelog of
each spec.

## Project Context Folder (SPEC-01)

The Project Context page shows the repository's Markdown from `specs/`, `docs/` and
`insights/` folders at any depth, because DevDigest keeps them per package. On an
agent's Context tab documents get attached, and the order matters. During a review the
attached documents go into that agent's prompt.

![Project Context](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/lab-5/context-page.png)

![Agent Context tab](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/lab-5/agent-context-tab.png)

How it works:

- Documents are read from the clone's default-branch commit (`git ls-tree` and
  `git show HEAD:<path>`), not from the working copy and not from the PR head. A PR
  cannot rewrite the spec it is being checked against. Symlinks do not even make it
  into the list.
- Every document goes in its own `<untrusted>` block, and its first line is the path.
  Before the blocks there is a trusted rule: documents describe how the project is
  supposed to work; a contradiction with them is a finding, but they cannot approve a
  PR, lower a severity or remove a finding.
- The budget is 8K tokens per model call. A document that crosses the limit is cut
  with a marker, the following ones are left out, and the log names both. Map-reduce
  gets the same documents in every call.
- The trace shows `specs_read` (even for a failed run) and the Project context block
  itself. The log has the commit the documents were read from.
- In the UI, Markdown from the repository is rendered without HTML and images, and only
  http(s) links are kept.

![Project context block in the trace](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/lab-5/trace-project-context.png)

### What live runs showed

Security Reviewer with two documents (`server/docs/architecture.md`,
`server/specs/review-flow.md`) read them from `e4f1a7d`, about 1 700 tokens, and found
the CRITICAL SSRF on demo PR #3, same as without them.

General Reviewer with `architecture.md` twice answered that no diff was sent and
approved the PR. The diff was in the prompt, I checked the trace. So I set up a
control experiment on the same PR:

| Where the documents are in the prompt | Runs | Found SSRF | Time |
|---|---|---|---|
| right before the diff | 2 | 0 (both approve 100, said the diff was missing) | 47-234 s |
| no documents | 2 | 2 | 16-20 s |
| at the start of the message, before the PR description | 2 | 2 | 24-27 s |

The sample is small, but the direction is clear, so documents now go first. Before
that, the same trace showed another problem: document headings (`## Modules`,
`## Data`) sat at the same level as `## Diff to review`. Now they are shifted two
levels down. Both changes went into AC-8 of the spec first, and only then into the code.

The result, plainly: in none of these runs did a finding refer to `architecture.md`,
although PR #3 queries the database straight from `routes.ts` and the document forbids
that. The mechanism works, and the documents reach the model. Whether it uses them
depends on the reviewer and the model.

## Onboarding Generator (SPEC-02)

The tour is built map-reduce style. Code collects the facts for free:

- languages and folder structure from the git tree;
- scripts and frameworks from `package.json` (up to ten, least nested first);
- the package manager from the lockfile next to it;
- Docker, Compose and CI, only when the files are there;
- endpoints, cron jobs, file ranks and import chains from the index.

The model gets only these facts, in one `<untrusted>` block, and makes one call. The
server does not trust its answer:

- the five sections always come in the same order;
- the reading path and the chains come from the index, and the model can only label
  the steps; steps it adds on its own are dropped;
- links are built only to files that exist in the commit;
- links, images and HTML are stripped from the prose.

If the model is unavailable, does not finish in 90 s or returns the wrong schema, what
remains is a skeleton built from the facts alone, with the reason. A failed
regeneration does not overwrite a tour the model wrote.

![Onboarding tour](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/lab-5/onboarding-top.png)

The tour for this repository: 622 files, 28-35 s, $0.0005 on deepseek-v4-flash. The
first run found three problems the tests did not catch:

- `styles.ts` and `constants.ts` got into the reading path, because PageRank piles up
  in files that import nothing themselves;
- the model suggested `pnpm install` at the root, as if it were a workspace, which it
  is not;
- for e2e it gave `pnpm`, although that package uses npm.

Style, constant and type modules are now excluded from the reading path (AC-9 was
updated first), and the prompt requires taking the manager of each package separately.
The second run fixed all of that.

![How to run and reading path](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/lab-5/onboarding-reading.png)

The remaining risk is written down in the plan too: numbers and paths inside the prose
are not checked. For example, the model guessed API port 3000 instead of 3001. Only the
links are checked.

## Traceability and verification

In `specs/project-context/plan.md` and `specs/onboarding/plan.md` every criterion has a
task, a test and a commit. At the end a separate agent acting as plan-verifier checked
every AC against the branch's code and tests, not against commit messages. Its reports
are in `verification.md` next to the spec.

| Spec | First pass | What it found | Second pass |
|---|---|---|---|
| SPEC-01 | ready, with gaps | 256 KB was counted in characters, not bytes; the mock did not tell reading from a commit apart from reading the working copy; a few criteria without tests | ready |
| SPEC-02 | **not ready** | up to three model calls instead of one (the adapter retried on its own); the facts limit measured a different text than the one in the prompt; bare URLs got into the prose; the tree was read from HEAD while links pointed to the indexed commit | ready |

The second pass found real things too. An unclosed backtick in the model's answer
could leave a URL outside a code span, so the tour now renders prose with no links at
all. And a resync in the middle of generation could mix two commits, so the tree and
the manifests are now read at a specific sha. Every fix has a test, and the items where
the wording changed are in the spec's changelog.

## Found along the way

- **The Context tab did not open.** The agent page had its own list of allowed tabs
  (`config`, `skills`), so `?tab=context` silently fell back to Config. Component tests
  render the tab directly and did not see it; the check in the browser caught it.
- **Markdown in the UI kit did not style headings and lists.** For documents and the
  tour that matters a lot, so the styles were added, and they apply everywhere the kit
  is used.
- **A run was marked finished before its trace was written.** On a full integration
  run under load, two tests read the trace before it was written. This is an old race
  from L01: the UI could open the trace too early in the same way. Now the trace is
  written first at all three completion points.
- **The clone lags behind `main`.** It sat on the course's starting commit until I ran
  a resync. Project Context shows the state of the default branch that the clone has.

## How to check it yourself

1. `./scripts/dev.sh`, pick an indexed repository in the sidebar.
2. Project Context -> pick a document: the right side shows its content and how many
   agents use it.
3. Agents -> an agent -> Context: tick documents, change the order. A warning appears
   after 4K tokens.
4. Run a review with this agent and open the trace. Specs read and Prompt assembly ->
   Project context show what went into the prompt.
5. Onboarding Tour -> Generate. The footer shows the model, the cost and the index
   commit.
6. Specs, plans and verification reports are in `specs/`.

Tests: `cd server && pnpm exec vitest run context project-context onboarding git-list deadline`,
`cd reviewer-core && npm test`,
`cd client && pnpm test ContextTab DocList DocPanel ContextDocView OnboardingTour MermaidDiagram context/page`.

---

# L05 homework: Risk Brief and git-why

Two features, both through the same SDD pipeline as the lab: spec, independent spec
review, plan, code, and a check of the code against the spec. **SPEC-03 Risk Brief**
answers what can break because of this PR, where to look first and who has already
touched these files. **SPEC-04 git-why** answers why a line is the way it is: who
changed it last and in which PR. Specs, plans and verification reports are in
`specs/risk-brief/` and `specs/git-why/`.

**Video (78 s):** [hw5-brief-why.mp4](https://github.com/vbronetskyi/devdigest/blob/pr-assets/hw-5/hw5-brief-why.mp4):
generating a brief on PR #9, an expanded risk, the jump into the diff, the history of
PR #5 and git-why on a line from PR #4.

## Risk Brief (SPEC-03)

Most of the brief is computed by code, for free:

- **Signals:** a table of rules over the PR's changes. A migration, a DB schema change
  without a migration, a dependency manifest, a lockfile, a CI workflow, paths with
  words like `auth`, `session`, `token`, routes and public contracts (deleted lines
  give medium, added-only lines give low). Tests and Markdown give no signals.
- **History:** other PRs that were already merged into the default branch and touched
  the same files. Taken from `git log --first-parent` of the clone, without lockfiles,
  Markdown and migration metadata.

The model gets this together with the diff and makes one call: it explains the risks,
ranks them, picks up to five places to read first and writes notes for the history.
The server does not trust it:

- a file reference stays only if the file is in the PR and the line is among the lines
  the diff shows (for a range, every line);
- a risk without a single live reference is dropped;
- links, images and HTML are stripped from the text;
- a rule's signal stays until the model covers it with a risk of the same type.

Without the model (no key, wrong schema, 90 s) the brief is built from the signals and
the history alone, with the reason. A failed regeneration does not overwrite the
model's brief for the same commit.

![Brief on demo PR #3](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/hw-5/brief-pr3.png)

On demo PR #3 the brief puts the SSRF first and points to the line with
`fetch(req.body.url)`. It costs $0.0007-0.0008 on deepseek-v4-flash. The brief for HW1
(#5, 55 files) costs $0.0016-0.0018. Its history shows Lab 1 (#4), which touched the
same `routes.ts`, contracts and `RunHistory`:

![Brief with history, PR #5](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/hw-5/brief-pr5-history.png)

Opening a PR does not call the model. Until there is a brief, the card offers Generate:

![Empty state](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/hw-5/brief-empty.png)

Every reference in the brief opens Files changed at the right file and line
(`?tab=diff&file=...&line=...`). A collapsed file expands and the line is highlighted.
If the tab's patch does not have the line, the page scrolls to the file itself.

![From the brief to the diff](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/hw-5/deep-link.png)

## git-why (SPEC-04)

In Files changed, hovering a deleted or context line shows a why button. The server
runs `git blame` on that line at the PR's merge base, because that is the revision the
left side of the diff shows, not the default branch HEAD. Then it finds the merge that
brought the commit into the default branch. No model here, only git:

![git-why on a line from PR #4](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/hw-5/why-panel.png)

A path from the user reaches git only after the check that it is a file of the PR, and
only after `--`. There are five checks, in this order: request schema (422), PR (404),
branch (409), file and line (404), clone (409). Before the fourth one git is not called
at all, and a test checks that with spies on every git method.

## What live runs found

- **A fork inherits upstream PR numbers.** The history of PR #5 showed "#11 chore:
  cleanup before home tasks". That is a squash commit from the course repository, while
  #11 in my fork is the open lab 5 PR. Now a number from a commit counts only if
  DevDigest knows such a PR in this repository as merged. The title comes from
  DevDigest, not from the commit message. The specs were changed first, both of them:
  AC-4 in SPEC-03, AC-7 in SPEC-04.
- **The root commit seemed to come from PR #4.** `rev-list --ancestry-path --merges` finds
  later merges even for a commit that sits on the mainline itself. Such a commit now has
  no merge it came through.
- **The model was off by two lines.** On PR #3 it pointed to `routes.ts:175`
  (`headers:`), while `fetch` is on 173. The model counts lines from `@@` and loses
  track. Grounding let it through, because 175 is also a line the diff shows. Now every
  line of the new version in the diff the model gets has its own number. After that,
  two runs gave 173 and 14 (the request body schema) exactly. Reviewers make the same
  mistake: the SSRF finding is on 175 too. But that is the reviewer-core prompt, so I
  wrote it into insights as a separate task.
- **A large PR.** On #5 the diff for the model is cut at 12 000 characters, so for
  files the model did not see it gives `:1`. For a new file that is a real line, so
  grounding lets it through. The only cures are a bigger diff budget or map-reduce, as
  the reviewers do.

## Verification

After the code, a separate Opus agent in the plan-verifier role checked the spec
against the branch's code and tests, not against commit messages. It took three rounds:
every pass found real things. Full reports are in `verification.md` next to the specs.

| Pass | SPEC-03 | SPEC-04 |
|---|---|---|
| 1 | not ready: the diff parser lost deleted files, Prisma migrations were not detected, a range across two hunks passed, any diff loading error became a 409 | not ready: 422 fired before 404/409, against the order in the spec, a phantom line after the final `\n`, why on the `\ No newline` marker |
| 2 | not ready: Go/Python/Ruby tests produced signals, `git diff` returned non-ASCII paths quoted with escape sequences, deleted files cost the reviewers an extra map call | not ready: the file existence check passed the path as `<sha>:<path>`, not after `--` |
| 3 | one regression from the second round: the `spec/` folder counted as tests, so `spec/openapi.yaml` stopped producing a signal. Fixed and covered by a test | ready |

Some of the findings were not only about the brief. The diff parser had dropped deleted
files since day one, so reviewers never saw them. `git diff` returned non-ASCII paths
quoted with escape sequences. The closing `</untrusted>` marker was escaped only in
lower case; that fix sits in #13, where the conventions extractor needs it too. All of
this is fixed with tests, and every behavior change was written into the spec's
changelog first.

Left as is on purpose, and written down in the specs:

- The 90-second deadline does not cancel the model request itself. That is how every
  model feature works; cancelling would need an AbortSignal passed through the LLM port.
- Actions on a diff line are only available on hover. The + for a comment works the
  same way, and keyboard navigation through the diff is a separate feature.
- The rule based on words in the path also catches the design system's `tokens.ts`.
  That is expected: the rule only looks at the words in the path.

## How to check it yourself

1. `./scripts/dev.sh --no-seed`, pick a repository with a clone in the sidebar.
2. PR -> Overview -> Risk brief -> Generate. A pill can be expanded with its arrow.
   Clicking a pill or a read-first line opens Files changed at that line.
3. History in the card shows other merged PRs on the same files.
4. Files changed -> hover a deleted or context line -> why. On a PR that does not
   target the default branch, the button is not there.

Tests:
- `cd server && pnpm exec vitest run brief why git-history grounding`;
- `cd reviewer-core && npm test`;
- `cd client && pnpm test BriefCard WhyPanel DiffTab helpers`.
