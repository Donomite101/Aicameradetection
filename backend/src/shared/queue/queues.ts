// Pure in-memory mock for queues in local development without Redis

function createMockQueue(name: string) {
  return {
    name,
    add: async (_jobName: string, _data: any) => ({ id: 'mock-job-id' }),
    close: async () => {},
    on: () => {},
  } as any;
}

function createMockQueueEvents(name: string) {
  return {
    name,
    close: async () => {},
    on: () => {},
  } as any;
}

export const queues = {
  attendanceProcessing: createMockQueue('attendance-processing'),
  infrastructureCheck: createMockQueue('infrastructure-check'),
  alertGeneration: createMockQueue('alert-generation'),
  thumbnailGeneration: createMockQueue('thumbnail-generation'),
  notification: createMockQueue('notification'),
  dataSync: createMockQueue('data-sync'),
};

export const queueEvents = {
  attendanceProcessing: createMockQueueEvents('attendance-processing'),
  infrastructureCheck: createMockQueueEvents('infrastructure-check'),
  alertGeneration: createMockQueueEvents('alert-generation'),
  thumbnailGeneration: createMockQueueEvents('thumbnail-generation'),
  notification: createMockQueueEvents('notification'),
  dataSync: createMockQueueEvents('data-sync'),
};

export interface AttendanceProcessingJob {
  centreId: string;
  cameraId: string;
  frameData: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface InfrastructureCheckJob {
  centreId: string;
  cameraId: string;
  itemId: string;
  frameData: string;
  timestamp: number;
}

export interface AlertGenerationJob {
  centreId: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
}

export async function closeQueues(): Promise<void> {
  await Promise.all(Object.values(queues).map((q) => q.close()));
  await Promise.all(Object.values(queueEvents).map((qe) => qe.close()));
}