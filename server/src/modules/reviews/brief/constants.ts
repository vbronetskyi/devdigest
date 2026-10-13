/** SPEC-03 limits; SPEC-04 has no tunables. */
export const BRIEF_SCHEMA_NAME = 'RiskBrief';
export const BRIEF_OPENROUTER_MODEL = 'deepseek/deepseek-v4-flash';
export const BRIEF_DEADLINE_MS = 90_000;
export const MAX_RISKS = 6;
export const MAX_FOCUS = 5;
export const HISTORY_LIMIT = 8;
/** git log entries scanned to find HISTORY_LIMIT PRs (direct commits are skipped). */
export const HISTORY_SCAN = 60;
export const PATCH_MAX_CHARS = 12_000;
export const RISK_KINDS = ['security', 'db_migration', 'breaking_api', 'perf', 'deps', 'correctness'] as const;
