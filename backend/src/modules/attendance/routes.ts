import { FastifyInstance } from 'fastify';
import {
  submitAttendanceSchema,
  getAttendanceSchema,
  listAttendanceSchema,
  updateAttendanceSchema,
  attendanceSummarySchema,
} from './schemas';
import {
  submitAttendance,
  getAttendanceById,
  listAttendance,
  updateAttendance,
  getAttendanceSummary,
  getRecentDiscrepancies,
} from './service';

export async function attendanceRoutes(app: FastifyInstance) {
  // Submit attendance record
  app.post('/', { schema: submitAttendanceSchema, preHandler: [app.authenticate] }, async (request) => {
    const user = request.user as any;
    const body = { ...(request.body as any) };
    if (user.role !== 'ADMIN' && user.centreId) {
      body.centreId = user.centreId;
    }
    return submitAttendance(body, user.id || user.userId);
  });

  // List attendance records
  app.get('/', { schema: listAttendanceSchema, preHandler: [app.authenticate] }, async (request) => {
    const user = request.user as any;
    const query = { ...(request.query as any) };
    if (user.role !== 'ADMIN' && user.centreId) {
      query.centreId = user.centreId;
    }
    return listAttendance(query);
  });

  // Get attendance summary for a centre
  app.get('/centre/:id/summary', { schema: attendanceSummarySchema, preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user as any;
    if (user.role !== 'ADMIN' && user.centreId && user.centreId !== id) {
      return reply.status(403).send({ error: 'Access denied: You can only view attendance for your assigned training centre' });
    }
    return getAttendanceSummary(id, request.query as any);
  });

  // Get recent discrepancies
  app.get('/centre/:id/discrepancies', { schema: attendanceSummarySchema, preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user as any;
    if (user.role !== 'ADMIN' && user.centreId && user.centreId !== id) {
      return reply.status(403).send({ error: 'Access denied: You can only view attendance for your assigned training centre' });
    }
    return getRecentDiscrepancies(id);
  });

  // Get single attendance record
  app.get('/:id', { schema: getAttendanceSchema, preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = await getAttendanceById(id);
    if (!record) {
      return reply.status(404).send({ error: 'Attendance record not found' });
    }
    const user = request.user as any;
    if (user.role !== 'ADMIN' && user.centreId && record.centreId !== user.centreId) {
      return reply.status(403).send({ error: 'Access denied: Attendance record belongs to another training centre' });
    }
    return record;
  });

  // Update attendance record
  app.patch('/:id', { schema: updateAttendanceSchema, preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = await getAttendanceById(id);
    if (!record) {
      return reply.status(404).send({ error: 'Attendance record not found' });
    }
    const user = request.user as any;
    if (user.role !== 'ADMIN' && user.centreId && record.centreId !== user.centreId) {
      return reply.status(403).send({ error: 'Access denied: Attendance record belongs to another training centre' });
    }
    return updateAttendance(id, request.body as any, user.id || user.userId);
  });
}