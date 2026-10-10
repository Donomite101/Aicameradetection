import { Client } from 'minio';
import { config } from '@/config';

const globalForMinio = globalThis as unknown as {
  minio: Client | undefined;
};

let minioInstance: Client | null = null;

function createMockMinio() {
  const store = new Map<string, Buffer>();
  return {
    store,
    bucketExists: async () => true,
    makeBucket: async () => {},
    putObject: async (bucket: string, objectName: string, data: Buffer | NodeJS.ReadableStream, metaData?: any) => {
      const buffer = data instanceof Buffer ? data : Buffer.from('');
      store.set(`${bucket}/${objectName}`, buffer);
    },
    getObject: async (bucket: string, objectName: string) => {
      const buffer = store.get(`${bucket}/${objectName}`);
      if (!buffer) throw new Error('Not found');
      const stream = require('stream');
      const readable = new stream.Readable();
      readable._read = () => {};
      readable.push(buffer);
      readable.push(null);
      return readable;
    },
    removeObject: async (bucket: string, objectName: string) => {
      store.delete(`${bucket}/${objectName}`);
    },
    presignedGetObject: async (bucket: string, objectName: string) => `mock://${bucket}/${objectName}`,
    listObjects: async (bucket: string, prefix: string) => {
      const results: string[] = [];
      for (const key of store.keys()) {
        if (key.startsWith(`${bucket}/${prefix}`)) {
          results.push(key.replace(`${bucket}/`, ''));
        }
      }
      return results;
    },
  } as any;
}

export const minio = config.MINIO_ENDPOINT && config.MINIO_ACCESS_KEY && config.MINIO_SECRET_KEY
  ? (globalForMinio.minio ??
      (globalForMinio.minio = new Client({
        endPoint: config.MINIO_ENDPOINT.split(':')[0],
        port: parseInt(config.MINIO_ENDPOINT.split(':')[1] || '9000'),
        useSSL: config.MINIO_USE_SSL,
        accessKey: config.MINIO_ACCESS_KEY,
        secretKey: config.MINIO_SECRET_KEY,
      })))
  : createMockMinio();

if (config.MINIO_ENDPOINT && process.env.NODE_ENV !== 'production') {
  globalForMinio.minio = minio as Client;
}

export const BUCKETS = {
  THUMBNAILS: config.MINIO_BUCKET_THUMBNAILS || 'thumbnails',
  CLIPS: config.MINIO_BUCKET_CLIPS || 'clips',
  MODELS: 'sih-models',
} as const;

export async function ensureBuckets(): Promise<void> {
  if (!config.MINIO_ENDPOINT) {
    console.log('⚠️ MinIO not configured, using mock storage');
    return;
  }
  try {
    for (const bucket of Object.values(BUCKETS)) {
      const exists = await minio.bucketExists(bucket);
      if (!exists) {
        await minio.makeBucket(bucket, 'us-east-1');
        console.log(`✅ Created bucket: ${bucket}`);
      }
    }
  } catch (err) {
    console.warn('⚠️ Could not connect to MinIO storage, using fallback:', (err as Error).message);
  }
}

export async function uploadFile(
  bucket: string,
  objectName: string,
  stream: NodeJS.ReadableStream,
  metaData?: Record<string, string>
): Promise<string> {
  await minio.putObject(bucket, objectName, stream, metaData);
  return getPublicUrl(bucket, objectName);
}

export async function uploadBuffer(
  bucket: string,
  objectName: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  await minio.putObject(bucket, objectName, buffer, buffer.length, { 'Content-Type': contentType });
  return getPublicUrl(bucket, objectName);
}

export function getPublicUrl(bucket: string, objectName: string): string {
  if (!config.MINIO_ENDPOINT) return `mock://${bucket}/${objectName}`;
  const protocol = config.MINIO_USE_SSL ? 'https' : 'http';
  const host = config.MINIO_ENDPOINT;
  return `${protocol}://${host}/${bucket}/${objectName}`;
}

export async function deleteFile(bucket: string, objectName: string): Promise<void> {
  await minio.removeObject(bucket, objectName);
}

export async function getPresignedUrl(
  bucket: string,
  objectName: string,
  expiry: number = 3600
): Promise<string> {
  return minio.presignedGetObject(bucket, objectName, expiry);
}

export async function listFiles(bucket: string, prefix: string = ''): Promise<string[]> {
  const objects: string[] = [];
  for await (const obj of minio.listObjects(bucket, prefix, true)) {
    if (obj.name) objects.push(obj.name);
  }
  return objects;
}