import { FastifyInstance } from 'fastify';
import { detectionReportSchema } from './schemas';
import { handleDetectionReport, handleFrameUpload } from './service';
import { DETECTABLE_CLASSES } from '@/modules/centres/schedule';

export async function detectionRoutes(app: FastifyInstance) {
  // Raw image bodies for POST /frame (the phone app sends the JPEG bytes directly)
  app.addContentTypeParser(['image/jpeg', 'image/png', 'application/octet-stream'], { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });

  /**
   * POST /api/v1/detection/report
   * Called by the Python AI service with the current person count.
   * Needs the shared X-Device-Key (DEVICE_API_KEY), or a user token of that centre / an admin.
   */
  app.post(
    '/report',
    { schema: detectionReportSchema, preHandler: [app.authenticateDevice] },
    async (request, reply) => {
      try {
        const body = request.body as any;
        const user = request.user as any;
        if (user.role !== 'DEVICE' && user.role !== 'ADMIN' && user.centreId !== body.centreId) {
          return reply.status(403).send({ error: 'You can only report for your own training centre' });
        }
        const result = await handleDetectionReport(body);
        return reply.status(200).send(result);
      } catch (error: any) {
        request.log.error({ error }, 'Detection report failed');
        return reply.status(500).send({ error: 'Detection processing failed' });
      }
    }
  );

  /**
   * POST /api/v1/detection/frame?centreId=&cameraId=
   * Body: raw JPEG bytes. Auth: Bearer token (site officer, or admin with ?centreId=).
   * The AI service counts people and tools; the result is recorded against the class slot that is live now.
   */
  app.post('/frame', { preHandler: [app.authenticate], bodyLimit: 10 * 1024 * 1024 }, async (request, reply) => {
    const user = request.user as any;
    const query = request.query as { centreId?: string; cameraId?: string; deviceName?: string; source?: string };
    const centreId = user.role === 'ADMIN' ? query.centreId || user.centreId : user.centreId;
    if (!centreId) {
      return reply.status(400).send({ error: 'No centre: log in as a centre officer, or pass ?centreId= as admin' });
    }
    const image = request.body as unknown;
    if (!Buffer.isBuffer(image) || image.length === 0) {
      return reply.status(400).send({ error: 'Send the image as the raw request body with Content-Type: image/jpeg' });
    }
    const cameraId = (query.cameraId || 'phone').slice(0, 100);
    // source=browser: the web page's own webcam, whose pictures are already upright
    return handleFrameUpload(centreId, cameraId, image, query.deviceName, { autorotate: query.source !== 'browser' });
  });

  /**
   * GET /api/v1/detection/classes
   * Object classes the detector can recognise (options for a centre's tool list).
   */
  app.get('/classes', { preHandler: [app.authenticate] }, async () => DETECTABLE_CLASSES);

  /**
   * GET /api/v1/detection/status
   * Quick status check — are we receiving live detection data?
   */
  app.get('/status', { preHandler: [app.authenticate] }, async () => {
    return {
      endpoint: 'POST /api/v1/detection/report',
      description: 'Send detection counts from AI service here',
    };
  });
}
