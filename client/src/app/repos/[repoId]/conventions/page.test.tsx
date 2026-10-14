import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate, ConventionList } from "@devdigest/shared";
import conventions from "../../../../../messages/en/conventions.json";

const h = vi.hoisted(() => ({
  list: { candidates: [], last_scan: null } as ConventionList,
  extract: vi.fn(),
  acceptCalls: [] as { id: string; resolve: () => void }[],
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ repoId: "r1" }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/repo-not-found", () => ({ RepoNotFound: () => <div>repo not found</div> }));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { name: "api", full_name: "acme/api", default_branch: "main" } }),
  useRepoNotFound: () => false,
}));
vi.mock("@/lib/toast", () => ({ notify: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/hooks", () => ({
  useConventions: () => ({ data: h.list, isLoading: false, isError: false, refetch: vi.fn() }),
  useExtractConventions: () => ({ mutate: h.extract, isPending: false, isError: false }),
  useAcceptConvention: () => ({
    mutateAsync: ({ id }: { id: string }) =>
      new Promise((resolve) => h.acceptCalls.push({ id, resolve: () => resolve({ skill_id: `s-${id}`, skill_name: id, convention: {} }) })),
  }),
  useRejectConvention: () => ({ mutateAsync: vi.fn() }),
}));

import ConventionsPage from "./page";

afterEach(() => {
  cleanup();
  h.extract.mockReset();
  h.acceptCalls = [];
});

const candidate = (id: string, accepted = false): ConventionCandidate => ({
  id,
  rule: `Rule ${id}`,
  evidence_path: "src/a.ts:1",
  evidence_snippet: "const x = compute();",
  confidence: 0.6,
  accepted,
  commit_sha: "c0ffee1",
});
const renderPage = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions }}>
      <ConventionsPage />
    </NextIntlClientProvider>,
  );

// SPEC-07 AC-1, AC-19, AC-20, AC-23 at page level.
describe("Conventions page", () => {
  it("AC-1/AC-20: opening the page never scans; before the first scan there is one Run extraction button", () => {
    h.list = { candidates: [], last_scan: null };
    renderPage();
    expect(h.extract).not.toHaveBeenCalled();
    expect(screen.getAllByRole("button", { name: /Run extraction/ })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Conventions in api");
  });

  it("AC-19: the stored scan is the subtitle after a reload", () => {
    h.list = {
      candidates: [candidate("a")],
      last_scan: { scanned_at: new Date().toISOString(), files: ["a", "b", "c"], model: "deepseek/deepseek-v4-flash", cost_usd: 0.0004, dropped: 1, skipped: 0, commit_sha: "c0ffee1" },
    };
    renderPage();
    expect(screen.getByText(/^Detected from 3 sample files · last scan just now · deepseek\/deepseek-v4-flash · /)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Re-scan" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Run extraction/ })).toBeNull();
  });

  it("AC-22: right after a scan the page says what was dropped and what was skipped", async () => {
    h.list = { candidates: [candidate("a")], last_scan: null };
    h.extract.mockImplementation((_v: unknown, opts: { onSuccess: (r: unknown) => void }) =>
      opts.onSuccess({ candidates: [], sampled_files: ["a"], dropped: 2, skipped: 1, model: "m", cost_usd: null }),
    );
    renderPage();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Re-scan" })));
    expect(screen.getByText("2 rules dropped: their quotes are not in the files · 1 skipped as a repeat, already accepted or over the limit")).toBeTruthy();
  });

  it("AC-23: Accept all goes one card at a time and locks every card meanwhile", async () => {
    h.list = { candidates: [candidate("a"), candidate("b"), candidate("c", true)], last_scan: null };
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Accept all (2)" }));
    expect(h.acceptCalls.map((c) => c.id)).toEqual(["a"]);
    // While "a" is accepted, "b" cannot be started by hand.
    for (const b of screen.getAllByRole("button", { name: "Reject" })) expect(b).toBeDisabled();
    await act(async () => h.acceptCalls[0]!.resolve());
    expect(h.acceptCalls.map((c) => c.id)).toEqual(["a", "b"]);
    await act(async () => h.acceptCalls[1]!.resolve());
    for (const b of screen.getAllByRole("button", { name: "Reject" })) expect(b).not.toBeDisabled();
  });
});
