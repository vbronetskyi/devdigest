import type { DigestCritical, WeeklyDigest } from "@devdigest/shared";
import { formatCost } from "@/lib/format-cost";

const DAY = 86_400_000;

/** Midnight UTC of a date; unlike `Date.UTC`, years 0–99 stay themselves. */
function utcDay(year: number, month: number, day: number): number {
  const d = new Date(0);
  d.setUTCFullYear(year, month, day);
  return d.getTime();
}

/** The ISO week (`YYYY-Www`) of an instant, by ISO week-year. */
export function isoWeekOf(at: Date): string {
  const day = utcDay(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
  const thursday = day + (3 - ((new Date(day).getUTCDay() + 6) % 7)) * DAY;
  const year = new Date(thursday).getUTCFullYear();
  const jan4 = utcDay(year, 0, 4);
  const week1 = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY;
  return `${String(year).padStart(4, "0")}-W${String(Math.floor((thursday - week1) / (7 * DAY)) + 1).padStart(2, "0")}`;
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

/** A change as "+2" / "−3" / "±0"; null when unknown (one side of it is). */
export function changeText(n: number | null, fmt: (v: number) => string = String): string | null {
  if (n == null) return null;
  if (n === 0) return "±0";
  return `${n > 0 ? "+" : "−"}${fmt(Math.abs(n))}`;
}

/** The PR's Files changed tab at the finding's line (the brief's deep link, HW L05). */
export function criticalHref(c: DigestCritical): string {
  return `/repos/${c.repo_id}/pulls/${c.pr_number}?tab=diff&file=${encodeURIComponent(c.file)}&line=${c.line}`;
}

export const githubPrUrl = (fullName: string, n: number) => `https://github.com/${fullName}/pull/${n}`;

/**
 * What a channel would turn into a link — a URL, `www.`, or a bare domain on a common
 * TLD (`evil.com/login`; Slack links those) — kept readable, inside a code span. File
 * names (`routes.ts`, `deploy.sh`) are not on the list.
 */
const LINKABLE =
  /((?:[a-z][a-z0-9+.-]*:\/\/|mailto:|www\.)[^\s`<>]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|dev|app|ai|co|xyz|info|me|ly|gg|link|site|online|biz|us|uk|eu|ru|ua)\b(?:\/[^\s`<>]*)?)/gi;

/**
 * Untrusted text (PR titles, finding titles, agent names, highlights) made safe for a
 * team channel: one line, Markdown syntax escaped, `@mentions`, `#123` / `GH-123`
 * references and `<!here>`-style commands neutralised, URLs and bare domains inside code
 * spans so no channel links them (SPEC-06 AC-12).
 */
export function mdSafe(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(LINKABLE)
    .map((part, i) =>
      i % 2 === 1
        ? `\`${part}\``
        : part
            .replace(/([\\`*_[\]<>|~])/g, "\\$1")
            .replace(/@(?=\w)/g, "@\u200b")
            .replace(/#(?=\d)/g, "#\u200b")
            .replace(/\bGH-(?=\d)/gi, (m) => `${m.slice(0, 2)}\u200b-`),
    )
    .join("");
}

/** A path in a code span: one line, no backtick to close it early. */
const codePath = (file: string, line: number) => `\`${file.replace(/`/g, "").replace(/\s+/g, " ").trim()}:${line}\``;

const pct = (r: number | null) => (r == null ? "—" : `${Math.round(r * 100)}%`);
const cost = (usd: number | null) => (usd == null ? "—" : formatCost(usd));
/** "(last week 4, +5)": the previous number and the change; "—" for an unknown one. */
const vs = (prev: string | number, change: string | null, inProgress: boolean) =>
  `(${inProgress ? "same days last week" : "last week"} ${prev}, ${change ?? "—"})`;

/** AC-12: the digest as Markdown — our structure, escaped data, GitHub links from owner/name/number. */
export function digestMarkdown(d: WeeklyDigest): string {
  const f = d.facts;
  const p = d.prev;
  const c = d.change;
  const ip = d.in_progress;
  const lines = [
    `**Weekly review digest — ${d.week}** (${shortDate(d.from)} – ${shortDate(lastDay(d.to))}, UTC${ip ? ", in progress" : ""})`,
    "",
    `- PRs opened: ${f.prs_opened} ${vs(p.prs_opened, changeText(c.prs_opened), ip)} · reviewed: ${f.prs_reviewed} ${vs(p.prs_reviewed, changeText(c.prs_reviewed), ip)}`,
    `- Review runs: ${f.runs}, ${f.failed} failed ${vs(p.runs, changeText(c.runs), ip)} · cost: ${cost(f.cost_usd)} ${vs(cost(p.cost_usd), changeText(c.cost_usd, formatCost), ip)}`,
    `- New findings: ${f.findings.CRITICAL} critical ${vs(p.findings.CRITICAL, changeText(c.critical), ip)}, ${f.findings.WARNING} warning, ${f.findings.SUGGESTION} suggestion`,
    `- Decisions: ${f.accepted} accepted ${vs(p.accepted, changeText(c.accepted), ip)}, ${f.dismissed} dismissed ${vs(p.dismissed, changeText(c.dismissed), ip)} · accept rate ${pct(f.accept_rate)} (${ip ? "same days last week" : "last week"} ${pct(p.accept_rate)})`,
  ];
  if (d.highlights?.lines.length) {
    lines.push("", "**Highlights** (AI-written, numbers checked)", ...d.highlights.lines.map((l) => `- ${mdSafe(l)}`));
  }
  if (d.open_criticals.length) {
    lines.push("", `**Open critical findings** (${d.open_criticals.length} of ${d.open_criticals_total})`);
    for (const x of d.open_criticals) {
      const state = x.pr_state ? ` (${x.pr_state})` : "";
      const agent = mdSafe(x.agent_name ?? "deleted agent");
      lines.push(`- [PR ${x.pr_number}](${githubPrUrl(x.repo_full_name, x.pr_number)}) ${mdSafe(x.pr_title)}${state}: ${mdSafe(x.title)} — ${codePath(x.file, x.line)} · ${agent}`);
    }
  }
  if (d.agents.length) {
    lines.push("", "**Agents**");
    for (const a of d.agents) lines.push(`- ${mdSafe(a.name ?? "deleted agent")}: ${a.runs} runs · ${cost(a.cost_usd)} · accept ${pct(a.accept_rate)}`);
  }
  return lines.join("\n");
}
