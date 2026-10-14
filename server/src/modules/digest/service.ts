import { z } from 'zod';
import type { DigestCritical, DigestFacts, WeeklyDigest } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, ConflictError, ExternalServiceError } from '../../platform/errors.js';
import { loadPromptTemplate } from '../../platform/prompts.js';
import { wrapUntrusted } from '../../platform/prompt.js';
import { resolveFeatureLlm } from '../_shared/feature-models.js';
import { withDeadline } from '../_shared/deadline.js';
import { DigestRepository } from './repository.js';
import { HIGHLIGHTS_DEADLINE_MS, HIGHLIGHTS_SCHEMA_NAME, MAX_CRITICALS, MAX_HIGHLIGHTS, OPENROUTER_FALLBACK_MODEL } from './constants.js';
import { changeOf, checkHighlight, factsHash, factsText, formatWeek, numbersIn, parseWeek, previousSpan, weekBounds, weekOf, type IsoWeek } from './helpers.js';

/** The model's answer; limits applied after parsing (strict JSON schema mode). */
const HighlightsOutput = z.object({ highlights: z.array(z.string()) });

const rate = (accepted: number, decided: number) => (decided > 0 ? accepted / decided : null);
const iso = (d: Date | string) => new Date(d).toISOString();

/**
 * SPEC-06 — one ISO week of review activity from stored data, and on request a
 * few model-written highlights whose numbers must all come from the facts.
 */
export class DigestService {
  private repo: DigestRepository;
  /** Workspace+week with a highlights call in flight (AC-9); one API process. */
  private running = new Set<string>();

  constructor(private container: Container) {
    this.repo = new DigestRepository(container.db);
  }

  async get(workspaceId: string, weekText: string | undefined, now = new Date()): Promise<WeeklyDigest> {
    const digest = await this.compute(workspaceId, this.validWeek(weekText, now), now);
    const stored = await this.repo.highlights(workspaceId, digest.week);
    return {
      ...digest,
      highlights: stored
        ? {
            lines: stored.lines,
            model: stored.model,
            cost_usd: stored.costUsd,
            generated_at: stored.generatedAt.toISOString(),
            stale: stored.factsHash !== factsHash(factsText(digest)),
          }
        : null,
    };
  }

  /** AC-6 – AC-9: one model call over the facts text; only lines whose numbers check out are kept. */
  async writeHighlights(workspaceId: string, weekText: string, now = new Date()): Promise<WeeklyDigest> {
    const week = this.validWeek(weekText, now);
    const digest = await this.compute(workspaceId, week, now);
    if (digest.empty) throw new ConflictError('No review activity this week — nothing to write highlights about.');
    const key = `${workspaceId}:${digest.week}`;
    if (this.running.has(key)) throw new ConflictError('Highlights for this week are already being written.');
    this.running.add(key);
    try {
      const text = factsText(digest);
      const { llm, model } = await resolveFeatureLlm(this.container, workspaceId, 'weekly_digest', OPENROUTER_FALLBACK_MODEL).catch((err: Error) => {
        throw new ExternalServiceError(`Couldn't write highlights: ${err.message}`);
      });
      const res = await withDeadline(
        llm.completeStructured({
          model,
          schema: HighlightsOutput,
          schemaName: HIGHLIGHTS_SCHEMA_NAME,
          messages: [
            { role: 'system', content: await loadPromptTemplate('weekly-digest.system.md') },
            { role: 'user', content: `Write the highlights of this week.\n\n${wrapUntrusted('digest-facts', text)}` },
          ],
          // One call: an answer off the schema fails the request, it is not re-prompted.
          maxRetries: 0,
          sessionId: `digest:${key}`,
        }),
        HIGHLIGHTS_DEADLINE_MS,
        'Writing the highlights',
      ).catch((err: Error) => {
        throw new ExternalServiceError(`Couldn't write highlights: ${err.message}`);
      });
      const allowed = numbersIn(text);
      const lines = res.data.highlights
        .map((l) => checkHighlight(l, allowed))
        .filter((l): l is string => l !== null)
        .slice(0, MAX_HIGHLIGHTS);
      if (lines.length === 0) throw new ExternalServiceError('No highlight passed the number check; the stored highlights are kept.');
      await this.repo.saveHighlights({ workspaceId, week: digest.week, lines, model, costUsd: res.costUsd, factsHash: factsHash(text) });
      return this.get(workspaceId, digest.week, now);
    } finally {
      this.running.delete(key);
    }
  }

  /** AC-5: default the current week; malformed, non-existent or future weeks are a 422. */
  private validWeek(weekText: string | undefined, now: Date): IsoWeek {
    const current = weekOf(now);
    if (weekText === undefined) return current;
    const week = parseWeek(weekText);
    if (!week) throw new AppError('invalid_week', `"${weekText}" is not an ISO week (YYYY-Www) that exists.`, 422);
    if (weekBounds(week).from.getTime() > weekBounds(current).from.getTime()) {
      throw new AppError('invalid_week', `${weekText} has not started yet.`, 422);
    }
    return week;
  }

  private async compute(ws: string, week: IsoWeek, now: Date): Promise<Omit<WeeklyDigest, 'highlights'>> {
    const { from, to } = weekBounds(week);
    const inProgress = now.getTime() < to.getTime();
    const prevSpan = previousSpan(from, to, now);
    const [facts, prev, criticals, agents, agentDecisions] = await Promise.all([
      this.facts(ws, from, inProgress ? now : to),
      this.facts(ws, prevSpan.from, prevSpan.to),
      this.repo.openCriticals(ws, from, to),
      this.repo.agents(ws, from, to),
      this.repo.agentDecisions(ws, from, to),
    ]);
    const decided = new Map(agentDecisions.map((d) => [d.agent_id ?? '', d]));
    const open: DigestCritical[] = criticals.slice(0, MAX_CRITICALS).map((c) => ({
      finding_id: c.finding_id,
      repo_id: c.repo_id,
      repo_full_name: c.repo_full_name,
      pr_number: c.pr_number,
      pr_title: c.pr_title,
      pr_state: c.pr_status === 'merged' || c.pr_status === 'closed' ? c.pr_status : null,
      file: c.file,
      line: c.line,
      title: c.title,
      agent_name: c.agent_id === null ? null : c.agent_name,
      ran_at: iso(c.ran_at),
    }));
    return {
      week: formatWeek(week),
      from: from.toISOString(),
      to: to.toISOString(),
      in_progress: inProgress,
      empty: facts.runs === 0 && facts.accepted + facts.dismissed === 0,
      facts,
      prev,
      change: changeOf(facts, prev),
      open_criticals: open,
      open_criticals_total: criticals.length,
      agents: agents
        .map((a) => {
          const d = decided.get(a.agent_id ?? '');
          return {
            agent_id: a.agent_id,
            name: a.agent_id === null ? null : a.name,
            runs: a.runs,
            cost_usd: a.cost_n > 0 ? a.cost : null,
            accept_rate: d ? rate(d.accepted, d.decided) : null,
            decided: d?.decided ?? 0,
          };
        })
        .sort((a, b) => b.runs - a.runs || (a.name ?? '￿').localeCompare(b.name ?? '￿')),
    };
  }

  /** AC-1: the numbers of one span. */
  private async facts(ws: string, from: Date, to: Date): Promise<DigestFacts> {
    const [opened, runs, severities, decisions] = await Promise.all([
      this.repo.prsOpened(ws, from, to),
      this.repo.runs(ws, from, to),
      this.repo.severities(ws, from, to),
      this.repo.decisions(ws, from, to),
    ]);
    const count = (sev: string) => severities.find((s) => s.severity === sev)?.n ?? 0;
    return {
      prs_opened: opened,
      prs_reviewed: runs.prs_reviewed,
      runs: runs.runs,
      failed: runs.failed,
      cost_usd: runs.cost,
      runs_without_cost: runs.no_cost,
      findings: { CRITICAL: count('CRITICAL'), WARNING: count('WARNING'), SUGGESTION: count('SUGGESTION') },
      accepted: decisions.accepted,
      dismissed: decisions.dismissed,
      accept_rate: rate(decisions.accepted, decisions.accepted + decisions.dismissed),
    };
  }
}
