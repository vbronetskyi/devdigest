import type { ChatMessage, ConventionCandidate, ConventionScan } from '@devdigest/shared';
import type { ConventionRow, ConventionScanRow } from '../../db/rows.js';
import { wrapUntrusted } from '../../platform/prompt.js';
import { CONFIDENCE_CAP_BY_FILES, MAX_CONVENTIONS, MAX_RULE_CHARS, MAX_SNIPPET_LINES, MIN_SNIPPET_CHARS } from './constants.js';

/** What the model returns per convention in step 2 (before grounding). */
export interface RawConvention {
  rule: string;
  evidence_path: string;
  evidence_snippet: string;
  /** Other sampled files said to show the same convention. */
  also_seen_in?: string[];
  confidence: number;
}

/** A convention whose snippet was found in the cited file. */
export interface GroundedConvention {
  rule: string;
  /** `path:start-end` (or `path:line` for one line), 1-based and inclusive. */
  evidencePath: string;
  /** The file's own lines for that range, dedented — never the model's copy. */
  evidenceSnippet: string;
  /** Null when the model gave no usable number. */
  confidence: number | null;
}

const MARKDOWN_LEAD = /^(?:#{1,6}\s+|[-*+>]\s+|\d+[.)]\s+)/;

/**
 * SPEC-07 AC-8: a rule is one line — whitespace collapsed, leading Markdown
 * markers removed, at most MAX_RULE_CHARS (cut at a word). A rule becomes the
 * heading of a trusted skill, so it must not carry extra lines or sections.
 */
export function normalizeRule(rule: string): string {
  let out = rule.replace(/\s+/g, ' ').trim();
  for (let prev = ''; prev !== out; ) {
    prev = out;
    out = out.replace(MARKDOWN_LEAD, '').trim();
  }
  if (out.length <= MAX_RULE_CHARS) return out;
  const cut = out.slice(0, MAX_RULE_CHARS - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > MAX_RULE_CHARS / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** The key two rules are "the same" by (SPEC-07 AC-10). */
export const ruleKey = (rule: string) => normalizeRule(rule).toLowerCase();

/** SPEC-07 AC-5: cut a file at the last line break within `max` characters, so no quoted line is half a line. */
export function clipAtLine(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastBreak = cut.lastIndexOf('\n');
  return lastBreak > 0 ? cut.slice(0, lastBreak) : cut;
}

const squash = (line: string) => line.replace(/\s+/g, ' ').trim();

/**
 * Find `snippet` in `content`, comparing line by line with whitespace collapsed
 * and blank lines skipped on both sides (models re-indent and drop blank lines).
 * Returns the 1-based inclusive line range, or null when it is not there.
 */
export function locateSnippet(content: string, snippet: string): { start: number; end: number } | null {
  const want = snippet.split(/\r?\n/).map(squash).filter(Boolean).slice(0, MAX_SNIPPET_LINES);
  if (want.length === 0 || want.join(' ').length < MIN_SNIPPET_CHARS) return null;
  const lines = content.split(/\r?\n/).map(squash);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== want[0]) continue;
    let k = 1;
    let j = i + 1;
    let last = i;
    while (k < want.length && j < lines.length) {
      if (lines[j] === '') {
        j++;
        continue;
      }
      if (lines[j] !== want[k]) break;
      last = j;
      k++;
      j++;
    }
    if (k === want.length) return { start: i + 1, end: last + 1 };
  }
  return null;
}

/** Strip the indentation common to every non-blank line. */
export function dedent(lines: string[]): string {
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^\s*/)![0].length);
  const cut = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(cut)).join('\n');
}

/**
 * Ceiling for a convention's confidence: how many sampled files show it. Paths
 * the model was not shown do not count.
 */
export function confidenceCap(citedPath: string, alsoSeenIn: readonly string[] | undefined, files: ReadonlyMap<string, string>): number {
  const support = new Set([citedPath, ...(alsoSeenIn ?? []).map((p) => p.trim()).filter((p) => files.has(p))]).size;
  return CONFIDENCE_CAP_BY_FILES[Math.min(support, CONFIDENCE_CAP_BY_FILES.length - 1)]!;
}

/**
 * Keep only conventions that cite a file the model was shown and quote it for
 * real; re-read the quoted range from the file itself (SPEC-07 AC-7). Rules are
 * normalized (AC-8); confidence is clamped to the ceiling from `confidenceCap`,
 * unknown when the model gave no number (AC-9). `dropped` counts rules without a
 * real quote; `skipped` counts repeats, rules already `accepted` in the repo and
 * the ones over the limit (AC-10, AC-11).
 */
export function groundConventions(
  raw: RawConvention[],
  files: ReadonlyMap<string, string>,
  accepted: ReadonlySet<string> = new Set(),
): { kept: GroundedConvention[]; dropped: number; skipped: number } {
  const kept: GroundedConvention[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  let skipped = 0;
  for (const c of raw) {
    const rule = normalizeRule(c.rule);
    const path = c.evidence_path.trim().replace(/:\d+(?:-\d+)?$/, '');
    const content = files.get(path);
    const at = content === undefined ? null : locateSnippet(content, c.evidence_snippet);
    if (!rule || !at) {
      dropped++;
      continue;
    }
    const key = rule.toLowerCase();
    if (seen.has(key) || accepted.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    const lines = content!.split(/\r?\n/).slice(at.start - 1, at.end);
    kept.push({
      rule,
      evidencePath: at.start === at.end ? `${path}:${at.start}` : `${path}:${at.start}-${at.end}`,
      evidenceSnippet: dedent(lines),
      confidence: Number.isFinite(c.confidence)
        ? Math.min(confidenceCap(path, c.also_seen_in, files), Math.max(0, c.confidence))
        : null,
    });
  }
  kept.sort((a, b) => (b.confidence ?? -1) - (a.confidence ?? -1));
  return { kept: kept.slice(0, MAX_CONVENTIONS), dropped, skipped: skipped + Math.max(0, kept.length - MAX_CONVENTIONS) };
}

const folderOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')));

/**
 * Only paths from the offered list survive, in the given order, without repeats
 * and with at most `perFolder` from any one folder.
 */
export function pickOffered(selected: readonly string[], offered: readonly string[], max: number, perFolder: number): string[] {
  const allowed = new Set(offered);
  const perDir = new Map<string, number>();
  const out: string[] = [];
  for (const path of new Set(selected.map((p) => p.trim()))) {
    if (!allowed.has(path)) continue;
    const dir = folderOf(path);
    if ((perDir.get(dir) ?? 0) >= perFolder) continue;
    perDir.set(dir, (perDir.get(dir) ?? 0) + 1);
    out.push(path);
    if (out.length >= max) break;
  }
  return out;
}

export function buildSelectionMessages(repoName: string, candidates: readonly string[], system: string): ChatMessage[] {
  return [
    { role: 'system', content: system },
    {
      role: 'user',
      content: `Repository: ${repoName}\nCandidate files, most central first:\n${candidates.map((p) => `- ${p}`).join('\n')}`,
    },
  ];
}

export function buildExtractionMessages(
  repoName: string,
  files: ReadonlyMap<string, string>,
  system: string,
): ChatMessage[] {
  // The shared wrapper defuses the closing marker in any case or spacing (SPEC-07 AC-6);
  // the label sits in an attribute, so a path cannot close it either.
  const blocks = [...files].map(([path, text]) => wrapUntrusted(`file:${path.replace(/["<>\r\n]/g, '_')}`, text));
  return [
    { role: 'system', content: system },
    { role: 'user', content: `Repository: ${repoName}\n\n${blocks.join('\n\n')}` },
  ];
}

const STOP_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'by', 'via', 'is', 'are', 'be', 'always', 'never', 'every', 'all', 'each', 'use', 'from', 'that', 'its', 'their']);

/** A SKILL.md-style name from the rule: up to five meaningful words. */
export function ruleToSkillName(rule: string): string {
  const words = rule
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !STOP_WORDS.has(w))
    .slice(0, 5);
  return words.join('-').slice(0, 56).replace(/-+$/, '') || 'convention';
}

/** `base`, or `base-2`, `base-3`… — the first one not in `taken`. */
export function uniqueName(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Skill body for an accepted convention — written for the reviewer that will read it. */
export function buildSkillBody(rule: string, evidencePath: string, snippet: string): string {
  const fence = snippet.includes('```') ? '~~~' : '```';
  return [
    `# ${rule}`,
    '',
    'A house convention of this repository, extracted from its code and accepted by a maintainer.',
    '',
    '## Flag',
    '- Changed code in the diff that breaks this convention. Quote the line and say what the',
    '  convention expects instead.',
    '',
    '## Do not flag',
    '- Code the diff does not touch.',
    '',
    '## Severity',
    'SUGGESTION. WARNING only when breaking the convention also causes a bug.',
    '',
    `## Example from \`${evidencePath}\``,
    fence,
    snippet,
    fence,
  ].join('\n');
}

export function toConventionDto(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    rule: row.rule,
    evidence_path: row.evidencePath ?? '',
    evidence_snippet: row.evidenceSnippet ?? '',
    confidence: row.confidence ?? null,
    accepted: row.accepted,
    commit_sha: row.commitSha ?? null,
  };
}

export function toScanDto(row: ConventionScanRow): ConventionScan {
  return {
    scanned_at: row.scannedAt.toISOString(),
    files: row.files,
    model: row.model,
    cost_usd: row.costUsd,
    dropped: row.dropped,
    skipped: row.skipped,
    commit_sha: row.commitSha,
  };
}

/** Total of known costs; null as soon as one call reported none (unknown is not zero). */
export function sumCosts(costs: (number | null)[]): number | null {
  return costs.some((c) => c === null) ? null : costs.reduce<number>((a, c) => a + (c as number), 0);
}
