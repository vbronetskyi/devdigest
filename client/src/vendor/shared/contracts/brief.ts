import { z } from 'zod';
import { Severity } from './findings.js';

/**
 * PR Brief building blocks: Intent, Blast radius, Risks, PR History,
 * Smart Diff. Composed into PrBrief.
 */

// ---- Intent ----
export const Intent = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
});
export type Intent = z.infer<typeof Intent>;

// ---- Blast radius ----
export const ChangedSymbol = z.object({
  name: z.string(),
  file: z.string(),
  kind: z.string(),
  /** Declaration line in the indexed version, for linking. */
  line: z.number().int().nullish(),
});
export type ChangedSymbol = z.infer<typeof ChangedSymbol>;

export const BlastCaller = z.object({
  name: z.string(),
  file: z.string(),
  line: z.number().int(),
});
export type BlastCaller = z.infer<typeof BlastCaller>;

export const DownstreamImpact = z.object({
  symbol: z.string(),
  callers: z.array(BlastCaller),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
});
export type DownstreamImpact = z.infer<typeof DownstreamImpact>;

export const BlastRadius = z.object({
  changed_symbols: z.array(ChangedSymbol),
  downstream: z.array(DownstreamImpact),
  summary: z.string(),
  /** Set when there is no full answer: why, and what would fix it. */
  degraded: z
    .object({ reason: z.enum(['not_indexed', 'no_files', 'flag_off']), message: z.string() })
    .nullish(),
  /** Commit the index describes; callers and lines are as of this sha. */
  indexed_sha: z.string().nullish(),
  /** Server time spent — the budget is 200 ms, no model call. */
  duration_ms: z.number().int().nullish(),
});
export type BlastRadius = z.infer<typeof BlastRadius>;

// ---- Risks ----
export const RiskSeverity = z.enum(['high', 'medium', 'low']);
export type RiskSeverity = z.infer<typeof RiskSeverity>;

export const Risk = z.object({
  kind: z.string(),
  title: z.string(),
  explanation: z.string(),
  severity: RiskSeverity,
  file_refs: z.array(z.string()),
});
export type Risk = z.infer<typeof Risk>;

export const Risks = z.object({
  risks: z.array(Risk),
});
export type Risks = z.infer<typeof Risks>;

// ---- PR History ----
export const PrHistoryItem = z.object({
  pr_number: z.number().int(),
  title: z.string(),
  merged_at: z.string(),
  author: z.string(),
  files_overlap: z.array(z.string()),
  notes: z.string(),
});
export type PrHistoryItem = z.infer<typeof PrHistoryItem>;

export const PrHistory = z.object({
  history: z.array(PrHistoryItem),
});
export type PrHistory = z.infer<typeof PrHistory>;

// ---- Risk brief (HW L05, SPEC-03) ----
/** A "read these first" spot: a changed file and a new-side line the diff shows. */
export const ReviewFocusItem = z.object({
  file: z.string(),
  line: z.number().int(),
  reason: z.string(),
});
export type ReviewFocusItem = z.infer<typeof ReviewFocusItem>;

export const BriefMeta = z.object({
  /** model: one call explained and ranked; signals: rules and history only. */
  source: z.enum(['model', 'signals']),
  /** Why it is signals-only; null for a model-written brief. */
  reason: z.string().nullish(),
  model: z.string().nullish(),
  /** USD the call cost; null when no call was made or none was reported. */
  cost_usd: z.number().nullish(),
  /** PR head the brief describes. */
  head_sha: z.string(),
  generated_at: z.string(),
});
export type BriefMeta = z.infer<typeof BriefMeta>;

export const RiskBrief = z.object({
  risks: z.array(Risk),
  review_focus: z.array(ReviewFocusItem),
  history: z.array(PrHistoryItem),
  /** ok, limited (shallow clone) or unavailable (no clone). */
  history_state: z.enum(['ok', 'limited', 'unavailable']),
  meta: BriefMeta,
});
export type RiskBrief = z.infer<typeof RiskBrief>;

export const RiskBriefResponse = z.object({
  brief: RiskBrief.nullable(),
  /** The PR head moved since the brief was generated. */
  stale: z.boolean(),
});
export type RiskBriefResponse = z.infer<typeof RiskBriefResponse>;

// ---- git-why (HW L05, SPEC-04) ----
export const WhyAnswer = z.object({
  file: z.string(),
  /** Old-side (base) line number. */
  line: z.number().int(),
  commit: z
    .object({ sha: z.string(), author: z.string(), date: z.string(), subject: z.string() })
    .nullable(),
  /** The commit is the oldest the clone has: earlier history is not available. */
  boundary: z.boolean(),
  pr: z.object({ number: z.number().int(), title: z.string().nullable(), url: z.string() }).nullable(),
  /** Said when there is no commit (new or renamed file). */
  note: z.string().nullable(),
});
export type WhyAnswer = z.infer<typeof WhyAnswer>;

// ---- Smart Diff ----
/** Review order: the substance, what connects it, its tests, its docs, the mechanical rest. */
export const SmartDiffRole = z.enum(['core', 'wiring', 'tests', 'docs', 'boilerplate']);
export type SmartDiffRole = z.infer<typeof SmartDiffRole>;

/** Why a file got its role — the rule that matched, so the UI can say it. */
export const SmartDiffReason = z.enum([
  'source',
  'agent_instructions',
  'entrypoint',
  'imports_only',
  'config',
  'migration',
  'infra',
  'lockfile',
  'generated',
  'test',
  'docs',
  'i18n',
  'assets',
  'styles',
  'tooling',
  'rename',
]);
export type SmartDiffReason = z.infer<typeof SmartDiffReason>;

/** A finding from the latest reviews, anchored to new-side lines of the file. */
export const SmartDiffFinding = z.object({
  id: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  severity: Severity,
  title: z.string(),
});
export type SmartDiffFinding = z.infer<typeof SmartDiffFinding>;

export const SmartDiffFile = z.object({
  path: z.string(),
  pseudocode_summary: z.string().nullish(),
  additions: z.number().int(),
  deletions: z.number().int(),
  finding_lines: z.array(z.number().int()),
  /** Rule that set the role; always present in API responses. */
  reason: SmartDiffReason.nullish(),
  /** Open findings from the latest reviews; always present in API responses. */
  findings: z.array(SmartDiffFinding).nullish(),
});
export type SmartDiffFile = z.infer<typeof SmartDiffFile>;

export const SmartDiffGroup = z.object({
  role: SmartDiffRole,
  files: z.array(SmartDiffFile),
});
export type SmartDiffGroup = z.infer<typeof SmartDiffGroup>;

export const ProposedSplit = z.object({
  name: z.string(),
  files: z.array(z.string()),
});
export type ProposedSplit = z.infer<typeof ProposedSplit>;

export const SmartDiff = z.object({
  groups: z.array(SmartDiffGroup),
  split_suggestion: z.object({
    too_big: z.boolean(),
    total_lines: z.number().int(),
    /** Changed lines in core and wiring files — what the size verdict counts. */
    reviewable_lines: z.number().int().nullish(),
    proposed_splits: z.array(ProposedSplit),
  }),
  /** Reviews the finding markers come from (latest per agent); 0 = not reviewed yet. */
  reviews_used: z.number().int().nullish(),
  /** The head moved since the last review: markers may point at shifted lines. */
  markers_stale: z.boolean().nullish(),
});
export type SmartDiff = z.infer<typeof SmartDiff>;

// ---- Composed PR Brief (pr_brief.json) ----
export const PrBrief = z.object({
  intent: Intent,
  blast: BlastRadius,
  risks: Risks,
  history: PrHistory,
});
export type PrBrief = z.infer<typeof PrBrief>;
