import { FastifyInstance } from 'fastify';
import { prisma } from '@/shared/database/prisma';
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

    // Every trainee is filed under their own centre. Officers can only mark their own centre's trainees;
    // an admin may mark trainees of several centres in one go. (The old x-centre-id header let anyone pick a centre.)
    const traineeIds: string[] = [...new Set<string>(body.records.map((r: any) => r.traineeId))];
    const trainees = await prisma.trainee.findMany({ where: { id: { in: traineeIds } }, select: { id: true, centreId: true } });
    if (trainees.length !== traineeIds.length) {
      return reply.status(404).send({ error: 'Some trainees were not found' });
    }
    if (user.role !== 'ADMIN' && trainees.some((t) => t.centreId !== user.centreId)) {
      return reply.status(403).send({ error: 'Some trainees do not belong to your training centre' });
    }

    const centreOf = new Map(trainees.map((t) => [t.id, t.centreId]));
    const groups = new Map<string, any[]>();
    for (const record of body.records) {
      const centreId = centreOf.get(record.traineeId)!;
      groups.set(centreId, [...(groups.get(centreId) ?? []), record]);
    }

    const results = [];
    for (const [centreId, records] of groups) {
      results.push(await markBatchAttendance({ ...body, records }, centreId, user.userId));
    }
    return {
      count: results.reduce((n, r) => n + r.count, 0),
      date: results[0].date,
      session: results[0].session,
      records: results.flatMap((r) => r.records),
    };
  });

  // Get trainee attendance records
  app.get('/attendance', { schema: listTraineeAttendanceSchema, preHandler: [app.authenticate] }, async (request) => {
    const user = request.user as any;
    const isAdmin = user.role === 'ADMIN';
    return listTraineeAttendance(request.query as any, user.centreId, isAdmin);
  });
}
