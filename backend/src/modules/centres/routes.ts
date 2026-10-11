import { FastifyInstance } from 'fastify';
import {
  createCentreSchema,
  updateCentreSchema,
  getCentreSchema,
  listCentresSchema,
  addCameraSchema,
  updateCameraSchema,
  addInventoryItemSchema,
  updateInventoryItemSchema,
} from './schemas';
import {
  createCentre,
  getCentreById,
  listCentres,
  updateCentre,
  deleteCentre,
  addCamera,
  updateCamera,
  deleteCamera,
  getCameras,
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  getInventory,
  getCentreStats,
  getSchedule,
} from './service';
import { getCentreAnalytics } from './analytics';

export async function centreRoutes(app: FastifyInstance) {
  // List centres (restricted to assigned centre for non-admins)
  app.get('/', { schema: listCentresSchema, preHandler: [app.authenticateDevice] }, async (request) => {
    const user = request.user as any;
    const userCentreId = user.role !== 'ADMIN' && user.role !== 'DEVICE' ? user.centreId : undefined;
    return listCentres(request.query as any, userCentreId);
  });

  // Get centre stats
  app.get('/:id/stats', { schema: getCentreSchema, preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user as any;
    if (user.role !== 'ADMIN' && user.centreId && user.centreId !== id) {
      return reply.status(403).send({ error: 'Access denied: You can only view your assigned training centre' });
    }
    return getCentreStats(id);
  });

  // Full analysis of one centre: KPIs, trends, per-slot and per-tool performance, alerts, trainees
  app.get('/:id/analytics', { schema: getCentreSchema, preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user as any;
    if (user.role !== 'ADMIN' && user.centreId && user.centreId !== id) {
      return reply.status(403).send({ error: 'Access denied: You can only view your assigned training centre' });
    }
    const requested = parseInt(String((request.query as any)?.days ?? 30), 10);
    const days = Math.min(365, Math.max(1, Number.isNaN(requested) ? 30 : requested));
    const analytics = await getCentreAnalytics(id, days);
    if (!analytics) return reply.status(404).send({ error: 'Centre not found' });
    return analytics;
  });

  // Class schedule: slots + active/next slot (used by the AI service and the UI)
  app.get('/:id/schedule', { schema: getCentreSchema, preHandler: [app.authenticateDevice] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user as any;
    if (user.role !== 'ADMIN' && user.role !== 'DEVICE' && user.centreId !== id) {
      return reply.status(403).send({ error: 'Access denied: You can only view your assigned training centre' });
    }
    return getSchedule(id);
  });

  // Get centre by ID
  app.get('/:id', { schema: getCentreSchema, preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user as any;
    if (user.role !== 'ADMIN' && user.centreId && user.centreId !== id) {
      return reply.status(403).send({ error: 'Access denied: You can only view your assigned training centre' });
    }
    const centre = await getCentreById(id);
    if (!centre) {
      return reply.status(404).send({ error: 'Centre not found' });
    }
    return centre;
  });

  // Create centre
  app.post('/', { schema: createCentreSchema, preHandler: [app.authenticate, app.requireRole('ADMIN')] }, async (request) => {
    // Route validation does not hand over zod defaults, so parse again to apply them (status = ACTIVE, tools = [], ...)
    return createCentre(createCentreSchema.shape.body.parse(request.body));
  });

  // Update centre
  app.patch('/:id', { schema: updateCentreSchema, preHandler: [app.authenticate, app.requireRole('ADMIN')] }, async (request) => {
    const { id } = request.params as { id: string };
    return updateCentre(id, request.body as any);
  });

  // Delete centre
  app.delete('/:id', { schema: getCentreSchema, preHandler: [app.authenticate, app.requireRole('ADMIN')] }, async (request) => {
    const { id } = request.params as { id: string };
    await deleteCentre(id);
    return { success: true };
  });

  // Cameras
  app.get('/:id/cameras', { schema: getCentreSchema, preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user as any;
    if (user.role !== 'ADMIN' && user.centreId && user.centreId !== id) {
      return reply.status(403).send({ error: 'Access denied: You can only view cameras for your assigned centre' });
    }
    return getCameras(id);
  });

  app.post('/:id/cameras', { schema: addCameraSchema, preHandler: [app.authenticate, app.requireRole('ADMIN', 'CENTRE_MANAGER')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user as any;
    if (user.role !== 'ADMIN' && user.centreId && user.centreId !== id) {
      return reply.status(403).send({ error: 'Access denied' });
    }
    const body = addCameraSchema.shape.body.parse(request.body); // applies the type default
    if (body.type === 'IP' && !body.rtspUrl) {
      return reply.status(400).send({ error: 'An IP camera needs its RTSP URL' });
    }
    return addCamera(id, body);
  });

  app.patch('/:id/cameras/:cameraId', { schema: updateCameraSchema, preHandler: [app.authenticate, app.requireRole('ADMIN', 'CENTRE_MANAGER')] }, async (request, reply) => {
    const { id, cameraId } = request.params as { id: string; cameraId: string };
    const user = request.user as any;
    if (user.role !== 'ADMIN' && user.centreId && user.centreId !== id) {
      return reply.status(403).send({ error: 'Access denied' });
    }
    return updateCamera(id, cameraId, request.body as any);
  });

  app.delete('/:id/cameras/:cameraId', { schema: updateCameraSchema, preHandler: [app.authenticate, app.requireRole('ADMIN')] }, async (request) => {
    const { id, cameraId } = request.params as { id: string; cameraId: string };
    await deleteCamera(id, cameraId);
    return { success: true };
  });

  // Inventory
  app.get('/:id/inventory', { schema: getCentreSchema, preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user as any;
    if (user.role !== 'ADMIN' && user.centreId && user.centreId !== id) {
      return reply.status(403).send({ error: 'Access denied: You can only view inventory for your assigned centre' });
    }
    return getInventory(id);
  });

  app.post('/:id/inventory', { schema: addInventoryItemSchema, preHandler: [app.authenticate, app.requireRole('ADMIN', 'CENTRE_MANAGER')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user as any;
    if (user.role !== 'ADMIN' && user.centreId && user.centreId !== id) {
      return reply.status(403).send({ error: 'Access denied' });
    }
    return addInventoryItem(id, request.body as any);
  });

  app.patch('/:id/inventory/:itemId', { schema: updateInventoryItemSchema, preHandler: [app.authenticate, app.requireRole('ADMIN', 'CENTRE_MANAGER')] }, async (request, reply) => {
    const { id, itemId } = request.params as { id: string; itemId: string };
    const user = request.user as any;
    if (user.role !== 'ADMIN' && user.centreId && user.centreId !== id) {
      return reply.status(403).send({ error: 'Access denied' });
    }
    return updateInventoryItem(id, itemId, request.body as any);
  });

  app.delete('/:id/inventory/:itemId', { schema: updateInventoryItemSchema, preHandler: [app.authenticate, app.requireRole('ADMIN')] }, async (request) => {
    const { id, itemId } = request.params as { id: string; itemId: string };
    await deleteInventoryItem(id, itemId);
    return { success: true };
  });
}