import type { IconName } from "@devdigest/ui";
import type { RiskSeverity } from "@devdigest/shared";

/** Risk kind → icon; an unknown kind falls back to AlertTriangle. */
export const KIND_ICON: Record<string, IconName> = {
  security: "Shield",
  db_migration: "Database",
  breaking_api: "AlertOctagon",
  perf: "Zap",
  deps: "Boxes",
  correctness: "Bug",
};

export const SEVERITY_COLOR: Record<RiskSeverity, string> = {
  high: "var(--crit)",
  medium: "var(--warn)",
  low: "var(--info)",
};
