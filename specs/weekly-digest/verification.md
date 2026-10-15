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

## Pass 7 — at `430125f`

**Verdict: not ready — AC-7 only.** The pass-6 items held. The probe grew to 1,297
lines (100 PR titles in 9 shapes, 30 finding titles, 20 paths, 20 agent names, 26
everyday lines).

| Finding | Kind | Resolution | Commit |
|---|---|---|---|
| `twentyone`, `fiftyone` — "one" was allowed only as a prefix of run-together words | security | `one` may follow any stem | `2120c4f`, `b8c2a45` |
| Greek capitals inside a mixed word were looked up by their small form: `TWEΝTY` (Ν→ν→v), `ΗUNDRED`, `$9 ΜM`, `ΖERO` | security | capitals looked up first (Η h, Μ m, Ν n, Υ y, Ζ z) | `2120c4f`, `b8c2a45` |
| Honest identifiers read as a number with a one-letter multiplier: `B2B`, `M2M`, `Y2K`, `OAuth2` (since pass 2) | honest lines dropped | digits glued to a letter before them are not a number for the multiplier rules | `2120c4f`, `b8c2a45` |
| The spec had no hyphen exception after a one-letter multiplier, the code did (`x-axis`, `X-Forwarded-For`) | spec gap | AC-7 states hyphenated words as accepted | `2120c4f` |
| Words made only of Cyrillic look-alikes passed (`$9 ММ`, `3 тімеѕ`) wherever a Ukrainian title supplied the letters; a non-breaking hyphen, `↓`, `≈` dropped honest lines | security / honest lines | such words of two letters or more read as Latin, while a lone look-alike letter is judged against the next word as written (`В тестах…` stays Ukrainian); arrows, `≈` and `‐ ‑` are typography | `b8c2a45` |

Left as accepted or not worth a rule: an unquoted Cyrillic preposition before a Latin word
(`PR #3 В CI…` — quoted shapes keep it), `-ish`, `9 OOO`, `9, 000`, multipliers inside
quoted English titles (`"Retry 3 times"`, `4K`, `@2x`, `1M`). The probe after the change:
1,289 of 1,297 kept — the eight drops are those unquoted prepositions and a bare
`PR #3 X API client`; 120 of 120 on the second set. 8 more mutations, all fail a test (one
first survived — the unquoted `В тестах` shape was missing — and is now in the test).
Three live calls kept 5 of 5 lines each.

## Pass 8 — at `fe73a07`

**Verdict: not ready — one regression from pass 7.** Every pass-7 item held; the existing
probes matched the log and a new one (480 lines: titles and agent names built from
look-alike letters, Greek and µ titles, words ending in "one", model typography) found no
honest-line regression.

| Finding | Kind | Resolution | Commit |
|---|---|---|---|
| The identifier exemption (`B2B`) also exempted a number with a leading dot and a digit right after a code span: `$.0049 M`, `$.0049 bn`, `.5 times`, `` `USD`9 M `` were kept | security (regression from `b8c2a45`) | a dot before the digits does not make an identifier, only a letter glued in the text as written; a code span ends a word | `c9198d8`, `9a6cfe0` |
| `$9 lakhs`, `9 crores`, `9 mils`, `9 lac` | nit | plural forms added | `c9198d8`, `9a6cfe0` |
| A double space in the spec's changelog; long prose lines in the package spec | nit | fixed | `c9198d8`, `9a6cfe0` |

Accepted: `9 (K)` and `$.42 (M)` — an opening bracket before a one-letter multiplier is
not covered, because `PR #3 (X API client)` must stay; `$9 ь`; typography outside the list
(`·`, `≤`, `÷`, `✓`) drops a line, as written. The probes after the change: 120/120,
1,289/1,297 (the accepted unquoted prepositions), 458/480 (the same 22 as before, all
intended). 3 more mutations, all fail a test; three live calls kept 5 of 5 lines each.

## Pass 9 — at `87bd252`

**Verdict: not ready — one combination.** Every pass-8 item held and no honest-line
regression was found (120/120, 1,289/1,297, 458/480 and 78/90 on the identifier set — the
drops all intended).

| Finding | Kind | Resolution | Commit |
|---|---|---|---|
| A code span before a number with a leading dot still hid a multiplier: `` `USD`.0049 M ``, `` USD`.0049` M ``, `` `x`.5 times `` — pass 8 had fixed each half alone | security | a backtick is a space for the multiplier rules, so a code span is a word boundary whatever follows it | `cdbfa1d`, `8178cf8` |

Accepted, as the spec reads: `9…K`, `9 'K'`, `9 Ks`; Cyrillic multipliers (`9 млн`,
`$9 тис.`) like the accepted non-English number words. The probes after the change: the
same counts; one more mutation fails a test; three live calls kept 5 of 5 lines each.

## Pass 10 — at `ec814c0`

**Verdict: not ready — one character class.** No honest-line regression (all probes match
the log); every pass-1 – 9 attack probe and their combinations are dropped.

| Finding | Kind | Resolution | Commit |
|---|---|---|---|
| Hangul fillers (`ㅤ` U+3164, `ﾠ` U+FFA0, U+115F, U+1160) are letters to Unicode but invisible, so they survived the clean-up and broke word edges: `ㅤtwenty`, `3 timesㅤ`, `$9 ㅤM`, `9ㅤ000` (since pass 3) | security | default-ignorable characters and the braille blank (U+2800) removed with the others | `8e9d94f`, `7945706` |
| A backtick inside a word split it once backticks became spaces: `` ti`mes` ``, `` twen`ty` `` | nit (from `8178cf8`) | a backtick between two letters is dropped | `8e9d94f`, `7945706` |
| Look-alike separators from a title: `$9‚000`, `$9，000`, `$9․26`, `$9·26` | nit | compatibility forms folded for the token check; `‚` and `·` join digits | `8e9d94f`, `7945706` |

The probes after the change: 120/120, 1,289/1,297, 458/480, 78/90 — unchanged. 5 more
mutations, all fail a test; three live calls kept 5 of 5 lines each.

## Pass 11 — at `67eda0b`

**Verdict: not ready — the rest of a class.** No honest-line regression (120/120,
1,289/1,297, 78/90, 458/480); every recorded attack dropped. A scan of every code point as
a separator in a title found what the pass-10 list missed.

| Finding | Kind | Resolution | Commit |
|---|---|---|---|
| Other look-alike separators split a number into two stated ones: `9⋅26`, `9∙26`, `9‧26`, `9・26`, `9¸000`, `9٬000`, `9٫26`, `9،000`, `26、000` | security | any run of non-ASCII marks between digits that are not letters, digits, spaces or listed typography joins them (`joinSplitDigits`) — no per-character list | `0a2a16e` |
| `9ͺ000`: the compatibility fold from pass 10 turned `ͺ` into a space and a mark, splitting what had been one token; likewise `˛ ´ ΄` | regression from `7945706` | marks removed after the fold | `0a2a16e` |

After the change the scan leaves only listed typography and forms that fold to ASCII
punctuation; honest probes unchanged; 3 more mutations fail a test. Of six live calls,
three kept 5 of 5 lines; three hit the 60 s deadline at the provider (slow at the time;
the check runs after the model answers) and answered 502, as AC-6 and AC-8 intend. Accepted: `𝅙` (no system font draws it, it shows as a box), digit-like
letters (`ЗО`, `1∅∅`), CJK numerals from a CJK title, ``9,`000`` (the accepted `9, 000`).

## Pass 12 — at `a3136e5`

**Verdict: not ready — the visible sibling of pass 10.** No honest-line regression (all
probes as logged, plus Ukrainian titles with `ʼ` in every quoting form); the code-point
scan unchanged from pass 11's post-fix result.

| Finding | Kind | Resolution | Commit |
|---|---|---|---|
| Letters that look like punctuation glue onto a word, so `ʼtwentyʼ`, `3 timesʼ`, `(3)ʼ times`, `$9 bnʼ` were kept wherever a title supplied the letter — `ʼ` is the standard Ukrainian apostrophe; likewise `ʻ ˈ ꓸ ꓹ ǃ ǀ` | security | modifier letters (`\p{Lm}`) and the clicks read as spaces for the number-word and multiplier tests | `9f2864c` |
| Spaces around a separating mark kept digits apart: `$9 ⋅000`, `$9٬ 000` | nit | joined, as long as a mark is there | `9f2864c` |

3 more mutations fail a test; three live calls kept 5 of 5 lines each.

## Pass 13 — at `57881e0`

**Verdict: not ready — the multiplier rules still used lists.** No honest-line regression
(all probes as logged; 74 of 75 new titles with Japanese `ー々`, Korean `ㅡㆍ`, `ʼ`, `ʻ` —
the one drop, an unquoted `PR #3 Kʼs`, drops with an ASCII apostrophe too).

| Finding | Kind | Resolution | Commit |
|---|---|---|---|
| U+2010 / U+2011 hyphens between a digit and a word multiplier — no title needed, and models write U+2011 on their own: `3‑fold`, `10‑fold`, `$9‑bn`, `3‑times` | security | what may sit between is now any Unicode dash, bracket or quote by category, primes and ellipses | `7b6c06d`, `80fe5a1` |
| Other brackets and quotes a title supplies: `【3】 times`, `「9」K`, `‹9› K`, `3―fold`, `3⸺fold`, `3⋯times`, `״3״`, `❝3❞` | security | the same category classes; closing ones (and ellipses) before a one-letter multiplier | `7b6c06d`, `80fe5a1` |
| Letters that look like punctuation beyond the modifier letters: `ㅡtwentyㅡ`, `ㆍ`, `一`, `丨`, `ノ`, `ᐨ` | security | letters of scripts other than Latin, Cyrillic and Greek read as spaces for these tests; a number word or multiplier ends at anything but an ASCII letter or digit (`жtwentyж`) | `7b6c06d`, `80fe5a1` |
| `9‑K` kept while `9-K` dropped | nit | true hyphens read as `-` for the token rule | `80fe5a1` |

6 more mutations fail a test (two first survived — the `жtwenty` test had only a capital
`Ж` in its facts — and were pinned). Three live calls kept 5 of 5 lines each. Accepted:
`9 ‐ K` and `9 ㅡ 000` with spaces around a dash (they read as a dash, as `9 - K` does).

## Pass 14 — at `dedfcbb`

**Verdict: not ready — a regression of mine and two mark classes.**

| Finding | Kind | Resolution | Commit |
|---|---|---|---|
| Reading every other-script letter as a space made them skippable between a digit and a multiplier, dropping honest CJK and Hangul titles: `"修复3个x轴标签"`, `"支持4K视频"`, `"3つのx軸ラベルを修正"`, `"認証トークンの更新" times out` — 59 new drops over 230 lines | honest lines dropped (regression from `80fe5a1`) | reverted: other letters stay letters (word edges are ASCII already); only letters that look like a dash or a bar (`ㅡ 一 丨 ノ ᐨ ㆍ`…) read as a dash; the probe's new drops vs `57881e0`: 0 | `c927226`, `d96ad07` |
| A closing quote Unicode files as initial: `»9« K` (no title needed), `„9“ K`, `›9‹ K` | security | initial-quote characters may close a number too | `c927226`, `d96ad07` |
| Ellipses other than `… ⋯` (`⋮ ⋰ ⋱ ᠁`), reversed primes (`‵ ‶`), the swung dash `⁓` between a digit and a multiplier | security | added, with `˗ ⁃ ─ ━ ‧` that read as hyphens | `c927226`, `d96ad07` |

4 more mutations fail a test, including re-adding the reverted rule. Three live calls kept
5 of 5 lines each. Accepted: an unquoted title that starts with a digit right after
`PR #3` (`PR #3 3つの…`) joins into `33`, as in English (`PR #3 3 x-axis…`); `՚3՚`, `⸲ ⹁`,
`🙶3🙷` (a box in most fonts), `9 …K` with a space before the ellipsis.

## Pass 15 — at `f2d08e4`

**Verdict: not ready — the dash-like letter list.** No honest-line regression: every
honest probe byte-identical to the `57881e0` snapshot, and the pass-14 CJK probe has 0 new
drops.

| Finding | Kind | Resolution | Commit |
|---|---|---|---|
| `ㅣ` was in the list but did nothing — NFKD turns it into `ᅵ` first; `ㄧ` (Bopomofo, drawn like `一`), `ⵏ`, `ꓲ`, `ߊ`, `ا` were missing: `3 ㅣtimesㅣ`, `$9 ㄧbn` kept | security | no list: a lone letter of a script other than Latin, Cyrillic or Greek, with none beside it, reads as a dash; runs of them (real CJK, Hangul, Arabic words) stay words — the CJK probe still has 0 new drops | `590820e` |
| ASCII `|` and other bars between a digit and a multiplier (`3 |times|`, no title needed) | nit | bars added | `590820e` |

4 more mutations fail a test, including treating whole runs as dashes. Three live calls
kept 5 of 5 lines each. Accepted: box-drawing and minus symbols that are not dashes
(`┄ ➖ ⎯`), parenthesised ideographs (`㈀`), a one-character other-script title read as a
dash.

## Pass 16 — at `f48553f`

**Verdict: not ready — one exemption too wide.** No honest-line regression the spec does
not intend: the seven earlier probes are byte-identical to `f2d08e4`; a new probe of 510
lines (51 titles with a lone CJK, Hebrew, Arabic or Devanagari character beside Latin or
digits) keeps nothing new, and its 29 new drops follow from the lone-letter rule — 22 of
them drop for the English title too (`用4K视频`, `约3K条` now count `4K`, `3K` as multipliers,
as English titles do).

| Finding | Kind | Resolution | Commit |
|---|---|---|---|
| A one-letter multiplier before any dash counted as a hyphenated word: `$9 M— up from…` (no title needed), `3 x— the most`, `9 K—up`, `3 x-, while`; since `590820e` also before a lone other-script letter (`$9 Mו up`, `9 Kا up`) | security | a hyphenated word needs a hyphen and then a letter or digit (`x-axis`, `X-Forwarded-For` kept) | `822cd56` |

2 more mutations fail a test. Three live calls kept 5 of 5 lines each. Accepted: runs of
dash-like letters stay words (`3 ㅡㅡtimes`), `3 ꟾtimesꟾ` (as ASCII `3 ltimesl`), a title
ending in a digit and one counter character before "times out" (`"重试 3 次" times out`).

## Pass 17 — at `8097739`

**Verdict: not ready — the character after a multiplier.** The pass-16 fix held and changed
nothing else: every honest probe and both scans byte-identical to pass 16. Scanning every
code point after the multiplier found three shapes, all older than `822cd56`.

| Finding | Kind | Resolution | Commit |
|---|---|---|---|
| A lone other-script letter became an ASCII `-`, so it counted as a hyphen and opened the hyphenated-word exemption: `9 K一up`, `3 x一the most`, `$9 M一up` — `一` is drawn like an em dash | security | the letter reads as an em dash, not a hyphen | `eb5f696` |
| The look-alike multipliers did not see that reading: `9 К一 up`, `9 Кا up`, `9 κ一 up` | security | the same reading before the look-alike test | `eb5f696` |
| `&` after a one-letter multiplier was exempt whatever followed: `9 K& up`, `3 x&, while` | security | `&` makes a word only before a letter or digit (`T&C` kept) | `eb5f696` |

3 more mutations fail a test. Of seven live calls, six kept 5 of 5 lines and one kept 4
— the dropped line is not visible through the API; the change touches only what follows a
multiplier and `&` after a letter, so the likeliest cause is a computed number, which is
what the check is for. Accepted: true hyphens (`$9 M-plus`), letters folding to ASCII
after `K` (`9 Kｕｐ`), `_` inside an identifier, a backtick between letters.

## Pass 18 — at `266b732`

**Verdict: not ready — one character.** No honest-line regression: all nine honest probes
byte-identical to `8097739`. A new scan of 41 shapes over every assigned code point —
before and after Latin, look-alike and word multipliers, at both edges of number words —
keeps nothing new; all nine pass-17 lines drop, `T&C`, `x-axis`, `X-Forwarded-For` kept.

| Finding | Kind | Resolution | Commit |
|---|---|---|---|
| A full-width or vertical low line after a multiplier folds to `_`, which counted as a word character whatever followed: `3 times＿ this week`, `$9 M＿, up`, `9 K︳ up` (drawn as `9 K| up`), `9 К＿ up` | security | `_` makes a word only before a letter or digit, as `-` and `&` do (`K_max` kept) | `8825a8e` |
| `ꞏ` (mapped to `-`) opened the hyphen exemption | nit | mapped to an em dash | `8825a8e` |

3 more mutations fail a test; three live calls kept 5 of 5 lines each. Accepted: `9 Kﾞup`,
`3✕` with a title supplying it, `9 K™ up`, `9 K&1 up`, `9 K﹣up` (the fold, `&` and hyphen
rules allow them as written).

## Pass 19 — at `afa75c0`

**Verdict: not ready — one rule applied to the wrong kind of multiplier.** No honest-line
regression (nine probes byte-identical to pass 18); the 41-shape scan and every attack
probe keep nothing new.

| Finding | Kind | Resolution | Commit |
|---|---|---|---|
| After a word multiplier, `_` and a letter still made a word: `3 times_this week`, `3 fold_this week`, `$9 bn_up`, `$9 mln_total` (no title needed), `3 times︳this week` (drawn `3 times|this week`) — the `_` exemption is meant for one-letter multipliers (`K_max`) | security (older than `80fe5a1`) | a word multiplier ends at anything but an ASCII letter or digit, `_` included; number words already did | `83a3143` |
| `ﾞ` / `ﾟ` folded to a combining mark and vanished before the modifier-letter rule: `doubledﾞthis` | nit | modifier letters count as spaces before the fold too | `83a3143` |
| The package spec still said a lone other-script letter reads as `-` | nit | "an em dash" | `83a3143` |

2 more mutations fail a test; three live calls kept 5 of 5 lines each. Accepted: an honest
title that starts with a multiplier word and `_` right after a digit (`9 mm_per_px`) drops,
as AC-7 reads; a backtick between letters is removed (`` times`this ``).

## Pass 20 — at `94c7153`

**Verdict: not ready — a regression of mine and an asymmetry.** No honest-line regression
(nine probes as pass 19).

| Finding | Kind | Resolution | Commit |
|---|---|---|---|
| Turning every modifier letter into a space before the fold also blanked superscript Latin letters, which pass the character gate freely: `tʷenty`, `ʰalved`, `3 timeˢ`, `3 ˣ`, `$9 ᴹ`, `teⁿfold` were kept (dropped before `83a3143`) | security (regression from `83a3143`) | before the fold only a modifier that folds to no letter (`ﾞ`) is a space; `ʰ ˣ ᴹ` fold to their letter | `9914a01` |
| A look-alike multiplier ended only at a non-letter, so a CJK run glued to it hid it: `$9 М一一 up` kept while `$9 M一一 up` dropped; `3 тімеѕ一一`, `ѕіх一一` — the CJK run made the whole run one non-Latin word | security (older) | look-alike words are read within runs of Latin, Cyrillic and Greek letters; a look-alike multiplier ends at any other letter; Latin variants read as their letter anywhere (`$9 ᴍ一一`) | `9914a01` |

4 more mutations fail a test (one first survived — the test's facts lacked a lower-case
`х` — and was pinned). Three live calls kept 5 of 5 lines each. Accepted: the look-alike
rule has no `&` exemption (`9 К&C` drops — stricter only).

## Pass 21 — at `a336919`

**Verdict: not ready — two regressions of mine.** No honest-line regression (nine probes
byte-identical to pass 20). A new scan compared every code point as a two-character or
mixed run next to each multiplier kind, and inside number words, against `94c7153`.

| Finding | Kind | Resolution | Commit |
|---|---|---|---|
| `\p{Script=…}` classes include symbols, so a Greek or Cyrillic symbol joined a look-alike word or continued a look-alike multiplier: `9 К͵ up`, `$9 М͵ up`, `3 тімеѕ͵`, `ѕіх͵`, `$9 ММ͵` (also `꙳ ҂ ϶ ꙾`) — the Latin twins dropped | security (regression from `9914a01`) | letters only in script runs and edges; a look-alike multiplier continues only into an ASCII letter or digit or a Cyrillic or Greek letter (`9 Кꞏup`, `9 Кʱ up` now drop too) | `9522e3d` |
| `LATIN_VARIANTS` was looked up in exact case: `TWƐNTY`, `SEVEŊ`, `THƦEE`, `twℇnty` kept | security (regression from `9914a01`) | either case | `9522e3d` |

5 more mutations; one survived — applying the Latin variants on the look-alike path, which
the new continuation rule makes redundant — and that call was removed. Of four live calls,
three kept 5 of 5 lines; one failed on a network reset at the provider (502, as intended).
Accepted: a superscript at a word's edge folds into the word, as AC-7 reads (`3 timesˢ`).

## Pass 22 — at `fa99f0f`

**Verdict: not ready — two older asymmetries.** `9522e3d` broke nothing: every honest and
attack probe byte-identical to passes 20 and 21. A twin scan (each code point beside a
Latin multiplier and its look-alike twin) found two places where the twins differed.

| Finding | Kind | Resolution | Commit |
|---|---|---|---|
| A look-alike word glued to a non-ASCII Latin letter stayed Cyrillic — "mixes Latin" checked only `[a-z]`: `$9 ММł up`, `ѕіхł`, `3 тімеѕß`; `3 тімеѕᶴ` (`ᶴ` folds to `ʃ`, a regression from `9914a01` that pass 21 missed) — the Latin twins dropped | security | any Latin letter makes a mixed word | `a8b2be4` |
| The apostrophe exemption after a look-alike multiplier accepted any letter: `$9 М'up`, `9 К'up`, `3 х’the most` — only the start of a Cyrillic word is meant (`М’яке`) | security | an apostrophe and a Cyrillic letter only | `a8b2be4` |

2 more mutations fail a test; three live calls kept 5 of 5 lines each. Accepted: capital
variants glued after a multiplier (`3 timesŊŊ`, as ASCII `timesnn`), `3 тімеѕλ`
(Cyrillic+Greek), Latin-side rules that are stricter than AC-7 (`9 K-ж`).

## Pass 23 — at `ed1d84b`

**Verdict: not ready — one twin.** `a8b2be4` broke nothing: 34 probe outputs byte-identical
to pass 22; scan21 against `fa99f0f` (2.3M substitutions) keeps nothing new. A new probe of
728 lines mixing Polish, Czech, Turkish, Vietnamese and other Latin-diacritic titles with
Cyrillic words drops nothing honest; its 17 new drops are mis-typed words the spec drops
(`Мөхəммəт` with a Latin `ə`, `в'ïзд` with a Latin `ï`).

| Finding | Kind | Resolution | Commit |
|---|---|---|---|
| `$9 М’ѕ up` (renders as "$9 M’s up") kept while its Latin twin dropped: the apostrophe exemption saw a Cyrillic `ѕ`, and the look-alike reading split the word at the apostrophe | security (older) | an apostrophe between letters is inside the word for the look-alike reading: `М’ѕ`, only look-alikes, reads as `m’s`; `М’яке` stays Ukrainian | `24f44b8` |

2 more mutations fail a test. The digest suite and three live calls were re-run cleanly
after the mutation run (an earlier run had overlapped with it): 26 tests, three calls 5 of
5. Accepted: a rare honest word made only of look-alikes with an apostrophe after a digit
(`3 в'їхав`) now drops.
