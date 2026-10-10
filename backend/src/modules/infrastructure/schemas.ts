import { z } from 'zod';

export const listInfrastructureChecksSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    centreId: z.string().optional().or(z.literal('')),
    itemId: z.string().optional().or(z.literal('')),
    search: z.string().optional().or(z.literal('')),
    detected: z.coerce.boolean().optional(),
    operability: z.enum(['FUNCTIONAL', 'NON_FUNCTIONAL', 'UNKNOWN', 'MAINTENANCE']).optional().or(z.literal('')),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
    sortBy: z.enum(['timestamp', 'confidence']).default('timestamp'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});

export const getInfrastructureCheckSchema = z.object({
  params: z.object({ id: z.string() }),
});

export const getCentreInfrastructureStatusSchema = z.object({
  params: z.object({ id: z.string() }),
});

export type ListInfrastructureChecksQuery = z.infer<typeof listInfrastructureChecksSchema>['query'];