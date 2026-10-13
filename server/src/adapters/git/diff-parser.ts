import type { UnifiedDiff, DiffHunk } from '@devdigest/shared';

/**
 * Minimal unified-diff parser. Extracts per-file hunks and the set of new-side
 * line numbers each hunk covers — exactly what the citation-grounding gate
 * needs (file:line must intersect a real hunk).
 *
 * Handles standard `git diff` output:
 *   diff --git a/path b/path
 *   --- a/path
 *   +++ b/path
 *   @@ -oldStart,oldLines +newStart,newLines @@
 *
 * A deleted file (`+++ /dev/null`) keeps its old path: it is part of the change,
 * with removed lines and no new-side ones. Files without a text diff (binary, a
 * pure rename) have no hunks and are left out, as before. A hunk ends when the
 * line counts of its header are used up, so a trailing newline or a
 * `\ No newline at end of file` marker is never a line, and `--- x` inside a hunk
 * is a removed `-- x`, not a file header.
 */
export function parseUnifiedDiff(raw: string): UnifiedDiff {
  const files: UnifiedDiff['files'] = [];
  const lines = raw.split('\n');

  let current: UnifiedDiff['files'][number] | null = null;
  let hunk: DiffHunk | null = null;
  let newLineCursor = 0;
  let oldPath = '';
  // Lines the current hunk still has to show, per side (from its header).
  let oldLeft = 0;
  let newLeft = 0;

  const flushHunk = () => {
    if (current && hunk) current.hunks.push(hunk);
    hunk = null;
  };
  const flushFile = () => {
    flushHunk();
    if (current) files.push(current);
    current = null;
  };

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      flushFile();
      // path resolved from +++ line below; placeholder for now
      current = { path: '', additions: 0, deletions: 0, hunks: [] };
      oldPath = '';
      continue;
    }
    const inHunk = hunk !== null && (oldLeft > 0 || newLeft > 0);
    if (!inHunk && line.startsWith('+++ ')) {
      if (!current) current = { path: '', additions: 0, deletions: 0, hunks: [] };
      const p = line.slice(4).replace(/^b\//, '').trim();
      current.path = p === '/dev/null' ? (oldPath === '/dev/null' ? '' : oldPath) : p;
      continue;
    }
    if (!inHunk && line.startsWith('--- ')) {
      oldPath = line.slice(4).replace(/^a\//, '').trim();
      continue;
    }
    const hh = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (hh) {
      flushHunk();
      const newStart = Number(hh[3]);
      const newLines = hh[4] ? Number(hh[4]) : 1;
      hunk = {
        file: current?.path ?? '',
        oldStart: Number(hh[1]),
        oldLines: hh[2] ? Number(hh[2]) : 1,
        newStart,
        newLines,
        newLineNumbers: [],
      };
      newLineCursor = newStart;
      oldLeft = hunk.oldLines;
      newLeft = newLines;
      continue;
    }
    if (!current || !hunk || !inHunk || line.startsWith('\\')) continue;
    if (line.startsWith('+')) {
      current.additions++;
      hunk.newLineNumbers.push(newLineCursor);
      newLineCursor++;
      newLeft--;
    } else if (line.startsWith('-')) {
      current.deletions++;
      // deletion: no new-side line consumed
      oldLeft--;
    } else {
      // context line (a blank one may have lost its space): covered on both sides
      hunk.newLineNumbers.push(newLineCursor);
      newLineCursor++;
      oldLeft--;
      newLeft--;
    }
  }
  flushFile();

  return { raw, files: files.filter((f) => f.path) };
}
