/* hooks/brief.ts — risk brief (HW L05 SPEC-03) and git-why (SPEC-04). Reads are
   free; only generating a brief makes a model call. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { RiskBriefResponse, WhyAnswer } from "@devdigest/shared";

const briefKey = (prId: string | null | undefined) => ["brief", prId];

export function useBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: briefKey(prId),
    queryFn: () => api.get<RiskBriefResponse>(`/pulls/${prId}/brief`),
    enabled: !!prId,
  });
}

/** Never triggered implicitly: one model call on the server (or a signals-only brief). */
export function useGenerateBrief(prId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<RiskBriefResponse>(`/pulls/${prId}/brief`, {}),
    onSuccess: (res) => qc.setQueryData(briefKey(prId), res),
  });
}

/** One base line's blame; fetched only while its panel is open. */
export function useWhy(prId: string | null | undefined, file: string, line: number) {
  return useQuery({
    queryKey: ["why", prId, file, line],
    queryFn: () => api.get<WhyAnswer>(`/pulls/${prId}/why?file=${encodeURIComponent(file)}&line=${line}`),
    enabled: !!prId,
    retry: false,
    staleTime: 5 * 60_000,
  });
}
