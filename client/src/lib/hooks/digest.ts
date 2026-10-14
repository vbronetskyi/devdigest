/* hooks/digest.ts — weekly digest (HW L08 SPEC-06). Reading is free; only writing
   highlights makes a model call. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { WeeklyDigest } from "@devdigest/shared";

const key = (week: string | null) => ["digest", week ?? "current"];

export function useDigest(week: string | null) {
  return useQuery({
    queryKey: key(week),
    queryFn: () => api.get<WeeklyDigest>(week ? `/digest?week=${encodeURIComponent(week)}` : "/digest"),
  });
}

/** One model call on the server; never triggered by opening the page. */
export function useWriteHighlights(week: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (w: string) => api.post<WeeklyDigest>("/digest/highlights", { week: w }),
    onSuccess: (res) => qc.setQueryData(key(week), res),
  });
}
