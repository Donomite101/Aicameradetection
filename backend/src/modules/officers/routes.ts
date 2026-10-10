import { FastifyInstance } from 'fastify';
import { createOfficerSchema, updateOfficerSchema, listOfficersSchema } from './schemas';
import { createOfficer, listOfficers, getOfficerById, updateOfficer, deleteOfficer } from './service';

export async function officerRoutes(app: FastifyInstance) {
  // List officers (Admin only)
  app.get('/', { schema: listOfficersSchema, preHandler: [app.authenticate, app.requireRole('ADMIN')] }, async (request) => {
    return listOfficers(request.query as any);
  });

  // Get officer by ID
  app.get('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user as any;
    // Admins can view any officer; officers can view themselves
    if (user.role !== 'ADMIN' && user.id !== id) {
      return reply.status(403).send({ error: 'Access denied' });
    }
    const officer = await getOfficerById(id);
    if (!officer) return reply.status(404).send({ error: 'Officer not found' });
    return officer;
  });

  // Create officer (Admin only)
  app.post('/', { schema: createOfficerSchema, preHandler: [app.authenticate, app.requireRole('ADMIN')] }, async (request) => {
    return createOfficer(request.body as any);
  });

  // Update officer (Admin only)
  app.patch('/:id', { schema: updateOfficerSchema, preHandler: [app.authenticate, app.requireRole('ADMIN')] }, async (request) => {
    const { id } = request.params as { id: string };
    return updateOfficer(id, request.body as any);
  });

  // Delete officer (Admin only)
  app.delete('/:id', { preHandler: [app.authenticate, app.requireRole('ADMIN')] }, async (request) => {
    const { id } = request.params as { id: string };
    return deleteOfficer(id);
  });
}
