import { z } from 'zod';

export const listAlertsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    centreId: z.string().optional().or(z.literal('')),
    search: z.string().optional().or(z.literal('')),
    type: z.enum(['ATTENDANCE_DISCREPANCY', 'EQUIPMENT_MISSING', 'EQUIPMENT_NON_FUNCTIONAL', 'CAMERA_OFFLINE', 'LOW_CONFIDENCE']).optional().or(z.literal('')),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional().or(z.literal('')),
    status: z.enum(['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'FALSE_POSITIVE', 'DISMISSED']).optional().or(z.literal('')),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
    sortBy: z.enum(['createdAt', 'severity', 'type']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});

export const getAlertSchema = z.object({
  params: z.object({ id: z.string() }),
});

export const updateAlertSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    status: z.enum(['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'FALSE_POSITIVE', 'DISMISSED']).optional(),
    acknowledgedBy: z.string().optional(),
    resolvedBy: z.string().optional(),
  }),
});

export type ListAlertsQuery = z.infer<typeof listAlertsSchema>['query'];
export type UpdateAlertInput = z.infer<typeof updateAlertSchema>['body'];