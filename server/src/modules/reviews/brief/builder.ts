import { RiskBrief } from '@devdigest/shared';
import type { RepoRef, RiskBriefResponse, UnifiedDiff } from '@devdigest/shared';
import type { Container } from '../../../platform/container.js';
import { ConflictError, ExternalServiceError } from '../../../platform/errors.js';
import { loadPromptTemplate } from '../../../platform/prompts.js';
import { resolveFeatureLlm } from '../../_shared/feature-models.js';
import { withDeadline } from '../../_shared/deadline.js';
import type { PullRow, ReviewRepository } from '../repository.js';
import { BRIEF_DEADLINE_MS, BRIEF_OPENROUTER_MODEL, BRIEF_SCHEMA_NAME, HISTORY_SCAN, MAX_FILES } from './constants.js';
import { BriefOutput, buildBriefMessages, diffIndex, groundBrief, signalsOnlyBrief, type BriefContext } from './helpers.js';
import { historyItems, prNumberOf, riskSignals } from './signals.js';

/** Paths that make every PR "overlap" without telling anything (AC-3). */
const HISTORY_NOISE = /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?|Cargo\.lock|Gemfile\.lock|poetry\.lock|go\.sum|composer\.lock)$|\.mdx?$|(^|\/)migrations\/meta\//i;

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
        throw new ConflictError(`No diff to brief: ${(err as Error).message}`);
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
    const files = diff.files.slice(0, MAX_FILES);
    const signals = riskSignals(
      files.map((f) => ({ path: f.path, additions: f.additions, deletions: f.deletions, patch: null })),
    );
    const shallow = await this.container.git.isShallow(ref);
    let history: BriefContext['history'] = [];
    if (shallow !== null) {
      const paths = files.map((f) => f.path).filter((p) => !HISTORY_NOISE.test(p));
      const commits = await this.container.git.history(ref, paths, HISTORY_SCAN);
      const numbers = commits.map((c) => prNumberOf(c.subject)).filter((n): n is number => n !== null);
      history = historyItems(commits, await this.repo.mergedPullTitles(pull.repoId, numbers), pull.number);
    }
    return {
      signals,
      history,
      historyState: shallow === null ? 'unavailable' : shallow ? 'limited' : 'ok',
      index: diffIndex(diff),
    };
  }

  private async stored(prId: string): Promise<RiskBrief | null> {
    const json = await this.repo.getBrief(prId);
    if (json === undefined) return null;
    const parsed = RiskBrief.safeParse(json);
    return parsed.success ? parsed.data : null;
  }
}
