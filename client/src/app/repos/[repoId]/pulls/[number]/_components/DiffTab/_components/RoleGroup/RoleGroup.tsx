/* RoleGroup — one Smart Diff section (core logic, wiring, tests, docs or
   boilerplate): a header that says how closely to read it, how many of its
   files carry findings, then its files. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SEV } from "@devdigest/ui";
import type { PrFile, SmartDiffRole } from "@devdigest/shared";
import {
  DiffViewer,
  type DiffCommentApi,
  type DiffFindingApi,
  type FileAnnotation,
  type WhyApi,
} from "@/components/diff-viewer";
import { ROLE_COLOR } from "../../constants";
import { worstSeverity } from "../../helpers";
import { s, swatchFor, findingsBadgeFor } from "./styles";

export function RoleGroup({
  role,
  files,
  annotations,
  commenting,
  findingApi,
  why,
}: {
  role: SmartDiffRole;
  files: PrFile[];
  annotations: Record<string, FileAnnotation>;
  commenting?: DiffCommentApi;
  findingApi?: DiffFindingApi;
  why?: WhyApi;
}) {
  const t = useTranslations("prReview");
  const label = t(`smartDiff.${role}Label`);
  const findings = files.flatMap((f) => annotations[f.path]?.findings ?? []);
  const withFindings = files.filter((f) => (annotations[f.path]?.findings.length ?? 0) > 0).length;
  const worst = worstSeverity(findings);
  return (
    <section style={s.group} aria-label={label} data-role={role}>
      <div style={s.head}>
        <span style={swatchFor(ROLE_COLOR[role])} aria-hidden />
        <span style={s.label}>{label}</span>
        <span style={s.desc}>{t(`smartDiff.${role}Desc`)}</span>
        {worst && withFindings > 0 && (
          <span className="tnum" style={findingsBadgeFor(SEV[worst].c)} data-severity={worst}>
            <span aria-hidden style={s.badgeDot(SEV[worst].c)} />
            {t("smartDiff.withFindings", { count: withFindings })}
          </span>
        )}
        <span className="tnum" style={s.count}>
          {t("smartDiff.filesCount", { count: files.length })}
        </span>
      </div>
      <DiffViewer files={files} commenting={commenting} annotations={annotations} findingApi={findingApi} why={why} />
    </section>
  );
}
