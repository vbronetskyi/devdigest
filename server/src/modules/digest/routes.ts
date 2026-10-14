import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { DigestHighlightsRequest } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { DigestService } from './service.js';

const DigestQuery = z.object({ week: z.string().optional() });

/**
 * HW L08 — weekly digest (SPEC-06).
 *   GET  /digest?week=YYYY-Www   → the week's facts, the week before, open criticals, agents; no model call
 *   POST /digest/highlights      → {week}: one model call; lines whose numbers are not in the facts are dropped
 */
export default async function digestRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new DigestService(app.container);

  app.get('/digest', { schema: { querystring: DigestQuery } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.get(workspaceId, req.query.week);
  });

  app.post(
    '/digest/highlights',
    { schema: { body: DigestHighlightsRequest }, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.writeHighlights(workspaceId, req.body.week);
    },
  );
}
