/** SPEC-05 limits and thresholds. */

export const WINDOW_DAYS = ['7', '30', '90'] as const;
export const DEFAULT_DAYS = 30;
/** A trend needs this many decided findings in both windows (AC-5). */
export const MIN_DECIDED_FOR_TREND = 5;
/** Accept-rate moves within one percentage point are "flat" (AC-5). */
export const FLAT_BAND = 0.01;
/** Runs listed per agent when its row is expanded (AC-9). */
export const RECENT_RUNS = 5;
export const DELETED_AGENT_LABEL = 'deleted agent';
export const UNKNOWN_MODEL_LABEL = 'unknown model';
export const DAY_MS = 86_400_000;
