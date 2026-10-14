import type { PerfWindow } from "@/lib/hooks/performance";

export const WINDOWS: readonly PerfWindow[] = [7, 30, 90];
export const DEFAULT_WINDOW: PerfWindow = 30;
/** Donut slices take design tokens in order. */
export const SLICE_COLORS = ["var(--accent)", "var(--ok)", "var(--warn)", "var(--crit)", "var(--sugg)", "var(--info)"] as const;
