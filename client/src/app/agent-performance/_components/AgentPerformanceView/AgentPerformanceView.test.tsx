import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentPerf, AgentPerfRow } from "@devdigest/shared";
import performance from "../../../../../messages/en/performance.json";

const h = vi.hoisted(() => ({
  state: { data: undefined as AgentPerf | undefined, isLoading: false, isError: false, error: null as unknown, refetch: vi.fn() },
  days: [] as number[],
  push: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => ({ activeRepo: { id: "r1" } }) }));
vi.mock("@/lib/hooks/performance", () => ({
  useAgentPerformance: (days: number) => {
    h.days.push(days);
    return h.state;
  },
}));

import { AgentPerformanceView } from "./AgentPerformanceView";

afterEach(() => {
  cleanup();
  h.days = [];
  h.push.mockReset();
});

const agent = (over: Partial<AgentPerfRow>): AgentPerfRow => ({
  agent_id: "a1",
  name: "Security Reviewer",
  runs: 12,
  failed: 1,
  cost_usd: 0.0072,
  avg_cost_usd: 0.0006,
  avg_duration_ms: 51_848,
  accept_rate: 0.8,
  decided: 10,
  accept_trend: "up",
  low_sample: false,
  last_run_at: new Date().toISOString(),
  recent: [],
  ...over,
});
const DATA: AgentPerf = {
  window: { days: 30, from: "2026-09-15T00:00:00.000Z", to: "2026-10-15T00:00:00.000Z" },
  totals: {
    runs: 14,
    failed: 2,
    cost_usd: 0.0091,
    runs_without_cost: 1,
    prev_cost_usd: null,
    cost_change_usd: null,
    accept_rate: 0.625,
    decided: 16,
    runs_per_day: [0, 4, 10],
    most_active: { agent_id: "a1", name: "Security Reviewer", runs: 12, accept_rate: 0.8 },
  },
  agents: [
    agent({
      recent: [
        { run_id: "r1", ran_at: new Date().toISOString(), status: "done", repo_id: "repo", pr_number: 3, pr_title: "Share a review", score: 61, findings_count: 4, duration_ms: 40_000, cost_usd: 0.0007 },
        { run_id: "r2", ran_at: new Date().toISOString(), status: "failed", repo_id: null, pr_number: null, pr_title: null, score: null, findings_count: null, duration_ms: null, cost_usd: null },
      ],
    }),
    agent({ agent_id: null, name: null, runs: 2, failed: 1, cost_usd: null, avg_cost_usd: null, avg_duration_ms: null, accept_rate: null, decided: 0, accept_trend: null, low_sample: true }),
  ],
  cost_by_agent: [{ label: "Security Reviewer", key: "a1", cost_usd: 0.0072, share: 1 }],
  cost_by_model: [{ label: "unknown model", key: null, cost_usd: 0.0072, share: 1 }],
};
const renderView = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ performance }}>
      <AgentPerformanceView />
    </NextIntlClientProvider>,
  );

// SPEC-05 AC-11 – AC-15.
describe("AgentPerformanceView", () => {
  it("AC-11/AC-14: four cards; unknown values are a dash with a reason, small costs keep their digits", () => {
    h.state = { ...h.state, data: DATA, isLoading: false, isError: false };
    renderView();
    expect(within(screen.getByLabelText("TOTAL RUNS (30D)")).getByText("14")).toBeTruthy();
    expect(screen.getByText("2 failed")).toBeTruthy();
    expect(within(screen.getByLabelText("TOTAL COST (30D)")).getByText("$0.0091")).toBeTruthy();
    expect(screen.getByText("no cost known for the previous 30 days")).toBeTruthy();
    expect(screen.getByText("1 run without a reported cost")).toBeTruthy();
    expect(within(screen.getByLabelText("ACCEPT RATE")).getByText("63%")).toBeTruthy();
    expect(screen.getByText("of 16 decided findings")).toBeTruthy();
    expect(screen.getByText("12 runs · 80% accept")).toBeTruthy();
    // The deleted agent's unknown accept rate and cost carry their reasons.
    const deleted = screen.getByRole("row", { name: "Show recent runs of deleted agent" });
    expect(within(deleted).getAllByText("—").length).toBeGreaterThanOrEqual(3);
    expect(within(deleted).getAllByTitle("Nothing decided yet: accept or dismiss findings to get a rate.").length).toBe(1);
  });

  it("AC-12/AC-13: the trend has a text label; a row opens its runs — a failed run's figures are dashes, a deleted PR is unlinked", () => {
    h.state = { ...h.state, data: DATA };
    renderView();
    expect(screen.getByRole("img", { name: "up against the previous window" })).toBeTruthy();
    fireEvent.click(screen.getByRole("row", { name: "Show recent runs of Security Reviewer" }));
    const runs = screen.getAllByTestId("recent-run");
    expect(within(runs[0]!).getByRole("link").getAttribute("href")).toBe("/repos/repo/pulls/3?tab=findings");
    expect(within(runs[0]!).getByText("score 61")).toBeTruthy();
    expect(within(runs[1]!).queryByRole("link")).toBeNull();
    expect(within(runs[1]!).getByText("deleted pull request")).toBeTruthy();
    expect(within(runs[1]!).getAllByTitle("A failed run records no score, findings, duration or cost.")).toHaveLength(4);
  });

  it("AC-11: the window selector asks for 7, 30 or 90 days", () => {
    h.state = { ...h.state, data: DATA };
    renderView();
    expect(h.days.at(-1)).toBe(30);
    fireEvent.click(screen.getByRole("button", { name: "7 days" }));
    expect(h.days.at(-1)).toBe(7);
    fireEvent.click(screen.getByRole("button", { name: "90 days" }));
    expect(h.days.at(-1)).toBe(90);
  });

  it("AC-15: an empty window points to the pull requests; a failed request offers a retry", () => {
    h.state = { ...h.state, data: { ...DATA, totals: { ...DATA.totals, runs: 0 }, agents: [] } };
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Open pull requests" }));
    expect(h.push).toHaveBeenCalledWith("/repos/r1/pulls");
    cleanup();
    h.state = { ...h.state, data: undefined, isError: true, error: new Error("boom") };
    renderView();
    expect(screen.getByText("Could not load agent performance.")).toBeTruthy();
  });
});
