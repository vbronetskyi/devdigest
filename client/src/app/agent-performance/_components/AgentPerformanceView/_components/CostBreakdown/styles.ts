import type { CSSProperties } from "react";

export const s = {
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 } satisfies CSSProperties,
  card: { padding: 16, borderRadius: 9, border: "1px solid var(--border)", background: "var(--bg-elevated)" } satisfies CSSProperties,
  title: { fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 14 } satisfies CSSProperties,
  empty: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
