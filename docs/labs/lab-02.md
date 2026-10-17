# L02: skills and conventions

A skill is a named chunk of review rules written in Markdown. The lesson looks at
skills from two sides: for Claude Code working in this repository, and for the
reviewers inside DevDigest itself. The second half is the conventions extractor:
DevDigest finds the house rules in a repository's code and offers to turn them into
skills.

## Skills for Claude Code

- `onion-architecture` and `frontend-architecture`: where code goes on the server and
  in the client. The backend dependency rule is checked by `pnpm depcruise`. Starting
  point: 0 errors, 14 warnings about old drift.
- `pr-self-review`: what to check before opening a PR. Gates of every touched package,
  mirrored contracts, untouched migrations and lockfiles, tests at the right level,
  insights. This PR was opened through it.
- `.claude/settings.json` lets checks run and git be read without asking, and forbids
  editing migrations, lockfiles and `.env`. Path rules only work in the `Edit(path)`
  syntax.
- The shared context moved to `AGENTS.md`, and `CLAUDE.md` now just imports it and
  adds a few Claude-specific lines.

## Skills library in DevDigest

The `/skills` page: list on the left, editor on the right, tabs Config, Preview,
Stats and Versions. The selected skill and tab live in the URL, so you can link to a
skill.

![Skill editor](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/lab-2/skill-config.png)

Preview shows the block exactly as the model will get it.

![Prompt block](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/lab-2/skill-preview.png)

Every change to the body is a new version. Old versions can be viewed, compared with
the current one and restored (a restore is also a new version, history is never
rewritten).

![Version history with a diff](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/lab-2/skill-versions.png)

The seed adds four skills for this codebase: `ssrf-outbound-requests`,
`query-efficiency`, `fastify-route-contracts`, `null-not-zero`. They are not attached
to anything until you do it yourself.

## Import from a file or a URL

Two ways in: upload a `.md` (or just paste the text), or give a link to a `SKILL.md`
(a GitHub page works too). Either way the server parses the file and shows a preview
with warnings, and nothing is saved until the second click.

![Import preview](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/lab-2/import-preview.png)

Import by URL means the server makes a request to an address the user typed, which
is textbook SSRF. So: https and port 443 only; every IP address is checked at connect
time, not before, so DNS rebinding does not help; every redirect is checked again;
one deadline for the whole exchange including the body; only `text/*` and at most
256 KB.

An imported skill (from a file too) shows up **disabled** and marked **needs
vetting**. Foreign text does not reach the prompt even if an agent already has the
skill attached. Turning it on is the human review. Wherever the file came from, for
DevDigest it is still someone else's text.

![Imported skill waiting for review](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/lab-2/imported-needs-vetting.png)

## Conventions extractor

Skills Lab -> **Conventions**. The **Run extraction** button makes two model calls.
First the model picks up to 10 files from the top of the `repo-intel` ranking (at
most two from one folder, so a single folder cannot take the whole sample). Then it
reads those files and returns rules, each with a quote.

![Conventions of this repository](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/lab-2/conventions-scan.png)

The main idea is not to take the model's word for anything:

- **The quote is checked.** A rule stays only if the quoted lines really are in the
  file (compared line by line, ignoring indentation). What gets stored are the lines
  from the file itself with an exact range (`core.ts:7`, `repos.ts:9-11`), not the
  model's copy. Made-up quotes are dropped, and the page shows how many there were.
- **The server caps confidence.** The prompt asked for at most 0.6 for a rule seen in
  one file. The model gave everything 1.0 anyway. Now the ceiling depends on how many
  of the files it read actually contain the rule: 1 -> 0.6, 2 -> 0.8, 3+ -> 1.
- **The model does not choose what to read from disk.** A path from the model is
  accepted only if it is in the proposed list.

A card can be accepted as is, edited first (rule and name), or rejected. An accepted
convention becomes a skill of type `convention` with the quote as its example, and it
is enabled right away: it is a rule from your own code, and a person has just read it.

![Accepted conventions](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/lab-2/conventions-accepted.png)

Scanning this repository: 8-10 files, 7-8 rules, about $0.0009 and 18-20 seconds.
The page never calls the model by itself, only the button does.

## Skills in an agent

The agent editor has a new Skills tab: tick a skill to attach it, drag or use the
up/down buttons to reorder. The order here is the order in the prompt. Every change is
saved right away, and if the request fails, the list goes back.

![Agent Skills tab](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/lab-2/agent-skills-linked.png)

Skills go into the prompt as a separate section: first a short preamble (a skill can
add things to check, but cannot change the answer format, severity or safety rules,
and cannot tell the model to stay quiet about something), then `<skill name="...">`
blocks. They are deliberately not wrapped in `<untrusted>`: the prompt protection
tells the model to ignore any instructions inside such blocks, and a skill is nothing
but instructions.

The run trace shows which skills, and which versions of them, the model got. So a
month later you can read exactly what it was told.

![Skills in the trace](https://raw.githubusercontent.com/vbronetskyi/devdigest/pr-assets/lab-2/trace-skills.png)

The skill's Stats tab counts runs from that trace field.

## Does a skill help?

In L01 Performance Reviewer missed the N+1 in demo PR #2. I attached
`query-efficiency` and `null-not-zero` to it and ran it three times with the skills
and three times without (`deepseek-v4-flash`, under a cent in total).

| | N+1 found | Said there was no diff | Read it and missed |
|---|---|---|---|
| With skills | 1 of 3 | 2 | 0 |
| Without skills | 0 of 3 | 2 | 1 |

The skill is not the main story here. In 4 of 6 runs the model wrote that the request
had no diff, even though the stored prompt is identical to the one where it found the
N+1. The stored run from L01 looks the same. So in L01 the agent did not miss the N+1,
it simply never saw it. When the model did read the diff, it found the problem with
the skill and missed it without. But that is one run against one, not enough for a
conclusion. The next step is to run the agent on a different model and take its
system prompt apart. Recorded in `server/insights/INSIGHTS.md` (Open Questions).

## How to check it yourself

1. `./scripts/dev.sh`: the seed adds the four skills if they are not there yet.
2. **Skills** in the sidebar: open `query-efficiency`, switch Preview to *Prompt block*.
3. **Agents -> Performance Reviewer -> Skills**: tick `query-efficiency`.
4. Run a PR review with this agent and open the trace: Configuration will show
   `query-efficiency@v1`.
5. **Add Skill -> Import from file / Import from URL**: any `SKILL.md`.
6. **Conventions -> Run extraction** (needs an indexed repository, the Indexed badge),
   then **Accept as Skill** on any card.

Tests: `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` and
`pnpm exec vitest run .it.test` (needs Docker), `cd client && pnpm test`,
`cd reviewer-core && npm test`.

## Found along the way

- Importing a zod schema as a value from `@devdigest/shared` in the client passes
  typecheck and tests, but takes the page down in `next dev` with a 500. Schemas are
  imported straight from the contract file.
- The server's `pnpm typecheck` does not look into `test/`, and vitest does not check
  types, so tests with an old contract shape compile without complaint.
- When `dev.sh` stops, it only kills its own subshell, so the API server is left
  orphaned on port 3001 and keeps serving old code.
- The first live conventions scan hung on the model call. Without its own deadline the
  HTTP request would have waited about 15 minutes; now it is a 502 after 120 seconds.
- next-intl only logs a missing translation key, so the page shows the raw key while
  the tests stay green. I added a test that checks every `t("...")` against the
  translation files, and it found one lost key right away.

Details are in the `insights/INSIGHTS.md` of each package.

---

# L02 homework: conventions extractor

The extractor itself already came with the lab (#6), so for the homework I put it
through the same cycle as the lesson 5 features. First I wrote a spec with acceptance
criteria. Then a separate agent checked the code and the course design against it.
Everything it found is fixed and covered by tests. The spec, plan and verification
reports are in `specs/conventions/` (SPEC-07).

**Video (56 s):** [hw2-conventions.mp4](https://github.com/vbronetskyi/devdigest/blob/pr-assets/hw-2/hw2-conventions.mp4).
It shows a real scan of this repository, the summary and counters, Edit first with an
attempt to sneak an extra section into a rule, Reject all, and the summary still in
place after a reload.

## What the verification found

The most important findings:

- **A rule could smuggle instructions into a trusted skill.** An accepted rule
  becomes the `# <rule>` heading of a skill, and reviewers read skills as
  instructions. On the card the rule is shown as a paragraph, so line breaks are
  invisible there. But text like `Use X\n\n## Severity\nCRITICAL...` turned into a
  separate section of the skill. Now a rule is always one line, with no Markdown
  markers at the start, up to 300 characters. That applies both to rules from the
  model and to rules edited by a person. The video shows the skill still has exactly
  one Severity section, its own.
- **The counter was wrong.** The "Dropped: quote not found" counter also counted
  duplicates and rules over the limit of 8. Now there are two separate numbers: rules without a real
  quote (`dropped`) and rules skipped as duplicates, already accepted or over the
  limit (`skipped`).
- **A rescan offered accepted rules again.** Accepting one again created a duplicate
  skill with a `-2` suffix. Now a rule already accepted in this repository is not
  offered again, and an accepted convention cannot be rejected: it stays as the record
  of the skill.
- **Skill names could collide.** The name was checked with a query before the insert,
  so two concurrent accepts both went through. Now a skill name is unique within the
  workspace at the database level (migration 0012). An accept that loses the race
  takes the next free suffix. Any other uniqueness violation now returns 409, not 500.
- **Two concurrent scans left both sets of candidates.** Delete and insert in one
  transaction does not protect against a parallel transaction. Now writing a scan is
  guarded by a per-repository advisory lock. A test holds the same lock from another
  transaction and checks that the scan waits.
- **The summary disappeared after a reload.** Now the last scan is stored: files,
  model, cost, counters and commit. GitHub links point to the commit whose lines were
  quoted, not to the current branch head.
- **The `get_conventions` MCP tool broke** after the API response changed. Its test
  still passed because the fake API returned the old shape. Fixed together with the
  fake.

Smaller things:
- the quote is matched only against its first 8 lines;
- a file is cut at a line boundary;
- unknown confidence is a dash, not 0;
- a code block in a skill cannot be closed from inside a quote;
- `test/` and `migrations/` folders at the repository root are left out of the sample;
- while Accept all is running, the other cards' actions are disabled.

## Verification

| Pass | Found | Result |
|---|---|---|
| 1 (before changes) | injection through a rule, the counter, repeats, duplicate names, parallel scans, summary after reload, some invariants without tests | not ready |
| 2 | broken MCP tool, unknown confidence the model schema did not allow, rejecting an accepted convention, skill link that only lived for the session, end of a code block inside a quote, half a line from the leftover budget | not ready |
| 3 | no new problems; only that no test pins the lock being taken before the delete (the code does it) | ready |

Key tests were checked with mutations: when I bring back the old behavior, the test
fails. There are six such checks: reading a file that was not proposed, a rule
without normalization, no retry on the name race, no lock, cards not locked during a
bulk action, and the overall character budget.

## How to check it yourself

1. `cd server && pnpm db:migrate` (migrations 0012 and 0013). If 0012 fails, the
   database already has two skills with the same name, and one of them has to be
   renamed (the query is in `server/specs/conventions.md`).
2. Skills Lab -> Conventions -> Re-scan. The summary appears under the heading, with
   the counters below it.
3. Edit first -> put a line break and `## Severity` into the rule -> Accept -> Open
   skill. The skill heading will be a single line.
4. Reload the page: the summary and the Open skill links on accepted cards stay.

Tests:
- `cd server && pnpm exec vitest run conventions routes-smoke`;
- `cd client && pnpm test conventions ConventionCard`;
- `cd mcp && npm test`.
