import type { CSSProperties } from "react";

/** Co-located styles for RoleGroup. */
export const s = {
  group: { marginBottom: 20 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 9, padding: "6px 0", marginBottom: 8 } satisfies CSSProperties,
  label: { fontSize: 13, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  desc: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  count: { marginLeft: "auto", fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
  badgeDot: (color: string): CSSProperties => ({ width: 7, height: 7, borderRadius: "50%", background: color }),
} as const;

/** "N files with findings" in the group header, in the worst severity's colour. */
export function findingsBadgeFor(color: string): CSSProperties {
  return { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, color };
}

export function swatchFor(color: string): CSSProperties {
  return { width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 };
}
