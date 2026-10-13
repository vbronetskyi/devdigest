# Spec: risk brief (HW L05)

Feature spec and acceptance criteria: `../../specs/risk-brief/spec.md` (SPEC-03). This
file is how it works today. Code: `src/modules/reviews/brief/`, routes and service in
`src/modules/reviews/`.

## Inputs ($0)

- **Diff** — the review's own loader (`loadDiff`: clone → stored `pr_files` → GitHub),
  first 100 files. A PR with no diff anywhere is a 409.
- **Signals** (`signals.ts`, `riskSignals`) — a rule table over changed non-test paths:
  migrations, DB schema, dependency manifests and lockfiles, CI workflows, auth-like path
  segments and `.env*`, routes and public contracts (removed lines → medium, additions
  only → low). Each signal has a fixed title and explanation and lists its files.
- **History** — `git.history` on the clone's default branch (`--first-parent
  --diff-merges=first-parent`, literal pathspecs, ≤ 100 paths, 60 commits scanned) over
  the changed files minus lockfiles, Markdown and `migrations/meta/`. `historyItems`
  keeps commits whose subject names a PR (`Merge pull request #N`, trailing `(#N)`)
  **and** that PR is in `pull_requests` for this repo with status `merged`; title from
  DevDigest; at most 8, without the PR itself. `history_state` is `limited` on a shallow
  clone and `unavailable` without one.

The merged check matters on forks: a fork's mainline carries the upstream's squash
subjects, and their `(#N)` names an unrelated PR here.

## Model (one call)

Feature model `risk_brief` (Settings → registry default → OpenRouter
`deepseek/deepseek-v4-flash`), template `src/prompts/risk-brief.system.md`, schema
`BriefOutput`, `maxRetries: 0`, 90 s deadline. Title, description (4,000 chars), stored
intent, file list, diff (12,000 chars), signals and history each go in an `<untrusted>`
block (`buildBriefMessages`).

`groundBrief`:
- a file reference survives only for a changed file; a line or range outside the
  diff's new-side lines (`diffIndex`, from `hunk.newLineNumbers`) loses its suffix; a
  model risk with no reference left is dropped;
- `mergeRisks`: every signal plus the model risks, a model risk replacing the signal of
  its kind, by severity (signals first on a tie), at most 6;
- review focus: at most 5 spots on a changed file's new-side line; history notes only
  for PR numbers in the history;
- all model text loses links, bare URLs, images and HTML, then is cut (120 / 600 / 240).

Any failure (no key, schema mismatch, deadline) → `signalsOnlyBrief`: the signals as
risks, the history, `meta.source: 'signals'`, the reason, `cost_usd: null`.

## API and state

| Endpoint | Behaviour |
|---|---|
| `GET /pulls/:id/brief` | `{ brief, stale }` — stored brief or null; `stale` when the PR head moved since. No model call |
| `POST /pulls/:id/brief` | generate (10/min). 409 when one runs for the PR or there is no diff; 502 when it fell back to signals-only while a model brief for the same head is stored (that one is kept) |

One row per PR in `pr_brief` (`json` = `RiskBrief` with `meta`: source, reason, model,
cost, head_sha, generated_at). A model brief for an older head is replaced.

Tests: `test/brief-signals.test.ts`, `test/brief-helpers.test.ts`,
`test/brief.it.test.ts`, `test/git-history.test.ts`.
