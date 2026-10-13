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

const MIGRATION = /(^|\/)migrations?\/[^/]+\.(sql|[cm]?[jt]s|py)$/i;
const SCHEMA = /(^|\/)(schema\.prisma|db\/schema(\/[^/]+|\.[cm]?[jt]s))$/i;
const MANIFEST = /(^|\/)(package\.json|requirements[^/]*\.txt|pyproject\.toml|go\.mod|Cargo\.toml|Gemfile|composer\.json)$/;
const LOCKFILE = /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?|poetry\.lock|go\.sum|Cargo\.lock|Gemfile\.lock|composer\.lock)$/;
const SECURITY_PATH = /(^|[/._-])(auth|authn|authz|session|sessions|secret|secrets|token|tokens|password|passwords|permission|permissions|crypto|oauth|jwt|csrf|cors)([/._-]|$)/i;
const ENV_FILE = /(^|\/)\.env(\.[\w-]+)?$/;
const CI_WORKFLOW = /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/;
const ROUTES = /(^|\/)(routes?|controllers?|handlers?|api)(\/[^/]+)?\.[cm]?[jt]sx?$|(^|\/)(routes|api)\/.+\.[cm]?[jt]sx?$/i;
// Public contracts only — a database schema is a db_migration signal, not an API one.
const CONTRACT = /(^|\/)contracts?\/.+\.(ts|json|ya?ml)$|(^|\/)(openapi|swagger)[^/]*\.(json|ya?ml)$|\.(proto|graphql|gql)$/i;

const isTest = (path: string) => /(^|\/)(test|tests|__tests__|e2e)\/|\.(test|spec)\.[cm]?[jt]sx?$/.test(path);

/** AC-1: risk signals by rules from the changed files; at most one signal per kind and severity. */
export function riskSignals(files: readonly ChangedFile[]): RiskSignal[] {
  const out: RiskSignal[] = [];
  const add = (kind: SignalKind, severity: RiskSeverity, title: string, reason: string, matched: ChangedFile[]) => {
    if (matched.length > 0) out.push({ kind, severity, title, reason, files: matched.map((f) => f.path) });
  };
  const code = files.filter((f) => !isTest(f.path));

  add('db_migration', 'high', 'Database migration', 'A migration runs against every environment; it must be safe on real data and reversible.', code.filter((f) => MIGRATION.test(f.path)));
  add('db_migration', 'medium', 'Database schema changed', 'The schema definition changed; check the generated migration and every query on the touched tables.', code.filter((f) => SCHEMA.test(f.path) && !MIGRATION.test(f.path)));

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
