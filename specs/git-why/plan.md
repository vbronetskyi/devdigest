# Plan: git-why (SPEC-04)

**Goal** — blame for a base-side diff line at the PR's merge base, with the PR that
brought the commit in. **Non-goals** — added lines, renames' old paths, non-default
bases.

## Placement

A `why` module (`routes`, `service`, `repository`, `helpers`): reads `pull_requests`,
`repos`, `pr_files`; git through the container. No model.

## Tasks

- [ ] T1 Git plumbing (shared with SPEC-03 T1): `blameLine(rev)`, `mergeBase`, `mergedVia`
  → AC-6, AC-7, AC-8, AC-10 → `test/git-history.test.ts`
- [ ] T2 `oldSideLines(patch)` and PR-number rule reuse → AC-4, AC-7 →
  `test/why-helpers.test.ts`
- [ ] T3 Service + route `GET /pulls/:id/why`: validation order, fetch the PR head, merge
  base, blame, PR lookup → AC-1 – AC-10 → `test/why.it.test.ts`
- [ ] T4 Client: "why" action on removed/context lines, panel under the line, hidden for
  non-default bases, errors shown → AC-11 – AC-13 → `DiffTab.test.tsx`,
  `diff-viewer` tests
- [ ] T5 Docs: `server/specs/why.md`, `client/specs/pages.md`, AGENTS read-when, insights

## Traceability matrix

| AC | Tasks | Tests | Commit |
|---|---|---|---|
| AC-1 – AC-5 | T3 | why.it "validation order" | |
| AC-4 | T2, T3 | why-helpers "old side", why.it | |
| AC-6 | T1, T3 | git-history "blame at a revision", why.it "merge base" | |
| AC-7 | T1, T2, T3 | git-history "mergedVia", why.it "PR", why.it "squash subject" (an open PR's number → null) | |
| AC-8 | T1, T3 | git-history "boundary", why.it | |
| AC-9 | T3 | why.it "new file" | |
| AC-10 | T1, T3 | git-history "option-looking path" | |
| AC-11 – AC-13 | T4 | DiffTab.test, CodeLine tests | |

## Verification

`cd server && pnpm typecheck && pnpm depcruise && pnpm exec vitest run` · `cd client && pnpm typecheck && pnpm test`
