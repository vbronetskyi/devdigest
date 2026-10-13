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

- [x] T1 Git plumbing: history (literal pathspecs, non-ASCII, ≤ 100 paths),
  blame at a revision, merge base, mergedVia, isShallow → AC-3, AC-5, AC-6, AC-7 →
  `test/git-history.test.ts`
- [x] T2 Signals and history rules (`brief/signals.ts`) → AC-2, AC-3, AC-4, AC-5 →
  `test/brief-signals.test.ts`
- [x] T3 Prompt, output schema, grounding (`brief/helpers.ts`): references, focus, notes,
  merge with signals, text caps → AC-9, AC-10, AC-11, AC-12, AC-13, AC-14 →
  `test/brief-helpers.test.ts`
- [x] T4 Signals-only brief → AC-15 → `test/brief-helpers.test.ts`
- [x] T5 `BriefBuilder` + repository + routes `GET/POST /pulls/:id/brief`: diff loader,
  one call (`maxRetries: 0`, 90 s), keep/replace rules, 409s, stale → AC-1, AC-7, AC-8,
  AC-15, AC-16, AC-17, AC-18 → `test/brief.it.test.ts`
- [x] T6 Client: hooks, Brief card on Overview (pills, focus, history, meta), deep link to
  Files changed (`?tab=diff&file=&line=`) → AC-19 – AC-24 → `BriefCard.test.tsx`,
  `DiffTab.test.tsx`
- [x] T7 Docs: `server/specs/brief.md`, `client/specs/pages.md`, AGENTS read-when, insights

## Traceability matrix

| AC | Tasks | Tests | Commit |
|---|---|---|---|
| AC-1 | T5 | brief.it "one call over the review diff…" | 566e72e |
| AC-2 | T2 | brief-signals "raises each rule of the table…", "a lockfile alone…" | f8c9a6c, 16eb122 (schema ≠ contract) |
| AC-3 | T1, T2 | git-history "lists first-parent commits…", brief-signals "merged PRs DevDigest knows only…", "stops at eight"; brief.it (noise paths left out) | cf83609, f8c9a6c, 566e72e |
| AC-4 | T2, T5 | brief-signals "reads merge and squash subjects…", "merged PRs DevDigest knows only…" (the upstream's #11) | f8c9a6c, f3e27ad |
| AC-5 | T2, T5 | brief-signals "merged PRs DevDigest knows only…", brief.it "history with known titles" | f8c9a6c, f3e27ad |
| AC-6 | T1 | git-history "reads non-ASCII paths and treats pathspec magic…", "option-looking path gives null" | cf83609 |
| AC-7 | T1, T5 | brief.it "says the history is limited on a shallow clone…" | 566e72e |
| AC-8 | T5 | brief.it "one call over the review diff…" (one call, `maxRetries: 0`) | 566e72e |
| AC-9 | T3 | brief-helpers "every repository-made or derived text sits in its own untrusted block" | 16eb122 |
| AC-10 | T3 | brief-helpers "an unknown kind or severity does not match the schema" | 16eb122 |
| AC-11 | T3 | brief-helpers "keeps a valid line or range…", "grounded model risks plus signals…" | 16eb122 |
| AC-12 | T3 | brief-helpers "grounded model risks plus signals…", "never more than six risks…" | 16eb122 |
| AC-13 | T3 | brief-helpers "focus keeps only shown new-side lines…" | 16eb122 |
| AC-14 | T3 | brief-helpers "strips links from model text and caps its length" | 16eb122 |
| AC-15 | T4, T5 | brief-helpers "the signals and history alone…", brief.it "signals-only on failure…", "with no provider key…" | 16eb122, 566e72e |
| AC-16 | T5 | brief.it "GET is free and reports staleness" | 566e72e |
| AC-17 | T5 | brief.it "a model brief of the same head is kept, one of an older head is replaced" | 566e72e |
| AC-18 | T5 | brief.it "refuses a second generation while one runs, and a PR with no diff anywhere" | 566e72e |
| AC-19 | T6 | BriefCard "without a brief, offers Generate…" | c976721 |
| AC-20 | T6 | BriefCard "pills in order with kind, severity and first reference…" | c976721 |
| AC-21 | T6 | BriefCard "focus spots and references open Files changed…; history links each PR" | c976721 |
| AC-22 | T6 | BriefCard (same), DiffTab "a deep link opens a folded file…", "a line the patch does not show scrolls to the file" | c976721, 58c2232 |
| AC-23 | T6 | BriefCard "names model, cost and head…; warns when stale" | c976721 |
| AC-24 | T6 | BriefCard "…expands to its explanation without links" | c976721 |
| edge: other base | T6 | BriefCard "a PR into another branch says the history is the default branch's" | 1cebb85 |

## Risks

- The diff loader may fetch from GitHub on first use — same as a review, rate-limited.
- History scans 60 first-parent commits; a repo with many direct commits may show fewer
  than 8 PRs (by design: AC-4).

## Verification

`cd server && pnpm typecheck && pnpm depcruise && pnpm exec vitest run` · `cd client && pnpm typecheck && pnpm test`
