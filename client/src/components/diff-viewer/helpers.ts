/** Pure helpers for the DiffViewer. */
import type React from "react";
import type { Severity, SmartDiffFinding } from "@devdigest/shared";
import { HUNK_HEADER_RE } from "./constants";

export interface Line {
  kind: "add" | "del" | "ctx" | "hunk";
  text: string;
  oldNo?: number;
  newNo?: number;
}

/** Parse unified-diff patch text into renderable lines with old/new line numbers. */
export function parsePatch(patch: string | null | undefined): Line[] {
  if (!patch) return [];
  const out: Line[] = [];
  let oldNo = 0;
  let newNo = 0;
  for (const raw of patch.split("\n")) {
    if (raw.startsWith("@@")) {
      const m = raw.match(HUNK_HEADER_RE);
      if (m) {
        oldNo = parseInt(m[1]!, 10);
        newNo = parseInt(m[2]!, 10);
      }
      out.push({ kind: "hunk", text: raw });
    } else if (raw.startsWith("+")) {
      out.push({ kind: "add", text: raw.slice(1), newNo });
      newNo++;
    } else if (raw.startsWith("-")) {
      out.push({ kind: "del", text: raw.slice(1), oldNo });
      oldNo++;
    } else {
      out.push({ kind: "ctx", text: raw.slice(raw.startsWith(" ") ? 1 : 0), oldNo, newNo });
      oldNo++;
      newNo++;
    }
  }
  return out;
}

/** Smart Diff extras for one file: finding markers, a role note, the initial fold. */
export interface FileAnnotation {
  findings: SmartDiffFinding[];
  /** Short muted label in the file header, e.g. "lockfile". */
  note?: string;
  /** Overrides the size-based default fold. */
  defaultOpen?: boolean;
  /** Deep link target: the card opens and scrolls into view, the new-side line (if any) is highlighted. */
  focus?: { line: number | null };
}

/** Optional git-why (HW L05): what to show under a removed or context line, by its base line number. */
export interface WhyApi {
  render: (path: string, oldLine: number) => React.ReactNode;
  label: string;
}

/**
 * How the diff shows findings in detail. The page owns the data and the actions
 * (accept/dismiss), so it renders the card; the viewer only decides where.
 */
export interface DiffFindingApi {
  /** Shared with the comments toggle: hiding it leaves the diff clean. */
  visible: boolean;
  /** The full card for a finding, or null when the page has no details for it. */
  render: (finding: SmartDiffFinding) => React.ReactNode;
}

/** What a diff line shows for the findings covering it. */
export interface LineMark {
  /** The most severe finding covering the line — colours the gutter bar. */
  severity: Severity;
  /** Findings anchored on this line, most severe first — labelled at the line end. */
  starting: SmartDiffFinding[];
}

/** Where each finding is labelled: the first shown new-side line its range covers. */
export interface FindingAnchors {
  /** New-side line number → findings labelled there. */
  byLine: Map<number, SmartDiffFinding[]>;
  /** Findings none of whose lines the patch shows — listed at the end of the file. */
  outside: SmartDiffFinding[];
}

const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

export function bySeverity(a: { severity: Severity }, b: { severity: Severity }): number {
  return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
}

const shownNewLine = (ln: Line): number | null => (ln.kind === "del" || ln.kind === "hunk" || ln.newNo === undefined ? null : ln.newNo);

/**
 * Anchor every finding to a line the patch shows. A finding that starts above
 * the hunk is labelled on its first visible line; one whose lines are all
 * outside the patch would otherwise vanish, so it goes to `outside`.
 */
export function anchorFindings(lines: readonly Line[], findings: readonly SmartDiffFinding[]): FindingAnchors {
  const shown = lines.map(shownNewLine).filter((n): n is number => n !== null).sort((a, b) => a - b);
  const byLine = new Map<number, SmartDiffFinding[]>();
  const outside: SmartDiffFinding[] = [];
  for (const f of [...findings].sort(bySeverity)) {
    const at = shown.find((n) => f.start_line <= n && n <= f.end_line);
    if (at === undefined) outside.push(f);
    else byLine.set(at, [...(byLine.get(at) ?? []), f]);
  }
  outside.sort((a, b) => a.start_line - b.start_line || bySeverity(a, b));
  return { byLine, outside };
}

/** Findings sit on new-side line numbers, so removed lines and hunk headers never carry a mark. */
export function markFor(ln: Line, findings: readonly SmartDiffFinding[], anchors: FindingAnchors): LineMark | null {
  const n = shownNewLine(ln);
  if (n === null) return null;
  const covering = findings.filter((f) => f.start_line <= n && n <= f.end_line).sort(bySeverity);
  if (covering.length === 0) return null;
  return { severity: covering[0]!.severity, starting: anchors.byLine.get(n) ?? [] };
}
