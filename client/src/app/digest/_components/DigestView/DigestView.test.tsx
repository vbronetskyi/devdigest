import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { WeeklyDigest } from "@devdigest/shared";
import digest from "../../../../../messages/en/digest.json";

const h = vi.hoisted(() => ({
  query: { data: undefined as WeeklyDigest | undefined, isLoading: false, isError: false, error: null as unknown, refetch: vi.fn() },
  write: { mutate: vi.fn(), isPending: false, isError: false, error: null as unknown },
  weeks: [] as (string | null)[],
  replace: vi.fn(),
  search: new URLSearchParams(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: h.replace }), useSearchParams: () => h.search }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/lib/toast", () => ({ notify: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/hooks/digest", () => ({
  useDigest: (week: string | null) => {
    h.weeks.push(week);
    return h.query;
  },
  useWriteHighlights: () => h.write,
}));

import { DigestView } from "./DigestView";

afterEach(() => {
  cleanup();
  h.replace.mockReset();
  h.write = { mutate: vi.fn(), isPending: false, isError: false, error: null };
  h.weeks = [];
  h.search = new URLSearchParams();
});

const DIGEST: WeeklyDigest = {
  week: "2026-W40",
  from: "2026-09-28T00:00:00.000Z",
  to: "2026-10-05T00:00:00.000Z",
  in_progress: false,
  empty: false,
  facts: { prs_opened: 2, prs_reviewed: 2, runs: 5, failed: 1, cost_usd: null, runs_without_cost: 1, findings: { CRITICAL: 9, WARNING: 1, SUGGESTION: 1 }, accepted: 2, dismissed: 1, accept_rate: 2 / 3 },
  prev: { prs_opened: 1, prs_reviewed: 1, runs: 1, failed: 0, cost_usd: 0.002, runs_without_cost: 0, findings: { CRITICAL: 0, WARNING: 1, SUGGESTION: 0 }, accepted: 0, dismissed: 0, accept_rate: null },
  change: { prs_opened: 1, prs_reviewed: 1, runs: 4, cost_usd: null, critical: 9, accepted: 2, dismissed: 1 },
  open_criticals: [
    { finding_id: "f1", repo_id: "r1", repo_full_name: "acme/api", pr_number: 2, pr_title: "Repo activity", pr_state: "merged", file: "src/z.ts", line: 20, title: "N+1 queries", agent_name: null, ran_at: "" },
  ],
  open_criticals_total: 7,
  agents: [{ agent_id: "a1", name: "Security Reviewer", runs: 2, cost_usd: 0.03, accept_rate: 2 / 3, decided: 3 }],
  highlights: null,
};
const renderView = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ digest }}>
      <DigestView />
    </NextIntlClientProvider>,
  );

// SPEC-06 AC-10 – AC-13.
describe("DigestView", () => {
  it("AC-10/AC-13: the week's cards with their change; unknown cost is a dash with a reason", () => {
    h.query = { ...h.query, data: DIGEST };
    renderView();
    expect(screen.getByText("2026-W40 · Sep 28 – Oct 4 (UTC)")).toBeTruthy();
    expect(within(screen.getByLabelText("REVIEW RUNS")).getByText("+4 vs last week")).toBeTruthy();
    const cost = screen.getByLabelText("COST");
    expect(within(cost).getByText("—").getAttribute("title")).toBe("No finished run reported a cost.");
    expect(within(cost).getByText("no change vs last week")).toBeTruthy(); // the change is unknown
    expect(within(screen.getByLabelText("NEW FINDINGS")).getByText("critical: +9 vs last week")).toBeTruthy();
    expect(within(screen.getByLabelText("DECISIONS")).getByText("67%")).toBeTruthy();
  });

  it("AC-10: previous / next week through the URL; no next past the current week", () => {
    h.query = { ...h.query, data: DIGEST };
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    expect(h.replace).toHaveBeenLastCalledWith("/digest?week=2026-W39");
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(h.replace).toHaveBeenLastCalledWith("/digest?week=2026-W41");
    cleanup();
    h.query = { ...h.query, data: { ...DIGEST, in_progress: true } };
    renderView();
    expect(screen.getByRole("button", { name: "Next week" })).toBeDisabled();
    expect(screen.getByText("in progress")).toBeTruthy();
  });

  it("AC-10: an open critical opens Files changed at its line; the total is shown", () => {
    h.query = { ...h.query, data: DIGEST };
    renderView();
    expect(screen.getByText("1 of 7")).toBeTruthy();
    expect(screen.getByRole("link", { name: "N+1 queries" }).getAttribute("href")).toBe("/repos/r1/pulls/2?tab=diff&file=src%2Fz.ts&line=20");
    expect(screen.getByText("merged")).toBeTruthy();
  });

  it("AC-11: opening never writes; the button does, labelled AI-written; a stored set shows its model and staleness; a failure shows the reason", () => {
    h.query = { ...h.query, data: DIGEST };
    renderView();
    expect(h.write.mutate).not.toHaveBeenCalled();
    expect(screen.getByText("AI-written, numbers checked")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Write highlights" }));
    expect(h.write.mutate).toHaveBeenCalledWith("2026-W40");
    cleanup();
    h.query = { ...h.query, data: { ...DIGEST, highlights: { lines: ["Runs rose to 5."], model: "gpt-4.1", cost_usd: 0.0001, generated_at: new Date().toISOString(), stale: true } } };
    h.write = { mutate: vi.fn(), isPending: false, isError: true, error: new Error("No highlight passed the number check") };
    renderView();
    expect(screen.getByText("Runs rose to 5.")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(/changed since/);
    expect(screen.getByText(/^gpt-4.1 · \$0.0001 · just now$/)).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/number check/);
  });

  it("AC-12/AC-13: Copy as Markdown writes the digest to the clipboard; an empty week says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    h.query = { ...h.query, data: { ...DIGEST, empty: true } };
    renderView();
    expect(screen.getByText("No review activity this week.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Write highlights" })).toBeDisabled();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy as Markdown" })));
    expect(writeText.mock.calls[0]![0]).toContain("**Weekly review digest — 2026-W40**");
  });
});
