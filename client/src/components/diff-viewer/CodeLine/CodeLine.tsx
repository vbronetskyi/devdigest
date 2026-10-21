/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored comment threads, an inline composer and,
   in the Smart Diff, the marker of a finding covering the line. The marker's
   severity word opens the finding card right under the line. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import { commentTargetFor, type CommentThread, type DiffCommentApi, cs } from "../comments";
import { type DiffFindingApi, type Line, type LineMark } from "../helpers";
import { s, findingBarFor, findingLabelFor, lineRowFor, lineSignFor } from "../styles";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";

export function CodeLine({
  ln,
  path,
  threads,
  commenting,
  mark: rawMark,
  findings,
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  commenting?: DiffCommentApi;
  mark?: LineMark | null;
  findings?: DiffFindingApi;
}) {
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  const mark = findings?.visible === false ? null : rawMark;

  if (ln.kind === "hunk") {
    return (
      <div className="mono" style={s.hunk}>
        {ln.text}
      </div>
    );
  }

  const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
  const target = commenting?.canComment ? commentTargetFor(ln) : null;
  const showAdd = hover && !!target && !composing;

  return (
    <div
      style={cs.rowWrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={{ ...lineRowFor(ln.kind), position: "relative" }} data-finding={mark?.severity}>
        {mark && <span style={findingBarFor(SEV[mark.severity].c)} aria-hidden />}
        <span className="mono tnum" style={{ ...s.lineNo, position: "relative" }}>
          {showAdd && target && (
            <button
              type="button"
              title="Add a comment on this line"
              aria-label="Add a comment on this line"
              onClick={() => setComposing(true)}
              style={cs.addBtn}
            >
              +
            </button>
          )}
          {ln.newNo ?? ln.oldNo ?? ""}
        </span>
        <span className="mono" style={lineSignFor(ln.kind)}>
          {sign}
        </span>
        <span className="mono" style={s.lineText}>
          {ln.text || " "}
        </span>
        {mark && mark.starting.length > 0 && (
          <FindingLabel mark={mark} expanded={expanded} onToggle={findings ? () => setExpanded((v) => !v) : undefined} />
        )}
      </div>

      {mark && expanded && findings && (
        <div style={s.findingDetails}>
          {mark.starting.map((f) => (
            <React.Fragment key={f.id}>{findings.render(f)}</React.Fragment>
          ))}
        </div>
      )}

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {commenting && composing && target && (
        <InlineComposer
          commenting={commenting}
          path={path}
          line={target.line}
          side={target.side}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  );
}

/**
 * The most severe finding anchored here, as its severity word (blocker /
 * warning / suggestion) so it reads without the colour; more than one adds
 * "+N". The titles are in the tooltip; a click opens the cards below the line.
 */
function FindingLabel({ mark, expanded, onToggle }: { mark: LineMark; expanded: boolean; onToggle?: () => void }) {
  const t = useTranslations("shell");
  const [top, ...rest] = mark.starting;
  const meta = SEV[top!.severity];
  const I = Icon[meta.icon];
  const all = mark.starting.map((f) => `${t(`diffViewer.severity.${f.severity}`)}: ${f.title}`).join("\n");
  const body = (
    <>
      <I size={11} aria-hidden style={{ flexShrink: 0 }} />
      <span>{t(`diffViewer.severity.${top!.severity}`)}</span>
      {rest.length > 0 && <span className="tnum">+{rest.length}</span>}
    </>
  );
  if (!onToggle) {
    return (
      <span style={findingLabelFor(meta.c)} title={all}>
        {body}
      </span>
    );
  }
  return (
    <button
      type="button"
      style={{ ...findingLabelFor(meta.c), ...s.findingLabelButton }}
      title={all}
      aria-expanded={expanded}
      aria-label={t("diffViewer.findingToggle", { label: all })}
      onClick={onToggle}
    >
      {body}
    </button>
  );
}
