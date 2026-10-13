import { RiskBrief } from '@devdigest/shared';
import type { RepoRef, RiskBriefResponse, UnifiedDiff } from '@devdigest/shared';
import type { Container } from '../../../platform/container.js';
import { ConflictError, ExternalServiceError } from '../../../platform/errors.js';
import { loadPromptTemplate } from '../../../platform/prompts.js';
import { resolveFeatureLlm } from '../../_shared/feature-models.js';
import { withDeadline } from '../../_shared/deadline.js';
import type { PullRow, ReviewRepository } from '../repository.js';
import { EmptyDiffError } from '../diff-loader.js';
import { BRIEF_DEADLINE_MS, BRIEF_OPENROUTER_MODEL, BRIEF_SCHEMA_NAME, HISTORY_SCAN } from './constants.js';
import { BriefOutput, buildBriefMessages, diffIndex, groundBrief, signalsOnlyBrief, type BriefContext } from './helpers.js';
import { historyItems, historyPaths, prNumberOf, riskSignals } from './signals.js';

/**
 * SPEC-03 — the risk brief of a PR head: rule signals and git history for
 * free, one model call to explain and rank, grounded; signals-only without a model.
 */
export class BriefBuilder {
  /** PRs with a generation in flight (AC-18); one API process, so memory is enough. */
  private running = new Set<string>();

  constructor(
    private container: Container,
    private repo: ReviewRepository,
  ) {}

  /** AC-16: the stored brief and whether the PR head moved since; no model call. */
  async get(pull: PullRow): Promise<RiskBriefResponse> {
    const brief = await this.stored(pull.id);
    return { brief, stale: brief !== null && brief.meta.head_sha !== pull.headSha };
  }

  async generate(
    workspaceId: string,
    pull: PullRow,
    ref: RepoRef,
    loadDiff: () => Promise<UnifiedDiff>,
  ): Promise<RiskBriefResponse> {
    if (this.running.has(pull.id)) throw new ConflictError('A brief for this PR is already being generated.');
    this.running.add(pull.id);
    try {
      let diff: UnifiedDiff;
      try {
        diff = await loadDiff();
      } catch (err) {
        // AC-18: only "no text diff anywhere" is the caller's 409; anything else is a fault.
        if (err instanceof EmptyDiffError) throw new ConflictError(`No diff to brief: ${err.message}`);
        throw err;
      }
      const ctx = await this.context(pull, ref, diff);
      const base = { head_sha: pull.headSha, generated_at: new Date().toISOString() };

      let brief: RiskBrief;
      try {
        const { llm, model } = await resolveFeatureLlm(this.container, workspaceId, 'risk_brief', BRIEF_OPENROUTER_MODEL);
        const intent = await this.repo.getIntent(pull.id);
        const res = await withDeadline(
          llm.completeStructured({
            model,
            schema: BriefOutput,
            schemaName: BRIEF_SCHEMA_NAME,
            messages: buildBriefMessages(await loadPromptTemplate('risk-brief.system.md'), {
              title: pull.title,
              description: pull.body,
              intent: intent ? { intent: intent.intent, in_scope: intent.inScope, out_of_scope: intent.outOfScope } : null,
              diff,
              signals: ctx.signals,
              history: ctx.history,
            }),
            // AC-8: one call — an answer off the schema becomes signals-only, no re-prompt.
            maxRetries: 0,
            sessionId: `pr:${pull.id}:brief`,
          }),
          BRIEF_DEADLINE_MS,
          'Writing the risk brief',
        );
        brief = groundBrief(res.data, ctx, { ...base, source: 'model', reason: null, model, cost_usd: res.costUsd });
      } catch (err) {
        brief = signalsOnlyBrief(ctx, { ...base, reason: (err as Error).message.slice(0, 300) });
      }

      // AC-17: never trade a model brief of this head for a signals-only one.
      if (brief.meta.source === 'signals') {
        const stored = await this.stored(pull.id);
        if (stored?.meta.source === 'model' && stored.meta.head_sha === pull.headSha) {
          throw new ExternalServiceError(`Couldn't regenerate the brief (${brief.meta.reason}). The previous brief is kept.`);
        }
      }
      await this.repo.upsertBrief(pull.id, brief);
      return { brief, stale: false };
    } finally {
      this.running.delete(pull.id);
    }
  }

  /** AC-2–AC-7: signals from the diff, history from the clone, the diff's new-side lines. */
  private async context(pull: PullRow, ref: RepoRef, diff: UnifiedDiff): Promise<BriefContext> {
    // AC-2: signals from every file; the 100-file cap is the prompt's and git's (AC-6, AC-9).
    const signals = riskSignals(
      diff.files.map((f) => ({ path: f.path, additions: f.additions, deletions: f.deletions, patch: null })),
    );
    let historyState: BriefContext['historyState'] = 'unavailable';
    let history: BriefContext['history'] = [];
    const shallow = await this.container.git.isShallow(ref);
    if (shallow !== null) {
      // AC-7: git could not read the clone — say "unavailable", not "no prior PRs".
      // Only git's failure is caught; a database error stays an error.
      const commits = await this.container.git
        .history(ref, historyPaths(diff.files.map((f) => f.path)), HISTORY_SCAN)
        .catch(() => null);
      if (commits) {
        const numbers = commits.map((c) => prNumberOf(c.subject)).filter((n): n is number => n !== null);
        history = historyItems(commits, await this.repo.mergedPullTitles(pull.repoId, numbers), pull.number);
        historyState = shallow ? 'limited' : 'ok';
      }
    }
    return { signals, history, historyState, index: diffIndex(diff) };
  }

  private async stored(prId: string): Promise<RiskBrief | null> {
    const json = await this.repo.getBrief(prId);
    if (json === undefined) return null;
    const parsed = RiskBrief.safeParse(json);
    return parsed.success ? parsed.data : null;
  }
}
