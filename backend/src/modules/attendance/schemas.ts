import { z } from 'zod';

export const submitAttendanceSchema = z.object({
  body: z.object({
    centreId: z.string(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
    session: z.enum(['MORNING', 'AFTERNOON', 'EVENING', 'FULL_DAY']),
    recordedCount: z.number().int().nonnegative(),
  }),
});

export const getAttendanceSchema = z.object({
  params: z.object({ id: z.string() }),
});

export const listAttendanceSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    centreId: z.string().optional().or(z.literal('')),
    search: z.string().optional().or(z.literal('')),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
    session: z.string().optional(),
    classSlotId: z.string().optional().or(z.literal('')),
    status: z.enum(['PENDING', 'VERIFIED', 'DISCREPANT', 'UNDER_REVIEW']).optional().or(z.literal('')),
    sortBy: z.enum(['date', 'createdAt', 'recordedCount', 'detectedCount']).default('date'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});

export const updateAttendanceSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    recordedCount: z.number().int().nonnegative().optional(),
    status: z.enum(['PENDING', 'VERIFIED', 'DISCREPANT', 'UNDER_REVIEW']).optional(),
  }),
});

export const attendanceSummarySchema = z.object({
  params: z.object({ id: z.string() }),
  query: z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
});

export type SubmitAttendanceInput = z.infer<typeof submitAttendanceSchema>['body'];
export type ListAttendanceQuery = z.infer<typeof listAttendanceSchema>['query'];
export type UpdateAttendanceInput = z.infer<typeof updateAttendanceSchema>['body'];
export type AttendanceSummaryQuery = z.infer<typeof attendanceSummarySchema>['query'];