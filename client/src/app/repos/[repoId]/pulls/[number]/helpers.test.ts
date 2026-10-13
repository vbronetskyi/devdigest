import { describe, it, expect } from "vitest";
import { baseBranchView, fileLinkQuery, focusFromQuery } from "./helpers";

describe("PR page helpers", () => {
  it("SPEC-03 AC-22: a reference opens Files changed at the file and line, keeping other params", () => {
    expect(fileLinkQuery("tab=overview&trace=r1", "src/a b.ts", 12)).toBe("tab=diff&trace=r1&file=src%2Fa+b.ts&line=12");
    expect(fileLinkQuery("tab=overview&line=5", "src/a.ts", null)).toBe("tab=diff&file=src%2Fa.ts");
  });

  it("SPEC-03 AC-22: reads the focus back; a bad line falls back to the file", () => {
    expect(focusFromQuery("src/a.ts", "12")).toEqual({ file: "src/a.ts", line: 12 });
    expect(focusFromQuery("src/a.ts", "0")).toEqual({ file: "src/a.ts", line: null });
    expect(focusFromQuery("src/a.ts", "x")).toEqual({ file: "src/a.ts", line: null });
    expect(focusFromQuery("src/a.ts", null)).toEqual({ file: "src/a.ts", line: null });
    expect(focusFromQuery(null, "3")).toBeNull();
  });

  it("SPEC-04 AC-11 / SPEC-03 edge case: why only into the default branch; otherwise the history note", () => {
    expect(baseBranchView("main", "main")).toEqual({ whyEnabled: true, historyBranch: null });
    expect(baseBranchView("hw-4/blast-radius", "main")).toEqual({ whyEnabled: false, historyBranch: "main" });
    expect(baseBranchView("main", null)).toEqual({ whyEnabled: false, historyBranch: null });
  });
});
