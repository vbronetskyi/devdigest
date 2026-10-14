import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { DEFAULT_DAYS, WINDOW_DAYS } from './constants.js';
import { PerformanceService } from './service.js';

/** AC-10: only these three windows; anything else (empty, "07", repeated) is a 422. */
const PerfQuery = z.object({ days: z.enum(WINDOW_DAYS).optional() });

/**
 * HW L08 — agent performance (SPEC-05).
 *   GET /agents/performance?days=7|30|90 → runs, cost, duration, accept rate per agent
 */
export default async function performanceRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new PerformanceService(app.container);

  app.get('/agents/performance', { schema: { querystring: PerfQuery } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.get(workspaceId, req.query.days ? Number(req.query.days) : DEFAULT_DAYS);
  });
}
