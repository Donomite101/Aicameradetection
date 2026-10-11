import { z } from 'zod';
import { existsSync } from 'fs';
import { resolve } from 'path';

// Automatically load environment file if available
for (const envPath of [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), 'backend', '.env'),
  resolve(__dirname, '../../../.env'),
  resolve(__dirname, '../../.env'),
]) {
  if (existsSync(envPath)) {
    try {
      if (typeof process.loadEnvFile === 'function') {
        process.loadEnvFile(envPath);
      }
      break;
    } catch {
      // Ignore if already loaded or parsing error
    }
  }
}

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  API_PREFIX: z.string().default('/api/v1'),

  DATABASE_URL: z.string().default('file:./dev.db'),

  REDIS_URL: z.string().url().optional(),

  MINIO_ENDPOINT: z.string().optional(),
  MINIO_ACCESS_KEY: z.string().optional(),
  MINIO_SECRET_KEY: z.string().optional(),
  MINIO_BUCKET_THUMBNAILS: z.string().optional(),
  MINIO_BUCKET_CLIPS: z.string().optional(),
  MINIO_USE_SSL: z.coerce.boolean().default(false),

  JWT_SECRET: z.string().min(32).default('dev-secret-change-in-production-min-32-chars'),
  // Shared secret the AI service sends as X-Device-Key (empty = device access switched off)
  DEVICE_API_KEY: z.string().default(''),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  AI_SERVICE_URL: z.string().default('http://127.0.0.1:8000'),
  YOLO_MODEL_PATH: z.string().default('./models/yolov8n.onnx'),
  PERSON_CONF_THRESHOLD: z.coerce.number().default(0.5),
  PERSON_IOU_THRESHOLD: z.coerce.number().default(0.45),
  EQUIPMENT_CONF_THRESHOLD: z.coerce.number().default(0.4),
  ATTENDANCE_DISCREPANCY_THRESHOLD: z.coerce.number().default(2),
  INFRASTRUCTURE_CHECK_INTERVAL: z.coerce.number().default(300000),

  ENABLE_FACE_BLUR: z.coerce.boolean().default(true),
  BLUR_KERNEL_SIZE: z.coerce.number().default(51),
  STORE_RAW_FRAMES: z.coerce.boolean().default(false),

  LOW_BANDWIDTH_MODE: z.coerce.boolean().default(false),
  METADATA_ONLY_UPLOAD: z.coerce.boolean().default(false),
  FRAME_SKIP_INTERVAL: z.coerce.number().default(2),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }

  cachedEnv = result.data;
  return cachedEnv;
}

export const config = getEnv();