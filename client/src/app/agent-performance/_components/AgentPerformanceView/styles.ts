import type { CSSProperties } from "react";

export const s = {
  page: { padding: "20px 28px 40px", maxWidth: 1040, margin: "0 auto" } satisfies CSSProperties,
  head: { display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 18 } satisfies CSSProperties,
  h1: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", marginTop: 3, marginBottom: 0 } satisfies CSSProperties,
  windows: { marginLeft: "auto", display: "flex", gap: 4 } satisfies CSSProperties,
  section: { marginTop: 24 } satisfies CSSProperties,
  skeletons: { display: "grid", gap: 14 } satisfies CSSProperties,
} as const;
