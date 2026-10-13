import { describe, it, expect } from "vitest";
import type { SmartDiffFinding } from "@devdigest/shared";
import { anchorFindings, markFor, parsePatch } from "./helpers";

const finding = (id: string, start: number, end: number, severity: SmartDiffFinding["severity"]): SmartDiffFinding => ({
  id,
  start_line: start,
  end_line: end,
  severity,
  title: `finding ${id}`,
});

describe("markFor", () => {
  const lines = parsePatch("@@ -10,3 +10,4 @@\n a\n-b\n+c\n+d\n e");
  const at = (text: string) => lines.find((l) => l.text === text)!;

  it("marks new-side lines a finding covers, never removed lines or hunk headers", () => {
    const findings = [finding("1", 11, 12, "WARNING")];
    const anchors = anchorFindings(lines, findings);
    expect(markFor(at("c"), findings, anchors)).toEqual({ severity: "WARNING", starting: findings });
    expect(markFor(at("d"), findings, anchors)).toEqual({ severity: "WARNING", starting: [] });
    expect(markFor(at("b"), findings, anchors)).toBeNull();
    expect(markFor(lines[0]!, findings, anchors)).toBeNull();
    expect(markFor(at("e"), findings, anchors)).toBeNull();
  });

  it("colours by the worst covering finding and lists those starting on the line, worst first", () => {
    const findings = [finding("s", 12, 12, "SUGGESTION"), finding("c", 10, 13, "CRITICAL"), finding("w", 12, 12, "WARNING")];
    const mark = markFor(at("d"), findings, anchorFindings(lines, findings));
    expect(mark?.severity).toBe("CRITICAL");
    expect(mark?.starting.map((f) => f.id)).toEqual(["w", "s"]);
  });
});

describe("anchorFindings", () => {
  const lines = parsePatch("@@ -10,3 +10,4 @@\n a\n-b\n+c\n+d\n e");

  it("labels a finding that starts above the hunk on its first shown line", () => {
    const early = finding("early", 5, 11, "WARNING");
    expect(anchorFindings(lines, [early]).byLine.get(10)).toEqual([early]);
  });

  it("puts findings with no shown line outside the diff, top to bottom, so none gets lost", () => {
    const below = finding("below", 40, 41, "SUGGESTION");
    const above = finding("above", 2, 3, "CRITICAL");
    const { byLine, outside } = anchorFindings(lines, [below, above]);
    expect(byLine.size).toBe(0);
    expect(outside.map((f) => f.id)).toEqual(["above", "below"]);
    expect(anchorFindings([], [below]).outside).toEqual([below]);
  });
});

describe("parsePatch", () => {
  it("numbers both sides; the no-newline marker and a trailing newline are not lines (SPEC-04 AC-11)", () => {
    const lines = parsePatch("@@ -4,2 +4,2 @@\n keep\n-old\n+new\n\\ No newline at end of file\n");
    expect(lines.map((l) => [l.kind, l.text, l.oldNo ?? null, l.newNo ?? null])).toEqual([
      ["hunk", "@@ -4,2 +4,2 @@", null, null],
      ["ctx", "keep", 4, 4],
      ["del", "old", 5, null],
      ["add", "new", null, 5],
    ]);
  });
});
