/* hooks/digest.ts — weekly digest (HW L08 SPEC-06). Reading is free; only writing
   highlights makes a model call. */
"use client";

import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { WeeklyDigest } from "@devdigest/shared";

const key = (week: string | null) => ["digest", week ?? "current"];
const highlightsKey = (week: string) => ["digest", "highlights", week];

export function useDigest(week: string | null) {
  return useQuery({
    queryKey: key(week),
    queryFn: () => api.get<WeeklyDigest>(week ? `/digest?week=${encodeURIComponent(week)}` : "/digest"),
  });
}

interface WriteVars {
  week: string;
  /** The page's `?week=` (null for the current week): the cache entry the page reads. */
  queryWeek: string | null;
}

/**
 * One model call on the server; never triggered by opening the page. A request
 * belongs to its week (SPEC-06 AC-11): the answer lands in the cache of the week it
 * was asked for — read from the request's own variables, not from whatever week the
 * page shows when it returns. The mutation key holds the week, so moving to another
 * week resets the observer: no progress or failure carries over.
 */
export function useWriteHighlights(week: string) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationKey: highlightsKey(week),
    mutationFn: ({ week: w }: WriteVars) => api.post<WeeklyDigest>("/digest/highlights", { week: w }),
    onSuccess: (res, vars) => {
      qc.setQueryData(key(vars.queryWeek), res);
      if (vars.queryWeek !== res.week) qc.setQueryData(key(res.week), res);
    },
  });
  // Survives a remount: back on a week whose request still runs, the page says so.
  const writing = useIsMutating({ mutationKey: highlightsKey(week) }) > 0;
  return { ...mutation, writing };
}
