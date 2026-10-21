import type { IssueMeta, RepoRef } from '@devdigest/shared';

/**
 * What the intent call reads besides the title and description: the issues and
 * plan documents the description links to, and the shape of the diff (files and
 * hunk headers) — never the diff body. A link that cannot be read is reported as
 * a gap, so the intent says what it is missing instead of guessing.
 */

export const MAX_LINKS = 5;
export const MAX_LINKED_CHARS = 2_000;
export const MAX_HUNK_HEADERS = 120;
export const LINK_DEADLINE_MS = 8_000;

export type PrLink =
  | { kind: 'issue'; label: string; number: number }
  | { kind: 'file'; label: string; path: string }
  | { kind: 'external'; label: string };

export interface LinkedDoc {
  label: string;
  text: string;
}

export interface LinkedContext {
  docs: LinkedDoc[];
  /** Links the call could not read, as "<label> (<reason>)". */
  gaps: string[];
}

const ISSUE_REF = /(?:^|[\s(\[,;:])(?:([\w.-]+\/[\w.-]+))?#(\d{1,7})\b/g;
const URL = /https?:\/\/[^\s)<>\]"'`]+/g;
const MD_LINK_TARGET = /\]\(([^)\s]+)\)/g;
const BARE_DOC_PATH = /(?:^|[\s(`])((?:[\w.-]+\/)+[\w.-]+\.(?:md|mdx|txt|ya?ml))(?=[\s)`.,;:]|$)/g;

const isSameRepo = (owner: string, name: string, repo: RepoRef) =>
  owner.toLowerCase() === repo.owner.toLowerCase() && name.toLowerCase() === repo.name.toLowerCase();

/** A repository-relative path that cannot climb out of the clone, or null. */
export function safeRepoPath(raw: string): string | null {
  const path = decodeURIComponent(raw.split(/[?#]/)[0]!).replace(/^\.\//, '');
  if (!path || path.startsWith('/') || path.split('/').some((p) => p === '..' || p === '')) return null;
  return path;
}

/**
 * Issues, plan files and other links the PR description points to, in the
 * order they appear, without repeats. Same-repo issue/PR numbers and blob URLs
 * become readable links; anything else is external and is not fetched.
 */
export function extractLinks(body: string | null | undefined, repo: RepoRef): PrLink[] {
  if (!body) return [];
  const found: { at: number; link: PrLink }[] = [];

  for (const m of body.matchAll(URL)) {
    const url = m[0].replace(/[.,;:]+$/, '');
    const gh = url.match(/^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/(issues|pull|blob)\/([^?#]+)/);
    if (gh && isSameRepo(gh[1]!, gh[2]!, repo)) {
      if (gh[3] !== 'blob') {
        const n = Number(gh[4]!.split('/')[0]);
        if (Number.isInteger(n) && n > 0) found.push({ at: m.index!, link: { kind: 'issue', label: `#${n}`, number: n } });
        continue;
      }
      const path = safeRepoPath(gh[4]!.split('/').slice(1).join('/'));
      if (path) found.push({ at: m.index!, link: { kind: 'file', label: path, path } });
      continue;
    }
    found.push({ at: m.index!, link: { kind: 'external', label: url } });
  }

  const withoutUrls = body.replace(URL, (u) => ' '.repeat(u.length));
  for (const m of withoutUrls.matchAll(ISSUE_REF)) {
    const [owner, name] = (m[1] ?? '').split('/');
    const n = Number(m[2]);
    if (m[1] && !isSameRepo(owner!, name!, repo)) {
      found.push({ at: m.index!, link: { kind: 'external', label: `${m[1]}#${n}` } });
    } else {
      found.push({ at: m.index!, link: { kind: 'issue', label: `#${n}`, number: n } });
    }
  }
  for (const re of [MD_LINK_TARGET, BARE_DOC_PATH]) {
    for (const m of withoutUrls.matchAll(re)) {
      const path = safeRepoPath(m[1]!);
      if (path && /\.\w+$/.test(path)) found.push({ at: m.index!, link: { kind: 'file', label: path, path } });
    }
  }

  const seen = new Set<string>();
  return found
    .sort((a, b) => a.at - b.at)
    .map((f) => f.link)
    .filter((l) => !seen.has(l.label) && !!seen.add(l.label));
}

/** Every hunk header of the diff with its file — the shape of the change without its body. */
export function hunkHeaders(raw: string): string[] {
  const out: string[] = [];
  let file = '';
  for (const line of raw.split('\n')) {
    const header = line.match(/^diff --git a\/.+ b\/(.+)$/);
    if (header) file = header[1]!;
    else if (line.startsWith('@@')) out.push(`${file} ${line.trim()}`);
  }
  return out;
}

async function within<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timed out')), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

const clipDoc = (s: string) => (s.length > MAX_LINKED_CHARS ? `${s.slice(0, MAX_LINKED_CHARS)}\n… (cut)` : s);

/**
 * Read the linked issues and repository files, at most MAX_LINKS of them. A
 * failure, an empty file or an external link is a gap, never an error.
 */
export async function gatherLinked(
  links: readonly PrLink[],
  read: { issue: (n: number) => Promise<IssueMeta>; file: (path: string) => Promise<string> },
): Promise<LinkedContext> {
  const docs: LinkedDoc[] = [];
  const gaps: string[] = [];
  let fetched = 0;
  for (const link of links) {
    if (link.kind === 'external') {
      gaps.push(`${link.label} (external link, not fetched)`);
      continue;
    }
    if (fetched >= MAX_LINKS) {
      gaps.push(`${link.label} (over the ${MAX_LINKS}-link limit)`);
      continue;
    }
    fetched++;
    try {
      if (link.kind === 'issue') {
        const issue = await within(read.issue(link.number), LINK_DEADLINE_MS);
        docs.push({ label: link.label, text: clipDoc(`${issue.title} (${issue.state})\n\n${issue.body?.trim() || '(no body)'}`) });
      } else {
        const text = (await within(read.file(link.path), LINK_DEADLINE_MS)).trim();
        if (!text) gaps.push(`${link.label} (missing or empty in the clone)`);
        else docs.push({ label: link.label, text: clipDoc(text) });
      }
    } catch (err) {
      gaps.push(`${link.label} (${link.kind === 'issue' ? 'not found or not readable' : 'not in the clone'}: ${(err as Error).message.slice(0, 80)})`);
    }
  }
  return { docs, gaps };
}
