import { describe, it, expect } from "vitest";
import { formatDuration, percent, runHref, signedCost, sliceColors } from "./helpers";
import { SLICE_COLORS } from "./constants";

describe("agent performance helpers (SPEC-05)", () => {
  it("formats durations and rates, unknown as null", () => {
    expect(formatDuration(51_848)).toBe("52s");
    expect(formatDuration(65_000)).toBe("1m 05s");
    expect(formatDuration(null)).toBeNull();
    expect(percent(0.625)).toBe("63%");
    expect(percent(null)).toBeNull();
  });

  it("AC-13: a run links its PR's Agent runs tab; a deleted PR has no link", () => {
    const run = { run_id: "r", ran_at: "", status: "done" as const, score: 1, findings_count: 1, duration_ms: 1, cost_usd: 1, pr_title: "t" };
    expect(runHref({ ...run, repo_id: "repo", pr_number: 3 })).toBe("/repos/repo/pulls/3?tab=findings");
    expect(runHref({ ...run, repo_id: null, pr_number: null })).toBeNull();
  });

  it("AC-14: a cost change keeps the app's cost format", () => {
    expect(signedCost(0.00042)).toEqual({ sign: "+", amount: "$0.00042" });
    expect(signedCost(-1.2)).toEqual({ sign: "−", amount: "$1.20" });
  });

  it("AC-11: a slice keeps its colour whatever its position, and slices do not share one", () => {
    const keys = ["agent-a", "agent-b", null, "agent-c"];
    const colors = sliceColors(keys);
    expect(new Set(colors).size).toBe(4);
    const reordered = sliceColors(["agent-c", null, "agent-a", "agent-b"]);
    expect(reordered).toEqual([colors[3], colors[2], colors[0], colors[1]]);
    // Seven slices over a six-colour palette: every colour is used before one repeats.
    expect(new Set(sliceColors(["1", "2", "3", "4", "5", "6", "7"])).size).toBe(SLICE_COLORS.length);
  });
});
