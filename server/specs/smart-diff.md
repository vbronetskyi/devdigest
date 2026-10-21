# Spec: smart diff (HW L03)

The PR's files in the order a reviewer should read them, with the latest
findings pinned to their lines and a split proposal for oversized PRs.
`GET /pulls/:id/smart-diff` → `SmartDiff`. Code: `src/modules/smart-diff/`.
Rules only: no model call, no repo index, no clone access.

## Roles

Every file gets one reason; the reason fixes the role. The path rules are
checked in a fixed order (`PATH_RULES` in `constants.ts`, pinned by a test) and
the first match wins:

1. Lockfile by name → `lockfile`.
2. `generated` — dist/build output, `__snapshots__/`, `*.snap`, `migrations/meta/`.
3. `assets` — images, fonts, video, PDF.
4. `agent_instructions` — `.claude/agents|skills|commands/`, `AGENTS.md`, `CLAUDE.md`.
5. `docs` — `*.md|mdx|rst|txt`, LICENSE/CHANGELOG, `docs/`.
6. `test` — `test/`, `tests/`, `__tests__/`, `e2e/`, `*.test|spec.*`, `_test.go`.
7. `i18n` (`messages/`, `locales/`…), then `migration` (`*.sql`), `infra`
   (`.github/`, Docker, `.mcp.json`), `tooling` (`package.json`, `tsconfig*.json`,
   `*.config.ts`, dotfile configs), `styles` (`*.css`, `styles.ts`), `entrypoint`
   (`index|main|app|server|container|bootstrap`), `config` (`config|env|settings.ts`,
   other JSON/YAML/TOML).

A path match decides at once unless its role is wiring; then (and when nothing
matched) no line changes → `rename`, a `@generated` / `do not edit` banner at the
top of a new file → `generated`, the wiring path match, ≥ 60 % of the meaningful
changed lines being imports, re-exports, `require`, `.register(` / `.use(` or a
bare registry entry → `imports_only`, everything else → `source`.

The order is the decision for files that fit two rules. The disputed cases,
each a row in the test table:

| File | Fits | Goes to | Why |
|---|---|---|---|
| `server/test/__snapshots__/x.test.ts.snap` | generated, test | boilerplate | machine output, nobody reviews it line by line |
| `.claude/skills/security/SKILL.md` | agent_instructions, docs | core | Markdown, but it is what an agent will do — read it like code |
| `e2e/README.md` | docs, test | docs | it explains the tests, it is not one |

| Role | Reasons | UI |
|---|---|---|
| `core` | source, agent_instructions | first, open |
| `wiring` | entrypoint, imports_only, config, migration, infra | second |
| `tests` | test | third |
| `docs` | docs | fourth |
| `boilerplate` | lockfile, generated, i18n, assets, styles, tooling, rename | last, folded |

Inside a group: files with the most severe finding first, then the biggest
change, then the path. Empty groups are omitted.

## Finding markers

From the newest `kind = 'review'` record of each agent on the PR (older reviews
by the same agent are superseded); rejected findings (`dismissed_at`) are left
out. Each file carries `findings` (`id`, `start_line`, `end_line`, severity,
title) on new-side line numbers, and `finding_lines` (distinct start lines).
The client takes the details (rationale, suggestion, Accept / Reject) from
`GET /pulls/:id/reviews` by id.
`reviews_used` says how many reviews that was — 0 before the first run.

Reviews store no head commit of their own. `markers_stale` is true when the
PR's head differs from `pull_requests.last_reviewed_sha` (and there are
reviews): after a push the markers can point at shifted lines until the PR is
reviewed again.

## Split suggestion

- `total_lines` — all changed lines; `reviewable_lines` — core + wiring only.
- `too_big` when `reviewable_lines` > 400 (past that, defects found per line
  drop sharply; a regenerated lockfile is not review work).
- `proposed_splits` (only when too big): reviewable files grouped by top
  directory when the PR spans several, by feature folder (`modules/<x>`,
  `_components/<X>`…) inside one. Slices under 10 % fold into the largest,
  after its own files; at most 4 slices; files biggest first. Fewer than two
  slices → `[]` (no clean cut).

`pseudocode_summary` is always `null`: the endpoint stays free and instant.

The fields this homework added to the contract (`reason`, `findings`,
`reviewable_lines`, `reviews_used`, `markers_stale`) are nullish there, so the
design prototype's data still parses (`test/contracts.test.ts`); the endpoint
always fills them.

Tests: `test/smart-diff-helpers.test.ts`, `test/smart-diff.it.test.ts`.
