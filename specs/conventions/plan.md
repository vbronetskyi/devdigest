# Plan: Conventions extractor (SPEC-07)

**Goal** — the extractor from lab 2 held to its spec: model text cannot reach a trusted
skill unchecked, counts say what they count, accepted rules stay accepted, skill names
are unique, the scan summary is stored. **Non-goals** — new extraction strategies,
checking `also_seen_in`, scheduled scans.

## Placement

All in the existing `conventions` module; storage in `db/schema/knowledge.ts` and
`skills.ts`; the sample filter in `repo-intel/service.ts`; the 409 for a unique
violation in the app's error handler. Contract changes in both copies.

## Contract and schema changes

- `ConventionCandidate`: nullable `confidence`, `commit_sha`. `ConventionExtraction`:
  `skipped`, `scan`. New `ConventionScan`, `ConventionList` (`GET` answer).
- Migration 0012 (generated): unique `skills (workspace_id, name)` (no duplicates in the
  dev database before it), `conventions.commit_sha`, table `convention_scans`.
- Migration 0013 (generated): `conventions.skill_id` → `skills.id` (on delete set null).

## Tasks

- [x] T1 Schema + migration; unique violation → 409 in the error handler → AC-17 →
  `routes-smoke.test.ts`
- [x] T2 Helpers: `normalizeRule`, `clipAtLine`, quote limited to 8 lines, `dropped` /
  `skipped`, accepted rules skipped, unknown confidence, escaped label → AC-5 – AC-11 →
  `conventions-helpers.test.ts`
- [x] T3 Service / repository: head commit, scan record, advisory lock, list shape,
  normalized rule on accept, retry on a taken derived name → AC-4, AC-8, AC-12, AC-13,
  AC-15 – AC-17 → `conventions.it.test.ts`
- [x] T4 Repo-intel sample filter at the root → AC-2
- [x] T5 Client: list shape, stored subtitle, scan counts, one empty-state button, repo
  name, commit links, unknown confidence, locked cards during bulk → AC-19 – AC-23 →
  `page.test.tsx`, `ConventionCard.test.tsx`
- [x] T6 Docs: `server/specs/conventions.md`, `client/specs/skills-ui.md`, insights

## Traceability matrix

| AC | Tasks | Tests | Commit |
|---|---|---|---|
| AC-1 | T5 | page "opening the page never scans…" | 227115b |
| AC-2 | T4 | — (one-line filter; covered by reading); helpers "test, migration and config folders are not samples — at the repository root too" | 227115b, 34c6823 |
| AC-3 | — | unchanged since lab 2 | — |
| AC-4 | T3 | it "reads only offered files…" (reads asserted), "a model that picks nothing usable still gets the top candidates" | 227115b |
| AC-5 | T2, T3 | helpers "a file is cut at the last line break within the budget"; it "all files together stay within 60,000 characters" | 227115b, 34c6823 |
| AC-6 | T2 | helpers "a file cannot close its block, in any case; a path cannot break the label"; it (block label) | 227115b |
| AC-7 | T2 | helpers "a multi-line quote keeps its range; only its first 8 lines are matched", "finds a re-indented snippet…", "rejects paraphrases…" | 227115b |
| AC-8 | T2, T3 | helpers "a rule is one line without leading Markdown…"; it "a rule reaches the skill as one line, whatever was sent" | 227115b |
| AC-9 | T2 | helpers "caps confidence…", "unknown confidence is null and sorts last…"; it "a confidence the model could not give is stored as unknown and listed last" | 227115b, 34c6823 |
| AC-10 | T2, T3 | helpers "…accepted rules are skipped; at most 8"; it "a re-scan … does not propose them again" | 227115b |
| AC-11 | T2 | helpers "drops unknown files and invented quotes; skips repeats separately"; it (dropped / skipped) | 227115b |
| AC-12 | T3 | it "a scan writes under the repository's lock…" (lock held by another transaction); it (commit per candidate) | dd0588c, 227115b |
| AC-13 | T1, T3 | it "reads only offered files…" (scan stored, returned after reload) | dd0588c, 227115b |
| AC-14 | — | unchanged since lab 2 (`deadline.test.ts`) | — |
| AC-15 | T3 | it (list shape, accepted first); it (unknown confidence listed last) | 227115b, 34c6823 |
| AC-16 | T3 | it "accepts a candidate as an enabled convention skill, exactly once"; helpers "the example fence cannot be closed by the quote…" | 227115b, 34c6823 |
| AC-17 | T1, T3 | it "two accepts racing for one derived name…", "\"Edit first\" … a taken name is a 409"; routes-smoke "a unique-index violation is a 409…" | dd0588c, 227115b |
| AC-18 | T3 | it "accepts … exactly once", "rejects by deleting…"; it (rejecting an accepted convention → 409) | 34c6823 |
| AC-19 | T5 | page "the stored scan is the subtitle after a reload" | 227115b |
| AC-20 | T5 | page "…before the first scan there is one Run extraction button" | 227115b |
| AC-21 | T5 | card "links at the commit the quote was read at; unknown confidence is a dash"; it (skill_id after reload); card "an accepted card links its skill after a reload too" | 227115b, 34c6823 |
| AC-22 | T5 | — (message wording; shown in the video); page "right after a scan the page says what was dropped and what was skipped" | 227115b, 34c6823 |
| AC-23 | T5 | page "Accept all goes one card at a time and locks every card meanwhile"; card "a locked card cannot start an action" | 227115b |

Mutation-checked: an unoffered path read, the rule not normalized on accept, no retry on
a unique violation, no advisory lock, no card lock during bulk — each makes a test fail.

## Risks

- `also_seen_in` stays the model's claim; the cap only limits how far it can lift the
  number (spec non-goal).
- The 120 s deadline does not cancel a model request (platform behaviour).

## Verification

`cd server && pnpm typecheck && pnpm depcruise && pnpm exec vitest run` · `cd client && pnpm typecheck && pnpm test`
