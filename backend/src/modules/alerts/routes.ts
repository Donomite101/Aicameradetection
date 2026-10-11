import { FastifyInstance } from 'fastify';
import { listAlertsSchema, getAlertSchema, updateAlertSchema } from './schemas';
import { listAlerts, getAlertById, acknowledgeAlert, resolveAlert, updateAlertStatus, getAlertStats } from './service';

export async function alertRoutes(app: FastifyInstance) {
  // List alerts
  app.get('/', { schema: listAlertsSchema, preHandler: [app.authenticate] }, async (request) => {
    const user = request.user as any;
    const query = { ...(request.query as any) };
    if (user.role !== 'ADMIN' && user.centreId) {
      query.centreId = user.centreId;
    }
    return listAlerts(query);
  });

  // Get alert stats
  app.get('/stats', { preHandler: [app.authenticate] }, async (request) => {
    const user = request.user as any;
    let centreId = (request.query as any).centreId;
    if (user.role !== 'ADMIN' && user.centreId) {
      centreId = user.centreId;
    }
    return getAlertStats(centreId);
  });

  // Get single alert
  app.get('/:id', { schema: getAlertSchema, preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const alert = await getAlertById(id);
    if (!alert) {
      return reply.status(404).send({ error: 'Alert not found' });
    }
    const user = request.user as any;
    if (user.role !== 'ADMIN' && user.centreId && alert.centreId !== user.centreId) {
      return reply.status(403).send({ error: 'Access denied: Alert belongs to another training centre' });
    }
    return alert;
  });

  // Acknowledge alert
  app.post('/:id/acknowledge', { schema: getAlertSchema, preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const alert = await getAlertById(id);
    if (!alert) return reply.status(404).send({ error: 'Alert not found' });
    const user = request.user as any;
    if (user.role !== 'ADMIN' && user.centreId && alert.centreId !== user.centreId) {
      return reply.status(403).send({ error: 'Access denied: Alert belongs to another training centre' });
    }
    return acknowledgeAlert(id, user.id || user.userId);
  });

  // Resolve alert
  app.post('/:id/resolve', { schema: getAlertSchema, preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const alert = await getAlertById(id);
    if (!alert) return reply.status(404).send({ error: 'Alert not found' });
    const user = request.user as any;
    if (user.role !== 'ADMIN' && user.centreId && alert.centreId !== user.centreId) {
      return reply.status(403).send({ error: 'Access denied: Alert belongs to another training centre' });
    }
    return resolveAlert(id, user.id || user.userId);
  });

  // Update alert status
  app.patch('/:id', { schema: updateAlertSchema, preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const alert = await getAlertById(id);
    if (!alert) return reply.status(404).send({ error: 'Alert not found' });
    const user = request.user as any;
    if (user.role !== 'ADMIN' && user.centreId && alert.centreId !== user.centreId) {
      return reply.status(403).send({ error: 'Access denied: Alert belongs to another training centre' });
    }
    return updateAlertStatus(id, request.body as any, user.id || user.userId);
  });
}