import { z } from 'zod';

export const dashboardSummarySchema = z.object({
  query: z.object({
    days: z.coerce.number().int().positive().default(30),
    centreId: z.string().optional(),
  }),
});

export const centresMapSchema = z.object({
  query: z.object({
    status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
    bounds: z.string().optional(), // minLng,minLat,maxLng,maxLat
    centreId: z.string().optional(),
  }),
});

export const attendanceTrendsSchema = z.object({
  query: z.object({
    centreId: z.string().optional(),
    days: z.coerce.number().int().positive().default(30),
    session: z.string().optional(),
  }),
});

export const infrastructureComplianceSchema = z.object({
  query: z.object({
    centreId: z.string().optional(),
    days: z.coerce.number().int().positive().default(30),
  }),
});

export type DashboardSummaryQuery = z.infer<typeof dashboardSummarySchema>['query'];
export type CentresMapQuery = z.infer<typeof centresMapSchema>['query'];
export type AttendanceTrendsQuery = z.infer<typeof attendanceTrendsSchema>['query'];
export type InfrastructureComplianceQuery = z.infer<typeof infrastructureComplianceSchema>['query'];