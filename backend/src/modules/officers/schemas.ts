import { z } from 'zod';

export const createOfficerSchema = z.object({
  body: z.object({
    fullName: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
    role: z.enum(['MONITORING_OFFICER', 'CENTRE_MANAGER', 'VIEWER']).default('MONITORING_OFFICER'),
    centreId: z.string().min(1, 'Assigned centre is required'),
  }),
});

export const updateOfficerSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    fullName: z.string().min(2).optional(),
    email: z.string().email().optional(),
    password: z.string().min(6).optional().or(z.literal('')),
    role: z.enum(['MONITORING_OFFICER', 'CENTRE_MANAGER', 'VIEWER']).optional(),
    centreId: z.string().optional().or(z.literal('')),
    isActive: z.boolean().optional(),
  }),
});

export const listOfficersSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(50),
    centreId: z.string().optional().or(z.literal('')),
    search: z.string().optional().or(z.literal('')),
    role: z.enum(['MONITORING_OFFICER', 'CENTRE_MANAGER', 'VIEWER', 'ADMIN']).optional().or(z.literal('')),
  }),
});

export type CreateOfficerInput = z.infer<typeof createOfficerSchema>['body'];
export type UpdateOfficerInput = z.infer<typeof updateOfficerSchema>['body'];
export type ListOfficersQuery = z.infer<typeof listOfficersSchema>['query'];
