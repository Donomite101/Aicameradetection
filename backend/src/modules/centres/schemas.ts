import { z } from 'zod';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm');

export const toolInputSchema = z.object({
  id: z.string().optional(),
  detectClass: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  quantity: z.number().int().positive(),
});

export const slotInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(100),
  startTime: hhmm,
  endTime: hhmm,
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).default([0, 1, 2, 3, 4, 5, 6]),
  expectedTrainees: z.number().int().nonnegative().optional(),
});

export const createCentreSchema = z.object({
  body: z.object({
    code: z.string().min(3).max(20),
    name: z.string().min(2).max(200),
    address: z.string().min(5).max(500),
    city: z.string().min(2).max(100),
    state: z.string().min(2).max(100),
    pincode: z.string().regex(/^\d{6}$/),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    sanctionedCapacity: z.number().int().positive(),
    contactPerson: z.string().optional(),
    contactPhone: z.string().optional(),
    contactEmail: z.string().email().optional(),
    area: z.string().max(200).optional(),
    totalTrainees: z.number().int().nonnegative().default(0),
    schemeId: z.string().min(1, 'Scheme is required'),
    tools: z.array(toolInputSchema).default([]),
    slots: z.array(slotInputSchema).default([]),
    status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional().default('ACTIVE'),
  }),
});

export const updateCentreSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    name: z.string().min(2).max(200).optional(),
    address: z.string().min(5).max(500).optional(),
    city: z.string().min(2).max(100).optional(),
    state: z.string().min(2).max(100).optional(),
    pincode: z.string().regex(/^\d{6}$/).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    sanctionedCapacity: z.number().int().positive().optional(),
    contactPerson: z.string().optional(),
    contactPhone: z.string().optional(),
    contactEmail: z.string().email().optional(),
    area: z.string().max(200).optional(),
    totalTrainees: z.number().int().nonnegative().optional(),
    schemeId: z.string().min(1).optional(),
    tools: z.array(toolInputSchema).optional(),
    slots: z.array(slotInputSchema).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
  }),
});

export const getCentreSchema = z.object({
  params: z.object({ id: z.string() }),
});

export const listCentresSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
    search: z.string().optional(),
    state: z.string().optional(),
    schemeId: z.string().optional(),
    sortBy: z.enum(['name', 'code', 'createdAt', 'status']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});

export const addCameraSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    name: z.string().min(1).max(100),
    type: z.enum(['WEBCAM', 'PHONE', 'IP']).default('IP'),
    rtspUrl: z.string().url().optional(), // IP cameras only
    roi: z.array(z.array(z.number())).optional(), // [[x1,y1], [x2,y2], ...]
  }),
});

export const updateCameraSchema = z.object({
  params: z.object({ id: z.string(), cameraId: z.string() }),
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    rtspUrl: z.string().url().optional(),
    roi: z.array(z.array(z.number())).optional(),
    isActive: z.boolean().optional(),
  }),
});

export const addInventoryItemSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    name: z.string().min(1).max(200),
    category: z.enum(['MACHINERY', 'FURNITURE', 'SAFETY', 'TOOLS', 'COMPUTERS', 'OTHER']),
    quantity: z.number().int().positive(),
    unit: z.string().default('PCS'),
    specs: z.record(z.unknown()).optional(),
    location: z.string().optional(),
    detectClass: z.string().optional(),
  }),
});

export const updateInventoryItemSchema = z.object({
  params: z.object({ id: z.string(), itemId: z.string() }),
  body: z.object({
    name: z.string().min(1).max(200).optional(),
    category: z.enum(['MACHINERY', 'FURNITURE', 'SAFETY', 'TOOLS', 'COMPUTERS', 'OTHER']).optional(),
    quantity: z.number().int().positive().optional(),
    unit: z.string().optional(),
    specs: z.record(z.unknown()).optional(),
    location: z.string().optional(),
    isActive: z.boolean().optional(),
  }),
});

export type CreateCentreInput = z.infer<typeof createCentreSchema>['body'];
export type UpdateCentreInput = z.infer<typeof updateCentreSchema>['body'];
export type ListCentresQuery = z.infer<typeof listCentresSchema>['query'];
export type AddCameraInput = z.infer<typeof addCameraSchema>['body'];
export type UpdateCameraInput = z.infer<typeof updateCameraSchema>['body'];
export type AddInventoryItemInput = z.infer<typeof addInventoryItemSchema>['body'];
export type UpdateInventoryItemInput = z.infer<typeof updateInventoryItemSchema>['body'];