import { FastifyInstance } from 'fastify';
import {
  createTraineeSchema,
  updateTraineeSchema,
  listTraineesSchema,
  markAttendanceSchema,
  listTraineeAttendanceSchema,
} from './schemas';
import {
  createTrainee,
  listTrainees,
  getTraineeById,
  updateTrainee,
  deleteTrainee,
  markBatchAttendance,
  listTraineeAttendance,
} from './service';

export async function traineeRoutes(app: FastifyInstance) {
  // List trainees
  app.get('/', { schema: listTraineesSchema, preHandler: [app.authenticate] }, async (request) => {
    const user = request.user as any;
    const isAdmin = user.role === 'ADMIN';
    return listTrainees(request.query as any, user.centreId, isAdmin);
  });

  // Get trainee by ID
  app.get('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const trainee = await getTraineeById(id);
    if (!trainee) return reply.status(404).send({ error: 'Trainee not found' });

    const user = request.user as any;
    if (user.role !== 'ADMIN' && user.centreId && trainee.centreId !== user.centreId) {
      return reply.status(403).send({ error: 'Access denied: trainee belongs to another centre' });
    }

    return trainee;
  });

  // Create trainee
  app.post('/', { schema: createTraineeSchema, preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as any;
    const body = request.body as any;

    let targetCentreId = body.centreId;
    if (user.role !== 'ADMIN') {
      if (!user.centreId) {
        return reply.status(400).send({ error: 'You are not assigned to any training centre' });
      }
      targetCentreId = user.centreId;
    } else if (!targetCentreId) {
      return reply.status(400).send({ error: 'centreId is required for admin' });
    }

    return createTrainee(body, targetCentreId);
  });

  // Update trainee
  app.patch('/:id', { schema: updateTraineeSchema, preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user as any;

    const existing = await getTraineeById(id);
    if (!existing) return reply.status(404).send({ error: 'Trainee not found' });

    if (user.role !== 'ADMIN' && user.centreId && existing.centreId !== user.centreId) {
      return reply.status(403).send({ error: 'Access denied: trainee belongs to another centre' });
    }

    return updateTrainee(id, request.body as any);
  });

  // Delete trainee
  app.delete('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user as any;

    const existing = await getTraineeById(id);
    if (!existing) return reply.status(404).send({ error: 'Trainee not found' });

    if (user.role !== 'ADMIN' && user.centreId && existing.centreId !== user.centreId) {
      return reply.status(403).send({ error: 'Access denied: trainee belongs to another centre' });
    }

    return deleteTrainee(id);
  });

  // Mark trainee attendance (Batch)
  app.post('/attendance', { schema: markAttendanceSchema, preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as any;
    const body = request.body as any;

    const centreId = user.centreId || request.headers['x-centre-id'] as string;
    if (!centreId && user.role !== 'ADMIN') {
      return reply.status(400).send({ error: 'No centre associated with user' });
    }

    return markBatchAttendance(body, centreId, user.id);
  });

  // Get trainee attendance records
  app.get('/attendance', { schema: listTraineeAttendanceSchema, preHandler: [app.authenticate] }, async (request) => {
    const user = request.user as any;
    const isAdmin = user.role === 'ADMIN';
    return listTraineeAttendance(request.query as any, user.centreId, isAdmin);
  });
}
