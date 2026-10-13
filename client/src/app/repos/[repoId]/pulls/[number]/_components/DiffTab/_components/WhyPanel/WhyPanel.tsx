/* WhyPanel — git-why for one base line (HW L05 SPEC-04): the commit that last
   changed it and the PR that brought it in. Shown under the line; no model call. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { useWhy } from "@/lib/hooks/brief";
import { ApiError } from "@/lib/api";
import { s } from "./styles";

export function WhyPanel({ prId, file, line }: { prId: string; file: string; line: number }) {
  const t = useTranslations("brief");
  const { data, isLoading, isError, error } = useWhy(prId, file, line);

  let body: React.ReactNode;
  if (isLoading) body = <span style={s.muted}>{t("why.loading")}</span>;
  else if (isError || !data) body = <span style={s.error}>{t("why.loadError", { message: error instanceof ApiError ? error.message : String(error) })}</span>;
  else if (!data.commit) body = <span style={s.muted}>{t(data.missing === "line" ? "why.lineNotAtBase" : "why.newFile")}</span>;
  else {
    const date = new Date(data.commit.date);
    body = (
      <>
        <span className="mono" style={s.sha}>
          {data.commit.sha.slice(0, 7)}
        </span>
        <span style={s.subject}>{data.commit.subject}</span>
        <span style={s.muted}>
          {t("why.meta", { author: data.commit.author, date: Number.isNaN(date.getTime()) ? data.commit.date : date.toLocaleDateString() })}
        </span>
        {data.pr && (
          <a href={data.pr.url} target="_blank" rel="noreferrer" style={s.pr}>
            <Icon.GitPullRequest size={12} aria-hidden />#{data.pr.number}
            {data.pr.title ? ` ${data.pr.title}` : ""}
          </a>
        )}
        {data.boundary && <span style={s.muted}>{t("why.boundary")}</span>}
      </>
    );
  }
  return (
    <div style={s.panel} role="note" aria-label={t("why.title")}>
      <Icon.History size={13} style={s.icon} aria-hidden />
      {body}
    </div>
  );
}
