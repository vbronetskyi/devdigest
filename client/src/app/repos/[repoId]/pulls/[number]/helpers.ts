/** Pure helpers for the PR detail page (HW L05: brief deep links, git-why, history note). */

/** Query string that opens Files changed at `file` (and new-side `line`), keeping the rest. */
export function fileLinkQuery(current: string, file: string, line: number | null): string {
  const sp = new URLSearchParams(current);
  sp.set("tab", "diff");
  sp.set("file", file);
  if (line == null) sp.delete("line");
  else sp.set("line", String(line));
  return sp.toString();
}

/** The deep-link focus from `?file=&line=`; a line that is not a positive integer means "the file". */
export function focusFromQuery(file: string | null, line: string | null): { file: string; line: number | null } | null {
  if (!file) return null;
  const n = Number(line);
  return { file, line: line && Number.isInteger(n) && n > 0 ? n : null };
}

/**
 * What the PR's base branch allows: git-why only into the default branch (SPEC-04 AC-11);
 * otherwise the brief's history is the default branch's, and the card says so (SPEC-03).
 * Unknown default branch (repo not loaded yet) → neither.
 */
export function baseBranchView(base: string, defaultBranch: string | null): { whyEnabled: boolean; historyBranch: string | null } {
  if (!defaultBranch) return { whyEnabled: false, historyBranch: null };
  return base === defaultBranch ? { whyEnabled: true, historyBranch: null } : { whyEnabled: false, historyBranch: defaultBranch };
}
