import type { DigestCritical, WeeklyDigest } from "@devdigest/shared";
import { formatCost } from "@/lib/format-cost";

const DAY = 86_400_000;

/** The ISO week (`YYYY-Www`) of an instant, by ISO week-year. */
export function isoWeekOf(at: Date): string {
  const day = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
  const thursday = day + (3 - ((new Date(day).getUTCDay() + 6) % 7)) * DAY;
  const year = new Date(thursday).getUTCFullYear();
  const jan4 = Date.UTC(year, 0, 4);
  const week1 = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY;
  return `${year}-W${String(Math.floor((thursday - week1) / (7 * DAY)) + 1).padStart(2, "0")}`;
}

/** The weeks around a digest's week, from its Monday. */
export function neighbourWeeks(fromIso: string): { prev: string; next: string } {
  const from = Date.parse(fromIso);
  return { prev: isoWeekOf(new Date(from - 7 * DAY)), next: isoWeekOf(new Date(from + 7 * DAY)) };
}

/** "Oct 12" in UTC. */
export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** The last day of the week (the stored `to` is the next Monday, exclusive). */
export const lastDay = (toIso: string) => new Date(Date.parse(toIso) - DAY).toISOString();

/** A change as "+2" / "−3" / null for none. */
export function signed(n: number | null, fmt: (v: number) => string = String): string | null {
  if (n == null || n === 0) return null;
  return `${n > 0 ? "+" : "−"}${fmt(Math.abs(n))}`;
}

/** The PR's Files changed tab at the finding's line (the brief's deep link, HW L05). */
export function criticalHref(c: DigestCritical): string {
  return `/repos/${c.repo_id}/pulls/${c.pr_number}?tab=diff&file=${encodeURIComponent(c.file)}&line=${c.line}`;
}

export const githubPrUrl = (fullName: string, n: number) => `https://github.com/${fullName}/pull/${n}`;

/**
 * Untrusted text (PR titles, finding titles, agent names) made safe for a team
 * channel: one line, Markdown syntax escaped, `@mentions`, `#123` references and
 * `<!here>`-style commands neutralised (SPEC-06 AC-12).
 */
export function mdSafe(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/([\\`*_[\]<>|~])/g, "\\$1")
    .replace(/@(?=\w)/g, "@​")
    .replace(/#(?=\d)/g, "#​");
}

const pct = (r: number | null) => (r == null ? "—" : `${Math.round(r * 100)}%`);

/** AC-12: the digest as Markdown — our structure, escaped data, GitHub links from owner/name/number. */
export function digestMarkdown(d: WeeklyDigest): string {
  const f = d.facts;
  const lines = [
    `**Weekly review digest — ${d.week}** (${shortDate(d.from)} – ${shortDate(lastDay(d.to))}, UTC${d.in_progress ? ", in progress" : ""})`,
    "",
    `- PRs opened: ${f.prs_opened} · reviewed: ${f.prs_reviewed}`,
    `- Review runs: ${f.runs} (${f.failed} failed) · cost: ${f.cost_usd == null ? "—" : formatCost(f.cost_usd)}`,
    `- New findings: ${f.findings.CRITICAL} critical, ${f.findings.WARNING} warning, ${f.findings.SUGGESTION} suggestion`,
    `- Decisions: ${f.accepted} accepted, ${f.dismissed} dismissed · accept rate ${pct(f.accept_rate)}`,
  ];
  if (d.highlights?.lines.length) {
    lines.push("", "**Highlights** (AI-written, numbers checked)", ...d.highlights.lines.map((l) => `- ${mdSafe(l)}`));
  }
  if (d.open_criticals.length) {
    lines.push("", `**Open critical findings** (${d.open_criticals.length} of ${d.open_criticals_total})`);
    for (const c of d.open_criticals) {
      const state = c.pr_state ? ` (${c.pr_state})` : "";
      lines.push(`- [PR ${c.pr_number}](${githubPrUrl(c.repo_full_name, c.pr_number)})${state}: ${mdSafe(c.title)} — \`${c.file.replace(/`/g, "")}:${c.line}\``);
    }
  }
  if (d.agents.length) {
    lines.push("", "**Agents**");
    for (const a of d.agents) lines.push(`- ${mdSafe(a.name ?? "deleted agent")}: ${a.runs} runs · ${a.cost_usd == null ? "—" : formatCost(a.cost_usd)} · accept ${pct(a.accept_rate)}`);
  }
  return lines.join("\n");
}
