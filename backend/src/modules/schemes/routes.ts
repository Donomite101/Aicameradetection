import { FastifyInstance } from 'fastify';
import { createSchemeSchema, updateSchemeSchema, listSchemesSchema } from './schemas';
import { createScheme, listSchemes, getSchemeById, updateScheme, deleteScheme } from './service';

export async function schemeRoutes(app: FastifyInstance) {
  // List schemes (authenticated)
  app.get('/', { schema: listSchemesSchema, preHandler: [app.authenticate] }, async (request) => {
    return listSchemes(request.query as any);
  });

  // Get scheme by id
  app.get('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const scheme = await getSchemeById(id);
    if (!scheme) return reply.status(404).send({ error: 'Scheme not found' });
    return scheme;
  });

  // Create scheme (Admin only)
  app.post('/', { schema: createSchemeSchema, preHandler: [app.authenticate, app.requireRole('ADMIN')] }, async (request) => {
    return createScheme(request.body as any);
  });

  // Update scheme (Admin only)
  app.patch('/:id', { schema: updateSchemeSchema, preHandler: [app.authenticate, app.requireRole('ADMIN')] }, async (request) => {
    const { id } = request.params as { id: string };
    return updateScheme(id, request.body as any);
  });

  // Delete scheme (Admin only)
  app.delete('/:id', { preHandler: [app.authenticate, app.requireRole('ADMIN')] }, async (request) => {
    const { id } = request.params as { id: string };
    return deleteScheme(id);
  });
}
