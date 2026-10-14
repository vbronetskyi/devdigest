import type { CSSProperties } from "react";

export const s = {
  row: { display: "flex", gap: 14 } satisfies CSSProperties,
  card: { flex: 1, minWidth: 0, padding: 16, borderRadius: 9, border: "1px solid var(--border)", background: "var(--bg-elevated)" } satisfies CSSProperties,
  label: { fontSize: 11, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.03em" } satisfies CSSProperties,
  top: { display: "flex", alignItems: "center", justifyContent: "space-between" } satisfies CSSProperties,
  value: { fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 10 } satisfies CSSProperties,
  name: { fontSize: 15, fontWeight: 700, marginTop: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  sub: { fontSize: 12, color: "var(--text-muted)", marginTop: 4 } satisfies CSSProperties,
  spark: { marginTop: 8 } satisfies CSSProperties,
  down: { color: "var(--ok)" } satisfies CSSProperties,
  up: { color: "var(--crit)" } satisfies CSSProperties,
} as const;
