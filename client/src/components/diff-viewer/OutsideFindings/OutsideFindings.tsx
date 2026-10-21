/* OutsideFindings — footer list for findings on lines this patch does not show
   (outside every hunk), so no finding of the file gets lost. Each row opens the
   same card a marked line opens. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { SmartDiffFinding } from "@devdigest/shared";
import type { DiffFindingApi } from "../helpers";
import { s, findingLabelFor } from "../styles";

export function OutsideFindings({ findings, api }: { findings: SmartDiffFinding[]; api: DiffFindingApi }) {
  const t = useTranslations("shell");
  if (findings.length === 0 || !api.visible) return null;
  return (
    <div style={s.outsideWrap} data-testid="outside-findings">
      <span style={s.outsideTitle}>{t("diffViewer.outsideTitle", { count: findings.length })}</span>
      {findings.map((f) => (
        <OutsideRow key={f.id} f={f} api={api} />
      ))}
    </div>
  );
}

function OutsideRow({ f, api }: { f: SmartDiffFinding; api: DiffFindingApi }) {
  const t = useTranslations("shell");
  const [open, setOpen] = React.useState(false);
  const meta = SEV[f.severity];
  const I = Icon[meta.icon];
  const lines = f.end_line > f.start_line ? `${f.start_line}-${f.end_line}` : String(f.start_line);
  return (
    <div>
      <button type="button" style={s.outsideRow} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span style={findingLabelFor(meta.c)}>
          <I size={11} aria-hidden style={{ flexShrink: 0 }} />
          {t(`diffViewer.severity.${f.severity}`)}
        </span>
        <span style={s.outsideText}>{f.title}</span>
        <span className="mono tnum" style={s.outsideLine}>
          {t("diffViewer.lineRef", { lines })}
        </span>
      </button>
      {open && <div style={s.findingDetails}>{api.render(f)}</div>}
    </div>
  );
}
