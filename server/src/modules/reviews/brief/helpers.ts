import { z } from 'zod';
import type { BriefMeta, ChatMessage, PrHistoryItem, ReviewFocusItem, Risk, RiskBrief, RiskSeverity, UnifiedDiff } from '@devdigest/shared';
import { wrapUntrusted } from '../../../platform/prompt.js';
import { stripLinks } from '../../_shared/markdown.js';
import {
  DESCRIPTION_MAX_CHARS,
  EXPLANATION_MAX,
  MAX_FILES,
  MAX_FOCUS,
  MAX_RISKS,
  PATCH_MAX_CHARS,
  REASON_MAX,
  RISK_KINDS,
  TITLE_MAX,
} from './constants.js';
import type { RiskSignal } from './signals.js';

/** AC-10: the model's answer. Unknown kinds or severities fail the schema (→ signals-only). */
export const BriefOutput = z.object({
  risks: z.array(
    z.object({
      kind: z.enum(RISK_KINDS),
      severity: z.enum(['high', 'medium', 'low']),
      title: z.string(),
      explanation: z.string(),
      file_refs: z.array(z.string()),
    }),
  ),
  review_focus: z.array(z.object({ file: z.string(), line: z.number().int(), reason: z.string() })),
  history_notes: z.array(z.object({ pr_number: z.number().int(), note: z.string() })),
});
export type BriefOutput = z.infer<typeof BriefOutput>;

export interface BriefInput {
  title: string;
  description: string | null;
  intent: { intent: string; in_scope: string[]; out_of_scope: string[] } | null;
  diff: UnifiedDiff;
  signals: RiskSignal[];
  history: PrHistoryItem[];
}

/** AC-9: fixed instructions; every repository-made or model-derived text in its own untrusted block. */
export function buildBriefMessages(system: string, input: BriefInput): ChatMessage[] {
  const files = input.diff.files.slice(0, MAX_FILES).map((f) => `${f.path} (+${f.additions} −${f.deletions})`).join('\n');
  const diff = input.diff.raw.length > PATCH_MAX_CHARS ? `${input.diff.raw.slice(0, PATCH_MAX_CHARS)}\n[… diff cut at ${PATCH_MAX_CHARS} characters]` : input.diff.raw;
  const signals = input.signals.map((s) => ({ kind: s.kind, severity: s.severity, title: s.title, files: s.files }));
  const history = input.history.map((h) => ({ pr_number: h.pr_number, title: h.title, merged_at: h.merged_at, files: h.files_overlap }));
  const sections = [
    'Write the risk brief for this pull request.',
    `## Signals (found by rules)\n${wrapUntrusted('signals', JSON.stringify(signals, null, 1))}`,
    `## PR title\n${wrapUntrusted('pr-title', input.title)}`,
    input.description?.trim() ? `## PR description\n${wrapUntrusted('pr-description', input.description.slice(0, DESCRIPTION_MAX_CHARS))}` : '',
    input.intent ? `## Derived intent (unverified)\n${wrapUntrusted('intent', JSON.stringify(input.intent, null, 1))}` : '',
    `## Changed files\n${wrapUntrusted('files', files)}`,
    `## History (other PRs that touched these files)\n${wrapUntrusted('history', JSON.stringify(history, null, 1))}`,
    `## Diff\n${wrapUntrusted('diff', diff)}`,
  ].filter(Boolean);
  return [
    { role: 'system', content: system },
    { role: 'user', content: sections.join('\n\n') },
  ];
}

/** New-side lines the diff shows per file (added and context) — what a reference may point at. */
export function diffIndex(diff: UnifiedDiff): Map<string, Set<number>> {
  return new Map(diff.files.map((f) => [f.path, new Set(f.hunks.flatMap((h) => h.newLineNumbers))]));
}

/** `path`, `path:line` or `path:start-end`; a colon not followed by a line spec belongs to the path. */
export function parseRef(ref: string): { path: string; start: number | null; end: number | null } {
  const m = ref.trim().match(/^(.*):(\d+)(?:-(\d+))?$/);
  if (!m) return { path: ref.trim(), start: null, end: null };
  const start = Number(m[2]);
  const end = m[3] ? Number(m[3]) : start;
  return { path: m[1]!, start, end };
}

/** AC-11: a reference kept as it is, reduced to its path, or dropped. */
export function groundRef(ref: string, index: ReadonlyMap<string, ReadonlySet<number>>): string | null {
  const { path, start, end } = parseRef(ref);
  const lines = index.get(path);
  if (!lines) return null;
  if (start === null || end === null) return path;
  const valid = start >= 1 && end >= start && lines.has(start) && lines.has(end);
  return valid ? (start === end ? `${path}:${start}` : `${path}:${start}-${end}`) : path;
}

const SEVERITY_RANK: Record<RiskSeverity, number> = { high: 0, medium: 1, low: 2 };
const clip = (text: string, max: number) => {
  const clean = stripLinks(text).replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
};

export function signalRisk(s: RiskSignal): Risk {
  return { kind: s.kind, severity: s.severity, title: s.title, explanation: s.reason, file_refs: s.files };
}

/** AC-12: every signal plus grounded model risks; a model risk of the same kind on a shared file replaces the signal. */
export function mergeRisks(signals: readonly RiskSignal[], model: readonly Risk[]): Risk[] {
  const fileOf = (ref: string) => parseRef(ref).path;
  const kept = signals.filter(
    (s) => !model.some((r) => r.kind === s.kind && r.file_refs.some((ref) => s.files.includes(fileOf(ref)))),
  );
  const tagged = [...kept.map((s) => ({ risk: signalRisk(s), signal: 0 })), ...model.map((risk) => ({ risk, signal: 1 }))];
  return tagged
    .map((t, i) => ({ ...t, i }))
    .sort((a, b) => SEVERITY_RANK[a.risk.severity] - SEVERITY_RANK[b.risk.severity] || a.signal - b.signal || a.i - b.i)
    .slice(0, MAX_RISKS)
    .map((t) => t.risk);
}

export interface BriefContext {
  signals: RiskSignal[];
  history: PrHistoryItem[];
  historyState: RiskBrief['history_state'];
  index: ReadonlyMap<string, ReadonlySet<number>>;
}

/** AC-11–AC-14: the brief as the server vouches for it. */
export function groundBrief(output: BriefOutput, ctx: BriefContext, meta: BriefMeta): RiskBrief {
  const modelRisks: Risk[] = output.risks.flatMap((r) => {
    const refs = [...new Set(r.file_refs.map((ref) => groundRef(ref, ctx.index)).filter((ref): ref is string => ref !== null))];
    if (refs.length === 0) return [];
    return [{ kind: r.kind, severity: r.severity, title: clip(r.title, TITLE_MAX), explanation: clip(r.explanation, EXPLANATION_MAX), file_refs: refs }];
  });

  const focus: ReviewFocusItem[] = [];
  const seen = new Set<string>();
  for (const spot of output.review_focus) {
    const key = `${spot.file}:${spot.line}`;
    if (seen.has(key) || !ctx.index.get(spot.file)?.has(spot.line)) continue;
    seen.add(key);
    focus.push({ file: spot.file, line: spot.line, reason: clip(spot.reason, REASON_MAX) });
    if (focus.length >= MAX_FOCUS) break;
  }

  const numbers = new Set(ctx.history.map((h) => h.pr_number));
  const notes = new Map<number, string>();
  for (const n of output.history_notes) if (numbers.has(n.pr_number) && !notes.has(n.pr_number)) notes.set(n.pr_number, clip(n.note, REASON_MAX));

  return {
    risks: mergeRisks(ctx.signals, modelRisks),
    review_focus: focus,
    history: ctx.history.map((h) => ({ ...h, notes: notes.get(h.pr_number) ?? h.notes })),
    history_state: ctx.historyState,
    meta,
  };
}

/** AC-15: the brief from rules and history alone. */
export function signalsOnlyBrief(ctx: BriefContext, meta: Omit<BriefMeta, 'source' | 'model' | 'cost_usd'> & { reason: string }): RiskBrief {
  return {
    risks: mergeRisks(ctx.signals, []),
    review_focus: [],
    history: ctx.history,
    history_state: ctx.historyState,
    meta: { ...meta, source: 'signals', model: null, cost_usd: null },
  };
}
