import { simpleGit, type SimpleGit } from 'simple-git';
import { join } from 'node:path';
import { mkdir, readFile, access, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import type {
  GitClient,
  RepoRef,
  CloneOptions,
  UnifiedDiff,
  BlameLine,
  GitCommit,
  TrackedFile,
  HistoryCommit,
  BlameLineInfo,
} from '@devdigest/shared';
import { parseUnifiedDiff } from './diff-parser.js';

/**
 * Depth fetched by `sync()`. Deeper than the shallow clone (CLONE_DEPTH=1) so the
 * previously-indexed sha is usually reachable, keeping the resync diff incremental;
 * when it isn't, the indexer falls back to a full reindex.
 */
const RESYNC_FETCH_DEPTH = 50;

/**
 * GitClient over simple-git. Repos clone to
 * `<cloneDir>/<owner>/<repo>`. We NEVER execute repo code — only git ops.
 */
export class SimpleGitClient implements GitClient {
  constructor(private cloneDir: string) {
    // Force non-interactive auth so an unauthenticated/private clone fails in
    // ~1s with a clear error instead of hanging on a credential prompt until the
    // job timeout. Set on process.env (inherited by git subprocesses) rather
    // than via simple-git's .env(), which inspects and rejects vars like
    // PAGER/EDITOR present in the shell environment.
    process.env.GIT_TERMINAL_PROMPT ??= '0';
    process.env.GCM_INTERACTIVE ??= 'never';
  }

  clonePathFor(repo: RepoRef): string {
    return join(this.cloneDir, repo.owner, repo.name);
  }

  private git(repo: RepoRef): SimpleGit {
    return simpleGit(this.clonePathFor(repo));
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await access(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async clone(repo: RepoRef, url: string, opts?: CloneOptions): Promise<{ path: string }> {
    const dest = this.clonePathFor(repo);
    await mkdir(join(this.cloneDir, repo.owner), { recursive: true });
    if (await this.exists(join(dest, '.git'))) {
      // already cloned → fetch latest
      await simpleGit(dest).fetch();
      return { path: dest };
    }
    // A prior clone may have timed out mid-write, leaving a partial dir without
    // a .git — git clone refuses a non-empty dest, so clear it first.
    if (await this.exists(dest)) await rm(dest, { recursive: true, force: true });
    const args: string[] = [];
    if (opts?.depth) args.push('--depth', String(opts.depth));
    if (opts?.branch) args.push('--branch', opts.branch);
    await simpleGit(this.cloneDir).clone(url, dest, args);
    return { path: dest };
  }

  async fetchPullHead(repo: RepoRef, n: number): Promise<void> {
    // Fetch the PR head ref into a local ref (GitHub exposes pull/<n>/head).
    await this.git(repo).fetch(['origin', `pull/${n}/head:pr-${n}`]);
  }

  async sync(repo: RepoRef, branch: string): Promise<{ head: string }> {
    // Resync the read-only mirror to upstream. A bare `fetch` only moves
    // `origin/<branch>`, so we `reset --hard` to advance local HEAD + worktree —
    // safe here because we never commit to or run code from the clone.
    // Fetch a bounded depth (> the shallow CLONE_DEPTH) so the prior indexed sha
    // is usually reachable for an incremental diff; the indexer falls back to a
    // full reindex when it isn't.
    const g = this.git(repo);
    await g.fetch(['origin', branch, '--depth', String(RESYNC_FETCH_DEPTH)]);
    await g.reset(['--hard', `origin/${branch}`]);
    return { head: (await g.revparse(['HEAD'])).trim() };
  }

  async currentHead(repo: RepoRef): Promise<string> {
    return (await this.git(repo).revparse(['HEAD'])).trim();
  }

  async diff(repo: RepoRef, base: string, head: string): Promise<UnifiedDiff> {
    const raw = await this.git(repo).diff([`${base}...${head}`]);
    return parseUnifiedDiff(raw);
  }

  /**
   * `git diff --name-only base..head` — used by the incremental indexer to
   * pick the file set that changed since `last_indexed_sha`. Two-dot is
   * intentional (commits reachable from `head` but not `base`), unlike the
   * three-dot symmetric form `diff()` uses for review diffs.
   */
  async diffNameOnly(repo: RepoRef, base: string, head: string): Promise<string[]> {
    if (base === head) return [];
    const raw = await this.git(repo).raw(['diff', '--name-only', `${base}..${head}`]);
    return raw
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  async blame(repo: RepoRef, path: string): Promise<BlameLine[]> {
    const raw = await this.git(repo).raw(['blame', '--line-porcelain', path]);
    return parseBlamePorcelain(raw);
  }

  async log(repo: RepoRef, path?: string): Promise<GitCommit[]> {
    const log = await this.git(repo).log(path ? { file: path } : undefined);
    return log.all.map((c) => ({
      sha: c.hash,
      message: c.message,
      author: c.author_name,
      date: c.date,
    }));
  }

  async readFile(repo: RepoRef, path: string): Promise<string> {
    return readFile(join(this.clonePathFor(repo), path), 'utf8');
  }

  async listFiles(repo: RepoRef, commit = 'HEAD'): Promise<TrackedFile[] | null> {
    if (!(await this.exists(join(this.clonePathFor(repo), '.git')))) return null;
    // -z: NUL-separated records with paths unquoted, whatever characters they hold.
    const raw = await this.git(repo).raw(['ls-tree', '-r', '-l', '-z', '--full-tree', commit]);
    return parseLsTree(raw);
  }

  async history(repo: RepoRef, paths: string[], limit: number): Promise<HistoryCommit[]> {
    const asked = paths.slice(0, MAX_HISTORY_PATHS);
    if (asked.length === 0 || !(await this.exists(join(this.clonePathFor(repo), '.git')))) return [];
    // --literal-pathspecs: `:(top)`, `*` and friends are plain characters. quotepath=off:
    // non-ASCII paths come out as written, so they match. --diff-merges=first-parent: a
    // merge lists the files its PR brought in. `--` keeps every path a path.
    const raw = await this.git(repo).raw([
      '-c',
      'core.quotepath=off',
      '--literal-pathspecs',
      'log',
      '--first-parent',
      '--diff-merges=first-parent',
      '--name-only',
      `-n${Math.max(1, Math.floor(limit))}`,
      `--format=${RECORD}%H${FIELD}%an${FIELD}%aI${FIELD}%s${END}`,
      'HEAD',
      '--',
      ...asked,
    ]);
    return parseHistory(raw, asked);
  }

  async blameLine(repo: RepoRef, path: string, line: number, rev = 'HEAD'): Promise<BlameLineInfo | null> {
    if (!Number.isInteger(line) || line < 1 || !/^[\w./-]+$/.test(rev) || rev.startsWith('-')) return null;
    if (!(await this.exists(join(this.clonePathFor(repo), '.git')))) return null;
    try {
      const raw = await this.git(repo).raw(['--literal-pathspecs', 'blame', '--line-porcelain', '-L', `${line},${line}`, rev, '--', path]);
      return parseBlameLine(raw);
    } catch {
      return null; // past the end of the file, or the file is not at `rev`
    }
  }

  async hasFile(repo: RepoRef, path: string, rev: string): Promise<boolean | null> {
    if (!/^[\w./-]+$/.test(rev) || rev.startsWith('-')) return null;
    if (!(await this.exists(join(this.clonePathFor(repo), '.git')))) return null;
    try {
      // -z: names come back unquoted (non-ASCII), NUL-separated.
      const raw = await this.git(repo).raw(['--literal-pathspecs', 'ls-tree', '-z', '--name-only', rev, '--', path]);
      return raw.split('\0').includes(path);
    } catch {
      return null;
    }
  }

  async mergeBase(repo: RepoRef, a: string, b: string): Promise<string | null> {
    if (![a, b].every((r) => /^[\w./-]+$/.test(r) && !r.startsWith('-'))) return null;
    if (!(await this.exists(join(this.clonePathFor(repo), '.git')))) return null;
    try {
      return (await this.git(repo).raw(['merge-base', a, b])).trim() || null;
    } catch {
      return null;
    }
  }

  async isShallow(repo: RepoRef): Promise<boolean | null> {
    if (!(await this.exists(join(this.clonePathFor(repo), '.git')))) return null;
    try {
      return (await this.git(repo).raw(['rev-parse', '--is-shallow-repository'])).trim() === 'true';
    } catch {
      return null; // a clone git cannot read is as good as none
    }
  }

  async mergedVia(repo: RepoRef, sha: string): Promise<{ sha: string; subject: string } | null> {
    if (!/^[0-9a-f]{7,40}$/.test(sha)) return null;
    if (!(await this.exists(join(this.clonePathFor(repo), '.git')))) return null;
    const git = this.git(repo);
    try {
      const mainline = new Set((await git.raw(['rev-list', '--first-parent', 'HEAD'])).split('\n').filter(Boolean));
      // A commit on the mainline itself was committed there (or squash-merged): no merge brought it in.
      const full = (await git.raw(['rev-parse', '--verify', `${sha}^{commit}`])).trim();
      if (mainline.has(full)) return null;
      // Merges that descend from the commit, ancestors first (topological, so skewed
      // commit dates cannot reorder them); the first one on the mainline brought it in.
      const merges = (await git.raw(['rev-list', '--ancestry-path', '--merges', '--topo-order', '--reverse', `${sha}..HEAD`]))
        .split('\n')
        .filter(Boolean);
      const via = merges.find((m) => mainline.has(m));
      if (!via) return null;
      const subject = (await git.raw(['log', '-1', '--format=%s', via])).trim();
      return { sha: via, subject };
    } catch {
      return null; // unknown to the clone: no PR can be named
    }
  }

  async readCommitted(repo: RepoRef, path: string, commit = 'HEAD'): Promise<string | null> {
    if (!(await this.exists(join(this.clonePathFor(repo), '.git')))) return null;
    try {
      return await this.git(repo).raw(['show', `${commit}:${path}`]);
    } catch {
      return null; // not in the commit
    }
  }
}

const SYMLINK_MODE = '120000';
const FIELD = '\x1f';
const RECORD = '\x1e';
const END = '\x1d';
/** At most this many paths go to one `git log` (SPEC-03 AC-6). */
export const MAX_HISTORY_PATHS = 100;

/**
 * `git log --name-only` records: `\x1e<sha>\x1f<author>\x1f<date>\x1f<subject>\x1d`
 * followed by one changed file per line.
 */
export function parseHistory(raw: string, asked: readonly string[]): HistoryCommit[] {
  const wanted = new Set(asked);
  return raw
    .split(RECORD)
    .filter((r) => r.trim())
    .map((record) => {
      const cut = record.indexOf(END);
      const head = cut === -1 ? record : record.slice(0, cut);
      const [sha = '', author = '', date = '', subject = ''] = head.split(FIELD);
      const files = (cut === -1 ? '' : record.slice(cut + 1))
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => wanted.has(l));
      return { sha, author, date, subject, files };
    })
    .filter((c) => c.sha && c.files.length > 0);
}

/** One `--line-porcelain` block: header, author, author-time, summary, `boundary`. */
export function parseBlameLine(raw: string): BlameLineInfo | null {
  const header = raw.match(/^([0-9a-f]{40}) \d+ \d+/m);
  if (!header) return null;
  const field = (name: string) => raw.match(new RegExp(`^${name} (.*)$`, 'm'))?.[1] ?? '';
  const time = Number(field('author-time'));
  return {
    sha: header[1]!,
    author: field('author'),
    date: Number.isFinite(time) && time > 0 ? new Date(time * 1000).toISOString() : '',
    summary: field('summary'),
    boundary: /^boundary$/m.test(raw),
  };
}

/**
 * `<mode> <type> <object> <size>\t<path>` records. Regular blobs only:
 * submodules (no size) and symbolic links (mode 120000) are left out.
 */
export function parseLsTree(raw: string): TrackedFile[] {
  const out: TrackedFile[] = [];
  for (const record of raw.split('\0')) {
    const tab = record.indexOf('\t');
    if (tab === -1) continue;
    const [mode, type, , size] = record.slice(0, tab).trim().split(/\s+/);
    if (type !== 'blob' || mode === SYMLINK_MODE) continue;
    out.push({ path: record.slice(tab + 1), bytes: Number(size) || 0 });
  }
  return out;
}

function parseBlamePorcelain(raw: string): BlameLine[] {
  const out: BlameLine[] = [];
  const lines = raw.split('\n');
  let sha = '';
  let author = '';
  let date = '';
  let summary = '';
  let lineNo = 0;
  for (const line of lines) {
    const header = line.match(/^([0-9a-f]{40})\s+\d+\s+(\d+)/);
    if (header) {
      sha = header[1]!;
      lineNo = Number(header[2]);
    } else if (line.startsWith('author ')) author = line.slice(7);
    else if (line.startsWith('author-time '))
      date = new Date(Number(line.slice(12)) * 1000).toISOString();
    else if (line.startsWith('summary ')) summary = line.slice(8);
    else if (line.startsWith('\t')) {
      out.push({ line: lineNo, sha, author, date, summary });
    }
  }
  return out;
}
