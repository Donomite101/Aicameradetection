import { FastifyInstance } from 'fastify';
import { listInfrastructureChecksSchema, getInfrastructureCheckSchema, getCentreInfrastructureStatusSchema } from './schemas';
import { listInfrastructureChecks, getInfrastructureCheckById, getCentreInfrastructureStatus, getInfrastructureComplianceRate } from './service';

export async function infrastructureRoutes(app: FastifyInstance) {
  // List infrastructure checks
  app.get('/checks', { schema: listInfrastructureChecksSchema, preHandler: [app.authenticate] }, async (request) => {
    const user = request.user as any;
    const query = { ...(request.query as any) };
    if (user.role !== 'ADMIN' && user.centreId) {
      query.centreId = user.centreId;
    }
    return listInfrastructureChecks(query);
  });

  // Get centre infrastructure status
  app.get('/centre/:id/status', { schema: getCentreInfrastructureStatusSchema, preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user as any;
    if (user.role !== 'ADMIN' && user.centreId && user.centreId !== id) {
      return reply.status(403).send({ error: 'Access denied: You can only view infrastructure for your assigned training centre' });
    }
    return getCentreInfrastructureStatus(id);
  });

  // Get compliance rate
  app.get('/centre/:id/compliance', { schema: getCentreInfrastructureStatusSchema, preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user as any;
    if (user.role !== 'ADMIN' && user.centreId && user.centreId !== id) {
      return reply.status(403).send({ error: 'Access denied: You can only view infrastructure for your assigned training centre' });
    }
    const days = (request.query as any).days ? parseInt((request.query as any).days) : 30;
    return getInfrastructureComplianceRate(id, days);
  });

  // Get single check
  app.get('/checks/:id', { schema: getInfrastructureCheckSchema, preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const check = await getInfrastructureCheckById(id);
    if (!check) {
      return reply.status(404).send({ error: 'Infrastructure check not found' });
    }
    const user = request.user as any;
    if (user.role !== 'ADMIN' && user.centreId && check.centreId !== user.centreId) {
      return reply.status(403).send({ error: 'Access denied: Check belongs to another training centre' });
    }
    return check;
  });
}