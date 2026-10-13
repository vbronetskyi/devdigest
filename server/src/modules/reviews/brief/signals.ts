import type { HistoryCommit, PrHistoryItem, RiskSeverity } from '@devdigest/shared';
import { HISTORY_LIMIT } from './constants.js';
import { prNumberOf } from '../../_shared/pr-number.js';

export { prNumberOf };

/**
 * SPEC-03 — what code can tell about a PR's risk for free. A signal is a
 * deterministic fact ("a migration changed"), not a judgement; the model may
 * explain, merge or rank them, and the skeleton brief shows them as they are.
 */

export type SignalKind = 'security' | 'db_migration' | 'breaking_api' | 'deps';

export interface RiskSignal {
  kind: SignalKind;
  severity: RiskSeverity;
  title: string;
  reason: string;
  files: string[];
}

export interface ChangedFile {
  path: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

// Anything under a migration folder, at any depth (Prisma nests one folder per migration).
const MIGRATION = /(^|\/)migrations?\/./i;
const SCHEMA = /(^|\/)(schema\.prisma|db\/schema([./].+)?)$/i;
const MANIFEST = /(^|\/)(package\.json|requirements[^/]*\.txt|pyproject\.toml|go\.mod|Cargo\.toml|Gemfile|composer\.json)$/;
const LOCKFILE = /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?|poetry\.lock|go\.sum|Cargo\.lock|Gemfile\.lock|composer\.lock)$/;
const SECURITY_PATH = /(^|[/._-])(auth|authn|authz|session|sessions|secret|secrets|token|tokens|password|passwords|permission|permissions|crypto|oauth|jwt|csrf|cors)([/._-]|$)/i;
const ENV_FILE = /(^|\/)\.env(\.[\w-]+)?$/;
const CI_WORKFLOW = /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/;
const SOURCE = String.raw`\.(?:[cm]?[jt]sx?|py|rb|go|java|kt|php|cs|rs)$`;
// A route / controller / handler by its file name (`routes.ts`, `user.controller.ts`,
// `users_controller.rb`) or any source file under `api/` or `routes/`.
const ROUTES = new RegExp(String.raw`(^|[/._-])(routes?|controllers?|handlers?)([._-][^/]*)?${SOURCE}|(^|/)api${SOURCE}|(^|/)(api|routes)/.+${SOURCE}`, 'i');
// Public contracts only — a database schema is a db_migration signal, not an API one.
const CONTRACT = /(^|\/)contracts?\/.+\.(ts|json|ya?ml)$|(^|\/)(openapi|swagger)[^/]*\.(json|ya?ml)$|\.(proto|graphql|gql)$/i;

// Test files in the languages the route rule knows: test folders, `*.test.*` / `*.spec.*`
// source files, Go `_test.go`, Python `test_*.py` / `*_test.py`, Ruby `*_spec.rb` /
// `*_test.rb`. Not a bare `spec/` folder or a `.spec.json`: an API spec lives there.
const isTest = (path: string) =>
  /(^|\/)(test|tests|__tests__|e2e)\/|\.(test|spec)\.(?:[cm]?[jt]sx?|py|rb|go)$|_test\.(go|py|rb)$|(^|\/)test_[^/]*\.py$|_spec\.rb$/.test(path);
const isMarkdown = (path: string) => /\.mdx?$/i.test(path);

/** Paths that make every PR "overlap" without telling anything (AC-3). */
const HISTORY_NOISE = /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?|Cargo\.lock|Gemfile\.lock|poetry\.lock|go\.sum|composer\.lock)$|\.mdx?$|(^|\/)migrations\/meta\//i;

/** AC-3/AC-6: the changed files worth a history lookup — no lockfiles, Markdown or migration metadata. */
export function historyPaths(paths: readonly string[]): string[] {
  return paths.filter((p) => !HISTORY_NOISE.test(p));
}

/** AC-1: risk signals by rules from the changed files; at most one signal per kind and severity. */
export function riskSignals(files: readonly ChangedFile[]): RiskSignal[] {
  const out: RiskSignal[] = [];
  const add = (kind: SignalKind, severity: RiskSeverity, title: string, reason: string, matched: ChangedFile[]) => {
    if (matched.length > 0) out.push({ kind, severity, title, reason, files: matched.map((f) => f.path) });
  };
  const code = files.filter((f) => !isTest(f.path) && !isMarkdown(f.path));

  const migrations = code.filter((f) => MIGRATION.test(f.path));
  const schemas = code.filter((f) => SCHEMA.test(f.path) && !MIGRATION.test(f.path));
  // With a migration in the PR, the schema files belong to that signal.
  add('db_migration', 'high', 'Database migration', 'A migration runs against every environment; it must be safe on real data and reversible.', migrations.length > 0 ? [...migrations, ...schemas] : []);
  if (migrations.length === 0) add('db_migration', 'medium', 'Database schema changed', 'The schema definition changed without a migration; check how it reaches the database and every query on the touched tables.', schemas);

  const manifests = code.filter((f) => MANIFEST.test(f.path));
  const lockfiles = code.filter((f) => LOCKFILE.test(f.path));
  add('deps', 'medium', 'Dependencies changed', 'A dependency manifest changed: new packages, versions or scripts reach every install.', manifests);
  if (manifests.length === 0) add('deps', 'low', 'Lockfile changed', 'The resolved dependency tree moved without a manifest change.', lockfiles);

  add('security', 'high', 'CI workflow changed', 'CI runs with repository secrets; a workflow change can expose them.', code.filter((f) => CI_WORKFLOW.test(f.path)));
  add('security', 'high', 'Auth or secrets code touched', 'The change is in code about authentication, sessions, secrets or permissions.', code.filter((f) => !CI_WORKFLOW.test(f.path) && (SECURITY_PATH.test(f.path) || ENV_FILE.test(f.path))));

  const api = code.filter((f) => ROUTES.test(f.path) || CONTRACT.test(f.path));
  add('breaking_api', 'medium', 'Public contract lines removed', 'Lines were removed from a route or contract file; existing callers may break.', api.filter((f) => f.deletions > 0));
  add('breaking_api', 'low', 'Public surface changed', 'A route or contract file changed; check callers and clients.', api.filter((f) => f.deletions === 0));
  return out;
}


/**
 * AC-3–AC-5: other PRs that touched these files, newest first. `merged` holds the
 * PRs DevDigest knows here as merged, with their titles — a number outside it (no
 * PR, or the upstream's numbering in a fork) is skipped.
 */
export function historyItems(commits: readonly HistoryCommit[], merged: ReadonlyMap<number, string>, exclude: number): PrHistoryItem[] {
  const out: PrHistoryItem[] = [];
  const seen = new Set<number>();
  for (const c of commits) {
    const n = prNumberOf(c.subject);
    if (n === null || n === exclude || seen.has(n) || !merged.has(n)) continue;
    seen.add(n);
    out.push({
      pr_number: n,
      title: merged.get(n)!,
      merged_at: c.date,
      author: c.author,
      files_overlap: c.files,
      notes: '',
    });
    if (out.length >= HISTORY_LIMIT) break;
  }
  return out;
}
