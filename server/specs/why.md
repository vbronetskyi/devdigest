# Spec: git-why (HW L05)

Feature spec and acceptance criteria: `../../specs/git-why/spec.md` (SPEC-04). This file
is how it works today. Code: `src/modules/why/`. No model call.

## `GET /pulls/:id/why?file=<path>&line=<n>`

`line` is the old-side (base) line number the diff shows. Checks, in this order, before
git sees the line:

| Check | Answer |
|---|---|
| PR not in the workspace | 404 |
| PR base is not the repo's default branch | 409 |
| `line` not a positive integer | 422 (zod) |
| `file` not in the PR's `pr_files`, or `line` not a removed/context line of its patch (`oldSideLines`) | 404 |
| no clone; PR head not in the clone even after `fetchPullHead` | 409 |

Then:

1. `mergeBase(HEAD, pr.headSha)` — the revision the diff's old side shows. Blaming at
   HEAD would give wrong lines once the default branch moved.
2. `blameLine(file, line, base)` (`--line-porcelain -L n,n <base> -- <file>`). No blame
   → `commit: null` with "no history" (the file is new or renamed in the PR).
3. `mergedVia(sha)` — the oldest merge on HEAD's first-parent line among the merges that
   descend from the commit (`rev-list --ancestry-path --merges`). A commit that is
   itself on the first-parent line returns null, so a direct or squash commit is not
   credited to a later merge.
4. PR number: from that merge's subject, else from a trailing `(#N)` on the commit's
   own subject. It counts only if `pull_requests` has PR N of this repo as `merged`
   (`mergedTitle`); otherwise `pr: null`. The URL is built from owner, name and number.
5. `boundary: true` with a note when the commit is the clone's oldest (root or shallow
   boundary).

Answer: `WhyAnswer { file, line, commit: {sha, author, date, subject} | null, boundary,
pr: {number, title, url} | null, note }`.

Tests: `test/why-helpers.test.ts`, `test/why.it.test.ts`, `test/git-history.test.ts`
(`blameLine`, `mergeBase`, `mergedVia` on a real repository).
