import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { WeeklyDigest } from "@devdigest/shared";

const h = vi.hoisted(() => ({ resolve: null as ((d: unknown) => void) | null, reject: null as ((e: unknown) => void) | null, posts: [] as unknown[] }));
vi.mock("../api", () => ({
  api: {
    get: vi.fn(),
    post: (_path: string, body: unknown) => {
      h.posts.push(body);
      return new Promise((resolve, reject) => {
        h.resolve = resolve;
        h.reject = reject;
      });
    },
  },
}));

import { useWriteHighlights } from "./digest";

afterEach(() => {
  h.resolve = null;
  h.posts = [];
});

// SPEC-06 AC-11: a highlights request belongs to its week.
describe("useWriteHighlights", () => {
  it("puts the answer in the cache of the week it was asked for, even after the page moved to another week", async () => {
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result, rerender } = renderHook(({ week }) => useWriteHighlights(week), { wrapper, initialProps: { week: "2026-W41" } });
    act(() => result.current.mutate({ week: "2026-W41", queryWeek: "2026-W41" }));
    await waitFor(() => expect(result.current.writing).toBe(true));
    expect(h.posts).toEqual([{ week: "2026-W41" }]);

    // The page moves to W40 while the request runs: nothing is writing there.
    rerender({ week: "2026-W40" });
    expect(result.current.writing).toBe(false);

    const answer = { week: "2026-W41" } as WeeklyDigest;
    await act(async () => h.resolve!(answer));
    await waitFor(() => expect(qc.getQueryData(["digest", "2026-W41"])).toBe(answer));
    expect(qc.getQueryData(["digest", "2026-W40"])).toBeUndefined();
  });

  it("the current week's answer also fills the cache the page reads without ?week=", async () => {
    const qc = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useWriteHighlights("2026-W42"), { wrapper });
    act(() => result.current.mutate({ week: "2026-W42", queryWeek: null }));
    await waitFor(() => expect(h.resolve).not.toBeNull());
    const answer = { week: "2026-W42" } as WeeklyDigest;
    await act(async () => h.resolve!(answer));
    await waitFor(() => expect(qc.getQueryData(["digest", "current"])).toBe(answer));
    expect(qc.getQueryData(["digest", "2026-W42"])).toBe(answer);
  });

  it("a failure belongs to its week: the page moved to another week shows none", async () => {
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result, rerender } = renderHook(({ week }) => useWriteHighlights(week), { wrapper, initialProps: { week: "2026-W41" } });
    act(() => result.current.mutate({ week: "2026-W41", queryWeek: "2026-W41" }));
    await waitFor(() => expect(h.reject).not.toBeNull());
    await act(async () => h.reject!(new Error("502")));
    await waitFor(() => expect(result.current.isError).toBe(true));
    rerender({ week: "2026-W40" });
    expect(result.current.isError).toBe(false);
  });

  it("coming back to a week whose request still runs shows it writing", async () => {
    const qc = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const first = renderHook(() => useWriteHighlights("2026-W41"), { wrapper });
    act(() => first.result.current.mutate({ week: "2026-W41", queryWeek: "2026-W41" }));
    await waitFor(() => expect(h.resolve).not.toBeNull());
    first.unmount();
    const again = renderHook(() => useWriteHighlights("2026-W41"), { wrapper });
    expect(again.result.current.writing).toBe(true);
    await act(async () => h.resolve!({ week: "2026-W41" }));
    await waitFor(() => expect(again.result.current.writing).toBe(false));
  });
});
