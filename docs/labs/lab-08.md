# L08 homework: Agent Performance and Weekly Digest

Two pages that answer a team lead's questions rather than a PR author's. **Agent
Performance** shows which reviewers are actually useful: how many runs, what they cost,
how long they take and what share of their findings people accept. **Weekly Digest**
puts a week of reviews in one place: what was reviewed, what was found, what is still
waiting for a person and what it all cost. It can be copied into the team channel.

Both features went through the same SDD cycle as in lesson 5. First a spec with
acceptance criteria. Then an independent review of the spec by another model, a plan,
the code, and passes checking the code against the spec until the check said ready:
SPEC-05 needed four of them, SPEC-06 twenty-four. Specs, plans with a criterion -> test
-> commit matrix and verification reports are in `specs/agent-performance/` (SPEC-05)
and `specs/weekly-digest/` (SPEC-06).

**Video (73 s):** [hw8-performance-digest.mp4](https://github.com/vbronetskyi/devdigest/blob/pr-assets/hw-8/hw8-performance-digest.mp4):
the agent cards and table for 7 / 30 / 90 days, an agent's latest runs with a jump into
the PR, the cost breakdown. Then the digest: a real model call on Rewrite, the jump
from an open critical finding into the diff, neighboring weeks and copying as Markdown.

## Agent Performance (SPEC-05)

`GET /agents/performance?days=7|30|90` computes everything in SQL from what is already
stored. No model is called. A few decisions worth knowing:

- **A window is calendar days in UTC**, today included. The previous window is the same
  number of days before it. Only `done` and `failed` runs count. Runs that got stuck
  during a restart are marked `failed` by the server on startup, so they end up in the
  stats too.
- **Cost only covers finished runs.** A failed run records no cost. If no run has a
  cost, the page shows a dash, not $0.
- **Accept rate is pooled, not an average over agents.** The course mockup averages
  three agents (78, 64, 41 -> 61%). Here accepted findings are divided by all resolved
  ones, so an agent that does more work weighs more. A trend is shown only when both
  sides have at least 5 decisions and the rate moved by more than one point. Otherwise
  the row is marked low sample.
- **Deleted agents** are folded into one deleted agent row. Their runs count towards
  the totals, but that row never becomes the most active one.
- **Fractions of a cent are visible.** On deepseek-v4-flash a run costs about $0.0006.
  A `<$0.01` format would show the same number in every row. So the page uses the
  app's cost format: three significant digits.

Every unknown value is a dash with a reason: no cost, nothing resolved, the run failed,
all of the agent's runs failed. The reason shows on hover, and a screen reader reads it
out. An agent row expands into its five latest runs, and each one leads to the Agent
runs tab of its PR.

## Weekly Digest (SPEC-06)

`GET /digest?week=2026-W42` returns one ISO week (Monday to Sunday, UTC). It has:
- how many PRs were opened and reviewed;
- runs and their cost;
- new findings by severity;
- decisions made this week.

The current week is compared with the same stretch of the previous one: a Wednesday is
compared with Monday to Wednesday, not with the whole week. Open critical findings come
from the latest run of each agent on each PR. So a finding that a newer run no longer
confirmed does not show up in the digest.

**Highlights** are up to five lines from the model. They appear only after a button
press, and opening the page does not call the model. The model gets the week's facts as
text and sees nothing else. The server checks every number in every line:
- the number has to be one that DevDigest itself named;
- numbers from PR titles, finding titles and paths do not count, because that text
  comes from outside;
- forms like `10k`, `3rd`, `3 times`, `doubled`, `twice` are rejected;
- before the check the line is cleaned: Markdown emphasis, invisible and control
  characters are removed, and a non-ASCII character is allowed only if it appears in
  the facts. That way a Ukrainian PR title can be quoted, but `４２` or a Cyrillic `х`
  instead of `x` cannot be slipped in.

A line with a made-up number is thrown out. If no line is left, the request returns
502, and the saved lines stay. When the week's facts change, the page marks the
highlights as stale.

**Copy as Markdown** puts the digest on the clipboard. Every number there comes with
last week's value and the change, and every critical finding with its PR, file:line and
agent. Text that came from outside is escaped: `@channel`, `#12`, `GH-12` and `<!here>`
ping nobody, and URLs and domains stay in a code span so the channel does not turn them
into links.

## What the verification found

The checks were done by separate agents (Opus, read-only), one per spec. They compared
the code with the spec, ran the tests and looked for code changes the tests would not
notice. After every pass I fixed the spec (if behavior changed), the code and the tests,
and then started the next pass. This went on until the agent said ready. The full log
with commits is in `specs/*/verification.md`.

**SPEC-05, four passes.** The numbers were right from the start. The problems were in
the UI and the tests:
- **A screen reader read the agent table as buttons without cells.** Expanding was done
  with `button role="row"`. Now it is a regular `<table>`, and a separate button with
  `aria-expanded` in the agent cell does the expanding.
- **Some dashes had no reason or the wrong one.** The cost card said there was no cost
  for the previous 30 days when it was this window's cost that was unknown.
- **An agent's color in the cost breakdown changed between windows.** It took three
  attempts to make it stable:
  1. The color depended on the slice position.
  2. Then the deleted agent slice shifted it when it appeared or disappeared.
  3. Finally it turned out that two palette tokens were the same blue and gray.

  Now there are six distinct chart colors. A test reads `styles.css` and checks that in
  both themes the colors are different, not gray and not close to each other.
- **More than twenty code changes passed all the tests**, for example:
  - the latest runs in reverse order;
  - another workspace's runs in the deleted agent row;
  - the cost of a cancelled run in the breakdown;
  - an unknown cost replaced with zero.

**SPEC-06, twenty-four passes, almost all about checking numbers.** The rule is simple:
a number in a highlights line has to be one that DevDigest named. But a number in text
can look like anything, and almost every pass found a new way to sneak a made-up one in:
- **Notation:** `-42`, `.95`, `10k`, `3rd`, `1_000`, `9 000`, `9٬000`, `$.0049 M`.
- **Invisible and look-alike characters:**
  - a zero-width character between digits;
  - keycaps `4⃣2⃣`, and also `④②` and `四十二`;
  - Korean filler characters `ㅤ`;
  - superscript `tʷenty` and small caps `ᴛᴡᴇɴᴛʏ`.
- **Markdown and HTML:**
  - emphasis like `**3** times`;
  - `3&*times;`, which after cleanup became `3&times;`, and GitHub rendered it as `3×`;
  - GitHub math `$9 . 26)$`.
- **Look-alikes:** a Cyrillic `х` instead of `x`, `$9 ММ` made of Cyrillic `М`, and
  `$9 М’ѕ up`, which looks like `$9 M's up`.

In the end, rules based on Unicode properties worked where character lists did not:
- The line is first cleaned of emphasis and invisible, control and combining characters.
- Any non-ASCII character other than Latin letters and ordinary typography has to be in
  the facts. So a new class of characters does not need a new rule.
- Digits separated only by spaces or by characters that are not letters count as one
  number.
- Between a digit and a multiplier there can be any dash, bracket or quote by Unicode
  category, and a multiplier ends at anything except an ASCII letter or digit.
- Look-alike Cyrillic and Greek letters are read as Latin only in words where the
  alphabets are mixed, or in words made entirely of look-alikes.

The hardest part was not breaking legitimate lines. Several of my own fixes turned out to be
regressions, and the next pass caught them:
- mapping `з` to the digit 3 rejected the title `Виправити обробку помилок` (fix error handling);
- the rule that turned letters of other scripts into spaces rejected `修复3个x轴标签`;
- superscript letters stopped folding into regular ones.

So every pass also ran sets of legitimate lines and compared them with the previous commit:
hundreds of real titles in Ukrainian, English, Japanese, Chinese, Korean, Polish and
other languages, in different line shapes, over 5 000 lines in total. In the end only
the lines the spec rejects are rejected, for example an unquoted `PR #3 В CI...`. The
tests contain over 400 made-up lines, and none of them gets through.

Other things found in the digest:
- **Numbers from PR titles became allowed.** A PR titled `Handle 250 rows` made it
  possible to write `250 runs`. Now allowed numbers come only from the facts without
  outside text.
- **Markdown brought links back.** The server hid URLs in a code span, and the copy
  escaped the backticks.
- **An unknown change was shown as no change.** Now it is a dash with a reason.
- **The model's answer could land on the wrong week** if you switched to another week
  while the request was running.
- **`0026-W42` returned data for 1926, and `0001-W01` a 500 error.** Now weeks before
  1970 return 422.

Left as is on purpose, and written down in the specs:
- The current week's highlights go stale on Monday, because the comparison switches to
  the whole previous week.
- `reviews.run_id` is not unique in the schema, but the executor writes one review per
  run.
- An identifier from a PR title (`250k`) can be quoted as is.

## Verification

| Package | Result |
|---|---|
| server | typecheck ✓ · depcruise 0 errors (14 warnings, same as before) · unit 259 ✓ · integration 100 ✓ |
| client | typecheck ✓ · 181 ✓ |
| mcp | typecheck ✓ · 12 ✓ |

- **Mutations.** Every verification finding is pinned by a test, and mutations confirmed
  that the test fails when the old behavior comes back:
  - SPEC-05: 41 changes, all caught;
  - SPEC-06: 168 changes, all caught.
- **Load.** A test fills the database with 10 000 runs and 50 000 findings. The median
  response is 13 ms for 90-day performance and 15 ms for the digest, against a spec
  limit of 1 s. A separate index on `findings.review_id` is not needed at these numbers.
- **Live runs.** After every tightening of the check I made three model calls for
  2026-W42 (deepseek-v4-flash), $0.0001-0.0003 per call. 81 succeeded in total:
  - 80 kept 5 of 5 lines;
  - one kept 4, and the rejected line is not visible through the API.

  So the check does not cut legitimate lines. Five more calls failed on the provider side:
  - three hit the 60-second deadline because the provider was slow at the time;
  - one broke on a network error;
  - one did not answer within the client's 90 seconds of waiting, and the server log
    for that moment was no longer around.

  In the known cases the server answered 502 as intended, and the saved lines stayed.

## How to check it yourself

1. `cd server && pnpm db:migrate`: migrations 0016 (indexes) and 0017 (`digest_highlights`).
2. Run reviews on a few PRs, accept or reject some findings.
3. In the sidebar, GLOBAL group -> **Agent Performance** (`g m`). Switch between 7 / 30 /
   90 days, expand an agent, open a run.
4. **Weekly Digest** (`g w`) -> **Write highlights**. The model and the cost show up
   under the lines. After a new review the page marks the highlights as stale.
5. **Copy as Markdown** and paste into any Markdown editor.

Tests:
- `cd server && pnpm exec vitest run performance digest`;
- `cd client && pnpm exec vitest run src/app/agent-performance src/app/digest src/lib/hooks/digest`.
