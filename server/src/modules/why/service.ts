import type { WhyAnswer } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { ConflictError, NotFoundError } from '../../platform/errors.js';
import { prNumberOf } from '../_shared/pr-number.js';
import { WhyRepository } from './repository.js';
import { githubPrUrl, oldSideLines } from './helpers.js';

const NO_HISTORY = 'No history for this file at the merge base — it is new or renamed in this PR.';
const NOT_AT_BASE = 'The file at the merge base has no such line — the stored diff and the merge base disagree.';
const BOUNDARY = 'This is the oldest commit the clone has; earlier history is not available.';

/**
 * SPEC-04 — why a base line of a diff is there: `git blame` at the PR's merge
 * base and the PR that brought the commit in. No model call.
 */
export class WhyService {
  private repo: WhyRepository;

  constructor(private container: Container) {
    this.repo = new WhyRepository(container.db);
  }

  async answer(workspaceId: string, prId: string, file: string, line: number): Promise<WhyAnswer> {
    const pull = await this.repo.pull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    if (pull.base !== pull.defaultBranch) {
      throw new ConflictError(`git-why covers PRs into the default branch (${pull.defaultBranch}); this one targets ${pull.base}.`);
    }
    // AC-4/AC-10: the path reaches git only if it is one of the PR's files and the
    // line is an old-side line its patch shows.
    const row = await this.repo.file(prId, file);
    if (!row) throw new NotFoundError('Not a changed file of this PR');
    if (!oldSideLines(row.patch).has(line)) throw new NotFoundError('Not a removed or context line of this file');

    const ref = { owner: pull.owner, name: pull.name };
    const git = this.container.git;
    if ((await git.isShallow(ref)) === null) {
      throw new ConflictError('This repository has no usable local clone (none yet, or git cannot read it). Index it first.');
    }
    let base = await git.mergeBase(ref, 'HEAD', pull.headSha);
    if (!base) {
      await git.fetchPullHead(ref, pull.number).catch(() => undefined);
      base = await git.mergeBase(ref, 'HEAD', pull.headSha);
    }
    if (!base) throw new ConflictError('The PR head could not be fetched into the clone, so its merge base is unknown.');

    const blame = await git.blameLine(ref, file, line, base);
    if (!blame) {
      // AC-9: a file the merge base lacks is new or renamed; otherwise the line is not there.
      const atBase = (await git.hasFile(ref, file, base)) === true;
      return { file, line, commit: null, boundary: false, pr: null, missing: atBase ? 'line' : 'file', note: atBase ? NOT_AT_BASE : NO_HISTORY };
    }

    const via = await git.mergedVia(ref, blame.sha);
    const number = (via ? prNumberOf(via.subject) : null) ?? prNumberOf(blame.summary);
    // AC-7: a number counts only for a PR DevDigest knows here as merged — a fork's
    // commits carry the upstream's numbers.
    const title = number === null ? null : await this.repo.mergedTitle(pull.repoId, number);
    const pr = number === null || title === null ? null : { number, title, url: githubPrUrl(pull.owner, pull.name, number) };
    return {
      file,
      line,
      commit: { sha: blame.sha, author: blame.author, date: blame.date, subject: blame.summary },
      boundary: blame.boundary,
      pr,
      missing: null,
      note: blame.boundary ? BOUNDARY : null,
    };
  }
}
