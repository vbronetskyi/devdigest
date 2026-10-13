import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RiskBrief, RiskBriefResponse } from "@devdigest/shared";
import brief from "../../../../../../../../messages/en/brief.json";

const h = vi.hoisted(() => ({
  data: { brief: null, stale: false } as RiskBriefResponse,
  mutate: vi.fn(),
  gen: { isPending: false, isError: false, error: null as unknown },
}));
vi.mock("@/lib/hooks/brief", () => ({
  useBrief: () => ({ data: h.data, isLoading: false }),
  useGenerateBrief: () => ({ mutate: h.mutate, ...h.gen }),
}));

import { BriefCard } from "./BriefCard";

afterEach(() => {
  cleanup();
  h.mutate.mockReset();
  h.gen = { isPending: false, isError: false, error: null };
});

const BRIEF: RiskBrief = {
  risks: [
    { kind: "security", severity: "high", title: "SSRF via the webhook URL", explanation: "The URL from the body is fetched. See https://evil.example/x", file_refs: ["server/src/routes.ts:162-175", "server/src/routes.ts"] },
    { kind: "deps", severity: "medium", title: "Dependencies changed", explanation: "A manifest changed.", file_refs: ["server/package.json"] },
  ],
  review_focus: [{ file: "server/src/routes.ts", line: 162, reason: "the fetch" }],
  history: [{ pr_number: 4, title: "Rate limit public routes", merged_at: "2026-10-01T10:00:00Z", author: "merger", files_overlap: ["server/src/routes.ts"], notes: "Added the limiter." }],
  history_state: "ok",
  meta: { source: "model", reason: null, model: "gpt-4.1", cost_usd: 0.0123, head_sha: "head123456", generated_at: "2026-10-13T10:00:00Z" },
};

const renderCard = (onOpenFile = vi.fn(), historyBranch: string | null = null) => {
  render(
    <NextIntlClientProvider locale="en" messages={{ brief }}>
      <BriefCard prId="p1" repo="acme/api" historyBranch={historyBranch} onOpenFile={onOpenFile} />
    </NextIntlClientProvider>,
  );
  return onOpenFile;
};

// SPEC-03 AC-19 – AC-24.
describe("BriefCard", () => {
  it("AC-19: without a brief, offers Generate and calls it only on click", () => {
    h.data = { brief: null, stale: false };
    renderCard();
    expect(screen.getByText("No brief yet")).toBeTruthy();
    expect(h.mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Generate brief" }));
    expect(h.mutate).toHaveBeenCalledTimes(1);
  });

  it("AC-20/AC-24: pills in order with kind, severity and first reference; one expands to its explanation without links", () => {
    h.data = { brief: BRIEF, stale: false };
    renderCard();
    const pills = document.querySelectorAll("[data-severity]");
    expect([...pills].map((p) => p.getAttribute("data-severity"))).toEqual(["high", "medium"]);
    expect(pills[0]!.textContent).toContain("security · high · server/src/routes.ts:162-175");
    fireEvent.click(within(pills[0] as HTMLElement).getByRole("button", { name: "Why this is a risk" }));
    const explanation = screen.getByTestId("risk-explanation");
    expect(explanation.textContent).toContain("The URL from the body is fetched.");
    expect(explanation.querySelector("a[href]")).toBeNull();
  });

  it("AC-21/AC-22: focus spots and references open Files changed at the file and line; history links each PR", () => {
    h.data = { brief: BRIEF, stale: false };
    const onOpenFile = renderCard();
    fireEvent.click(screen.getByRole("button", { name: /server\/src\/routes.ts:162 — the fetch/ }));
    expect(onOpenFile).toHaveBeenLastCalledWith("server/src/routes.ts", 162);
    fireEvent.click(screen.getByTitle("server/src/routes.ts:162-175"));
    expect(onOpenFile).toHaveBeenLastCalledWith("server/src/routes.ts", 162);
    fireEvent.click(screen.getByRole("button", { name: /Other PRs touching these files/ }));
    expect(screen.getByRole("link", { name: "#4" }).getAttribute("href")).toBe("https://github.com/acme/api/pull/4");
    expect(screen.getByText("Added the limiter.")).toBeTruthy();
    expect(screen.queryByText(/targets another branch/)).toBeNull();
  });

  it("edge case: a PR into another branch says the history is the default branch's", () => {
    h.data = { brief: BRIEF, stale: false };
    renderCard(vi.fn(), "main");
    fireEvent.click(screen.getByRole("button", { name: /Other PRs touching these files/ }));
    expect(screen.getByText("This PR targets another branch; the history is from main.")).toBeTruthy();
  });

  it("AC-23: names model, cost and head — or says signals-only and why; warns when stale", () => {
    h.data = { brief: BRIEF, stale: true };
    renderCard();
    expect(screen.getByTestId("brief-footer").textContent).toBe("Written by gpt-4.1 · $0.0123 · for head123");
    expect(screen.getByRole("status").textContent).toMatch(/new commits since this brief/);
    cleanup();
    h.data = { brief: { ...BRIEF, meta: { ...BRIEF.meta, source: "signals", reason: "No API key for openai", model: null, cost_usd: null } }, stale: false };
    renderCard();
    expect(screen.getByTestId("brief-footer").textContent).toBe("Signals only, no model (No API key for openai) · for head123");
  });

  it("shows a failed regeneration next to the kept brief", () => {
    h.data = { brief: BRIEF, stale: false };
    h.gen = { isPending: false, isError: true, error: new Error("The previous brief is kept.") };
    renderCard();
    expect(screen.getByRole("alert").textContent).toContain("The previous brief is kept.");
    expect(screen.getByText("SSRF via the webhook URL")).toBeTruthy();
  });
});
