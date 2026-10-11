import { FastifyInstance } from 'fastify';
import { Readable } from 'stream';
import { config } from '@/config';
import { createStreamTicket, resolveStreamTicketUser } from '@/modules/auth/service';

/**
 * The AI service only listens on the backend computer. The web app (which may be open on another laptop) reaches it
 * through these routes, so it needs a login and the AI service never has to be exposed to the network.
 */
const AI = config.AI_SERVICE_URL.replace(/\/+$/, '');
const unreachable = { error: 'The AI service is not running on the backend computer. Start ai-service/detector.py there.' };

export async function aiRoutes(app: FastifyInstance) {
  // Starting / stopping the camera and switching its source: any signed-in staff, not read-only viewers
  const canControl = app.requireRole('ADMIN', 'MONITORING_OFFICER', 'CENTRE_MANAGER');

  async function forwardJson(reply: any, path: string, init: RequestInit = {}, timeoutMs = 6000) {
    try {
      const res = await fetch(AI + path, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      return reply.status(res.status).type('application/json').send(await res.text());
    } catch {
      return reply.status(503).send(unreachable);
    }
  }

  // An <img> tag cannot send a login header, so the image routes take a short-lived ticket in the address instead
  const ticketAuth = async (request: any, reply: any) => {
    const ticket = (request.query as any)?.ticket;
    const user = ticket ? await resolveStreamTicketUser(String(ticket)) : null;
    if (!user) return reply.status(401).send({ error: 'Invalid or expired stream ticket' });
    if (user.role !== 'ADMIN' && !user.centreId) return reply.status(403).send({ error: 'Your account is not assigned to a training centre' });
    request.user = user;
  };

  app.get('/status', { preHandler: [app.authenticate] }, (_req, reply) => forwardJson(reply, '/status'));

  app.get('/history', { preHandler: [app.authenticate] }, (request, reply) => {
    const limit = Math.min(100, Math.max(1, parseInt(String((request.query as any)?.limit ?? 30), 10) || 30));
    return forwardJson(reply, `/history?limit=${limit}`);
  });

  app.post('/mode', { preHandler: [app.authenticate, canControl] }, (request, reply) =>
    forwardJson(reply, '/mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: (request.body as any)?.mode }),
    })
  );

  app.post('/start', { preHandler: [app.authenticate, canControl] }, (_req, reply) => forwardJson(reply, '/start', { method: 'POST' }, 20_000));
  app.post('/stop', { preHandler: [app.authenticate, canControl] }, (_req, reply) => forwardJson(reply, '/stop', { method: 'POST' }, 20_000));

  app.get('/ticket', { preHandler: [app.authenticate] }, async (request) => ({
    ticket: await createStreamTicket(request.user.userId),
    expiresInSeconds: 300,
  }));

  // Latest annotated photo (phone mode preview)
  app.get('/snapshot', { preHandler: [ticketAuth] }, async (_request, reply) => {
    try {
      const res = await fetch(AI + '/snapshot', { signal: AbortSignal.timeout(6000) });
      if (!res.ok) return reply.status(res.status).send({ error: 'No frame available yet' });
      return reply
        .header('Cross-Origin-Resource-Policy', 'cross-origin') // the page that shows it is on another origin
        .header('Cache-Control', 'no-store')
        .type(res.headers.get('content-type') ?? 'image/jpeg')
        .send(Buffer.from(await res.arrayBuffer()));
    } catch {
      return reply.status(503).send(unreachable);
    }
  });

  // Live annotated video (laptop webcam): passed straight through
  app.get('/video_feed', { preHandler: [ticketAuth] }, async (request, reply) => {
    const stop = new AbortController();
    request.raw.on('close', () => stop.abort()); // the viewer closed the page: stop reading from the AI service

    let upstream: Response;
    try {
      upstream = await fetch(AI + '/video_feed', { signal: stop.signal });
    } catch {
      return reply.status(503).send(unreachable);
    }
    if (!upstream.ok || !upstream.body) return reply.status(502).send({ error: 'No video from the AI service' });

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': upstream.headers.get('content-type') ?? 'multipart/x-mixed-replace; boundary=frame',
      'Cache-Control': 'no-store',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    const body = Readable.fromWeb(upstream.body as any);
    body.on('error', () => reply.raw.end());
    body.pipe(reply.raw);
  });
}
