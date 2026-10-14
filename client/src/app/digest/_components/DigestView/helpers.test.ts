import { describe, it, expect } from "vitest";
import type { WeeklyDigest } from "@devdigest/shared";
import { criticalHref, digestMarkdown, isoWeekOf, mdSafe, neighbourWeeks, signed } from "./helpers";

const DIGEST: WeeklyDigest = {
  week: "2026-W42",
  from: "2026-10-12T00:00:00.000Z",
  to: "2026-10-19T00:00:00.000Z",
  in_progress: true,
  empty: false,
  facts: { prs_opened: 1, prs_reviewed: 3, runs: 9, failed: 1, cost_usd: 0.00499, runs_without_cost: 0, findings: { CRITICAL: 3, WARNING: 9, SUGGESTION: 3 }, accepted: 10, dismissed: 6, accept_rate: 0.625 },
  prev: { prs_opened: 4, prs_reviewed: 1, runs: 4, failed: 0, cost_usd: 0.0028, runs_without_cost: 0, findings: { CRITICAL: 3, WARNING: 4, SUGGESTION: 2 }, accepted: 0, dismissed: 0, accept_rate: null },
  change: { prs_opened: -3, prs_reviewed: 2, runs: 5, cost_usd: 0.0022, critical: 0, accepted: 10, dismissed: 6 },
  open_criticals: [
    { finding_id: "f1", repo_id: "r1", repo_full_name: "acme/api", pr_number: 3, pr_title: "Share", pr_state: "merged", file: "server/src/routes.ts", line: 153, title: "SSRF via `url` — ping @channel <!here> about #12 [click](https://x.y)", agent_name: "Security Reviewer", ran_at: "" },
  ],
  open_criticals_total: 4,
  agents: [{ agent_id: null, name: null, runs: 1, cost_usd: null, accept_rate: null, decided: 0 }],
  highlights: { lines: ["Runs rose to 9 (up 5)."], model: "m", cost_usd: 0.0001, generated_at: "", stale: false },
};

describe("digest helpers (SPEC-06)", () => {
  it("ISO weeks by week-year, and the weeks around a digest", () => {
    expect(isoWeekOf(new Date("2025-12-30T10:00:00Z"))).toBe("2026-W01");
    expect(isoWeekOf(new Date("2027-01-01T10:00:00Z"))).toBe("2026-W53");
    expect(neighbourWeeks("2026-10-12T00:00:00.000Z")).toEqual({ prev: "2026-W41", next: "2026-W43" });
    expect(neighbourWeeks("2025-12-29T00:00:00.000Z")).toEqual({ prev: "2025-W52", next: "2026-W02" });
  });

  it("AC-10: a critical opens Files changed at its line; changes are signed, zero is none", () => {
    expect(criticalHref(DIGEST.open_criticals[0]!)).toBe("/repos/r1/pulls/3?tab=diff&file=server%2Fsrc%2Froutes.ts&line=153");
    expect(signed(-3)).toBe("−3");
    expect(signed(2)).toBe("+2");
    expect(signed(0)).toBeNull();
    expect(signed(null)).toBeNull();
  });

  it("AC-12: untrusted text cannot ping, reference, link or format in a channel", () => {
    const safe = mdSafe("SSRF via `url`\n ping @channel <!here> about #12 [click](https://x.y)");
    expect(safe).not.toMatch(/@channel|<!here>|#12|\[click\]\(/);
    expect(safe).toContain("\\`url\\`");
    expect(safe.includes("\n")).toBe(false);
  });

  it("AC-12: the Markdown has the facts, the checked highlights, the criticals with GitHub links, and the agents", () => {
    const md = digestMarkdown(DIGEST);
    expect(md).toContain("**Weekly review digest — 2026-W42** (Oct 12 – Oct 18, UTC, in progress)");
    expect(md).toContain("- Review runs: 9 (1 failed) · cost: $0.00499");
    expect(md).toContain("**Highlights** (AI-written, numbers checked)\n- Runs rose to 9 (up 5).");
    expect(md).toContain("- [PR 3](https://github.com/acme/api/pull/3) (merged): SSRF via");
    expect(md).toContain("`server/src/routes.ts:153`");
    expect(md).toContain("**Open critical findings** (1 of 4)");
    expect(md).toContain("- deleted agent: 1 runs · — · accept —");
    expect(md).not.toContain("@channel");
  });
});
