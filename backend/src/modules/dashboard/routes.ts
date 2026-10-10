import { FastifyInstance } from 'fastify';
import { dashboardSummarySchema, centresMapSchema, attendanceTrendsSchema, infrastructureComplianceSchema } from './schemas';
import { getDashboardSummary, getCentresForMap, getAttendanceTrends, getInfrastructureCompliance } from './service';

export async function dashboardRoutes(app: FastifyInstance) {
  // Dashboard summary
  app.get('/summary', { schema: dashboardSummarySchema, preHandler: [app.authenticate] }, async (request) => {
    return getDashboardSummary(request.query);
  });

  // Centres for map view
  app.get('/centres/map', { schema: centresMapSchema, preHandler: [app.authenticate] }, async (request) => {
    return getCentresForMap(request.query);
  });

  // Attendance trends
  app.get('/attendance/trends', { schema: attendanceTrendsSchema, preHandler: [app.authenticate] }, async (request) => {
    return getAttendanceTrends(request.query);
  });

  // Infrastructure compliance
  app.get('/infrastructure/compliance', { schema: infrastructureComplianceSchema, preHandler: [app.authenticate] }, async (request) => {
    return getInfrastructureCompliance(request.query);
  });
}