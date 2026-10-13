# Plan: git-why (SPEC-04)

**Goal** — blame for a base-side diff line at the PR's merge base, with the PR that
brought the commit in. **Non-goals** — added lines, renames' old paths, non-default
bases.

## Placement

A `why` module (`routes`, `service`, `repository`, `helpers`): reads `pull_requests`,
`repos`, `pr_files`; git through the container. No model.

## Tasks

- [x] T1 Git plumbing (shared with SPEC-03 T1): `blameLine(rev)`, `mergeBase`, `mergedVia`
  → AC-6, AC-7, AC-8, AC-10 → `test/git-history.test.ts`
- [x] T2 `oldSideLines(patch)` and PR-number rule reuse → AC-4, AC-7 →
  `test/why-helpers.test.ts`
- [x] T3 Service + route `GET /pulls/:id/why`: validation order, fetch the PR head, merge
  base, blame, PR lookup → AC-1 – AC-10 → `test/why.it.test.ts`
- [x] T4 Client: "why" action on removed/context lines (on hover), panel under the line, hidden for
  non-default bases, errors shown → AC-11 – AC-13 → `DiffTab.test.tsx`,
  `WhyPanel.test.tsx`
- [x] T5 Docs: `server/specs/why.md`, `client/specs/pages.md`, AGENTS read-when, insights

## Traceability matrix

| AC | Tasks | Tests | Commit |
|---|---|---|---|
| AC-1 – AC-5 | T3 | why.it "422 malformed first, then 404 PR, 409 non-default base, 404 file or line, 409 no clone or unknown merge base — no git before AC-4" (pairs of failing conditions, git spies); why.it (empty / over-long path → 422; "no usable local clone") | 9a21d5d, 045373c, 419b935 |
| AC-4 | T2, T3 | why-helpers "removed and context lines by their base numbers…", "stops where the hunk header says…"; why.it (same) | 9a21d5d, 045373c |
| AC-5 | T3 | why.it "…409 no clone or unknown merge base…" (messages), "a PR head missing from the clone is fetched, then answered" | 9a21d5d, 045373c |
| AC-6 | T1, T3 | git-history "blames at a given revision and finds a merge base"; why.it "blames the line at the merge base…", "the merge base of HEAD and the PR head…" | cf83609, 9a21d5d, 045373c |
| AC-7 | T1, T2, T3 | git-history "blames one line and finds the merge that brought its commit in" (mainline commits → null, oldest of two merges); why-helpers "built from repo coordinates…"; why.it "…names the PR", "squash subject when no merge" (an open PR's number → null), "the merge outranks the commit's own (#N)…"; git-history (a sync merge off the mainline before the PR's merge) | cf83609, 9a21d5d, f3e27ad, 045373c, 419b935 |
| AC-8 | T1, T3 | git-history "marks the root commit as the boundary…", "a shallow clone says so…"; why.it "boundary note"; git-history (an unreadable clone → null) | cf83609, 9a21d5d, 045373c, 419b935 |
| AC-9 | T3 | why.it "no history for a new file" (+ a line the merge base lacks); git-history "past the end… gives null"; WhyPanel "…or for a line the merge base lacks"; why.it (the check at the merge base); git-history "tells whether a path is in the tree…" | 9a21d5d, 045373c, 419b935 |
| AC-10 | T1, T3 | git-history "an option-looking path gives null — never a git option"; why.it (unknown file → 404 before git); git-history "…the path after --" | cf83609, 9a21d5d, 419b935 |
| AC-11 | T4 | DiffTab "'why' on context lines only…" (removed lines too), "no 'why' when the PR is not into the default branch"; page helpers "why only into the default branch…"; diff-viewer "the no-newline marker and a trailing newline are not lines"; diff-viewer "stops each hunk at its header counts…" | c976721, c5fce8b, 045373c, 419b935 |
| AC-12 | T4 | DiffTab "…showing the answer under the line", WhyPanel "shows the commit and the PR linked on GitHub…" (author, date), "says there is no history…" | c976721, 045373c |
| AC-13 | T4 | WhyPanel "shows the server's message when the request fails" | c976721 |

## Verification

`cd server && pnpm typecheck && pnpm depcruise && pnpm exec vitest run` · `cd client && pnpm typecheck && pnpm test`
