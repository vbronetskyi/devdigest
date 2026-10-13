/**
 * The PR number a commit subject names: a merge (`Merge pull request #N …`) or a
 * squash (`… (#N)` at the end). Shared by the risk brief's history (SPEC-03 AC-4)
 * and git-why (SPEC-04 AC-7).
 */
export function prNumberOf(subject: string): number | null {
  const merge = subject.match(/^Merge pull request #(\d+)\b/);
  if (merge) return Number(merge[1]);
  const squash = subject.match(/\(#(\d+)\)\s*$/);
  return squash ? Number(squash[1]) : null;
}
