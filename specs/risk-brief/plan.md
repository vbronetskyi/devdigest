# Plan: Risk brief and PR history (SPEC-03)

**Goal** — a brief per PR head: rule signals + git history for free, one model call to
explain and rank, all grounded. **Non-goals** — changing scores, GitHub-API history,
automatic generation.

## Placement

In the `reviews` module next to `intent.ts`: the brief needs the review's diff loader
and the stored intent, and modules may not import each other. Pure parts in
`reviews/brief/`, storage in `reviews/repository/brief.repo.ts`, routes in
`reviews/routes.ts`.

## Contract changes

- `ReviewFocusItem`, `BriefMeta`, `RiskBrief`, `RiskBriefResponse` in `contracts/brief.ts`
  (both copies). `Risk`, `PrHistoryItem` reused.
- `GitClient.history / blameLine / mergeBase / mergedVia / isShallow` (server port only).
- No migration: `pr_brief (pr_id, json)` exists; head, model and cost live in the JSON.

## Tasks

- [ ] T1 Git plumbing: history (literal pathspecs, non-ASCII, ≤ 100 paths),
  blame at a revision, merge base, mergedVia, isShallow → AC-3, AC-5, AC-6, AC-7 →
  `test/git-history.test.ts`
- [ ] T2 Signals and history rules (`brief/signals.ts`) → AC-2, AC-3, AC-4, AC-5 →
  `test/brief-signals.test.ts`
- [ ] T3 Prompt, output schema, grounding (`brief/helpers.ts`): references, focus, notes,
  merge with signals, text caps → AC-9, AC-10, AC-11, AC-12, AC-13, AC-14 →
  `test/brief-helpers.test.ts`
- [ ] T4 Signals-only brief → AC-15 → `test/brief-helpers.test.ts`
- [ ] T5 `BriefBuilder` + repository + routes `GET/POST /pulls/:id/brief`: diff loader,
  one call (`maxRetries: 0`, 90 s), keep/replace rules, 409s, stale → AC-1, AC-7, AC-8,
  AC-15, AC-16, AC-17, AC-18 → `test/brief.it.test.ts`
- [ ] T6 Client: hooks, Brief card on Overview (pills, focus, history, meta), deep link to
  Files changed (`?tab=diff&file=&line=`) → AC-19 – AC-24 → `BriefCard.test.tsx`,
  `DiffTab.test.tsx`
- [ ] T7 Docs: `server/specs/brief.md`, `client/specs/pages.md`, AGENTS read-when, insights

## Traceability matrix

| AC | Tasks | Tests | Commit |
|---|---|---|---|
| AC-1 | T5 | brief.it "uses the review's diff" | |
| AC-2 | T2 | brief-signals "rule table" | |
| AC-3 | T1, T2 | git-history, brief-signals "history" | |
| AC-4 | T2, T4 | brief-signals "PR numbers", brief-signals "merged PRs DevDigest knows" (the upstream's #11) | |
| AC-5 | T2, T4 | brief-signals "merged PRs DevDigest knows", brief.it "history" | |
| AC-6 | T1 | git-history "pathspec, non-ASCII" | |
| AC-7 | T1, T5 | brief.it "shallow / no clone" | |
| AC-8 | T5 | brief.it "one call, maxRetries 0" | |
| AC-9 | T3 | brief-helpers "messages" | |
| AC-10 | T3 | brief-helpers "schema" | |
| AC-11 | T3 | brief-helpers "references" | |
| AC-12 | T3 | brief-helpers "signals kept, order, cap" | |
| AC-13 | T3 | brief-helpers "focus, notes" | |
| AC-14 | T3 | brief-helpers "text" | |
| AC-15 | T4, T5 | brief-helpers "signals-only", brief.it "model fails" | |
| AC-16 | T5 | brief.it "GET free, stale" | |
| AC-17 | T5 | brief.it "keep / replace" | |
| AC-18 | T5 | brief.it "409" | |
| AC-19 – AC-24 | T6 | BriefCard.test, DiffTab.test | |

## Risks

- The diff loader may fetch from GitHub on first use — same as a review, rate-limited.
- History scans 60 first-parent commits; a repo with many direct commits may show fewer
  than 8 PRs (by design: AC-4).

## Verification

`cd server && pnpm typecheck && pnpm depcruise && pnpm exec vitest run` · `cd client && pnpm typecheck && pnpm test`
