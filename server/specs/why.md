# Spec: git-why (HW L05)

Feature spec and acceptance criteria: `../../specs/git-why/spec.md` (SPEC-04). This file
is how it works today. Code: `src/modules/why/`. No model call.

## `GET /pulls/:id/why?file=<path>&line=<n>`

`line` is the old-side (base) line number the diff shows. Checks, in this order; git sees
nothing before the fourth passes:

| Check | Answer |
|---|---|
| id not a UUID, `line` not a positive integer, `file` empty or over 4,096 chars | 422 (zod, before the handler) |
| PR not in the workspace | 404 |
| PR base is not the repo's default branch | 409 |
| `file` not in the PR's `pr_files`, or `line` not a removed/context line inside a hunk of its patch (`oldSideLines`, bounded by the header counts) | 404 |
| no usable clone (none, or git cannot read it); PR head not in the clone even after `fetchPullHead` | 409, saying which |

Then:

1. `mergeBase(HEAD, pr.headSha)` — the revision the diff's old side shows. Blaming at
   HEAD would give wrong lines once the default branch moved.
2. `blameLine(file, line, base)` (`--line-porcelain -L n,n <base> -- <file>`). No blame
   → `commit: null` and `missing`: `file` when the merge base lacks the file (new or
   renamed in the PR), `line` when it has the file but not the line (`hasFile`:
   `ls-tree -z --name-only <base> -- <file>`).
3. `mergedVia(sha)` — the oldest merge on HEAD's first-parent line among the merges that
   descend from the commit (`rev-list --ancestry-path --merges --topo-order --reverse`).
   A commit that is itself on the first-parent line returns null, so a direct or squash
   commit is not credited to a later merge; a git failure is null too.
4. PR number: from that merge's subject, else (no merge, or a merge that names no PR)
   from a trailing `(#N)` on the commit's own subject. It counts only if `pull_requests` has PR N of this repo as `merged`
   (`mergedTitle`); otherwise `pr: null`. The URL is built from owner, name and number.
5. `boundary: true` with a note when the commit is the clone's oldest (root or shallow
   boundary).

Answer: `WhyAnswer { file, line, commit: {sha, author, date, subject} | null, boundary,
pr: {number, title, url} | null, missing: 'file' | 'line' | null, note }`. `note` is an
English sentence for API callers; the UI words its own from `boundary` and `missing`.

Tests: `test/why-helpers.test.ts`, `test/why.it.test.ts`, `test/git-history.test.ts`
(`blameLine`, `mergeBase`, `mergedVia` on a real repository).
