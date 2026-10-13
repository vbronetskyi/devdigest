import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';

/** The stored brief JSON for a PR (one per PR, replaced on regeneration). */
export async function getBrief(db: Db, prId: string): Promise<unknown | undefined> {
  const [row] = await db.select({ json: t.prBrief.json }).from(t.prBrief).where(eq(t.prBrief.prId, prId));
  return row?.json;
}

export async function upsertBrief(db: Db, prId: string, json: unknown): Promise<void> {
  await db.insert(t.prBrief).values({ prId, json }).onConflictDoUpdate({ target: t.prBrief.prId, set: { json } });
}

/**
 * Titles of the repo's PRs DevDigest knows as merged, by number. Only these count as
 * history: a fork's commits carry the upstream's PR numbers (SPEC-03 AC-4).
 */
export async function mergedPullTitles(db: Db, repoId: string, numbers: number[]): Promise<Map<number, string>> {
  if (numbers.length === 0) return new Map();
  const rows = await db
    .select({ number: t.pullRequests.number, title: t.pullRequests.title })
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.status, 'merged'), inArray(t.pullRequests.number, numbers)));
  return new Map(rows.map((r) => [r.number, r.title]));
}
