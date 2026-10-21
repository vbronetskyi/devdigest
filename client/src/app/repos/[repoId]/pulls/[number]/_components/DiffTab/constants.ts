import type { SmartDiffRole } from "@devdigest/shared";

export type DiffOrder = "smart" | "original";
export const ORDERS: readonly DiffOrder[] = ["smart", "original"];

/** Group swatch colour: accent for the substance, warning for wiring, calmer for the rest. */
export const ROLE_COLOR: Record<SmartDiffRole, string> = {
  core: "var(--accent)",
  wiring: "var(--warn)",
  tests: "var(--ok)",
  docs: "var(--info)",
  boilerplate: "var(--text-muted)",
};

/** Paths listed per proposed split before "+N more". */
export const SPLIT_FILES_SHOWN = 4;
