import { z } from 'zod';

export const createSchemeSchema = z.object({
  body: z.object({
    code: z.string().min(2),
    name: z.string().min(2),
    description: z.string().optional().or(z.literal('')),
    ministry: z.string().optional().or(z.literal('')),
    fundingType: z.string().optional().or(z.literal('')),
    targetBeneficiaries: z.number().int().positive().optional(),
    isActive: z.boolean().default(true),
  }),
});

export const updateSchemeSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    code: z.string().min(2).optional(),
    name: z.string().min(2).optional(),
    description: z.string().optional().or(z.literal('')),
    ministry: z.string().optional().or(z.literal('')),
    fundingType: z.string().optional().or(z.literal('')),
    targetBeneficiaries: z.number().int().positive().optional(),
    isActive: z.boolean().optional(),
  }),
});

export const listSchemesSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(50),
    search: z.string().optional().or(z.literal('')),
    isActive: z.coerce.boolean().optional(),
  }),
});

export type CreateSchemeInput = z.infer<typeof createSchemeSchema>['body'];
export type UpdateSchemeInput = z.infer<typeof updateSchemeSchema>['body'];
export type ListSchemesQuery = z.infer<typeof listSchemesSchema>['query'];
