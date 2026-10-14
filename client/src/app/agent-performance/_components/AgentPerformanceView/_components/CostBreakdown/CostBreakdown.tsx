/* CostBreakdown — known cost of the window by agent and by model, each with its share
   (SPEC-05 AC-8, AC-11). A slice's colour follows its key, so an agent keeps its colour
   when the window changes. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Donut } from "@devdigest/ui";
import type { PerfCostSegment } from "@devdigest/shared";
import { formatCost } from "@/lib/format-cost";
import { percent, sliceColors } from "../../helpers";
import { s } from "./styles";

export function CostBreakdown({ byAgent, byModel }: { byAgent: PerfCostSegment[]; byModel: PerfCostSegment[] }) {
  const t = useTranslations("performance");
  return (
    <div style={s.grid}>
      <Slices title={t("breakdown.byAgent")} slices={byAgent} label={(x) => (x.key == null ? t("table.deletedAgent") : x.label)} />
      <Slices title={t("breakdown.byModel")} slices={byModel} label={(x) => (x.key == null ? t("breakdown.unknownModel") : x.label)} />
    </div>
  );
}

function Slices({ title, slices, label }: { title: string; slices: PerfCostSegment[]; label: (x: PerfCostSegment) => string }) {
  const t = useTranslations("performance");
  const colors = sliceColors(slices.map((x) => x.key));
  const legend = (i: number) => {
    const x = slices[i]!;
    const share = percent(x.share);
    return share == null ? formatCost(x.cost_usd) : t("breakdown.share", { cost: formatCost(x.cost_usd), share });
  };
  return (
    <section style={s.card} aria-label={title}>
      <div style={s.title}>{title}</div>
      {slices.length === 0 ? (
        <p style={s.empty}>{t("breakdown.empty")}</p>
      ) : (
        <Donut size={120} segments={slices.map((x, i) => ({ label: label(x), value: x.cost_usd, color: colors[i]! }))} format={(_, i) => legend(i)} />
      )}
    </section>
  );
}
