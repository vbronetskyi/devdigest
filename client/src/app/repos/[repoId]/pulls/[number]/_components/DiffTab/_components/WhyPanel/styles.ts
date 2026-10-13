import type { CSSProperties } from "react";

/** Co-located styles for WhyPanel. */
export const s = {
  panel: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    margin: "2px 12px 6px 58px",
    padding: "7px 10px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    fontSize: 12,
  } satisfies CSSProperties,
  icon: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  sha: { color: "var(--accent-text)" } satisfies CSSProperties,
  subject: { color: "var(--text-primary)", fontWeight: 500 } satisfies CSSProperties,
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
  error: { color: "var(--crit)" } satisfies CSSProperties,
  pr: { display: "inline-flex", alignItems: "center", gap: 4, color: "var(--accent-text)" } satisfies CSSProperties,
} as const;
