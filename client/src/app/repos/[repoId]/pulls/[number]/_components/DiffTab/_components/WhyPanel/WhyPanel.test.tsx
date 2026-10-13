import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { WhyAnswer } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import brief from "../../../../../../../../../../messages/en/brief.json";

const h = vi.hoisted(() => ({ state: { data: undefined as WhyAnswer | undefined, isLoading: false, isError: false, error: null as unknown } }));
vi.mock("@/lib/hooks/brief", () => ({ useWhy: () => h.state }));

import { WhyPanel } from "./WhyPanel";

afterEach(cleanup);
const renderPanel = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ brief }}>
      <WhyPanel prId="p1" file="src/a.ts" line={11} />
    </NextIntlClientProvider>,
  );

// SPEC-04 AC-12 / AC-13.
describe("WhyPanel", () => {
  it("AC-12: shows the commit and the PR linked on GitHub, and the boundary note", () => {
    h.state = {
      data: { file: "src/a.ts", line: 11, commit: { sha: "c0ffee1234567", author: "dev", date: "2026-09-01T10:00:00Z", subject: "Wire the routes" }, boundary: true, pr: { number: 4, title: "Add routes", url: "https://github.com/acme/api/pull/4" }, note: "x" },
      isLoading: false,
      isError: false,
      error: null,
    };
    renderPanel();
    expect(screen.getByText("c0ffee1")).toBeTruthy();
    expect(screen.getByText("Wire the routes")).toBeTruthy();
    expect(screen.getByRole("link").getAttribute("href")).toBe("https://github.com/acme/api/pull/4");
    expect(screen.getByText(/earlier history is not available/)).toBeTruthy();
  });

  it("AC-12: says there is no history for a new or renamed file", () => {
    h.state = { data: { file: "src/a.ts", line: 11, commit: null, boundary: false, pr: null, note: "x" }, isLoading: false, isError: false, error: null };
    renderPanel();
    expect(screen.getByText(/new or renamed in this PR/)).toBeTruthy();
  });

  it("AC-13: shows the server's message when the request fails", () => {
    h.state = { data: undefined, isLoading: false, isError: true, error: new ApiError("git-why covers PRs into the default branch (main).", 409, "conflict") };
    renderPanel();
    expect(screen.getByText(/git-why covers PRs into the default branch/)).toBeTruthy();
  });
});
