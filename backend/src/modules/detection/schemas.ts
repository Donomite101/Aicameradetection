import { z } from 'zod';

export const detectionReportSchema = z.object({
  body: z.object({
    centreId: z.string().min(1, 'centreId is required'),
    cameraId: z.string().default('webcam-001'),
    deviceName: z.string().max(100).optional(), // friendly name, e.g. the phone model
    detectedCount: z.number().int().nonnegative(),
    confidence: z.number().min(0).max(1).default(0),
    items: z.array(z.object({
      name: z.string(),
      count: z.number().int().nonnegative(),
      confidence: z.number().min(0).max(1).default(0),
      category: z.string().optional(),
      personNearby: z.boolean().optional(),
    })).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // YYYY-MM-DD
    session: z.enum(['MORNING', 'AFTERNOON', 'EVENING', 'FULL_DAY']).optional(), // deprecated: the server derives the slot
    classSlotId: z.string().optional(),
    timestamp: z.number().optional(),
  }),
});

export type DetectionReportInput = z.infer<typeof detectionReportSchema>['body'];
