# Spec: conventions extractor

Finds a repository's house rules from its own code and lets a maintainer turn
each one into a `convention` skill. Module: `src/modules/conventions/`. Feature spec
with acceptance criteria: `../../specs/conventions/spec.md` (SPEC-07).

## Scan — `POST /repos/:id/conventions/extract`

Runs only on an explicit request (two paid model calls; 5 per minute).

1. **Candidates.** `repoIntel.getConventionSamples(repoId, 40)` — top-ranked files
   without tests, configs and migrations (also at the repository root). Empty (repo
   not indexed, or repo-intel off) → `409 repo_not_indexed`.
2. **Model.** The workspace's Settings choice for `conventions`; otherwise the
   registry default (`FEATURE_MODELS`), and when that provider has no key,
   OpenRouter with `deepseek/deepseek-v4-flash`.
3. **Step 1 — `ConventionFileSelection`.** The model gets the candidate paths and
   picks up to 10. Only offered paths survive, at most 2 per folder. Nothing
   usable → the same rule applied to the candidates in rank order.
4. **Read.** The picked files are read from the local clone, each cut at the last
   line break within 8 000 chars (60 000 total), and the clone's head commit is
   noted. Paths never come from the model's free text, only from the offered list.
5. **Step 2 — `ConventionExtraction`.** Files go in `wrapUntrusted` blocks labelled
   `file:<path>` (quotes and angle brackets in the path replaced; the closing marker
   defused in any case). Per convention the model returns `rule`, `evidence_path`,
   `evidence_snippet`, `also_seen_in`, `confidence`.
6. **Rule.** `normalizeRule`: one line, leading Markdown markers removed, at most
   300 chars cut at a word. The rule becomes a skill's heading later, so it must not
   carry sections of its own.
7. **Grounding.** A convention survives only if its file was read and the first 8
   non-blank lines of its snippet are found there line by line (whitespace
   collapsed, blank lines skipped, at least 12 characters). The stored snippet is
   the file's own lines for that range, dedented, and `evidence_path` becomes
   `path:start-end` (`path:line` for one line). Otherwise it counts as `dropped`.
8. **Repeats.** A rule equal (case/space-insensitive) to an earlier one of the pass
   or to an accepted convention of the repo, and anything past 8, count as
   `skipped`.
9. **Confidence** is the model's number capped by how many read files the model
   says show the rule (cited file + `also_seen_in` paths that were read): 1 file →
   0.6, 2 → 0.8, 3+ → 1; null when the model gave no number. `also_seen_in` is the
   model's claim, not checked.
10. **Store.** Under `pg_advisory_xact_lock(hashtext('conventions:<repoId>'))`, in one
    transaction: pending candidates of the repo are replaced (accepted stay), each
    with the commit it was read at, and `convention_scans` gets the scan record (files,
    model, cost, dropped, skipped, commit, time). At most 8 per pass, highest
    confidence first, unknown last.

Each model call has a 120 s deadline (`CALL_DEADLINE_MS`) → `502` with a message.
The deadline frees the request; it does not abort the provider call (see
`reviewer-core/insights` on the SDK timeout).

Response `ConventionExtraction`: `candidates` (everything stored for the repo),
`sampled_files`, `dropped`, `skipped`, `model`, `cost_usd` (sum of both calls;
`null` if either reported none), `scan` (the stored record).

## Review

| Endpoint | Behaviour |
|---|---|
| `GET /repos/:id/conventions` | `{ candidates, last_scan }` — accepted first, then by confidence (unknown last); the last scan or null |
| `POST /conventions/:id/accept {rule?, name?}` | creates the skill and marks the candidate accepted in one transaction (row locked) — `201` |
| `DELETE /conventions/:id` | reject = delete a pending candidate; an accepted one → 409 `already_accepted` (it is the record of a skill) |

Accept details:

- Skill: `type: convention`, `source: extracted`, enabled, version 1,
  `evidence_files: [path]`. Body: the rule (`normalizeRule`, edited or not; empty
  after it → 422 `invalid_rule`) as a heading, what to flag and not to flag,
  severity (SUGGESTION, WARNING only if breaking it causes a bug), and the quoted
  example with its range.
- Name: the explicit `name` (409 if taken), or one derived from the rule (up to
  five meaningful words), suffixed `-2`, `-3`… until free. `skills (workspace_id,
  name)` is unique in the database: when a concurrent accept takes the derived name
  first, the accept is retried (3 attempts); for an explicit name it is a 409.
- Accepting twice → `409 already_accepted`.
- The accepted row keeps `skill_id` (migration 0013), so the page links the skill after
  a reload.

Migration 0012 creates the unique index on `skills (workspace_id, name)`. A database
that already has two skills with one name in a workspace fails it; rename one first:

```sql
select workspace_id, name, count(*) from skills group by 1, 2 having count(*) > 1;
```

## Invariants

- No scan without a request; opening the page reads stored rows only.
- Every stored snippet exists verbatim (modulo indentation) at its stored range
  in the file as it was read, at the stored commit.
- A rule stored or turned into a skill is one line of at most 300 characters.
- A model cannot make the server read a path it was not offered.

Tests: `test/conventions-helpers.test.ts`, `test/conventions.it.test.ts`.
