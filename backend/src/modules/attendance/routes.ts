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
    return submitAttendance(request.body, request.user!.userId);
  });

  // List attendance records
  app.get('/', { schema: listAttendanceSchema, preHandler: [app.authenticate] }, async (request) => {
    return listAttendance(request.query);
  });

  // Get attendance summary for a centre
  app.get('/centre/:id/summary', { schema: attendanceSummarySchema, preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    return getAttendanceSummary(id, request.query);
  });

  // Get recent discrepancies
  app.get('/centre/:id/discrepancies', { schema: attendanceSummarySchema, preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    return getRecentDiscrepancies(id);
  });

  // Get single attendance record
  app.get('/:id', { schema: getAttendanceSchema, preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = await getAttendanceById(id);
    if (!record) {
      return reply.status(404).send({ error: 'Attendance record not found' });
    }
    return record;
  });

  // Update attendance record
  app.patch('/:id', { schema: updateAttendanceSchema, preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    return updateAttendance(id, request.body, request.user!.userId);
  });
}