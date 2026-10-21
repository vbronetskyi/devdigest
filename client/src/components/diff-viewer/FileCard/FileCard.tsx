/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count, Smart Diff finding dot and role note) and, when open, its parsed lines,
   the findings on lines the patch does not show, and any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { anchorFindings, bySeverity, markFor, parsePatch, type DiffFindingApi, type FileAnnotation, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { s, chevronFor, findingDotFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";
import { OutsideFindings } from "../OutsideFindings";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

export function FileCard({
  file,
  commenting,
  annotation,
  findingApi,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  annotation?: FileAnnotation;
  findingApi?: DiffFindingApi;
}) {
  const t = useTranslations("shell");
  const [open, setOpen] = React.useState(
    annotation?.defaultOpen ?? (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);
  const findings = annotation?.findings ?? [];
  const anchors = React.useMemo(() => anchorFindings(lines, findings), [lines, findings]);
  const worst = findings.length > 0 ? [...findings].sort(bySeverity)[0]!.severity : null;

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, lines]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  return (
    <div style={s.fileCard}>
      <div onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        {worst && <FindingDot severity={worst} label={t("diffViewer.findings", { count: findings.length })} />}
        {annotation?.note && <span style={s.fileNote}>{annotation.note}</span>}
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => (
              <CodeLine
                key={i}
                ln={ln}
                path={file.path}
                threads={threadsForLine(ln, matched)}
                commenting={commenting}
                mark={markFor(ln, findings, anchors)}
                findings={findingApi}
              />
            ))
          )}
          {findingApi && <OutsideFindings findings={anchors.outside} api={findingApi} />}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
        </div>
      )}
    </div>
  );
}

/** A plain dot in the worst severity's colour; the count is in its label, not on screen. */
function FindingDot({ severity, label }: { severity: Severity; label: string }) {
  return <span role="img" aria-label={label} title={label} style={findingDotFor(SEV[severity].c)} data-severity={severity} />;
}
