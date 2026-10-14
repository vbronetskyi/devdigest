/* /repos/:repoId/conventions — Conventions extractor (L02). Scans the cloned repo
   for house rules backed by quoted evidence; each can become a Skill. A scan is
   two paid model calls, so it only runs on an explicit click. */
"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { ConventionAcceptRequest, ConventionExtraction } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useAcceptConvention, useConventions, useExtractConventions, useRejectConvention } from "@/lib/hooks";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ApiError } from "@/lib/api";
import { formatCost } from "@/lib/format-cost";
import { relativeTime } from "@/lib/relative-time";
import { notify } from "@/lib/toast";
import { ConventionCard } from "./_components/ConventionCard";
import { s } from "./styles";

const messageOf = (err: unknown) => (err instanceof ApiError ? err.message : String(err));

export default function ConventionsPage() {
  const t = useTranslations("conventions");
  const router = useRouter();
  const { repoId } = useParams<{ repoId: string }>();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data: list, isLoading, isError, error, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const accept = useAcceptConvention(repoId);
  const reject = useRejectConvention(repoId);
  const [busy, setBusy] = React.useState<ReadonlySet<string>>(new Set());
  const [skillIds, setSkillIds] = React.useState<Record<string, string>>({});
  // The counts of a scan run in this session (AC-22); the scan record itself is stored.
  const [justScanned, setJustScanned] = React.useState<ConventionExtraction | null>(null);
  const [bulk, setBulk] = React.useState(false);

  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];
  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const candidates = list?.candidates ?? [];
  const scanRecord = list?.last_scan ?? null;
  const pending = candidates.filter((c) => !c.accepted);
  const mark = (id: string, on: boolean) =>
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const acceptOne = async (id: string, overrides: ConventionAcceptRequest = {}) => {
    mark(id, true);
    try {
      const res = await accept.mutateAsync({ id, ...overrides });
      setSkillIds((m) => ({ ...m, [id]: res.skill_id }));
      notify.success(t("page.accepted", { name: res.skill_name }));
    } catch (err) {
      notify.error(messageOf(err));
    } finally {
      mark(id, false);
    }
  };
  const rejectOne = async (id: string) => {
    mark(id, true);
    try {
      await reject.mutateAsync(id);
    } catch (err) {
      notify.error(messageOf(err));
    } finally {
      mark(id, false);
    }
  };
  // Sequential on purpose: each accept takes a row lock and may pick a suffixed name.
  // While it runs no card can start its own action (AC-23).
  const runBulk = async (fn: (id: string) => Promise<void>) => {
    setBulk(true);
    try {
      for (const c of pending) await fn(c.id);
    } finally {
      setBulk(false);
    }
  };
  const acceptAll = () => runBulk((id) => acceptOne(id));
  const rejectAll = async () => {
    if (!window.confirm(t("page.rejectAllConfirm", { count: pending.length }))) return;
    await runBulk(rejectOne);
  };
  const scan = () => extract.mutate(undefined, { onSuccess: setJustScanned });

  // AC-19: the stored scan, so the summary survives a reload.
  const subtitle = scanRecord
    ? t("page.lastScan", {
        files: scanRecord.files.length,
        ago: relativeTime(scanRecord.scanned_at),
        model: scanRecord.model,
        cost: formatCost(scanRecord.cost_usd),
      })
    : t("page.subtitle");
  const neverScanned = candidates.length === 0 && !scanRecord;

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.head}>
          <div style={{ flex: 1 }}>
            <h1 style={s.h1}>
              {t("page.headingPrefix")}
              <span className="mono" style={s.repo}>
                {activeRepo?.name ?? t("page.repoFallback")}
              </span>
            </h1>
            <p style={s.subtitle}>{subtitle}</p>
            {justScanned && (
              <p style={s.subtitle} role="status">
                {t("page.scanCounts", { dropped: justScanned.dropped, skipped: justScanned.skipped ?? 0 })}
              </p>
            )}
          </div>
          {/* AC-20: before the first scan the empty state holds the only button. */}
          {!neverScanned && (
            <span title={t("page.costHint")}>
              <Button kind="secondary" size="sm" icon="RefreshCw" loading={extract.isPending} disabled={bulk} onClick={scan}>
                {extract.isPending ? t("page.scanning") : t("page.rescan")}
              </Button>
            </span>
          )}
        </div>

        {extract.isError && (
          <div role="alert" style={s.error}>
            {t("page.extractionFailed")}: {messageOf(extract.error)}
          </div>
        )}

        {pending.length > 1 && (
          <div style={s.bulk}>
            <Button kind="ghost" size="sm" icon="Check" disabled={bulk || busy.size > 0} onClick={acceptAll}>
              {t("page.acceptAll", { count: pending.length })}
            </Button>
            <Button kind="ghost" size="sm" icon="X" disabled={bulk || busy.size > 0} onClick={rejectAll}>
              {t("page.rejectAll")}
            </Button>
          </div>
        )}

        {isLoading ? (
          <div style={s.skeletons}>
            <Skeleton height={150} />
            <Skeleton height={150} />
          </div>
        ) : isError ? (
          <ErrorState title={t("page.loadError")} body={messageOf(error)} onRetry={() => refetch()} />
        ) : neverScanned ? (
          <EmptyState
            icon="ListChecks"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={scan}
            ctaLoading={extract.isPending}
          />
        ) : candidates.length === 0 ? (
          <p style={s.subtitle}>{t("page.nothingFound")}</p>
        ) : (
          candidates.map((c) => (
            <ConventionCard
              key={c.id}
              candidate={c}
              repoFullName={activeRepo?.full_name ?? ""}
              branch={activeRepo?.default_branch ?? "main"}
              busy={busy.has(c.id)}
              locked={bulk}
              {...(skillIds[c.id] ? { skillId: skillIds[c.id] } : {})}
              onAccept={(overrides) => acceptOne(c.id, overrides)}
              onReject={() => rejectOne(c.id)}
              onOpenSkill={(id) => router.push(`/skills?skill=${id}`)}
            />
          ))
        )}
      </div>
    </AppShell>
  );
}
