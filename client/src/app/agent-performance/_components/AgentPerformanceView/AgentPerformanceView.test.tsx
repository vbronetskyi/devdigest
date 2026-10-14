import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentPerf, AgentPerfRow } from "@devdigest/shared";
import performance from "../../../../../messages/en/performance.json";

const h = vi.hoisted(() => ({
  state: { data: undefined as AgentPerf | undefined, isLoading: false, isError: false, error: null as unknown, refetch: vi.fn() },
  days: [] as number[],
  push: vi.fn(),
  activeRepo: { id: "r1" } as { id: string } | null,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => ({ activeRepo: h.activeRepo }) }));
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
  h.activeRepo = { id: "r1" };
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
    agent({ agent_id: null, name: null, runs: 2, failed: 1, cost_usd: null, avg_cost_usd: null, avg_duration_ms: null, accept_rate: null, decided: 0, accept_trend: null, low_sample: false }),
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

const agentRow = (name: string) => screen.getByRole("button", { name }).closest("tr")!;

// SPEC-05 AC-11 – AC-15.
describe("AgentPerformanceView", () => {
  it("AC-11/AC-14: four cards with the daily sparkline; unknown values are a dash with a reason, small costs keep their digits", () => {
    h.state = { ...h.state, data: DATA, isLoading: false, isError: false };
    renderView();
    const runsCard = screen.getByLabelText("TOTAL RUNS (30D)");
    expect(within(runsCard).getByText("14")).toBeTruthy();
    expect(runsCard.querySelector("svg")).not.toBeNull();
    expect(screen.getByText("2 failed")).toBeTruthy();
    expect(within(screen.getByLabelText("TOTAL COST (30D)")).getByText("$0.0091")).toBeTruthy();
    expect(screen.getByText("no cost known for the previous 30 days")).toBeTruthy();
    expect(screen.getByText("1 run without a reported cost")).toBeTruthy();
    expect(within(screen.getByLabelText("ACCEPT RATE")).getByText("63%")).toBeTruthy();
    expect(screen.getByText("of 16 decided findings")).toBeTruthy();
    expect(screen.getByText("12 runs · 80% accept")).toBeTruthy();
    // The deleted agent's unknown accept rate and cost carry their reasons, readable without hovering.
    const deleted = agentRow("deleted agent");
    expect(within(deleted).getAllByText("—").length).toBeGreaterThanOrEqual(3);
    expect(within(deleted).getAllByTitle(performance.unknown.decided)).toHaveLength(1);
    expect(within(deleted).getByText(performance.unknown.cost)).toBeTruthy();
  });

  it("AC-14: an unknown cost this window is not a missing previous one; no current agent and an all-failed agent say why", () => {
    const allFailed = agent({ agent_id: "a2", name: "Broken Reviewer", runs: 3, failed: 3, cost_usd: null, avg_cost_usd: null, avg_duration_ms: null, accept_rate: null, decided: 0, accept_trend: null, low_sample: false });
    h.state = {
      ...h.state,
      data: { ...DATA, totals: { ...DATA.totals, cost_usd: null, prev_cost_usd: 0.002, cost_change_usd: null, most_active: null }, agents: [allFailed] },
    };
    renderView();
    const cost = screen.getByLabelText("TOTAL COST (30D)");
    expect(within(cost).getByText("no cost known in this window")).toBeTruthy();
    expect(within(cost).queryByText(/previous 30 days/)).toBeNull();
    expect(within(screen.getByLabelText("MOST-ACTIVE AGENT")).getByTitle(performance.unknown.mostActive)).toBeTruthy();
    expect(within(agentRow("Broken Reviewer")).getAllByTitle(performance.unknown.allFailed)).toHaveLength(3); // cost, duration, accept rate
    cleanup();
    h.state = { ...h.state, data: { ...DATA, totals: { ...DATA.totals, most_active: { ...DATA.totals.most_active!, accept_rate: null } } } };
    renderView();
    expect(within(screen.getByLabelText("MOST-ACTIVE AGENT")).getByTitle(performance.unknown.decided)).toBeTruthy();
  });

  it("AC-12: a table with every value under its column; trends have text labels, a low sample is marked", () => {
    const down = agent({ agent_id: "a3", name: "Style Reviewer", accept_rate: 0.4, accept_trend: "down", decided: 3, low_sample: true });
    const flat = agent({ agent_id: "a4", name: "Docs Reviewer", accept_trend: "flat" });
    h.state = { ...h.state, data: { ...DATA, agents: [...DATA.agents, down, flat] } };
    renderView();
    const table = screen.getByRole("table", { name: performance.table.caption });
    expect(within(table).getAllByRole("columnheader").map((c) => c.textContent)).toEqual(["Agent", "Runs", "Avg cost", "Avg dur.", "Accept", "Last run"]);
    const row = agentRow("Security Reviewer");
    expect(within(row).getByRole("rowheader")).toBeTruthy();
    expect(within(row).getAllByRole("cell")).toHaveLength(6);
    expect(within(row).getByRole("img", { name: "up against the previous window" })).toBeTruthy();
    expect(within(row).getByTitle("up against the previous window")).toBeTruthy(); // the label on hover too
    expect(within(row).queryByText("low sample")).toBeNull(); // enough decisions on both sides
    expect(within(agentRow("Style Reviewer")).getByRole("img", { name: "down against the previous window" })).toBeTruthy();
    expect(within(agentRow("Style Reviewer")).getByTitle(performance.table.lowSampleHint)).toBeTruthy();
    expect(within(agentRow("Docs Reviewer")).getByRole("img", { name: "about the same as the previous window" })).toBeTruthy();
    // Nothing decided: no "low sample" next to a dash.
    expect(within(agentRow("deleted agent")).queryByText("low sample")).toBeNull();
  });

  it("AC-13: the agent's button opens its runs — a failed run's figures are dashes, a missing figure of a finished run says so, a deleted PR is unlinked", () => {
    const withGap = { ...DATA.agents[0]!.recent[0]!, run_id: "r3", score: null };
    h.state = { ...h.state, data: { ...DATA, agents: [{ ...DATA.agents[0]!, recent: [...DATA.agents[0]!.recent, withGap] }, DATA.agents[1]!] } };
    renderView();
    const toggle = screen.getByRole("button", { name: "Security Reviewer" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const panel = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    const runs = within(panel).getAllByTestId("recent-run");
    expect(within(runs[0]!).getByRole("link").getAttribute("href")).toBe("/repos/repo/pulls/3?tab=findings");
    expect(within(runs[0]!).getByText("score 61")).toBeTruthy();
    expect(within(runs[1]!).queryByRole("link")).toBeNull();
    expect(within(runs[1]!).getByText("deleted pull request")).toBeTruthy();
    expect(within(runs[1]!).getAllByTitle(performance.unknown.failed)).toHaveLength(4);
    expect(within(runs[2]!).getAllByTitle(performance.unknown.notRecorded)).toHaveLength(1);
    expect(within(runs[2]!).queryByTitle(performance.unknown.runCost)).toBeNull();
    fireEvent.click(toggle);
    expect(screen.queryAllByTestId("recent-run")).toHaveLength(0);
  });

  it("AC-14: a finished run without a cost says so", () => {
    const noCost = { ...DATA.agents[0]!.recent[0]!, run_id: "r9", cost_usd: null };
    h.state = { ...h.state, data: { ...DATA, agents: [{ ...DATA.agents[0]!, recent: [noCost] }] } };
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Security Reviewer" }));
    expect(within(screen.getByTestId("recent-run")).getByTitle(performance.unknown.runCost)).toBeTruthy();
  });

  it("AC-7/AC-11: a known cost change is signed in the app's cost format — up in red, down in green, none plain", () => {
    const render$ = (change: number) => {
      cleanup();
      h.state = { ...h.state, data: { ...DATA, totals: { ...DATA.totals, prev_cost_usd: 0.007, cost_change_usd: change } } };
      renderView();
      return screen.getByLabelText("TOTAL COST (30D)");
    };
    const up = within(render$(0.0021)).getByText("+$0.0021 vs previous 30 days");
    expect(up.getAttribute("style")).toContain("var(--crit)");
    const down = within(render$(-0.0021)).getByText("−$0.0021 vs previous 30 days");
    expect(down.getAttribute("style")).toContain("var(--ok)");
    const none = within(render$(0)).getByText("±$0 vs previous 30 days");
    expect(none.getAttribute("style")).toBeNull();
  });

  it("AC-8/AC-11: the breakdown shows each slice's cost and share; an unknown model is labelled", () => {
    h.state = {
      ...h.state,
      data: {
        ...DATA,
        cost_by_agent: [
          { label: "Security Reviewer", key: "a1", cost_usd: 0.0054, share: 0.75 },
          { label: "deleted agent", key: null, cost_usd: 0.0018, share: 0.25 },
        ],
      },
    };
    renderView();
    const byAgent = screen.getByLabelText("By agent");
    expect(within(byAgent).getByText("$0.0054 · 75%")).toBeTruthy();
    // The colour follows the key: the deleted agent's swatch is the unknown grey.
    const swatch = within(byAgent).getByText("deleted agent").previousElementSibling as HTMLElement;
    expect(swatch.style.background).toBe("var(--text-muted)");
    expect(within(screen.getByLabelText("By model")).getByText(performance.breakdown.unknownModel)).toBeTruthy();
    expect(within(screen.getByLabelText("By model")).getByText("$0.0072 · 100%")).toBeTruthy();
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

  it("AC-15: an empty window points to the pull requests; a failed request offers a retry that refetches", () => {
    h.state = { ...h.state, data: { ...DATA, totals: { ...DATA.totals, runs: 0 }, agents: [] } };
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Open pull requests" }));
    expect(h.push).toHaveBeenCalledWith("/repos/r1/pulls");
    cleanup();
    h.activeRepo = null;
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Open pull requests" }));
    expect(h.push).toHaveBeenLastCalledWith("/");
    cleanup();
    h.state = { ...h.state, data: undefined, isError: true, error: new Error("boom") };
    renderView();
    expect(screen.getByText("Could not load agent performance.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(h.state.refetch).toHaveBeenCalledTimes(1);
  });
});
