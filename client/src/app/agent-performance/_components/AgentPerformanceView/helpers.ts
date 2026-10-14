import type { AgentPerfRun } from "@devdigest/shared";
import { formatCost } from "@/lib/format-cost";

/** "52s", "1m 05s"; null when unknown (the caller shows "—" with a reason). */
export function formatDuration(ms: number | null): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

/** 0.8 → "80%"; null when unknown. */
export const percent = (rate: number | null): string | null => (rate == null ? null : `${Math.round(rate * 100)}%`);

/** The PR's Agent runs tab; null for a run whose PR was deleted (shown unlinked). */
export function runHref(run: AgentPerfRun): string | null {
  return run.repo_id && run.pr_number != null ? `/repos/${run.repo_id}/pulls/${run.pr_number}?tab=findings` : null;
}

/** A cost change as sign + amount in the app's cost format. */
export function signedCost(change: number): { sign: string; amount: string } {
  return { sign: change > 0 ? "+" : change < 0 ? "−" : "±", amount: formatCost(Math.abs(change)) };
}
