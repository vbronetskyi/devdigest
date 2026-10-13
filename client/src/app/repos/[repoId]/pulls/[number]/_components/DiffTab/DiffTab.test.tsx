import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile, SmartDiff } from "@devdigest/shared";
import prReview from "../../../../../../../../messages/en/prReview.json";
import shell from "../../../../../../../../messages/en/shell.json";
import brief from "../../../../../../../../messages/en/brief.json";

const h = vi.hoisted(() => ({
  smart: { data: undefined as SmartDiff | undefined, isLoading: false, isError: false },
  findings: [] as FindingRecord[],
  mutate: vi.fn(),
}));
vi.mock("@/lib/hooks/smart-diff", () => ({ useSmartDiff: () => h.smart }));
vi.mock("@/lib/hooks/brief", () => ({
  useWhy: (_pr: string, file: string, line: number) => ({
    data: { file, line, commit: { sha: "c0ffee1234567", author: "dev", date: "2026-09-01T10:00:00Z", subject: `blame ${file}:${line}` }, boundary: false, pr: null, note: null },
    isLoading: false,
    isError: false,
    error: null,
  }),
}));
vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: () => ({ data: [] }),
  useCreatePrComment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePrReviews: () => ({ data: [{ findings: h.findings }] }),
  useFindingAction: () => ({ mutate: h.mutate, isPending: false, variables: undefined }),
}));

import { DiffTab } from "./DiffTab";
import { roleSections } from "./helpers";

afterEach(() => {
  cleanup();
  h.mutate.mockReset();
});

const record = (id: string, title: string, start: number, extra: Partial<FindingRecord> = {}): FindingRecord => ({
  id,
  severity: "CRITICAL",
  category: "security",
  title,
  file: "server/src/share.ts",
  start_line: start,
  end_line: start,
  rationale: `Why ${id} matters.`,
  suggestion: `Fix for ${id}.`,
  confidence: 0.9,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
  ...extra,
});

// GitHub's order: alphabetical. The reviewer order puts the risky code first.
const FILES: PrFile[] = [
  { path: "pnpm-lock.yaml", additions: 1, deletions: 0, patch: "@@ -1,1 +1,2 @@\n a\n+lock-line-content" },
  { path: "server/src/index.ts", additions: 1, deletions: 0, patch: "@@ -1,1 +1,2 @@\n a\n+import share from './share.js';" },
  { path: "server/src/share.ts", additions: 3, deletions: 0, patch: "@@ -0,0 +1,3 @@\n+const url = req.body.url;\n+await fetch(url);\n+return ok;" },
  { path: "server/test/share.test.ts", additions: 1, deletions: 0, patch: "@@ -0,0 +1,1 @@\n+it('shares');" },
  { path: "docs/share.md", additions: 1, deletions: 0, patch: "@@ -0,0 +1,1 @@\n+# Share" },
] as PrFile[];

type SmartFile = SmartDiff["groups"][number]["files"][number];
const smartFile = (path: string, reason: SmartFile["reason"], findings: NonNullable<SmartFile["findings"]> = []) => {
  const f = FILES.find((x) => x.path === path)!;
  return { path, additions: f.additions, deletions: f.deletions, pseudocode_summary: null, reason, findings, finding_lines: findings.map((x) => x.start_line) };
};

const SMART: SmartDiff = {
  groups: [
    { role: "core", files: [smartFile("server/src/share.ts", "source", [{ id: "f1", start_line: 2, end_line: 2, severity: "CRITICAL", title: "SSRF via webhook URL" }])] },
    { role: "wiring", files: [smartFile("server/src/index.ts", "entrypoint")] },
    { role: "tests", files: [smartFile("server/test/share.test.ts", "test")] },
    { role: "docs", files: [smartFile("docs/share.md", "docs")] },
    { role: "boilerplate", files: [smartFile("pnpm-lock.yaml", "lockfile")] },
  ],
  split_suggestion: { too_big: false, total_lines: 5, reviewable_lines: 4, proposed_splits: [] },
  reviews_used: 2,
  markers_stale: false,
};

const renderTab = (extra: Partial<React.ComponentProps<typeof DiffTab>> = {}) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview, shell, brief }}>
      <DiffTab prId="p1" filesCount={FILES.length} files={FILES} canComment={false} {...extra} />
    </NextIntlClientProvider>,
  );

const filePaths = () =>
  screen.getAllByText(/^(pnpm-lock\.yaml|server\/(src|test)\/[\w.]+\.ts|docs\/share\.md)$/).map((el) => el.textContent);

describe("DiffTab", () => {
  it("groups files core → wiring → tests → docs → boilerplate, opens the file with a finding and folds the lockfile", () => {
    h.smart = { data: SMART, isLoading: false, isError: false };
    renderTab();
    expect(screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"))).toEqual(["Core logic", "Wiring", "Tests", "Docs", "Boilerplate"]);
    expect(filePaths()).toEqual(["server/src/share.ts", "server/src/index.ts", "server/test/share.test.ts", "docs/share.md", "pnpm-lock.yaml"]);

    const core = screen.getByRole("region", { name: "Core logic" });
    // The group says how many of its files have findings; the file itself shows a plain dot.
    expect(within(core).getByText("1 file with findings")).toBeTruthy();
    expect(within(core).getByRole("img", { name: "1 finding" })).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Wiring" })).queryByText(/with findings/)).toBeNull();
    // The line says the severity in a word; the title is in the tooltip.
    const label = within(core).getByRole("button", { name: /blocker: SSRF via webhook URL/ });
    expect(label.textContent).toBe("blocker");
    expect(screen.getByText("await fetch(url);").closest("[data-finding]")?.getAttribute("data-finding")).toBe("CRITICAL");
    expect(screen.getByText("const url = req.body.url;").closest("[data-finding]")).toBeNull();

    expect(screen.getByText("lockfile")).toBeTruthy();
    expect(screen.queryByText("lock-line-content")).toBeNull();
    expect(screen.getByText("Finding markers from the latest review of each of 2 agents.")).toBeTruthy();
  });

  it("switches to GitHub's order, keeping the finding markers but not the role notes", () => {
    h.smart = { data: SMART, isLoading: false, isError: false };
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Original order" }));
    expect(screen.queryAllByRole("region")).toHaveLength(0);
    expect(filePaths()).toEqual(["pnpm-lock.yaml", "server/src/index.ts", "server/src/share.ts", "server/test/share.test.ts", "docs/share.md"]);
    expect(screen.getByRole("button", { name: /blocker: SSRF via webhook URL/ })).toBeTruthy();
    expect(screen.getByText("lock-line-content")).toBeTruthy();
    expect(screen.queryByText("lockfile")).toBeNull();
  });

  it("proposes splits for an oversized PR, or says there is no clean cut", () => {
    const paths = ["a/1.ts", "a/2.ts", "a/3.ts", "a/4.ts", "a/5.ts", "a/6.ts"];
    h.smart = {
      data: { ...SMART, split_suggestion: { too_big: true, total_lines: 900, reviewable_lines: 620, proposed_splits: [{ name: "server", files: paths }, { name: "client", files: ["c/x.tsx"] }] } },
      isLoading: false,
      isError: false,
    };
    renderTab();
    const banner = screen.getByRole("note");
    expect(within(banner).getByText("This PR is large: 620 changed lines to review (900 in total)")).toBeTruthy();
    expect(within(banner).getByText("6 files")).toBeTruthy();
    expect(within(banner).getByText(/a\/1\.ts, a\/2\.ts, a\/3\.ts, a\/4\.ts \+2 more/)).toBeTruthy();
    cleanup();

    h.smart = { data: { ...SMART, split_suggestion: { too_big: true, total_lines: 500, reviewable_lines: 450, proposed_splits: [] } }, isLoading: false, isError: false };
    renderTab();
    expect(screen.getByText(/no clean cut/)).toBeTruthy();
  });

  it("warns when the markers come from a review of an earlier commit", () => {
    h.smart = { data: { ...SMART, markers_stale: true }, isLoading: false, isError: false };
    renderTab();
    expect(screen.getByRole("status").textContent).toMatch(/earlier commit/);
    expect(screen.getByRole("button", { name: /blocker: SSRF via webhook URL/ })).toBeTruthy();
  });

  it("opens the finding under its line with the explanation, the fix and Accept / Reject", () => {
    h.smart = { data: SMART, isLoading: false, isError: false };
    h.findings = [record("f1", "SSRF via webhook URL", 2)];
    renderTab();
    expect(screen.queryByText("Why f1 matters.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /blocker: SSRF via webhook URL/ }));
    expect(screen.getByText("Why f1 matters.")).toBeTruthy();
    expect(screen.getByText("Fix for f1.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(h.mutate).toHaveBeenCalledWith({ findingId: "f1", action: "accept", prId: "p1" });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(h.mutate).toHaveBeenLastCalledWith({ findingId: "f1", action: "dismiss", prId: "p1" });
  });

  it("lists a finding on a line the patch does not show at the end of its file", () => {
    const outside = { id: "f9", start_line: 40, end_line: 42, severity: "WARNING" as const, title: "Timeout never cleared" };
    const groups = SMART.groups.map((g) =>
      g.role === "core" ? { ...g, files: [smartFile("server/src/share.ts", "source", [...g.files[0]!.findings!, outside])] } : g,
    );
    h.smart = { data: { ...SMART, groups }, isLoading: false, isError: false };
    h.findings = [record("f9", "Timeout never cleared", 40, { severity: "WARNING", end_line: 42 })];
    renderTab();
    const block = screen.getByTestId("outside-findings");
    expect(within(block).getByText("1 finding on lines this diff does not show")).toBeTruthy();
    expect(within(block).getByText("Timeout never cleared")).toBeTruthy();
    expect(within(block).getByText("line 40-42")).toBeTruthy();
    fireEvent.click(within(block).getByRole("button", { name: /warning/ }));
    expect(screen.getByText("Why f9 matters.")).toBeTruthy();
  });

  it("hides findings with the same switch as GitHub comments, for a clean diff", () => {
    h.smart = { data: SMART, isLoading: false, isError: false };
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Hide comments and findings (1)" }));
    expect(screen.queryByRole("button", { name: /blocker/ })).toBeNull();
    expect(screen.getByText("await fetch(url);").closest("[data-finding]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show comments and findings (1)" }));
    expect(screen.getByRole("button", { name: /blocker/ })).toBeTruthy();
  });

  it("falls back to GitHub's order when the smart diff is unavailable", () => {
    h.smart = { data: undefined, isLoading: false, isError: true };
    renderTab();
    expect(screen.queryByRole("button", { name: "Smart order" })).toBeNull();
    expect(screen.getByText(/Smart order is unavailable/)).toBeTruthy();
    expect(filePaths()).toEqual(["pnpm-lock.yaml", "server/src/index.ts", "server/src/share.ts", "server/test/share.test.ts", "docs/share.md"]);
  });
});

describe("roleSections", () => {
  it("never hides a file the smart diff does not list", () => {
    const sections = roleSections({ ...SMART, groups: SMART.groups.slice(0, 1) }, FILES);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.files.map((f) => f.path)).toEqual([
      "server/src/share.ts",
      "pnpm-lock.yaml",
      "server/src/index.ts",
      "server/test/share.test.ts",
      "docs/share.md",
    ]);
  });
});

// HW L05: deep links from the risk brief (SPEC-03 AC-22) and git-why (SPEC-04 AC-11).
describe("DiffTab — brief deep link and git-why", () => {
  it("SPEC-03 AC-22: a deep link opens a folded file and highlights the new-side line", () => {
    h.smart = { data: SMART, isLoading: false, isError: false };
    renderTab({ focus: { file: "pnpm-lock.yaml", line: 2 } });
    const focused = screen.getByText("lock-line-content").closest("[data-focused]");
    expect(focused).not.toBeNull();
  });

  it("SPEC-03 AC-22: a line the patch does not show scrolls to the file instead", () => {
    h.smart = { data: SMART, isLoading: false, isError: false };
    const scroll = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scroll;
    try {
      renderTab({ focus: { file: "server/src/share.ts", line: 40 } });
      expect(document.querySelector("[data-focused]")).toBeNull();
      expect(scroll).toHaveBeenCalledTimes(1);
      expect((scroll.mock.contexts[0] as Element).getAttribute("data-focus")).toBe("true");
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it("SPEC-04 AC-11/AC-12: 'why' on context lines only, showing the answer under the line", () => {
    h.smart = { data: SMART, isLoading: false, isError: false };
    renderTab({ whyEnabled: true, focus: { file: "server/src/index.ts", line: null } });
    const context = screen.getAllByText("a").map((el) => el.closest("[data-finding], div")!.parentElement!);
    fireEvent.mouseEnter(context[0]!);
    fireEvent.click(screen.getByRole("button", { name: "why" }));
    expect(screen.getByText("blame server/src/index.ts:1")).toBeTruthy();

    const added = screen.getByText("import share from './share.js';").closest("div")!.parentElement!;
    fireEvent.mouseEnter(added);
    expect(screen.getAllByRole("button", { name: "why" })).toHaveLength(1);
  });

  it("SPEC-04 AC-11: no 'why' when the PR is not into the default branch", () => {
    h.smart = { data: SMART, isLoading: false, isError: false };
    renderTab({ whyEnabled: false, focus: { file: "server/src/index.ts", line: null } });
    fireEvent.mouseEnter(screen.getAllByText("a")[0]!.closest("div")!.parentElement!);
    expect(screen.queryByRole("button", { name: "why" })).toBeNull();
  });
});
