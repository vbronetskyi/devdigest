import { pgTable, uuid, text, integer, boolean, jsonb, timestamp, index, doublePrecision, primaryKey } from 'drizzle-orm/pg-core';
import { workspaces } from './core';

// ============================================================ Jobs & ops

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    payload: jsonb('payload'),
    status: text('status', {
      enum: ['queued', 'running', 'done', 'failed'],
    })
      .notNull()
      .default('queued'),
    attempts: integer('attempts').notNull().default(0),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    error: text('error'),
  },
  (t) => ({ statusIdx: index('jobs_status_idx').on(t.status) }),
);

export const installedPlugins = pgTable('installed_plugins', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  version: text('version'),
  source: text('source'),
  installedAt: timestamp('installed_at', { withTimezone: true }).defaultNow().notNull(),
  enabled: boolean('enabled').notNull().default(true),
});

export const digests = pgTable('digests', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  periodStart: timestamp('period_start', { withTimezone: true }),
  periodEnd: timestamp('period_end', { withTimezone: true }),
  bodyMd: text('body_md'),
  deliveredTo: text('delivered_to'),
});

/** Model-written highlights of one ISO week (SPEC-06 AC-8); the facts are computed, never stored. */
export const digestHighlights = pgTable(
  'digest_highlights',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    /** ISO week, `YYYY-Www`. */
    week: text('week').notNull(),
    lines: jsonb('lines').$type<string[]>().notNull(),
    model: text('model').notNull(),
    costUsd: doublePrecision('cost_usd'),
    /** Hash of the facts text the model saw — a different hash today means stale. */
    factsHash: text('facts_hash').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.workspaceId, t.week] }) }),
);
