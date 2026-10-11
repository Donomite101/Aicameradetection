import { z } from 'zod';

export const createTraineeSchema = z.object({
  body: z.object({
    centreId: z.string().optional(),
    registrationNo: z.string().min(2).optional(),
    fullName: z.string().min(2, 'Full name is required'),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().min(10).max(15).optional().or(z.literal('')),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
    dateOfBirth: z.string().optional().or(z.literal('')),
    aadhaarLast4: z.string().length(4).optional().or(z.literal('')),
    courseName: z.string().optional().or(z.literal('')),
    batchName: z.string().optional().or(z.literal('')),
    schemeCode: z.string().optional().or(z.literal('')),
    status: z.enum(['ACTIVE', 'COMPLETED', 'DROPOUT', 'SUSPENDED']).default('ACTIVE'),
    photoUrl: z.string().optional().or(z.literal('')),
  }),
});

export const updateTraineeSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    fullName: z.string().min(2).optional(),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().optional().or(z.literal('')),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
    dateOfBirth: z.string().optional().or(z.literal('')),
    aadhaarLast4: z.string().length(4).optional().or(z.literal('')),
    courseName: z.string().optional().or(z.literal('')),
    batchName: z.string().optional().or(z.literal('')),
    schemeCode: z.string().optional().or(z.literal('')),
    status: z.enum(['ACTIVE', 'COMPLETED', 'DROPOUT', 'SUSPENDED']).optional(),
    photoUrl: z.string().optional().or(z.literal('')),
  }),
});

export const listTraineesSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(50),
    centreId: z.string().optional().or(z.literal('')),
    search: z.string().optional().or(z.literal('')),
    batchName: z.string().optional().or(z.literal('')),
    courseName: z.string().optional().or(z.literal('')),
    status: z.enum(['ACTIVE', 'COMPLETED', 'DROPOUT', 'SUSPENDED']).optional().or(z.literal('')),
  }),
});

export const markAttendanceSchema = z.object({
  body: z.object({
    date: z.string().optional(), // YYYY-MM-DD
    session: z.string().min(1).max(100).default('FULL_DAY'), // FULL_DAY or a class slot name
    records: z.array(
      z.object({
        traineeId: z.string(),
        status: z.enum(['PRESENT', 'ABSENT', 'LEAVE']),
        remarks: z.string().optional(),
      })
    ),
  }),
});

export const listTraineeAttendanceSchema = z.object({
  query: z.object({
    date: z.string().optional(),
    session: z.string().optional(),
    centreId: z.string().optional().or(z.literal('')),
    traineeId: z.string().optional().or(z.literal('')),
  }),
});

export type CreateTraineeInput = z.infer<typeof createTraineeSchema>['body'];
export type UpdateTraineeInput = z.infer<typeof updateTraineeSchema>['body'];
export type ListTraineesQuery = z.infer<typeof listTraineesSchema>['query'];
export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>['body'];
export type ListTraineeAttendanceQuery = z.infer<typeof listTraineeAttendanceSchema>['query'];
