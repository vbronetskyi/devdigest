"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { BlastRadiusCard } from "../BlastRadiusCard";
import { IntentCard } from "../IntentCard";
import { BriefCard } from "../BriefCard";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string;
  repo: string | null;
  defaultBranch: string;
  /** Set when the PR targets a branch other than the default one (see BriefCard). */
  historyBranch: string | null;
  headSha: string | null | undefined;
  /** Open Files changed at this file (and new-side line). */
  onOpenFile: (file: string, line: number | null) => void;
}

export function OverviewTab({ prBody, prId, repo, defaultBranch, historyBranch, headSha, onOpenFile }: OverviewTabProps) {
  return (
    <>
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
      <IntentCard prId={prId} headSha={headSha} />
      <BriefCard prId={prId} repo={repo} historyBranch={historyBranch} onOpenFile={onOpenFile} />
      {repo && <BlastRadiusCard prId={prId} repo={repo} defaultBranch={defaultBranch} />}
    </>
  );
}
