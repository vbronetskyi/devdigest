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
| AC-1 | T5 | brief.it "one call over the review diff…"; grounding "keeps a deleted file under its old path…" | 566e72e, c5fce8b |
| AC-2 | T2 | brief-signals "raises each rule of the table…", "a lockfile alone…" (docs-only → none), "migrations at any depth, schema alone, manifests and contracts across ecosystems" (deleted route); brief-signals "…tests and docs raise nothing" (Go / Python / Ruby tests); brief-signals (an API spec under spec/ is not a test) | f8c9a6c, 16eb122, c5fce8b, e0e33c7, ef2acdf |
| AC-3 | T1, T2, T6 | git-history "lists first-parent commits…"; brief-signals "merged PRs DevDigest knows only…", "stops at eight", "lockfiles, Markdown and migration metadata never look for history"; BriefCard "each history entry names its PR, the merge commit's author and date…"; brief.it (the 60-commit scan); git-history (merge commit's author vs committer) | cf83609, f8c9a6c, c5fce8b, e0e33c7 |
| AC-4 | T2, T5 | brief-signals "reads merge and squash subjects…", "merged PRs DevDigest knows only…" (the upstream's #11) | f8c9a6c, f3e27ad |
| AC-5 | T2, T5 | brief-signals "merged PRs DevDigest knows only…", brief.it "history with known titles" | f8c9a6c, f3e27ad |
| AC-6 | T1 | git-history "reads non-ASCII paths and treats pathspec magic…", "sends at most 100 paths to git", "option-looking path gives null"; git-history "the review diff names non-ASCII files as written" | cf83609, 045373c, e0e33c7 |
| AC-7 | T1, T5, T6 | brief.it "says the history is limited on a shallow clone…"; git-history "a shallow clone says so…"; BriefCard "says when the history is limited or unavailable…"; brief.it (a failing history → unavailable) | 566e72e, c5fce8b, 045373c, e0e33c7 |
| AC-8 | T5 | brief.it "one call over the review diff…" (one call, `maxRetries: 0`) | 566e72e |
| AC-9 | T3 | brief-helpers "every repository-made or derived text sits in its own untrusted block", "every new-side line carries its number…", "the diff is cut at 12,000 characters and the file list at 100 files"; brief-helpers "a new file header ends an unfinished hunk" | 16eb122, c5fce8b, 2eaf5b7, e0e33c7 |
| AC-10 | T3 | brief-helpers "an unknown kind or severity does not match the schema" | 16eb122 |
| AC-11 | T3 | brief-helpers "keeps a valid line or range…" (a range across two hunks → path), "grounded model risks plus signals…"; brief-helpers (a range inside the size bound) | 16eb122, c5fce8b, e0e33c7 |
| AC-12 | T3 | brief-helpers "grounded model risks plus signals…", "never more than six risks…" | 16eb122 |
| AC-13 | T3 | brief-helpers "focus keeps only shown new-side lines…" | 16eb122 |
| AC-14 | T3 | brief-helpers "strips links from model text and caps its length" (120 / 600 / 240); brief-helpers (lower bounds of the caps) | 16eb122, c5fce8b, e0e33c7 |
| AC-15 | T4, T5 | brief-helpers "the signals and history alone…", brief.it "signals-only on failure…", "with no provider key…" | 16eb122, 566e72e |
| AC-16 | T5 | brief.it "GET is free and reports staleness" | 566e72e |
| AC-17 | T5 | brief.it "a model brief of the same head is kept, one of an older head is replaced" | 566e72e |
| AC-18 | T5 | brief.it "refuses a second generation while one runs, and a PR with no diff anywhere"; brief-helpers "no text diff anywhere is a 409; any other failure stays an error" | 566e72e, c5fce8b |
| AC-19 | T6 | BriefCard "without a brief, offers Generate…" | c976721 |
| AC-20 | T6 | BriefCard "pills in order with kind, severity and first reference…" | c976721 |
| AC-21 | T6 | BriefCard "focus spots and references open Files changed…; history links each PR", "…and when there are no risks" | c976721, c5fce8b |
| AC-22 | T6 | BriefCard (same); page helpers "a reference opens Files changed at the file and line…", "reads the focus back…"; DiffTab "a deep link opens a folded file…", "a line the patch does not show scrolls to the file" | c976721, 58c2232, c5fce8b |
| AC-23 | T6 | BriefCard "names model, cost and head…; warns when stale" | c976721 |
| AC-24 | T6 | BriefCard "…expands to its explanation without links" | c976721 |
| edge: other base | T6 | BriefCard "a PR into another branch says…"; page helpers "why only into the default branch; otherwise the history note" | 1cebb85, c5fce8b |
| edge: deleted / no text diff | T1 | grounding "keeps a deleted file under its old path…", "ends a hunk at its header counts…"; reviewer-core run "map-reduce: a deleted file gets no map call…" | c5fce8b, 0b571ac |

## Risks

- The diff loader may fetch from GitHub on first use — same as a review, rate-limited.
- History scans 60 first-parent commits; a repo with many direct commits may show fewer
  than 8 PRs (by design: AC-3/AC-4).
- The 90 s deadline does not cancel the request (platform `withDeadline`); a late answer
  may still be billed. Fixing it needs an AbortSignal through the LLM port — every model
  feature shares this, so it is a follow-up, not part of this feature.
- Accepted from verification: the security word rule matches design `tokens.ts`; the
  "why" button is hover-only, like the comment "+"; signal file lists in the prompt are
  capped at 100 each.

## Verification

`cd server && pnpm typecheck && pnpm depcruise && pnpm exec vitest run` · `cd client && pnpm typecheck && pnpm test`
