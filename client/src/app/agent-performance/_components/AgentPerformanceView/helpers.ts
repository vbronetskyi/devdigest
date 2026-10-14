import type { AgentPerfRun } from "@devdigest/shared";
import { formatCost } from "@/lib/format-cost";
import { NEUTRAL_SLICE, SLICE_COLORS } from "./constants";

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

/**
 * A colour per slice key that does not depend on the slice's position (SPEC-05 AC-11):
 * the key hashes to a palette slot, and a taken slot passes to the next free one (keys
 * placed in sorted order, so the same set always gets the same colours). A null key —
 * the deleted agent, the unknown model — is grey and takes no slot. Past the palette,
 * colours repeat.
 */
export function sliceColors(keys: readonly (string | null)[]): string[] {
  const n = SLICE_COLORS.length;
  const taken = new Set<number>();
  const slot = new Map<string, number>();
  for (const k of [...new Set(keys.filter((k): k is string => k !== null))].sort()) {
    let i = fnv1a(k) % n;
    for (let step = 0; step < n && taken.has(i); step++) i = (i + 1) % n;
    taken.add(i);
    slot.set(k, i);
  }
  return keys.map((k) => (k === null ? NEUTRAL_SLICE : SLICE_COLORS[slot.get(k)!]!));
}

function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}
