import { z } from 'zod';
import { Severity } from './findings.js';

/**
 * A6 — Productionize contracts (L08).
 *
 * NEW file (A6 owns it; the barrel re-exports it). Covers:
 *   - PluginBundle / InstalledPlugin   POST /plugins/export, /plugins/import, GET /plugins
 *   - AgentPerf / AgentPerfRow         GET /agents/performance
 *   - Digest / DigestSettings          Weekly Digest (settings + cron-built rows)
 *
 * Nothing here mutates an existing contract — these sit alongside A2's
 * `review-api.ts` and A5's `observability.ts`.
 */

// ---------------------------------------------------------------------------
// Plugin export / import  (.devdigest-plugin/ bundle)
// ---------------------------------------------------------------------------

/** An exported skill (config only — no DB ids; round-trippable). */
export const PluginSkill = z.object({
  name: z.string(),
  description: z.string(),
  type: z.enum(['rubric', 'convention', 'security', 'custom']),
  source: z.enum(['manual', 'imported_url', 'imported_file', 'extracted', 'community']),
  body: z.string(),
  enabled: z.boolean(),
  evidence_files: z.array(z.string()).nullish(),
});
export type PluginSkill = z.infer<typeof PluginSkill>;

/** An exported agent. `skills` references PluginSkill.name within the bundle. */
export const PluginAgent = z.object({
  name: z.string(),
  description: z.string(),
  provider: z.enum(['openai', 'anthropic']),
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  enabled: z.boolean(),
  /** Names of skills (in this bundle) linked to the agent, in order. */
  skills: z.array(z.string()),
});
export type PluginAgent = z.infer<typeof PluginAgent>;

/** An exported eval case. `owner_ref` ties it to an agent or skill by name. */
export const PluginEvalCase = z.object({
  name: z.string(),
  owner_kind: z.enum(['skill', 'agent']),
  owner_ref: z.string(),
  input_diff: z.string().nullish(),
  input_files: z.unknown().nullish(),
  input_meta: z.unknown().nullish(),
  expected_output: z.unknown().nullish(),
  notes: z.string().nullish(),
});
export type PluginEvalCase = z.infer<typeof PluginEvalCase>;

/** An exported convention (house-rule). */
export const PluginConvention = z.object({
  rule: z.string(),
  evidence_path: z.string().nullish(),
  evidence_snippet: z.string().nullish(),
  confidence: z.number().nullish(),
  accepted: z.boolean(),
});
export type PluginConvention = z.infer<typeof PluginConvention>;

export const PluginManifest = z.object({
  name: z.string(),
  version: z.string(),
  format: z.literal('devdigest-plugin/v1'),
  exported_at: z.string(),
  description: z.string().nullish(),
  counts: z.object({
    agents: z.number().int(),
    skills: z.number().int(),
    eval_cases: z.number().int(),
    conventions: z.number().int(),
  }),
});
export type PluginManifest = z.infer<typeof PluginManifest>;

/** The whole `.devdigest-plugin/` bundle as one JSON document. */
export const PluginBundle = z.object({
  manifest: PluginManifest,
  agents: z.array(PluginAgent),
  skills: z.array(PluginSkill),
  eval_cases: z.array(PluginEvalCase),
  conventions: z.array(PluginConvention),
});
export type PluginBundle = z.infer<typeof PluginBundle>;

/** Request body for POST /plugins/export. */
export const PluginExportRequest = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  /** Limit export to a subset of agent ids (default: all). */
  agent_ids: z.array(z.string()).optional(),
});
export type PluginExportRequest = z.infer<typeof PluginExportRequest>;

/** Request body for POST /plugins/import. */
export const PluginImportRequest = z.object({
  bundle: PluginBundle,
  /** 'merge' keeps existing items; 'replace' is reserved (merge is the default). */
  mode: z.enum(['merge', 'replace']).default('merge').optional(),
});
export type PluginImportRequest = z.infer<typeof PluginImportRequest>;

/** A row in `installed_plugins` (GET /plugins). */
export const InstalledPlugin = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string().nullable(),
  source: z.string().nullable(),
  installed_at: z.string(),
  enabled: z.boolean(),
});
export type InstalledPlugin = z.infer<typeof InstalledPlugin>;

/** Result of an import: what was created + the installed_plugins row. */
export const PluginImportResult = z.object({
  installed: InstalledPlugin,
  created: z.object({
    agents: z.number().int(),
    skills: z.number().int(),
    eval_cases: z.number().int(),
    conventions: z.number().int(),
  }),
});
export type PluginImportResult = z.infer<typeof PluginImportResult>;

// ---------------------------------------------------------------------------
// Agent Performance  (GET /agents/performance)
// ---------------------------------------------------------------------------

// The starter's stub, implemented by SPEC-05 (specs/agent-performance/spec.md).

/** One counted run of an agent (done or failed); run figures are null unless it is done. */
export const AgentPerfRun = z.object({
  run_id: z.string(),
  ran_at: z.string(),
  status: z.enum(['done', 'failed']),
  /** Null when the PR was deleted. */
  repo_id: z.string().nullable(),
  pr_number: z.number().int().nullable(),
  pr_title: z.string().nullable(),
  score: z.number().int().nullable(),
  findings_count: z.number().int().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
});
export type AgentPerfRun = z.infer<typeof AgentPerfRun>;

export const AgentPerfRow = z.object({
  /** Null: runs of deleted agents, one row. */
  agent_id: z.string().nullable(),
  name: z.string().nullable(),
  runs: z.number().int(),
  failed: z.number().int(),
  cost_usd: z.number().nullable(),
  avg_cost_usd: z.number().nullable(),
  avg_duration_ms: z.number().nullable(),
  accept_rate: z.number().nullable(),
  decided: z.number().int(),
  accept_trend: z.enum(['up', 'down', 'flat']).nullable(),
  /** Fewer decided findings than a trend needs, in this window or the previous one — false when nothing is decided. */
  low_sample: z.boolean(),
  last_run_at: z.string().nullable(),
  recent: z.array(AgentPerfRun),
});
export type AgentPerfRow = z.infer<typeof AgentPerfRow>;

export const PerfCostSegment = z.object({
  label: z.string(),
  /** Agent id or model id; null for deleted agents / unknown model. */
  key: z.string().nullable(),
  cost_usd: z.number(),
  share: z.number().nullable(),
});
export type PerfCostSegment = z.infer<typeof PerfCostSegment>;

/** Response of GET /agents/performance (SPEC-05). */
export const AgentPerf = z.object({
  window: z.object({ days: z.number().int(), from: z.string(), to: z.string() }),
  totals: z.object({
    runs: z.number().int(),
    failed: z.number().int(),
    cost_usd: z.number().nullable(),
    runs_without_cost: z.number().int(),
    prev_cost_usd: z.number().nullable(),
    cost_change_usd: z.number().nullable(),
    accept_rate: z.number().nullable(),
    decided: z.number().int(),
    runs_per_day: z.array(z.number().int()),
    most_active: z
      .object({ agent_id: z.string(), name: z.string(), runs: z.number().int(), accept_rate: z.number().nullable() })
      .nullable(),
  }),
  agents: z.array(AgentPerfRow),
  cost_by_agent: z.array(PerfCostSegment),
  cost_by_model: z.array(PerfCostSegment),
});
export type AgentPerf = z.infer<typeof AgentPerf>;

// re-export Severity-adjacent helper to keep the import surface tidy
export { Severity };

// ---------------------------------------------------------------------------
// Weekly Digest
// ---------------------------------------------------------------------------

/** A persisted digest row (one period summary). */
export const Digest = z.object({
  id: z.string(),
  period_start: z.string().nullable(),
  period_end: z.string().nullable(),
  body_md: z.string().nullable(),
  delivered_to: z.string().nullable(),
});
export type Digest = z.infer<typeof Digest>;

/** Request body for POST /digest/run (build now). */
export const DigestRunRequest = z.object({
  /** ISO range; defaults to the last 7 days. */
  period_start: z.string().optional(),
  period_end: z.string().optional(),
});
export type DigestRunRequest = z.infer<typeof DigestRunRequest>;

// ---- Weekly digest (HW L08, SPEC-06): one ISO week, computed from stored data ----

/** The week's numbers; `cost_usd` and `accept_rate` are null when unknown. */
export const DigestFacts = z.object({
  prs_opened: z.number().int(),
  prs_reviewed: z.number().int(),
  runs: z.number().int(),
  failed: z.number().int(),
  cost_usd: z.number().nullable(),
  runs_without_cost: z.number().int(),
  findings: z.object({ CRITICAL: z.number().int(), WARNING: z.number().int(), SUGGESTION: z.number().int() }),
  accepted: z.number().int(),
  dismissed: z.number().int(),
  accept_rate: z.number().nullable(),
});
export type DigestFacts = z.infer<typeof DigestFacts>;

/** This week minus the previous one, per number; null when either side is unknown. */
export const DigestChange = z.object({
  prs_opened: z.number(),
  prs_reviewed: z.number(),
  runs: z.number(),
  cost_usd: z.number().nullable(),
  critical: z.number(),
  accepted: z.number(),
  dismissed: z.number(),
});
export type DigestChange = z.infer<typeof DigestChange>;

export const DigestCritical = z.object({
  finding_id: z.string(),
  repo_id: z.string(),
  repo_full_name: z.string(),
  pr_number: z.number().int(),
  pr_title: z.string(),
  /** GitHub state when the PR is no longer open. */
  pr_state: z.enum(['merged', 'closed']).nullable(),
  file: z.string(),
  line: z.number().int(),
  title: z.string(),
  /** Null when the agent was deleted. */
  agent_name: z.string().nullable(),
  ran_at: z.string(),
});
export type DigestCritical = z.infer<typeof DigestCritical>;

export const DigestAgent = z.object({
  agent_id: z.string().nullable(),
  name: z.string().nullable(),
  runs: z.number().int(),
  cost_usd: z.number().nullable(),
  accept_rate: z.number().nullable(),
  decided: z.number().int(),
});
export type DigestAgent = z.infer<typeof DigestAgent>;

export const DigestHighlights = z.object({
  lines: z.array(z.string()),
  model: z.string(),
  cost_usd: z.number().nullable(),
  generated_at: z.string(),
  /** The week's facts changed since the highlights were written. */
  stale: z.boolean(),
});
export type DigestHighlights = z.infer<typeof DigestHighlights>;

/** Response of GET /digest?week=YYYY-Www (SPEC-06). */
export const WeeklyDigest = z.object({
  week: z.string(),
  from: z.string(),
  to: z.string(),
  in_progress: z.boolean(),
  /** No runs and no decisions in the week. */
  empty: z.boolean(),
  facts: DigestFacts,
  /** The previous week — for a week in progress, over the same elapsed span. */
  prev: DigestFacts,
  change: DigestChange,
  open_criticals: z.array(DigestCritical),
  open_criticals_total: z.number().int(),
  agents: z.array(DigestAgent),
  highlights: DigestHighlights.nullable(),
});
export type WeeklyDigest = z.infer<typeof WeeklyDigest>;

export const DigestHighlightsRequest = z.object({ week: z.string() });
export type DigestHighlightsRequest = z.infer<typeof DigestHighlightsRequest>;
