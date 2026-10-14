/* /agent-performance — how the workspace's reviewer agents did over 7 / 30 / 90 days
   (HW L08, SPEC-05): runs, cost, duration and the accept rate of their findings.
   Reads stored data only; opening the page calls no model. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, SectionLabel, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useAgentPerformance, type PerfWindow } from "@/lib/hooks/performance";
import { useActiveRepo } from "@/lib/repo-context";
import { DEFAULT_WINDOW, WINDOWS } from "./constants";
import { SummaryCards } from "./_components/SummaryCards";
import { AgentsTable } from "./_components/AgentsTable";
import { CostBreakdown } from "./_components/CostBreakdown";
import { s } from "./styles";

export function AgentPerformanceView() {
  const t = useTranslations("performance");
  const router = useRouter();
  const { activeRepo } = useActiveRepo();
  const [days, setDays] = React.useState<PerfWindow>(DEFAULT_WINDOW);
  const { data, isLoading, isError, error, refetch } = useAgentPerformance(days);

  return (
    <AppShell crumb={[{ label: t("page.crumb") }]}>
      <div style={s.page}>
        <div style={s.head}>
          <div>
            <h1 style={s.h1}>{t("page.title")}</h1>
            <p style={s.subtitle}>{t("page.subtitle")}</p>
          </div>
          <div style={s.windows} role="group" aria-label={t("page.windowLabel")}>
            {WINDOWS.map((w) => (
              <Button key={w} kind="tertiary" size="sm" icon="Calendar" active={w === days} aria-pressed={w === days} onClick={() => setDays(w)}>
                {t("page.window", { days: w })}
              </Button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div style={s.skeletons}>
            <Skeleton height={110} />
            <Skeleton height={220} />
          </div>
        ) : isError || !data ? (
          <ErrorState title={t("page.loadError")} body={error instanceof Error ? error.message : undefined} onRetry={() => refetch()} />
        ) : data.totals.runs === 0 ? (
          <EmptyState
            icon="Activity"
            title={t("page.emptyTitle")}
            body={t("page.emptyBody")}
            cta={t("page.emptyCta")}
            onCta={() => router.push(activeRepo ? `/repos/${activeRepo.id}/pulls` : "/")}
          />
        ) : (
          <>
            <SummaryCards totals={data.totals} days={days} />
            <div style={s.section}>
              <AgentsTable agents={data.agents} />
            </div>
            <div style={s.section}>
              <SectionLabel icon="DollarSign">{t("breakdown.title")}</SectionLabel>
              <CostBreakdown byAgent={data.cost_by_agent} byModel={data.cost_by_model} />
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
