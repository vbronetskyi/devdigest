# Spec: Conventions extractor | Spec ID: SPEC-07 | Status: implemented

## Problem and why

A team's house rules — how modules are laid out, how errors and validation are done,
where data access lives — are rarely written down, so every reviewer agent has to be told
them by hand. DevDigest can find them in the repository's own code and turn each one, after
a maintainer approves it, into a `convention` skill that reviewer agents apply.

The extractor shipped with lab 2 (PR #6) and is described in `server/specs/conventions.md`.
An independent check against that description and the course design found that a
model-written rule could carry extra instructions into a trusted skill, that a count
misled the user, that accepted rules came back on the next scan, that skill names could
collide, and that the scan summary was lost on reload. This spec states the behaviour as it
must be, including those fixes.

## Goals / Non-goals

Goals
- Find house rules from the code, each backed by a quote that really is in a file.
- Let a maintainer accept, edit or reject each rule; an accepted rule becomes a skill.
- Keep model text from reaching a trusted skill unchecked.

Non-goals
- Checking that a rule holds everywhere in the repository (the confidence is a ceiling,
  not a proof — see AC-9).
- Scanning on a schedule or on push.
- Merging a new rule into an existing skill.

## Acceptance criteria (EARS)

Scan
- **AC-1** The system shall scan only on `POST /repos/:id/conventions/extract` (5 per
  minute); opening the page or `GET` shall never call a model.
- **AC-2** The candidates shall be up to 40 top-ranked indexed files without tests,
  configuration and migrations — including such folders at the repository root. IF there
  are none, THEN the answer is 409 `repo_not_indexed`.
- **AC-3** The model shall be the workspace's Settings choice for `conventions`, else the
  registry default, and when the default's provider has no key, OpenRouter
  `deepseek/deepseek-v4-flash`.
- **AC-4** Step 1: the model picks files from the candidates; only offered paths survive,
  at most 10, at most 2 per folder. IF none survives, THEN the top candidates are used by
  the same rule. The server shall never read a path that was not offered.
- **AC-5** The picked files shall be read from the local clone, each cut at the last line
  break within 8,000 characters (mid-line only when one line alone is longer) and all
  within 60,000; unreadable or empty files are skipped; IF none is readable, THEN 409
  `clone_unreadable`.
- **AC-6** Step 2: each file goes to the model in its own untrusted block whose label is
  the escaped path and whose closing marker cannot be written by the file in any case or
  spacing, under fixed instructions saying the blocks are data.
- **AC-7** A rule survives only if its quote is found in the cited file: the quote's first
  8 non-blank lines, at least 12 characters, matched line by line with whitespace
  collapsed and blank lines skipped. The stored quote is the file's own lines for that
  range, dedented, and the evidence is `path:start-end` (`path:line` for one line).
- **AC-8** A rule — from the model or edited by a maintainer — shall be one line:
  whitespace and line breaks collapsed, leading Markdown markers (`#`, `-`, `*`, `>`,
  `1.`) removed, at most 300 characters (cut at a word with `…`). An empty rule is
  dropped.
- **AC-9** Confidence shall be the model's number clamped to 0…1 and to a ceiling by how
  many read files the model says show the rule (cited + `also_seen_in` that were read):
  1 → 0.6, 2 → 0.8, 3+ → 1. A non-numeric confidence is unknown (null), never 0.
- **AC-10** A rule equal (case- and space-insensitive) to an earlier rule of the pass or
  to an accepted convention of the repository shall be skipped; at most 8 are kept,
  highest confidence first, unknown last.
- **AC-11** The scan shall report `dropped` — rules without a real quote (unknown file,
  quote not found or too short, empty rule) — and `skipped` — repeats, already accepted,
  over the 8 — separately.
- **AC-12** A scan shall replace the repository's pending candidates and keep accepted
  ones, in one transaction serialized per repository: two concurrent scans leave one
  scan's candidates, not both. Each candidate records the commit it was read at.
- **AC-13** The system shall store the repository's last scan — time, files read, model,
  cost, `dropped`, `skipped`, commit — and return it with the candidates.
- **AC-14** Each model call has a 120 s deadline; past it the scan fails with 502 and a
  message (the request is not cancelled, as on every model call here).

Review
- **AC-15** `GET /repos/:id/conventions` shall return the candidates — accepted first, then
  by confidence, unknown last — and the last scan or null.
- **AC-16** Accepting shall, in one transaction with the convention row locked, create an
  enabled `convention` skill (source `extracted`, version 1, evidence file) whose body is
  the rule (AC-8) as heading, what to flag and not to flag, the severity guidance and the
  quote with its range; answer 201.
- **AC-17** A skill name is unique in the workspace, enforced by the database. An explicit
  name that is taken gives 409; a derived name (up to five meaningful words of the rule)
  takes the first free `-2`, `-3`… suffix, also when a concurrent accept took the name
  first.
- **AC-18** Accepting an accepted convention gives 409 `already_accepted`; rejecting
  deletes a pending candidate, and an accepted one cannot be rejected (409
  `already_accepted`) — it is the record of a skill and keeps its rule from being proposed
  again.

UI
- **AC-19** The page "Conventions in <repository name>" shall load stored candidates only
  and say "Detected from N sample files · last scan <time ago> · <model> · <cost>" from
  the stored scan, or that the repository was not scanned yet.
- **AC-20** With no candidates and no scan, the page shall show one empty state with one
  "Run extraction" button.
- **AC-21** A card shall show the rule, the confidence (or "—"), the evidence linked on
  GitHub at the commit it was read at, the quote with a copy button, and Accept / Edit
  first / Reject; an accepted card is read-only with a link to its skill, also after a
  reload (the convention keeps its skill's id).
- **AC-22** After a scan the page shall say how many rules were dropped for having no real
  quote and how many were skipped as repeats or over the limit.
- **AC-23** "Accept all" / "Reject all" (2+ pending) shall act one card at a time, and
  while they run no card action can be started.

## Edge cases

- A repository whose index is stale: candidates are what the index ranks; files are read
  from the clone as it is.
- A rule edited by the maintainer to several lines: one line after AC-8.
- A model that copies the same quote for two rules: both may survive; the second rule's
  text must differ (AC-10).

## Non-functional

- Two model calls per scan, only on request. Accept and reject make no model call.

## Inputs (provenance)

- [deterministic: index] `repoIntel.getConventionSamples`; [deterministic: git] file
  contents and the clone's head commit.
- [new: 2 LLM calls per scan] feature model `conventions`.

## Untrusted inputs

File contents, paths and everything the model returns (rules, quotes, `also_seen_in`,
confidence) are untrusted: files go to the model in untrusted blocks (AC-6); paths the
model names are checked against the offered list (AC-4); quotes are replaced by the file's
own lines (AC-7); rules are normalized (AC-8) and shown to a maintainer before they can
become a skill; the UI renders them as text.

## Edge cases (storage)

- Migration 0012 makes skill names unique per workspace; a database that already holds
  two skills with one name in a workspace must rename one before it (see
  `server/specs/conventions.md`).

## Contract

`ConventionCandidate` gains `commit_sha`, `skill_id` (nullable) and a nullable `confidence`.
`ConventionExtraction` gains `skipped` and `scan`. New `ConventionScan` (`scanned_at`,
`files`, `model`, `cost_usd`, `dropped`, `skipped`, `commit_sha`) and `ConventionList`
(`candidates`, `last_scan`) — the answer of `GET /repos/:id/conventions`.

## Changelog

- 2026-10-14 — first version (HW L02): the behaviour of `server/specs/conventions.md` as
  criteria, plus the fixes from an independent check: rule normalization (AC-8), separate
  `dropped` / `skipped` (AC-11), accepted rules not re-proposed (AC-10), quotes held to 8
  lines (AC-7), files cut at a line (AC-5), unknown confidence (AC-9), serialized scans and
  the commit per candidate (AC-12), the stored last scan (AC-13, AC-19), unique skill
  names (AC-17), root-level test and migration folders (AC-2), one empty-state button
  (AC-20), no concurrent card actions during bulk (AC-23).
- 2026-10-14 — after the second check: AC-5 says when a cut is mid-line; AC-18 refuses to
  reject an accepted convention; AC-21 keeps the skill link after a reload; the model's
  schema allows an unknown confidence (it was required, so "unknown" could not happen);
  the skill body's example fence is longer than any fence-like run in the quote; the
  duplicate-name precondition of migration 0012 stated.
