/* CostBreakdown — known cost of the window by agent and by model (SPEC-05 AC-8). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Donut } from "@devdigest/ui";
import type { PerfCostSegment } from "@devdigest/shared";
import { formatCost } from "@/lib/format-cost";
import { SLICE_COLORS } from "../../constants";
import { s } from "./styles";

export function CostBreakdown({ byAgent, byModel }: { byAgent: PerfCostSegment[]; byModel: PerfCostSegment[] }) {
  const t = useTranslations("performance");
  return (
    <div style={s.grid}>
      <Slices title={t("breakdown.byAgent")} slices={byAgent} label={(x) => (x.key == null ? t("table.deletedAgent") : x.label)} />
      <Slices title={t("breakdown.byModel")} slices={byModel} label={(x) => x.label} />
    </div>
  );
}

function Slices({ title, slices, label }: { title: string; slices: PerfCostSegment[]; label: (x: PerfCostSegment) => string }) {
  const t = useTranslations("performance");
  return (
    <section style={s.card} aria-label={title}>
      <div style={s.title}>{title}</div>
      {slices.length === 0 ? (
        <p style={s.empty}>{t("breakdown.empty")}</p>
      ) : (
        <Donut
          size={120}
          segments={slices.map((x, i) => ({ label: label(x), value: x.cost_usd, color: SLICE_COLORS[i % SLICE_COLORS.length]! }))}
          format={(v) => formatCost(v)}
        />
      )}
    </section>
  );
}
