/* hooks/performance.ts — agent performance (HW L08 SPEC-05). Stored data only, no model call. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { AgentPerf } from "@devdigest/shared";

export type PerfWindow = 7 | 30 | 90;

export function useAgentPerformance(days: PerfWindow) {
  return useQuery({
    queryKey: ["agent-performance", days],
    queryFn: () => api.get<AgentPerf>(`/agents/performance?days=${days}`),
  });
}
