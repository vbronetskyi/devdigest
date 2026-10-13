import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit, type SimpleGit } from 'simple-git';
import { SimpleGitClient } from '../src/adapters/git/simple-git.js';

// SPEC-03 AC-2/AC-3 (history) and SPEC-04 AC-1/AC-2/AC-5/AC-6 (git-why) on a real repo.
describe('SimpleGitClient history / blameLine / mergedVia', () => {
  let root: string;
  let dir: string;
  let git: SimpleGit;
  const repo = { owner: 'acme', name: 'api' };
  const sha: Record<string, string> = {};
  const commit = async (msg: string) => {
    await git.raw(['-c', 'user.name=dev', '-c', 'user.email=dev@example.com', 'commit', '-q', '-m', msg]);
    return (await git.revparse(['HEAD'])).trim();
  };

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'devdigest-hist-'));
    dir = join(root, 'acme', 'api');
    await mkdir(join(dir, 'src'), { recursive: true });
    git = simpleGit(dir);
    await git.init(['-b', 'main']);
    await writeFile(join(dir, 'src', 'a.ts'), 'one\ntwo\nthree\n');
    await writeFile(join(dir, 'src', 'b.ts'), 'b\n');
    await git.add('.');
    sha.root = await commit('initial snapshot');

    // A PR branch, merged with a merge commit.
    await git.checkout(['-q', '-b', 'feature']);
    await writeFile(join(dir, 'src', 'a.ts'), 'one\nTWO\nthree\n');
    await git.add('.');
    sha.feature = await commit('change two');
    await git.checkout(['-q', 'main']);
    await git.raw(['-c', 'user.name=dev', '-c', 'user.email=dev@example.com', 'merge', '-q', '--no-ff', 'feature', '-m', 'Merge pull request #7 from acme/feature', '-m', 'Change the second line']);
    sha.merge = (await git.revparse(['HEAD'])).trim();

    // A file with a non-ASCII name, then a squash-merged PR, then a direct commit.
    await writeFile(join(dir, 'src', 'привіт.ts'), 'hi\n');
    await git.add('.');
    sha.unicode = await commit('add greeting');
    await writeFile(join(dir, 'src', 'b.ts'), 'b\nbee\n');
    await git.add('.');
    sha.squash = await commit('Add bee (#9)');
    await writeFile(join(dir, 'src', 'b.ts'), 'b\nbee\nbuzz\n');
    await git.add('.');
    sha.direct = await commit('tweak b');

    // A later PR merged on top (dated in the past): the commit from #7 is contained by
    // both merges, and #7 is the one that brought it in.
    await git.checkout(['-q', '-b', 'later']);
    await writeFile(join(dir, 'src', 'c.ts'), 'c\n');
    await git.add('.');
    await commit('add c');
    await git.checkout(['-q', 'main']);
    // Only what git needs: simple-git refuses an environment carrying GIT_EDITOR and friends.
    const past = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', GIT_AUTHOR_DATE: '2001-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2001-01-01T00:00:00Z' };
    await simpleGit(dir).env(past).raw(['-c', 'user.name=dev', '-c', 'user.email=dev@example.com', 'merge', '-q', '--no-ff', 'later', '-m', 'Merge pull request #12 from acme/later']);

    // A branch that merged main into itself before its own PR was merged: the first
    // merge descending from its commit is that sync merge, off the mainline.
    await git.checkout(['-q', '-b', 'synced', 'HEAD~1']);
    await writeFile(join(dir, 'src', 'd.ts'), 'd\n');
    await git.add('.');
    sha.synced = await commit('add d');
    await git.raw(['-c', 'user.name=dev', '-c', 'user.email=dev@example.com', 'merge', '-q', '--no-ff', 'main', '-m', "Merge branch 'main' into synced"]);
    await git.checkout(['-q', 'main']);
    await git.raw(['-c', 'user.name=dev', '-c', 'user.email=dev@example.com', 'merge', '-q', '--no-ff', 'synced', '-m', 'Merge pull request #13 from acme/synced']);
    sha.merge13 = (await git.revparse(['HEAD'])).trim();

    // A clone git cannot read: a .git that is not a repository.
    await mkdir(join(root, 'acme', 'broken', '.git'), { recursive: true });

    // A shallow clone of it, cut at its tip.
    await git.clone(`file://${dir}`, join(root, 'acme', 'shallow'), ['--depth', '1', '-q']);
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('SPEC-03 AC-3/AC-5: lists first-parent commits touching the files, newest first, with the files each touched', async () => {
    const client = new SimpleGitClient(root);
    const history = await client.history(repo, ['src/a.ts', 'src/b.ts'], 10);
    expect(history.map((c) => [c.subject, c.files])).toEqual([
      ['tweak b', ['src/b.ts']],
      ['Add bee (#9)', ['src/b.ts']],
      ['Merge pull request #7 from acme/feature', ['src/a.ts']],
      ['initial snapshot', ['src/a.ts', 'src/b.ts']],
    ]);
    expect(history[0]!.author).toBe('dev');
    expect(history[0]!.date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(await client.history(repo, ['src/a.ts'], 1)).toHaveLength(1);
  });

  it('SPEC-03 AC-6: reads non-ASCII paths and treats pathspec magic and globs as plain text', async () => {
    const client = new SimpleGitClient(root);
    expect((await client.history(repo, ['src/привіт.ts'], 10)).map((c) => c.subject)).toEqual(['add greeting']);
    expect(await client.history(repo, ['src/*.ts'], 10)).toEqual([]);
    expect(await client.history(repo, [':(top)src'], 10)).toEqual([]);
    expect(await client.isShallow(repo)).toBe(false);
  });

  it('SPEC-04 AC-6: blames at a given revision and finds a merge base', async () => {
    const client = new SimpleGitClient(root);
    // feature is merged, so its tip is where it meets main.
    expect(await client.mergeBase(repo, 'main', sha.feature!)).toBe(sha.feature);
    expect(await client.mergeBase(repo, sha.root!, sha.feature!)).toBe(sha.root);
    expect((await client.blameLine(repo, 'src/a.ts', 2, sha.root!))?.sha).toBe(sha.root);
    expect(await client.blameLine(repo, 'src/привіт.ts', 1, sha.root!)).toBeNull();
    expect(await client.mergeBase(repo, '--all', 'main')).toBeNull();
  });

  it('SPEC-04 AC-6/AC-7: blames one line and finds the merge that brought its commit in', async () => {
    const client = new SimpleGitClient(root);
    const line = await client.blameLine(repo, 'src/a.ts', 2);
    expect(line).toMatchObject({ sha: sha.feature, author: 'dev', summary: 'change two', boundary: false });
    // Two merges descend from it (#7, then #12): the oldest by ancestry wins.
    expect(await client.mergedVia(repo, sha.feature!)).toEqual({ sha: sha.merge, subject: 'Merge pull request #7 from acme/feature' });
    expect(await client.mergedVia(repo, 'f'.repeat(40))).toBeNull();
    // The sync merge (main into the branch) comes first but is off the mainline: #13 brought it.
    expect(await client.mergedVia(repo, sha.synced!)).toEqual({ sha: sha.merge13, subject: 'Merge pull request #13 from acme/synced' });
    // A commit made on the mainline itself arrived without a merge — even with merges after it.
    expect(await client.mergedVia(repo, sha.squash!)).toBeNull();
    expect(await client.mergedVia(repo, sha.root!)).toBeNull();
  });

  it('SPEC-04 AC-8: marks the root commit as the boundary of known history', async () => {
    const line = await new SimpleGitClient(root).blameLine(repo, 'src/a.ts', 1);
    expect(line).toMatchObject({ sha: sha.root, boundary: true });
  });

  it('SPEC-03 AC-7 / SPEC-04 AC-8: a shallow clone says so, and its cut is the boundary', async () => {
    const client = new SimpleGitClient(root);
    const shallow = { owner: 'acme', name: 'shallow' };
    expect(await client.isShallow(shallow)).toBe(true);
    expect(await client.blameLine(shallow, 'src/a.ts', 1)).toMatchObject({ boundary: true });
    expect(await client.isShallow({ owner: 'acme', name: 'none' })).toBeNull();
    expect(await client.isShallow({ owner: 'acme', name: 'broken' })).toBeNull();
  });

  it('SPEC-04 AC-9/AC-10: tells whether a path is in the tree at a revision, the path after --', async () => {
    const client = new SimpleGitClient(root);
    expect(await client.hasFile(repo, 'src/a.ts', sha.root!)).toBe(true);
    expect(await client.hasFile(repo, 'src/привіт.ts', sha.root!)).toBe(false);
    expect(await client.hasFile(repo, 'src/привіт.ts', 'main')).toBe(true);
    expect(await client.hasFile(repo, 'src/*.ts', 'main')).toBe(false);
    expect(await client.hasFile(repo, '--output=x', 'main')).toBe(false);
    expect(await client.hasFile(repo, 'src/a.ts', '--all')).toBeNull();
    expect(await client.hasFile({ owner: 'acme', name: 'broken' }, 'src/a.ts', 'main')).toBeNull();
  });

  it('SPEC-03 AC-6: sends at most 100 paths to git', async () => {
    const client = new SimpleGitClient(root);
    const filler = Array.from({ length: 100 }, (_, i) => `src/missing-${i}.ts`);
    // The only real path is the 101st: it never reaches git.
    expect(await client.history(repo, [...filler, 'src/a.ts'], 10)).toEqual([]);
    expect((await client.history(repo, [...filler.slice(1), 'src/a.ts'], 10)).length).toBeGreaterThan(0);
  });

  it('SPEC-04 AC-9/AC-10: past the end, a bad line or an option-looking path gives null — never a git option', async () => {
    const client = new SimpleGitClient(root);
    expect(await client.blameLine(repo, 'src/a.ts', 99)).toBeNull();
    expect(await client.blameLine(repo, 'src/a.ts', 0)).toBeNull();
    const out = join(root, 'pwned.txt');
    expect(await client.blameLine(repo, `--output=${out}`, 1)).toBeNull();
    expect(await client.history(repo, [`--output=${out}`], 5)).toEqual([]);
    await expect(readFile(out, 'utf8')).rejects.toThrow();
    expect(await client.mergedVia(repo, '--all')).toBeNull();
  });
});
