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
- [x] T4 Client: "why" action on removed/context lines, panel under the line, hidden for
  non-default bases, errors shown → AC-11 – AC-13 → `DiffTab.test.tsx`,
  `WhyPanel.test.tsx`
- [x] T5 Docs: `server/specs/why.md`, `client/specs/pages.md`, AGENTS read-when, insights

## Traceability matrix

| AC | Tasks | Tests | Commit |
|---|---|---|---|
| AC-1 – AC-5 | T3 | why.it "404 PR, 409 non-default base, 422 bad line, 404 file or line, 409 no clone or unknown merge base — before any blame" | 9a21d5d |
| AC-4 | T2, T3 | why-helpers "removed and context lines by their base numbers, never added ones", why.it (same) | 9a21d5d |
| AC-6 | T1, T3 | git-history "blames at a given revision and finds a merge base", why.it "blames the line at the merge base…" | cf83609, 9a21d5d |
| AC-7 | T1, T2, T3 | git-history "blames one line and finds the merge that brought its commit in" (mainline commits → null), why-helpers "built from repo coordinates…", why.it "…names the PR", "squash subject when no merge" (an open PR's number → null) | cf83609, 9a21d5d, f3e27ad |
| AC-8 | T1, T3 | git-history "marks the root commit as the boundary…", why.it "boundary note" | cf83609, 9a21d5d |
| AC-9 | T3 | why.it "no history for a new file", git-history "past the end… gives null" | 9a21d5d |
| AC-10 | T1, T3 | git-history "an option-looking path gives null — never a git option"; why.it (unknown file → 404 before git) | cf83609, 9a21d5d |
| AC-11 | T4 | DiffTab "'why' on context lines only…", "no 'why' when the PR is not into the default branch" | c976721 |
| AC-12 | T4 | DiffTab "…showing the answer under the line", WhyPanel "shows the commit and the PR linked on GitHub…", "says there is no history…" | c976721 |
| AC-13 | T4 | WhyPanel "shows the server's message when the request fails" | c976721 |

## Verification

`cd server && pnpm typecheck && pnpm depcruise && pnpm exec vitest run` · `cd client && pnpm typecheck && pnpm test`
