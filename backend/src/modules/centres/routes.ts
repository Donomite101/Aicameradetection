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
} from './service';

export async function centreRoutes(app: FastifyInstance) {
  // List centres
  app.get('/', { schema: listCentresSchema, preHandler: [app.authenticate] }, async (request) => {
    return listCentres(request.query);
  });

  // Get centre stats
  app.get('/:id/stats', { schema: getCentreSchema, preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    return getCentreStats(id);
  });

  // Get centre by ID
  app.get('/:id', { schema: getCentreSchema, preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const centre = await getCentreById(id);
    if (!centre) {
      return reply.status(404).send({ error: 'Centre not found' });
    }
    return centre;
  });

  // Create centre
  app.post('/', { schema: createCentreSchema, preHandler: [app.authenticate, app.requireRole('ADMIN')] }, async (request) => {
    return createCentre(request.body);
  });

  // Update centre
  app.patch('/:id', { schema: updateCentreSchema, preHandler: [app.authenticate, app.requireRole('ADMIN')] }, async (request) => {
    const { id } = request.params as { id: string };
    return updateCentre(id, request.body);
  });

  // Delete centre
  app.delete('/:id', { schema: getCentreSchema, preHandler: [app.authenticate, app.requireRole('ADMIN')] }, async (request) => {
    const { id } = request.params as { id: string };
    await deleteCentre(id);
    return { success: true };
  });

  // Cameras
  app.get('/:id/cameras', { schema: getCentreSchema, preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    return getCameras(id);
  });

  app.post('/:id/cameras', { schema: addCameraSchema, preHandler: [app.authenticate, app.requireRole('ADMIN', 'CENTRE_MANAGER')] }, async (request) => {
    const { id } = request.params as { id: string };
    return addCamera(id, request.body);
  });

  app.patch('/:id/cameras/:cameraId', { schema: updateCameraSchema, preHandler: [app.authenticate, app.requireRole('ADMIN', 'CENTRE_MANAGER')] }, async (request) => {
    const { id, cameraId } = request.params as { id: string; cameraId: string };
    return updateCamera(id, cameraId, request.body);
  });

  app.delete('/:id/cameras/:cameraId', { schema: updateCameraSchema, preHandler: [app.authenticate, app.requireRole('ADMIN')] }, async (request) => {
    const { id, cameraId } = request.params as { id: string; cameraId: string };
    await deleteCamera(id, cameraId);
    return { success: true };
  });

  // Inventory
  app.get('/:id/inventory', { schema: getCentreSchema, preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    return getInventory(id);
  });

  app.post('/:id/inventory', { schema: addInventoryItemSchema, preHandler: [app.authenticate, app.requireRole('ADMIN', 'CENTRE_MANAGER')] }, async (request) => {
    const { id } = request.params as { id: string };
    return addInventoryItem(id, request.body);
  });

  app.patch('/:id/inventory/:itemId', { schema: updateInventoryItemSchema, preHandler: [app.authenticate, app.requireRole('ADMIN', 'CENTRE_MANAGER')] }, async (request) => {
    const { id, itemId } = request.params as { id: string; itemId: string };
    return updateInventoryItem(id, itemId, request.body);
  });

  app.delete('/:id/inventory/:itemId', { schema: updateInventoryItemSchema, preHandler: [app.authenticate, app.requireRole('ADMIN')] }, async (request) => {
    const { id, itemId } = request.params as { id: string; itemId: string };
    await deleteInventoryItem(id, itemId);
    return { success: true };
  });
}