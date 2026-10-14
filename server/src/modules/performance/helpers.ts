import type { AgentPerfRow, PerfCostSegment } from '@devdigest/shared';
import { DAY_MS, FLAT_BAND, MIN_DECIDED_FOR_TREND } from './constants.js';

/**
 * SPEC-05 — the pure part: window bounds, the per-day series, rates, trend,
 * shares and ordering. Nothing here touches the database.
 */

export interface WindowBounds {
  /** First instant of the window (00:00 UTC, `days - 1` days before today). */
  from: Date;
  /** End of today (exclusive). */
  to: Date;
  /** Start of the previous window, `days` days before `from`. */
  prevFrom: Date;
}

/** The last `days` UTC calendar days ending today (today partial), and the window before. */
export function windowBounds(days: number, now: Date): WindowBounds {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const from = today - (days - 1) * DAY_MS;
  return { from: new Date(from), to: new Date(today + DAY_MS), prevFrom: new Date(from - days * DAY_MS) };
}

/** Exactly `days` counts from `from`, 0 for days without runs (AC-7). `rows` are UTC `YYYY-MM-DD` keys. */
export function fillDays(rows: readonly { day: string; n: number }[], from: Date, days: number): number[] {
  const byDay = new Map(rows.map((r) => [r.day, r.n]));
  return Array.from({ length: days }, (_, i) => byDay.get(new Date(from.getTime() + i * DAY_MS).toISOString().slice(0, 10)) ?? 0);
}

/** accepted ÷ decided; unknown when nothing was decided (AC-4). */
export const rate = (accepted: number, decided: number): number | null => (decided > 0 ? accepted / decided : null);

export interface Decisions {
  accepted: number;
  decided: number;
}

/** AC-5: up / down past one point, flat within it, null without enough decisions on either side. */
export function trend(current: Decisions, previous: Decisions): 'up' | 'down' | 'flat' | null {
  if (current.decided < MIN_DECIDED_FOR_TREND || previous.decided < MIN_DECIDED_FOR_TREND) return null;
  const delta = current.accepted / current.decided - previous.accepted / previous.decided;
  // 0.81 − 0.80 is 0.0100000000000000009 in floating point: the boundary is inclusive.
  if (Math.abs(delta) <= FLAT_BAND + 1e-9) return 'flat';
  return delta > 0 ? 'up' : 'down';
}

export const lowSample = (current: Decisions, previous: Decisions): boolean =>
  current.decided < MIN_DECIDED_FOR_TREND || previous.decided < MIN_DECIDED_FOR_TREND;

/** AC-8: each slice's share of the known total, largest first; null shares when the total is 0. */
export function shares(items: readonly { label: string; key: string | null; cost: number }[]): PerfCostSegment[] {
  const total = items.reduce((n, i) => n + i.cost, 0);
  return [...items]
    .sort((a, b) => b.cost - a.cost || a.label.localeCompare(b.label))
    .map((i) => ({ label: i.label, key: i.key, cost_usd: i.cost, share: total > 0 ? i.cost / total : null }));
}

/** AC-12: by accept rate (unknown last), then runs, then name, then id. */
export function sortAgents(rows: readonly AgentPerfRow[]): AgentPerfRow[] {
  return [...rows].sort(
    (a, b) =>
      (b.accept_rate ?? -1) - (a.accept_rate ?? -1) ||
      b.runs - a.runs ||
      (a.name ?? '￿').localeCompare(b.name ?? '￿') ||
      (a.agent_id ?? '').localeCompare(b.agent_id ?? ''),
  );
}

/** AC-7: most runs among existing agents; ties by name then id; null without runs. */
export function mostActive(rows: readonly AgentPerfRow[]): { agent_id: string; name: string; runs: number; accept_rate: number | null } | null {
  const live = rows.filter((r): r is AgentPerfRow & { agent_id: string; name: string } => r.agent_id !== null && r.name !== null);
  const top = [...live].sort((a, b) => b.runs - a.runs || a.name.localeCompare(b.name) || a.agent_id.localeCompare(b.agent_id))[0];
  return top ? { agent_id: top.agent_id, name: top.name, runs: top.runs, accept_rate: top.accept_rate } : null;
}

/** AC-7: the change in cost, only when both windows have a known cost. */
export const costChange = (current: number | null, previous: number | null): number | null =>
  current !== null && previous !== null ? current - previous : null;
