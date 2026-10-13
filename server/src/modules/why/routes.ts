import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { WhyService } from './service.js';

/** `line` is the old-side (base) line number the diff shows; anything else is a 422. */
const WhyQuery = z.object({
  file: z.string().min(1).max(500),
  line: z.coerce.number().int().positive(),
});

/**
 * HW L05 — git-why (SPEC-04).
 *   GET /pulls/:id/why?file=&line= → who last changed a base line, in which commit and PR
 */
export default async function whyRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new WhyService(app.container);

  app.get('/pulls/:id/why', { schema: { params: IdParams, querystring: WhyQuery } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.answer(workspaceId, req.params.id, req.query.file, req.query.line);
  });
}
