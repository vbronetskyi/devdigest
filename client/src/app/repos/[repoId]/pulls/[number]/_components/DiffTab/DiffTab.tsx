/* DiffTab — the PR's changed files. Smart order (HW L03) groups them core →
   wiring → tests → docs → boilerplate with the latest findings pinned to their
   lines (a click opens the finding card with Accept / Dismiss right there) and a
   split nudge for oversized PRs; Original order is the list as GitHub gives it.
   One toggle shows or hides both GitHub comments and findings. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button, Skeleton } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffFindingApi, type WhyApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment, usePrReviews, useFindingAction } from "@/lib/hooks/reviews";
import { useSmartDiff } from "@/lib/hooks/smart-diff";
import { notify } from "@/lib/toast";
import type { FindingRecord, PrFile } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { ORDERS, type DiffOrder } from "./constants";
import { annotationsFor, roleSections, withFocus } from "./helpers";
import { RoleGroup } from "./_components/RoleGroup";
import { SplitBanner } from "./_components/SplitBanner";
import { WhyPanel } from "./_components/WhyPanel";
import { s } from "./styles";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  /** For the finding cards' links to the file on GitHub. */
  repoFullName?: string | null;
  headSha?: string | null;
  /** Deep link from the risk brief: open this file, scroll to this new-side line. */
  focus?: { file: string; line: number | null } | null;
  /** git-why needs a PR into the default branch (SPEC-04 AC-11). */
  whyEnabled?: boolean;
}

export function DiffTab({
  prId,
  filesCount,
  files,
  canComment,
  repoFullName,
  headSha,
  focus = null,
  whyEnabled = false,
}: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  const smart = useSmartDiff(prId);
  const { data: reviews } = usePrReviews(prId);
  const action = useFindingAction();
  // One switch for everything layered on the code — GitHub comments and findings —
  // so the diff can be read clean. Shown by default: the markers are the point.
  const [showComments, setShowComments] = React.useState(true);
  const [order, setOrder] = React.useState<DiffOrder>("smart");

  const commentCount = comments?.length ?? 0;
  const findingCount = (smart.data?.groups ?? []).reduce((n, g) => n + g.files.reduce((m, f) => m + (f.findings?.length ?? 0), 0), 0);
  const overlayCount = commentCount + findingCount;

  // Full findings (rationale, suggestion, accepted/dismissed) by id, from the same
  // reviews the Agent runs tab shows; the smart diff only carries the markers.
  const findingById = React.useMemo(() => {
    const map = new Map<string, FindingRecord>();
    for (const r of reviews ?? []) for (const f of r.findings) map.set(f.id, f);
    return map;
  }, [reviews]);

  const findingApi: DiffFindingApi = {
    visible: showComments,
    render: (marker) => {
      const f = findingById.get(marker.id);
      if (!f) return null;
      return (
        <FindingCard
          f={f}
          defaultExpanded
          repoFullName={repoFullName}
          headSha={headSha}
          pending={action.isPending && action.variables?.findingId === f.id}
          onAction={(act) => action.mutate({ findingId: f.id, action: act, prId: prId ?? undefined })}
        />
      );
    },
  };

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : t("smartDiff.commentError"));
        throw err;
      }
    },
  };

  const data = smart.data;
  const smartReady = !!data && data.groups.length > 0;
  const shown: DiffOrder = smartReady ? order : "original";
  const annotations = React.useMemo(
    () => withFocus(annotationsFor(data, shown, (reason) => t(`smartDiff.reason.${reason}`)), focus),
    [data, shown, t, focus],
  );
  const tBrief = useTranslations("brief");
  const why: WhyApi | undefined =
    whyEnabled && prId ? { label: tBrief("why.action"), render: (path, line) => <WhyPanel prId={prId} file={path} line={line} /> } : undefined;

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          overlayCount > 0 ? (
            <Button
              kind="ghost"
              size="sm"
              icon={showComments ? "EyeOff" : "Eye"}
              aria-pressed={!showComments}
              onClick={() => setShowComments((v) => !v)}
            >
              {t(showComments ? "smartDiff.hideComments" : "smartDiff.showComments", { count: overlayCount })}
            </Button>
          ) : undefined
        }
      >
        {t("smartDiff.title", { count: filesCount })}
      </SectionLabel>

      <div style={s.toolbar}>
        {smartReady && (
          <div style={s.orders} role="group">
            {ORDERS.map((o) => (
              <Button key={o} kind="tertiary" size="sm" active={order === o} aria-pressed={order === o} onClick={() => setOrder(o)}>
                {t(`smartDiff.order.${o}`)}
              </Button>
            ))}
          </div>
        )}
        {smart.isError ? (
          <span style={s.meta}>{t("smartDiff.unavailable")}</span>
        ) : data?.markers_stale ? (
          <span style={{ ...s.meta, ...s.metaStale }} role="status">
            {t("smartDiff.markersStale")}
          </span>
        ) : data?.reviews_used != null ? (
          <span style={s.meta}>{t("smartDiff.markers", { count: data.reviews_used })}</span>
        ) : null}
      </div>

      {smart.isLoading ? (
        <Skeleton height={120} />
      ) : (
        <>
          {data && <SplitBanner split={data.split_suggestion} />}
          {shown === "smart" && data ? (
            roleSections(data, files).map((sec) => (
              <RoleGroup
                key={sec.role}
                role={sec.role}
                files={sec.files}
                annotations={annotations}
                commenting={commenting}
                findingApi={findingApi}
                why={why}
              />
            ))
          ) : (
            <DiffViewer files={files} commenting={commenting} annotations={annotations} findingApi={findingApi} why={why} />
          )}
        </>
      )}
    </section>
  );
}
