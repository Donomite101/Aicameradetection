import { FastifyInstance } from 'fastify';
import { listInfrastructureChecksSchema, getInfrastructureCheckSchema, getCentreInfrastructureStatusSchema } from './schemas';
import { listInfrastructureChecks, getInfrastructureCheckById, getCentreInfrastructureStatus, getInfrastructureComplianceRate } from './service';

export async function infrastructureRoutes(app: FastifyInstance) {
  // List infrastructure checks
  app.get('/checks', { schema: listInfrastructureChecksSchema, preHandler: [app.authenticate] }, async (request) => {
    return listInfrastructureChecks(request.query);
  });

  // Get centre infrastructure status
  app.get('/centre/:id/status', { schema: getCentreInfrastructureStatusSchema, preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    return getCentreInfrastructureStatus(id);
  });

  // Get compliance rate
  app.get('/centre/:id/compliance', { schema: getCentreInfrastructureStatusSchema, preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
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
    return check;
  });
}