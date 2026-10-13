import type { PrFile, Severity, SmartDiff, SmartDiffFinding, SmartDiffReason, SmartDiffRole } from "@devdigest/shared";
import type { FileAnnotation } from "@/components/diff-viewer";
import type { DiffOrder } from "./constants";

export interface RoleSection {
  role: SmartDiffRole;
  files: PrFile[];
}

/**
 * The smart groups mapped onto the PR files the page loaded. A file the smart
 * diff does not list (synced in between the two requests) is never hidden: it
 * goes to the end of the last group.
 */
export function roleSections(smart: SmartDiff, files: readonly PrFile[]): RoleSection[] {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const sections: RoleSection[] = smart.groups.map((g) => ({
    role: g.role,
    files: g.files.flatMap((f) => byPath.get(f.path) ?? []),
  }));
  const listed = new Set(smart.groups.flatMap((g) => g.files.map((f) => f.path)));
  const rest = files.filter((f) => !listed.has(f.path));
  if (rest.length > 0) {
    const last = sections.at(-1);
    if (last) last.files.push(...rest);
    else sections.push({ role: "core", files: [...rest] });
  }
  return sections.filter((sec) => sec.files.length > 0);
}

/**
 * Per-file markers, role notes and initial fold. Files with findings open;
 * in the smart order boilerplate starts folded and says why it is there.
 */
export function annotationsFor(
  smart: SmartDiff | undefined,
  order: DiffOrder,
  noteFor: (reason: Exclude<SmartDiffReason, "source">) => string,
): Record<string, FileAnnotation> {
  const out: Record<string, FileAnnotation> = {};
  for (const group of smart?.groups ?? []) {
    for (const f of group.files) {
      const smartOrder = order === "smart";
      const findings = f.findings ?? [];
      out[f.path] = {
        findings,
        note: smartOrder && f.reason && f.reason !== "source" ? noteFor(f.reason) : undefined,
        defaultOpen: findings.length > 0 ? true : smartOrder && group.role === "boilerplate" ? false : undefined,
      };
    }
  }
  return out;
}

const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

/** The worst severity among findings, or null when there are none. */
export function worstSeverity(findings: readonly SmartDiffFinding[]): Severity | null {
  return findings.reduce<Severity | null>((w, f) => (w === null || SEVERITY_RANK[f.severity] < SEVERITY_RANK[w] ? f.severity : w), null);
}

/** The last two path segments — enough to tell files apart in a one-line list. */
export function shortPath(path: string): string {
  return path.split("/").slice(-2).join("/");
}

/** A deep link (HW L05 risk brief) on top of the smart-diff annotations: that file opens and scrolls. */
export function withFocus(
  annotations: Record<string, FileAnnotation>,
  focus: { file: string; line: number | null } | null,
): Record<string, FileAnnotation> {
  if (!focus) return annotations;
  const current = annotations[focus.file] ?? { findings: [] };
  return { ...annotations, [focus.file]: { ...current, defaultOpen: true, focus: { line: focus.line } } };
}
