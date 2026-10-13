/**
 * SPEC-04 AC-4: the old-side (base) line numbers a unified-diff patch shows —
 * removed and context lines — so a requested line is checked without git.
 */
export function oldSideLines(patch: string | null): Set<number> {
  const out = new Set<number>();
  if (!patch) return out;
  let old = 0;
  let inHunk = false;
  for (const line of patch.split('\n')) {
    const header = line.match(/^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/);
    if (header) {
      old = Number(header[1]);
      inHunk = true;
      continue;
    }
    if (!inHunk || line.startsWith('\\')) continue;
    if (line.startsWith('+')) continue;
    if (line.startsWith('-') || line.startsWith(' ') || line === '') {
      out.add(old);
      old++;
    }
  }
  return out;
}

/** AC-7: the PR link from the repo coordinates and an integer — never from commit text. */
export function githubPrUrl(owner: string, name: string, n: number): string {
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pull/${n}`;
}
