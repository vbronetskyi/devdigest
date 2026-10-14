/* SummaryCards — the four headline numbers of the window (SPEC-05 AC-11). Unknown is "—". */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { CircularScore, Sparkline } from "@devdigest/ui";
import type { AgentPerf } from "@devdigest/shared";
import { formatCost } from "@/lib/format-cost";
import { percent, signedCost } from "../../helpers";
import { Unknown } from "../Unknown";
import { s } from "./styles";

export function SummaryCards({ totals, days }: { totals: AgentPerf["totals"]; days: number }) {
  const t = useTranslations("performance");
  const rate = percent(totals.accept_rate);
  const change = totals.cost_change_usd == null ? null : signedCost(totals.cost_change_usd);
  const top = totals.most_active;
  return (
    <div style={s.row}>
      <div role="group" style={s.card} aria-label={t("card.runs", { days })}>
        <div style={s.label}>{t("card.runs", { days })}</div>
        <div className="tnum" style={s.value}>
          {totals.runs}
        </div>
        <div style={s.sub}>{t("card.runsSub", { failed: totals.failed })}</div>
        <div style={s.spark}>
          <Sparkline data={totals.runs_per_day} w={200} h={28} />
        </div>
      </div>

      <div role="group" style={s.card} aria-label={t("card.cost", { days })}>
        <div style={s.label}>{t("card.cost", { days })}</div>
        <div className="mono tnum" style={s.value}>
          {totals.cost_usd == null ? <Unknown reason={t("unknown.cost")} /> : formatCost(totals.cost_usd)}
        </div>
        <div style={s.sub} title={change ? undefined : t("unknown.costChange")}>
          {change ? (
            <span style={totals.cost_change_usd! > 0 ? s.up : totals.cost_change_usd! < 0 ? s.down : undefined}>
              {t("card.costChange", { sign: change.sign, amount: change.amount, days })}
            </span>
          ) : totals.cost_usd == null ? (
            t("card.costUnknown")
          ) : (
            t("card.costNoChange", { days })
          )}
        </div>
        {totals.runs_without_cost > 0 && <div style={s.sub}>{t("card.withoutCost", { count: totals.runs_without_cost })}</div>}
      </div>

      <div role="group" style={s.card} aria-label={t("card.accept")}>
        <div style={s.top}>
          <span style={s.label}>{t("card.accept")}</span>
          {totals.accept_rate != null && <CircularScore score={Math.round(totals.accept_rate * 100)} size={34} stroke={4} />}
        </div>
        <div className="tnum" style={s.value}>
          {rate ?? <Unknown reason={t("unknown.decided")} />}
        </div>
        <div style={s.sub}>{t("card.acceptSub", { count: totals.decided })}</div>
      </div>

      <div role="group" style={s.card} aria-label={t("card.mostActive")}>
        <div style={s.label}>{t("card.mostActive")}</div>
        <div style={s.name}>{top ? top.name : <Unknown reason={t("unknown.mostActive")} />}</div>
        {top && (
          <div style={s.sub}>
            {t.rich("card.mostActiveSub", {
              runs: top.runs,
              rate: (chunks) => (top.accept_rate == null ? <Unknown reason={t("unknown.decided")} /> : chunks),
              accept: percent(top.accept_rate) ?? "",
            })}
          </div>
        )}
      </div>
    </div>
  );
}
