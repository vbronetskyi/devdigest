# Verification: SPEC-06 Weekly digest

By the `plan-verifier` role: a separate agent (Opus), read-only, judging the code and
tests against the spec and the course design — not commit messages.

## Pass 1 — at `45b6b2e`

**Verdict: not ready.**

| Finding | Kind | Resolution | Commit |
|---|---|---|---|
| The number check could be bypassed: `-42`, `.95`, `3-5`, `10-day`, `3/4`, `42x`, `10k`, `3rd`, `42pct`, `1e3`, `1_000`, `_42_`, `４２`, code spans, "doubled", "halved", "dozens" | security | tokens with a digit; a number must be a trusted one, anything else verbatim in the facts or a range of trusted numbers; non-ASCII digits and inflected number words drop the line (AC-7 rewritten) | `dbb4000`, `23f8267` |
| A stray backtick in a title hid the fact numbers up to the next one, forcing a 502 | bug | no code-span handling left on either side | `23f8267` |
| Numbers in titles and paths entered the allowed set; a newline in a title could forge a fact line | security | trusted numbers from the facts text with untrusted strings redacted; untrusted text collapsed to one line | `23f8267` |
| Copy as Markdown escaped the backticks of code-spanned URLs, turning them back into links | security | URLs split out first and kept in code spans (AC-12 amended) | `dbb4000`, `b489c4b` |
| An unknown change showed as "no change" | deviation | "—" with its reason (AC-10, AC-13) | `b489c4b` |
| The Markdown had no changes or previous week; criticals lacked PR title and agent; the Decisions card had no change | gap | all added (AC-10, AC-12 amended) | `dbb4000`, `b489c4b` |
| Highlights could land in another week's cache when the page moved mid-request; pending and error carried across weeks | bug | the week in `mutationKey`, the cache target from the request's variables, `useIsMutating` after a remount (AC-11 amended) | `dbb4000`, `b489c4b` |
| `0026-W42` answered with 1926 data (`Date.UTC` maps 0–99 to 1900+) | bug | `setUTCFullYear`, four-digit years, server and client | `23f8267`, `b489c4b` |
| Every highlight of the current week goes stale at its close | by design | written into the spec's edge cases | `dbb4000` |
| The failure message carried its prefix twice; deleted agents on one PR merged in `distinct on`; the Markdown path not collapsed | bug | the server's sentence shown once; grouping by `coalesce(agent_id, reviews.agent_id, run id)`; one-line path (AC-3 amended) | `23f8267`, `b489c4b` |
| Untested: replace on conflict, the no-key 502, a released week after a failure, null vs zero cost, week edges, workspace filters, the severities status filter, the in-progress end, number words, `mdSafe` escapes | untested | tests added; 39 mutations checked, all fail a test | `23f8267`, `b489c4b` |

Not mutation-checked: removing `withDeadline` (a 60 s wait; the same wrapper is tested in
the brief and onboarding modules).

## Pass 2 — at `106e145`

**Verdict: not ready — AC-7 only.** Every other criterion held, and all pass-1 items were
confirmed fixed or accepted in the spec: the redacted facts text excludes every untrusted
string, the hook behaves correctly in TanStack Query 5.101 (checked in its source), and
the deleted-agent grouping is sound.

| Finding | Kind | Resolution | Commit |
|---|---|---|---|
| Thousands grouped by a space or an apostrophe split into stated tokens: "9 000" passed as 9 and 0 | security | groups joined into one number before tokenizing | `fd60e1e`, `e2cd1b6` |
| Invisible characters between digits: "4​2" read as 42 and passed as 4 and 2 | security | NFC, then format and combining characters removed | `fd60e1e`, `e2cd1b6` |
| Non-ASCII numerals without a decimal digit (`④②`, `²`, `½`) never reached the check | security | any numeral outside ASCII drops the line | `fd60e1e`, `e2cd1b6` |
| Multipliers and more number words: `3×`, `3 times`, `9 K`, `10^3`, `thirty`, `zero`, `billion`, `hundredfold` | security | `MULTIPLIER` and a longer `NUMBER_WORDS` | `fd60e1e`, `e2cd1b6` |
| "5 of 12" could not pass: the listed count was not stated | honest line dropped | "Open critical findings: 12 (5 listed)" | `e2cd1b6` |
| `?week=0001-W01` reached Postgres with year 0 and answered 500 | bug | weeks before 1970 are a 422 (AC-5 amended) | `fd60e1e`, `e2cd1b6` |
| The week in progress: facts ended at now, agents and criticals at the week's end | inconsistency | one end for all | `e2cd1b6` |
| Bare domains (`evil.com/login`) and `GH-12` reached a channel live | security | domains on common TLDs in code spans, `GH-N` neutralised (AC-12 amended) | `fd60e1e`, `e2cd1b6` |
| Untested: the 5-line cap, the 20-agent cap and the title cut, workspace filters in `prsOpened` and the criticals' CTE, a week with decisions but no runs, the file order, the upsert's time, the agents table's dashes, the PRs card on an empty week; a hook test that depended on order | untested | tests added; 18 more mutations, all fail a test | `e2cd1b6` |

Accepted as is, written into the spec or the plan's risks: identifier-like tokens that a
title carries as written (`250k`) may be quoted; "week 42" and dates are dropped unless
stated as written; backslash escapes show literally in Slack; letting failed runs into
the criticals' CTE is an equivalent mutation (a failed run has no review). Three live
calls after the change kept 5 of 5 lines each.

## Pass 3 — at `061fb3e`

**Verdict: not ready — AC-7 only.** Every pass-2 item was confirmed resolved and tested;
no regressions across AC-1 – AC-13 (the 1970 floor, one end for the week in progress,
the listed count, file names left plain).

| Finding | Kind | Resolution | Commit |
|---|---|---|---|
| Markdown emphasis between a digit and its multiplier or around a number word: `**3** times`, `**3**x`, `_twenty_` | security | emphasis removed before the check (and from the stored line) | `71b8e76`, `365d182` |
| Enclosing marks (keycaps `4⃣2⃣`), control characters (`9\u0085000`), NUL (a 500 at the jsonb insert) | security | every `\p{C}` and `\p{M}` removed, after whitespace is collapsed | `71b8e76`, `365d182` |
| Numerals that are letters (`四十二`), look-alike apostrophes (`1＇000`, `1‘000`), `✕` `⨯` `·`, Cyrillic homoglyphs (`twеnty`, `3 х`) | security | a non-ASCII character must be common typography or appear in the facts — titles in any language still quote | `71b8e76`, `365d182` |
| N-fold for other N (`twelvefold`, `dozenfold`, `millionfold`); `9 mn`, `9 tn`, `9 mil` | security | number words by stem with an optional `-fold`; more abbreviations | `71b8e76`, `365d182` |
| HTML character references (`3&times;`, `9&nbsp;000`) render as numbers in GitHub | security | a reference drops the line | `71b8e76`, `365d182` |
| `9 0000`, `1 00 000` not joined | security | any digit run split only by a space or an apostrophe is one number | `71b8e76`, `365d182` |
| "PR #3 X-Forwarded-For" dropped as a multiplier | honest line dropped | `x` not before a word character or a hyphen | `365d182` |
| The facts said "to 2026-10-19" — the exclusive next Monday | off by one | the week's last day | `365d182` |
| `evil.de/login` and `_evil.com_` stayed live in the Markdown | security | any `host.tld/path`; domains matched without `\b` (AC-12 amended) | `71b8e76`, `365d182` |
| "Previous week" on 1970-W01 led to a 422 | bug | disabled there (AC-10 amended) | `71b8e76`, `365d182` |
| Untested `MULTIPLIER` alternatives and the `’` separator; four new tests missing from the matrix | untested | tests and matrix rows added; 14 more mutations, all fail a test | `365d182` |

Accepted by the spec: `×3` (a multiplier before the digit), `9.000` as 9, a flipped sign,
ratios (`9/26`), words off the list (`XLII`, `a third`, `fifth`), identifiers a title
carries as written. Dropped honest phrasing ("ran 3 times", "first half") is steered away
in the prompt. Three live calls after the change kept 5 of 5 lines each.

## Pass 4 — at `0a7ea82`

**Verdict: not ready — AC-7 only.** Every pass-3 item confirmed resolved and tested (the
90-shape table, X-Forwarded-For kept, the last day, `evil.de/login` and `_evil.com_`,
the 1970-W01 button); no regressions across AC-1 – AC-13; honest lines, bolded numbers
and quoted Ukrainian titles kept, stored lines clean.

| Finding | Kind | Resolution | Commit |
|---|---|---|---|
| The clean-up rebuilt an HTML character reference (`3&*times;` → `3&times;`, `4&#5*7;` → `4&#57;`), and `mdSafe` left `&` live, so GitHub rendered 3× or 49 | security | the reference is checked again after the clean-up; `&` escaped in the Markdown | `47e793f`, `911eb1e` |
| Backticks between a digit and its multiplier: `` `3` times ``, `` 3`x` ``, `` 10`^`3 `` | security | backticks ignored for the number-word and multiplier tests | `47e793f`, `911eb1e` |
| An en or em dash before `fold`: `3–fold` | security | dashes, brackets and quotes may sit between a digit and its multiplier: `(3) times`, `"3" times`, `3- fold`, `3 x-fold` | `47e793f`, `911eb1e` |
| More abbreviations: `9 bln`, `9 bil`, `9 mill`, `$9 grand`, `9 thou`, `9 Mio` | security | added | `911eb1e` |
| HTML comments not removed: `4<!-- -->2` | nit | removed before the check | `911eb1e` |
| `8.9999999999999999` read as 9 through `Number()` | nit | numbers compared as written | `911eb1e` |
| `src/modules/_shared/…` stored as `…/shared/…` | honest line misquoted | an underscore next to `/` or a file extension stays | `911eb1e` |
| An NFD title (as macOS writes paths) could not be quoted; `→` and `naïve` dropped | honest line dropped | facts characters taken after NFC; Latin letters and `→ « »` allowed | `911eb1e` |
| With Cyrillic in the facts, `twеnty` or `3 х` could pass | hardening | Cyrillic and Greek look-alikes read as Latin for number words and multipliers | `911eb1e` |

The table of invented shapes now has 121 lines; 14 more mutations, all fail a test (two
first survived — the `-fold` dash on a stem is redundant, as the stem alone matches, and
the NFD test used a Latin letter — and were fixed). Three live calls after the change
kept 5 of 5 lines each.

Accepted by the spec as written: non-English number words (`двадцять`, `zwanzig`), words
off the list (`a score`, `tenth`, `a couple`), identifiers a title carries as written,
ratios, `×3`, a flipped sign; scripts that need combining marks (Devanagari, Thai) lose
them in a quoted title.

## Pass 5 — at `a3f08a2`

**Verdict: not ready — a regression, nothing an attacker needs.** No line a reader would
take for an invented number got through; all pass-4 items were confirmed. But the
pass-4 look-alike reading broke honest lines.

| Finding | Kind | Resolution | Commit |
|---|---|---|---|
| Quoted Ukrainian titles were dropped: `з` was read as the digit 3 and word edges were ASCII, so `3 "В…` or `з в…` read as a multiplier — "Виправити обробку помилок", "Видалити старий кеш", "Робота з ключем API"… | honest lines dropped (regression from `911eb1e`) | `з` stays a letter; word edges are Unicode letters in both rules; eight common titles in the honest-line test | `1d6d0a7`, `3d3206d` |
| Quotes and marks the spec names were missing between a digit and a multiplier: `«3» times`, `<9> K`, `3− times`, `3… times` | nit | added | `3d3206d` |
| GitHub inline math: `$9{}000{}$` renders 9000 | nit | LaTeX braces and backslashes drop the line; so do emoji shortcodes (`:heavy_multiplication_x:`) | `1d6d0a7`, `3d3206d` |
| Latin look-alikes (`eiɡht`, `thırty`, `twénty`, `ｔｗｅｎｔｙ`, `9 ᴋ`) and run-together words (`fortytwo`, `tenthousand`) | nit | NFKD fold, marks removed and Latin variants mapped for the word and multiplier tests; stems may repeat | `3d3206d` |
| `9 MM`, `9 trn`, `9 lakh`; `9' 000`; a comment rebuilt around a zero-width space | nit | added; separators may repeat; comments removed again after the clean-up | `3d3206d` |

The invented-shape table has 149 lines; 11 more mutations, all fail a test (one first
survived — no title placed `х` before an unmapped letter — and "Хліб і сіль" now pins it).
Three live calls after the change kept 5 of 5 lines each.

## Pass 6 — at `e28f1fa`

**Verdict: not ready — AC-7 only.** The pass-5 items held (`з` a letter, Unicode word
edges, eight titles in the test). The check now ran over 201 lines of 67 realistic
titles, 12 agent names and 17 everyday lines.

| Finding | Kind | Resolution | Commit |
|---|---|---|---|
| A one-letter Cyrillic word starting a quoted title read as a multiplier: `PR #3 "В логах…"`, `«В інтерфейсі…»`, `"М’яке видалення"`, `К релизу…`; likewise English `"X API client"`, `"B tree index"` | honest lines dropped | look-alikes read as Latin only inside a word that mixes them with ASCII letters; a one-letter multiplier counts only right after the digit and its closing marks, and a Cyrillic look-alike not before a Cyrillic word or an apostrophe | `8b07cea`, `7009a83` |
| Rust paths and Redis keys matched the shortcode rule: `std::sync::MutexGuard`, `ws:pr:sha` | honest lines dropped | a shortcode only as a whole word | `8b07cea`, `7009a83` |
| Latin letters with no ASCII decomposition passed freely: `ᴛᴡᴇɴᴛʏ`, `3 ᴛɪᴍᴇꜱ`, `9 ᴍ`, `9 ĸ`, `twɛnty` | security | a Latin letter needs no source only if it folds to ASCII; small capitals mapped | `8b07cea`, `7009a83` |
| GitHub inline math collapses spaces: `$9 . 26)$` renders 9.26) | security | inline math drops the line | `8b07cea`, `7009a83` |
| Cyrillic `п` (looks like n) unmapped: `twепty` with a Ukrainian title in the facts | security | mapped, with `г һ ԁ ӏ ԝ ь η` | `7009a83` |

A probe of 30 real-looking Ukrainian and English titles in four line shapes keeps 120 of
120 (one unquoted `T&C` first dropped and now passes). The invented-shape table has 163
lines; 11 more mutations, all fail a test (two first survived — the small-caps attack was
already caught by the mapping, and the `п` test had only a capital `П` in its facts — and
were pinned with `ꝁ`, `ʞ` and a lower-case title). Three live calls kept 5 of 5 lines each.
