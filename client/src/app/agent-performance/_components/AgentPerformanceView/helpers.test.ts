import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatDuration, percent, runHref, signedCost, sliceColors } from "./helpers";
import { NEUTRAL_SLICE, SLICE_COLORS } from "./constants";

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

  it("AC-11: in both themes the palette's colours are distinct, and none is the grey of the unknown slice", () => {
    const css = readFileSync(resolve(__dirname, "../../../../vendor/ui/styles.css"), "utf8");
    const light = css.indexOf('[data-theme="light"] {');
    const themes = [css.slice(css.indexOf(":root,"), css.indexOf("}")), css.slice(light, css.indexOf("}", light))];
    for (const theme of themes) {
      const value = (token: string) => new RegExp(`${token}:\\s*(#[0-9a-f]{6})`, "i").exec(theme)![1]!.toLowerCase();
      const hexes = SLICE_COLORS.map((c) => value(/var\((--[\w-]+)\)/.exec(c)![1]!));
      expect(new Set(hexes).size).toBe(SLICE_COLORS.length);
      expect(hexes).not.toContain(value(/var\((--[\w-]+)\)/.exec(NEUTRAL_SLICE)![1]!));
      const rgb = hexes.map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]);
      for (const [r, g, b] of rgb) expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeGreaterThan(60); // a hue, not a grey
      // No two close enough to be mistaken for each other.
      for (let i = 0; i < rgb.length; i++)
        for (let j = i + 1; j < rgb.length; j++) expect(Math.hypot(...rgb[i]!.map((v, k) => v - rgb[j]![k]!))).toBeGreaterThan(60);
    }
  });

  it("AC-11: a slice keeps its colour whatever its position, and slices do not share one", () => {
    const keys = ["agent-a", "agent-b", null, "agent-c"];
    const colors = sliceColors(keys);
    expect(new Set(colors).size).toBe(4);
    const reordered = sliceColors(["agent-c", null, "agent-a", "agent-b"]);
    expect(reordered).toEqual([colors[3], colors[2], colors[0], colors[1]]);
    // The deleted agent coming or going moves no one: it is grey and takes no slot.
    const withDeleted = sliceColors(["agent-a", "agent-b", "agent-c", null]);
    const withoutDeleted = sliceColors(["agent-a", "agent-b", "agent-c"]);
    expect(withDeleted.slice(0, 3)).toEqual(withoutDeleted);
    expect(withDeleted[3]).toBe(NEUTRAL_SLICE);
    expect(withoutDeleted).not.toContain(NEUTRAL_SLICE);
    // Seven slices over a six-colour palette: every colour is used before one repeats.
    expect(new Set(sliceColors(["1", "2", "3", "4", "5", "6", "7"])).size).toBe(SLICE_COLORS.length);
  });
});
