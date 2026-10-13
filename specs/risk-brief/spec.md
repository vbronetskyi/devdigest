# Spec: Risk brief and PR history | Spec ID: SPEC-03 | Status: implemented

## Problem and why

Findings say what is wrong in the lines a reviewer was shown. Before reading a diff a
reviewer also needs what could go wrong *because of* the change — a migration, a new
dependency, a touched auth path, a changed public contract — where to look first, and
what earlier PRs changed the same files. Code finds most of this for free; a model is
worth one call to explain and rank it.

## Goals / Non-goals

Goals
- Risk signals from the PR's diff by rules ($0), always shown.
- Other PRs merged into the default branch that touched the same code files ($0).
- One model call that explains and ranks risks, picks a review focus and annotates the
  history, all grounded by the server in the PR's diff.
- A useful brief without a model.

Non-goals
- Replacing reviewer agents: risks are not findings and never change a score.
- History from the GitHub API, or from the PR's own base branch when that is not the
  default branch.
- Generating the brief automatically on a review or when the PR is opened.

## User stories

- As a reviewer, I open a PR and see its risk areas, each with why and where.
- As a reviewer, I get a short "read these first" list of file:line spots.
- As someone new to the code, I see which other PRs touched these files.

## Acceptance criteria (EARS)

Diff
- **AC-1** WHEN a brief is generated, the system shall use the PR's diff from the same
  loader a review uses (local clone, stored files, then GitHub), and describe the PR head
  that diff belongs to.

Signals (no model) — always part of the brief
- **AC-2** The system shall raise these signals from changed, non-test files:

  | Kind | Severity | When |
  |---|---|---|
  | `db_migration` | high | a file under a `migration(s)/` folder |
  | `db_migration` | medium | a schema definition (`schema.prisma`, `db/schema*`) without a migration |
  | `deps` | medium | a dependency manifest (`package.json`, `requirements*.txt`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `Gemfile`, `composer.json`) |
  | `deps` | low | only lockfiles changed |
  | `security` | high | a CI workflow (`.github/workflows/*.yml`) |
  | `security` | high | a path with a segment `auth`, `session`, `secret`, `token`, `password`, `permission`, `crypto`, `oauth`, `jwt`, `csrf`, `cors` (and plurals), or an `.env*` file |
  | `breaking_api` | medium | a route / controller / handler / `api/` file, or a public contract (`contracts/`, OpenAPI / Swagger, `.proto`, GraphQL schema), with removed lines |
  | `breaking_api` | low | the same files with additions only |

  Each signal has a fixed title and explanation and lists its files.

History (no model)
- **AC-3** The system shall list other PRs merged into the clone's default branch that
  touched any of the PR's changed files, leaving out lockfiles, Markdown and generated
  migration metadata: newest first, at most 8, without the PR itself, each with its
  number, title, merge date, who merged it and the overlapping files.
- **AC-4** The system shall take a commit's PR number from `Merge pull request #N` or from
  a `(#N)` at the end of the subject, and count it only if DevDigest knows PR N of this
  repository as merged — a fork's history carries the upstream's PR numbers, which name
  other PRs here. Other commits are skipped and not counted toward the 8; a number seen
  twice is listed once.
- **AC-5** A history entry's title shall be DevDigest's title for that PR.
- **AC-6** The system shall pass paths to git literally (no pathspec magic or globs),
  read non-ASCII paths correctly, and send at most 100 paths.
- **AC-7** IF the clone is shallow or missing, THEN the brief shall say the history is
  limited or unavailable instead of "no prior PRs".

Model (one call)
- **AC-8** The system shall make at most one model call per generation — no re-prompt on
  a schema mismatch; a transport retry of a request that got no answer is not a second
  call.
- **AC-9** The model input shall be the signals, the PR title, the description (first
  4,000 characters), the stored intent when there is one, the changed file list (at most
  100), the diff (first 12,000 characters) and the history, each repository-made or
  model-derived text inside an untrusted block, under fixed instructions saying the
  blocks are data.
- **AC-10** Model risks shall have a kind from `security`, `db_migration`,
  `breaking_api`, `perf`, `deps`, `correctness` and a severity `high` / `medium` / `low`;
  an answer with another kind or severity does not match the schema (AC-14).
- **AC-11** A file reference is `path`, `path:line` or `path:start-end`. IF its path is
  not a changed file of the PR, THEN the reference is dropped; IF its line or range is
  not within the new-side lines the diff shows for that file, THEN the suffix is dropped
  and the path kept. IF a model risk has no reference left, THEN it is dropped.
- **AC-12** The brief's risks shall be every signal (AC-2) plus the grounded model risks,
  a model risk replacing the signal of the same kind it covers, ordered by severity
  (high → low; signals before model risks on a tie), at most 6.
- **AC-13** The review focus shall be at most 5 spots, each a changed file and a new-side
  line the diff shows for it (added or context), with a reason; other spots are dropped.
  History notes attach only to PR numbers in the history list.
- **AC-14** All model text shall lose links (including bare URLs and reference links),
  images and HTML, and be cut to 120 characters for titles, 600 for explanations and 240
  for reasons and notes.

Fallback, state, API
- **AC-15** IF the model call fails, does not match the schema, takes longer than 90 s,
  or no provider has a key, THEN the system shall build the brief from the signals and
  the history alone, marked as signals-only with the reason and a null cost.
- **AC-16** The system shall store the brief with the head it describes, the model, the
  cost and the generation time; `GET /pulls/:id/brief` shall return it with `stale: true`
  when the PR head moved since, and make no model call.
- **AC-17** WHEN a generation succeeds, it replaces the stored brief. IF it falls back to
  signals-only while a model-written brief for the same head is stored, THEN the stored
  one is kept and the request fails with 502 saying so. A model-written brief for an
  older head is replaced: a brief describes one head.
- **AC-18** IF a generation for the PR is already running, THEN the system shall refuse a
  second one with 409; IF the PR has no diff anywhere, THEN with 409 saying why.

UI
- **AC-19** WHILE no brief is stored, the PR Overview shall show a Brief card with a
  Generate button.
- **AC-20** The Brief card shall show the risks as pills — kind icon, severity colour,
  title, first file reference — each expanding to its explanation and references.
- **AC-21** The card shall show the review focus list and a history accordion with each
  PR linked on GitHub.
- **AC-22** Every file reference and focus spot shall open the Files changed tab at that
  file, scrolled to the line when there is one.
- **AC-23** The card shall name the model, cost and head commit — or say it is
  signals-only and why — and say when the brief is stale.
- **AC-24** Model text shall be rendered as plain text or safe Markdown without links.

## Edge cases

- Docs-only PR: no signals; the model may find none — "No notable risks".
- A file reference to a binary or very large file without hunks: the path is kept, no
  line (AC-11), and it opens the file in Files changed without scrolling.
- PR into a non-default branch: history is still the default branch's (non-goal), and
  the card says so.

## Non-functional

- One call of roughly 4–8K input tokens. With the registry default for `risk_brief`
  (gpt-4.1) about 2¢; with the OpenRouter fallback (deepseek-v4-flash) well under 1¢.
- Opening the PR never triggers the call.

## Inputs (provenance)

- [reused: L04] the review's diff loader.
- [deterministic: git] `git log --first-parent --diff-merges=first-parent` on the clone.
- [reused: L03] stored intent; [reused: SPEC-02] the Markdown-stripping rules.
- [new: 1 LLM call] feature model `risk_brief`.

## Untrusted inputs

PR title, description, diff, file paths, commit subjects, PR titles, authors
and the stored intent (model-derived from the author's text) are untrusted: they go to
the model inside `<untrusted>` blocks; the output is grounded by the server (AC-10–AC-14)
and rendered without links (AC-24). PR links are built from the repo owner, name and an
integer number, never from text.

## Contract

New `RiskBrief` (both copies): `risks` (`Risk[]`), `review_focus`
(`{file, line, reason}[]`), `history` (`PrHistoryItem[]`), `history_state`
(`ok` / `limited` / `unavailable`), `meta` (`source` model / signals, `reason`, `model`,
`cost_usd`, `head_sha`, `generated_at`). `GET` answers `{ brief, stale }`.

## Open questions

None open.

## Changelog

- 2026-10-13 — first version (HW L05).
- 2026-10-13 — revised after an independent review (second agent, different model): rule
  table instead of loose wording, the review's diff loader instead of `pr_files` (which
  lag or are missing), history noise (lockfiles, Markdown), PR-number and title rules,
  literal pathspecs and non-ASCII paths, shallow clones, one-call wording, input caps and
  the full untrusted list, how signals and model risks combine, reference and focus
  validation against the diff's new-side lines, text caps, the response shape, a stale
  model brief vs a fresh fallback, split UI criteria, corrected cost.
- 2026-10-13 — AC-2 during implementation: "schema file" also matched `db/schema/*`, so a
  database schema raised `breaking_api` as well as `db_migration`. Public contracts are
  now named explicitly; a DB schema is only `db_migration`.
- 2026-10-13 — AC-4/AC-5 after a live run: on this fork the history listed "#11 chore:
  cleanup before home tasks" — a squash commit from the upstream course repo, whose #11
  is not this repo's #11 (an open lab PR). A number now counts only when DevDigest knows
  that PR here as merged, and the title is always DevDigest's.
