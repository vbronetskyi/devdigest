import type { PerfWindow } from "@/lib/hooks/performance";

export const WINDOWS: readonly PerfWindow[] = [7, 30, 90];
export const DEFAULT_WINDOW: PerfWindow = 30;
/** Donut slices take the chart tokens by key (`sliceColors`): six distinct hues, none grey. */
export const SLICE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"] as const;
/** The deleted-agent and unknown-model slices: outside the palette, so their coming and going moves no one. */
export const NEUTRAL_SLICE = "var(--text-muted)";
