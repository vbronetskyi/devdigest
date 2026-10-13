# Spec: git-why | Spec ID: SPEC-04 | Status: implemented

## Problem and why

A reviewer reading a diff often asks "why is this line here?" about the code around the
change. The answer is in git: who last changed the line, in which commit, and which PR
that commit came with. DevDigest already has the clone; showing it next to the line
costs nothing.

## Goals / Non-goals

Goals
- For a removed or context line of the diff, the commit that last changed it at the
  revision the diff is based on, and the PR that brought that commit in.

Non-goals
- Lines the PR adds (no history yet), renamed files' old paths, a per-line history view.
- PRs whose base is not the repository's default branch.

## Request

`GET /pulls/:id/why?file=<path>&line=<n>` — `file` as the PR's file list names it,
`line` the old-side (base) line number the diff shows.

## Acceptance criteria (EARS)

Validation, in this order, before any git call on the line
- **AC-1** IF the PR is not in the workspace, THEN the system shall answer 404.
- **AC-2** IF the PR's base branch is not the repository's default branch, THEN the
  system shall answer 409 saying git-why covers PRs into the default branch.
- **AC-3** IF `line` is not a positive integer, THEN the system shall answer 422.
- **AC-4** IF `file` is not a changed file of the PR, or `line` is not an old-side line
  (removed or context) in that file's patch, THEN the system shall answer 404.
- **AC-5** IF the repository has no clone, or the PR head cannot be fetched into it,
  THEN the system shall answer 409 saying so.

Answer
- **AC-6** The system shall blame the line at the merge base of the default branch and
  the PR head — the revision the diff's old side shows — and return the commit's sha,
  author, date and subject.
- **AC-7** The system shall return the PR that brought that commit into the default
  branch: the oldest merge on the default branch's first-parent line containing the
  commit; IF there is none, the number from a `(#N)` at the end of the commit's own
  subject; else null. A number counts only if DevDigest knows PR N of this repository as
  merged (SPEC-03 AC-4 — a fork inherits the upstream's numbers); otherwise the PR is
  null. With the number go DevDigest's title and a GitHub link built from the repo owner,
  name and the number.
- **AC-8** IF the commit is the oldest the clone has (root or shallow boundary), THEN the
  answer shall carry `boundary: true` and say earlier history is not available.
- **AC-9** IF the file does not exist at the merge base (new or renamed in the PR), THEN
  the answer shall say no history is available for it, with a null commit.
- **AC-10** The system shall pass the file to git only as a path after `--`, and only after
  AC-4 confirmed it is one of the PR's files.

UI
- **AC-11** In the Files changed tab, removed and context lines shall offer a "why"
  action; added lines shall not; WHERE the PR's base is not the default branch, no line
  shall offer it.
- **AC-12** The action shall show, under the line, the commit (short sha, subject,
  author, date), the PR linked on GitHub when there is one, and the "earlier history"
  or "no history" note.
- **AC-13** IF the request fails, THEN the panel shall show the server's message.

## Edge cases

- The same commit blamed for many lines: each request is independent; nothing cached.
- A shallow clone: most old lines blame to the boundary commit (AC-8 says so).

## Inputs (provenance)

- [deterministic: git] `git fetch pull/N/head`, `git merge-base`, `git blame
  --line-porcelain -L n,n <base> -- <file>`, `git rev-list`; `pr_files` patches; PR
  titles from `pull_requests`. No model call.

## Untrusted inputs

Commit subjects, authors and PR titles are repository text, rendered as plain text. The
path is checked against the PR's file list before git sees it (AC-4, AC-10).

## Changelog

- 2026-10-13 — first version (HW L05).
- 2026-10-13 — revised after an independent review: blame at the merge base instead of
  HEAD (line numbers were wrong once the default branch moved), the request defined, one
  status per validation and their order, lines validated from the patch without git,
  renamed/new files, shallow boundary, number precedence, the UI hidden for non-default
  bases, errors shown.
- 2026-10-13 — AC-7: PR numbers from commit subjects are verified against DevDigest's
  merged PRs (same reason as SPEC-03 AC-4).
