import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export class WhyRepository {
  constructor(private db: Db) {}

  /** The PR (workspace-scoped) with what git-why needs about its repo. */
  async pull(workspaceId: string, prId: string) {
    const [row] = await this.db
      .select({
        id: t.pullRequests.id,
        number: t.pullRequests.number,
        base: t.pullRequests.base,
        headSha: t.pullRequests.headSha,
        repoId: t.pullRequests.repoId,
        owner: t.repos.owner,
        name: t.repos.name,
        defaultBranch: t.repos.defaultBranch,
      })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  /** The PR's stored file row: undefined when the path is not one of its files. */
  async file(prId: string, path: string) {
    const [row] = await this.db
      .select({ patch: t.prFiles.patch })
      .from(t.prFiles)
      .where(and(eq(t.prFiles.prId, prId), eq(t.prFiles.path, path)));
    return row;
  }

  async title(repoId: string, number: number): Promise<string | null> {
    const [row] = await this.db
      .select({ title: t.pullRequests.title })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, number)));
    return row?.title ?? null;
  }
}
