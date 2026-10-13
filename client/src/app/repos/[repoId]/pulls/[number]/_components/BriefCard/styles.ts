import type { CSSProperties } from "react";

/** Co-located styles for BriefCard. */
export const s = {
  card: { border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-elevated)", padding: 18 } satisfies CSSProperties,
  error: { fontSize: 12.5, color: "var(--crit)", background: "var(--crit-bg)", borderRadius: 7, padding: "8px 12px", marginBottom: 12 } satisfies CSSProperties,
  stale: { fontSize: 12.5, color: "var(--warn)", background: "var(--warn-bg)", borderRadius: 7, padding: "8px 12px", marginBottom: 12 } satisfies CSSProperties,
  empty: { textAlign: "center", padding: "18px 0 6px" } satisfies CSSProperties,
  emptyTitle: { fontSize: 14.5, fontWeight: 700, marginBottom: 6 } satisfies CSSProperties,
  emptyBody: { fontSize: 12.5, lineHeight: 1.55, color: "var(--text-muted)", maxWidth: 520, margin: "0 auto 14px" } satisfies CSSProperties,
  h3: { display: "flex", alignItems: "center", gap: 8, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", margin: "4px 0 10px" } satisfies CSSProperties,
  none: { fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 12px" } satisfies CSSProperties,
  pills: { display: "flex", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  pillMain: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, padding: "6px 10px", border: "none", background: "transparent", cursor: "pointer", textAlign: "left", fontFamily: "inherit", color: "inherit" } satisfies CSSProperties,
  pillTitle: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  pillMeta: { fontSize: 11, color: "var(--text-muted)" } satisfies CSSProperties,
  pillToggle: { display: "grid", placeItems: "center", width: 28, border: "none", borderLeft: "1px solid var(--border)", background: "transparent", cursor: "pointer", color: "var(--text-muted)" } satisfies CSSProperties,
  explain: { marginTop: 10, padding: "10px 12px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg-surface)", fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  refs: { display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 } satisfies CSSProperties,
  refBtn: { border: "none", background: "transparent", padding: 0, cursor: "pointer", fontSize: 11.5, color: "var(--accent-text)" } satisfies CSSProperties,
  focus: { listStyle: "none", padding: 0, margin: "0 0 14px", display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  focusBtn: { display: "flex", alignItems: "baseline", gap: 9, width: "100%", padding: "6px 8px", borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", textAlign: "left", fontFamily: "inherit" } satisfies CSSProperties,
  focusRef: { fontSize: 11.5, color: "var(--accent-text)", flexShrink: 0 } satisfies CSSProperties,
  focusReason: { fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.4 } satisfies CSSProperties,
  history: { marginTop: 14, border: "1px solid var(--border)", borderRadius: 7, overflow: "hidden" } satisfies CSSProperties,
  historyHead: { display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px", border: "none", background: "transparent", cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", fontFamily: "inherit" } satisfies CSSProperties,
  historyBody: { borderTop: "1px solid var(--border)", padding: "8px 12px" } satisfies CSSProperties,
  historyRow: { padding: "8px 0", borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  historyTitle: { display: "flex", gap: 8, alignItems: "baseline", fontSize: 13, fontWeight: 600 } satisfies CSSProperties,
  prLink: { color: "var(--accent-text)", fontSize: 12 } satisfies CSSProperties,
  historyMeta: { fontSize: 11.5, color: "var(--text-muted)", margin: "3px 0" } satisfies CSSProperties,
  historyNote: { fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 } satisfies CSSProperties,
  overlap: { fontSize: 11, color: "var(--text-muted)", marginTop: 3 } satisfies CSSProperties,
  chevron: (open: boolean): CSSProperties => ({ marginLeft: "auto", color: "var(--text-muted)", transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }),
  footer: (signals: boolean): CSSProperties => ({ fontSize: 11.5, color: signals ? "var(--warn)" : "var(--text-muted)", margin: "14px 0 0" }),
} as const;

export function pillFor(color: string, expanded: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "stretch",
    borderRadius: 7,
    overflow: "hidden",
    border: `1px solid ${expanded ? color : "var(--border)"}`,
    background: expanded ? "var(--bg-hover)" : "transparent",
  };
}
