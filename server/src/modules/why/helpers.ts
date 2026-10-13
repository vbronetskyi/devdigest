/**
 * SPEC-04 AC-4: the old-side (base) line numbers a unified-diff patch shows —
 * removed and context lines — so a requested line is checked without git.
 */
export function oldSideLines(patch: string | null): Set<number> {
  const out = new Set<number>();
  if (!patch) return out;
  let old = 0;
  // Old-side lines the current hunk still has to show; the header says how many, so a
  // trailing newline or a `\ No newline` marker never becomes a line.
  let left = 0;
  for (const line of patch.split('\n')) {
    const header = line.match(/^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/);
    if (header) {
      old = Number(header[1]);
      left = header[2] === undefined ? 1 : Number(header[2]);
      continue;
    }
    if (left === 0 || line.startsWith('\\') || line.startsWith('+')) continue;
    // A blank context line may have lost its leading space on the way.
    if (line.startsWith('-') || line.startsWith(' ') || line === '') {
      out.add(old);
      old++;
      left--;
    }
  }
  return out;
}

/** AC-7: the PR link from the repo coordinates and an integer — never from commit text. */
export function githubPrUrl(owner: string, name: string, n: number): string {
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pull/${n}`;
}
