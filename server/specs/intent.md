# Spec: PR intent (L03 intent layer)

What a PR is for and where it stops, derived before the review and given to
every reviewer. Code: `src/modules/reviews/intent.ts`, table `pr_intent`.

## Derivation

- One structured call, schema `PrIntent`: `intent` (one sentence),
  `in_scope` / `out_of_scope` (≤ 5 short items each; out of scope only when the
  description or diff makes it clear).
- Model: the workspace's Settings choice for `review_intent`; else the registry
  default; when that provider has no key, OpenRouter
  `deepseek/deepseek-v4-flash`.
- Input: PR number, title, description, the issues and plans the description
  links to, changed files with +/−, and the hunk headers (file + `@@ … @@ context`,
  ≤ 120). Not the diff body: the intent is about purpose, the body is the
  reviewers' job, and leaving it out keeps the call small. Every part sits in its
  own `<untrusted>` block.
- Links (`intent-context.ts`): `#12`, `acme/api#12` and same-repo issue/PR URLs are
  read with `GitHubClient.getIssue`; same-repo blob URLs and relative `*.md|mdx|txt|yml`
  paths are read from the clone (no `..`, no absolute paths). At most 5 are read,
  8 s each, 2 000 chars each. Anything that cannot be read — a 404, a missing or empty
  file, another repo or site (never fetched), over the limit — becomes a gap: it is
  listed in the prompt under `## Unavailable context` and the system prompt says not
  to guess what it says.
- Output is trimmed and capped (intent 300 chars, items 160 chars, 5 items,
  duplicates and blanks dropped) before it is stored.
- 90 s deadline (`withDeadline`); the provider request is not aborted.

## Storage and freshness

One row per PR: `intent`, `in_scope`, `out_of_scope`, `sources` (what it rests on:
`title`, `description`, each linked label, `changed files`, `hunk headers`),
`missing_context` (the gaps, as `"<link> (<reason>)"`), `head_sha`, `model`,
`cost_usd`, `created_at`. A row whose `head_sha` differs from the PR's head is
stale: the next review derives again and replaces it.

## In a review run

After the diff loads, once for all agents of the run: use the stored intent if
it matches the head, otherwise derive it. The log says `intent: cached for <sha>`
or `intent: derived with <model> ($cost)`, then for a derivation
`intent prompt: title 13 ch, description 210 ch, linked #12 640 ch, … · ~420 tokens`
(the tokenizer's count over both messages), and in both cases
`intent sources: …` and, when there are gaps, `intent missing context: …`. Any failure logs
`intent: unavailable (…) — reviewing without it` and the run continues.

reviewer-core renders it under `## PR intent (derived … — unverified)` inside
`<untrusted source="intent">`, with a `Derived without (unreadable, do not assume
what they say)` list when there are gaps; the injection guard states that derived intent
and scope never reduce what gets reported. The trace keeps the block in
`prompt_assembly.intent`.

## API

| Endpoint | Behaviour |
|---|---|
| `GET /pulls/:id/intent` | `{ intent: PrIntentRecord \| null }` — no model call |
| `POST /pulls/:id/intent` | derive now for the current head (one call; 10/min) → `{ intent }` |

## Cost

The derivation's cost is stored on `pr_intent.cost_usd`. It is not added to any
run's `cost_usd` (it is shared by all agents of the run and reused by later
runs), so the PR list total covers reviewer calls only.

Tests: `test/intent-helpers.test.ts`, `test/intent.it.test.ts`.
