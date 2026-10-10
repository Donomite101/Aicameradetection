import { FastifyInstance } from 'fastify';
import { listAlertsSchema, getAlertSchema, updateAlertSchema } from './schemas';
import { listAlerts, getAlertById, acknowledgeAlert, resolveAlert, updateAlertStatus, getAlertStats } from './service';

export async function alertRoutes(app: FastifyInstance) {
  // List alerts
  app.get('/', { schema: listAlertsSchema, preHandler: [app.authenticate] }, async (request) => {
    return listAlerts(request.query);
  });

  // Get alert stats
  app.get('/stats', { preHandler: [app.authenticate] }, async (request) => {
    const centreId = (request.query as any).centreId;
    return getAlertStats(centreId);
  });

  // Get single alert
  app.get('/:id', { schema: getAlertSchema, preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const alert = await getAlertById(id);
    if (!alert) {
      return reply.status(404).send({ error: 'Alert not found' });
    }
    return alert;
  });

  // Acknowledge alert
  app.post('/:id/acknowledge', { schema: getAlertSchema, preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    return acknowledgeAlert(id, request.user!.userId);
  });

  // Resolve alert
  app.post('/:id/resolve', { schema: getAlertSchema, preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    return resolveAlert(id, request.user!.userId);
  });

  // Update alert status
  app.patch('/:id', { schema: updateAlertSchema, preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    return updateAlertStatus(id, request.body, request.user!.userId);
  });
}