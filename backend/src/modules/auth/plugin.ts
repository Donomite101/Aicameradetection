import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { timingSafeEqual } from 'crypto';
import { config } from '@/config';
import { resolveSessionUser } from './service';

declare module 'fastify' {
  interface FastifyRequest {
    /** The signed-in user (or the AI device), set by authenticate / authenticateDevice. */
    user: any;
  }
  interface FastifyInstance {
    authenticate: (request: any, reply: any) => Promise<void>;
    /** A user token, OR the shared X-Device-Key sent by the AI service. Device access is for machine-to-machine routes only. */
    authenticateDevice: (request: any, reply: any) => Promise<void>;
    requireRole: (...roles: string[]) => (request: any, reply: any) => Promise<void>;
    requireCentreAccess: (request: any, reply: any) => Promise<void>;
  }
}

function sameKey(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

async function authPluginFn(app: FastifyInstance) {
  if (!app.hasRequestDecorator('user')) {
    app.decorateRequest('user', null);
  }

  // Decorate with authenticate helper used in preHandler
  app.decorate('authenticate', async (request: any, reply: any) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing or invalid authorization header' });
    }

    // Checked against the database (cached for a few seconds): a deactivated user or a changed role/centre
    // takes effect almost immediately, and refresh / password-reset tokens are not accepted as access tokens.
    const user = await resolveSessionUser(authHeader.substring(7));
    if (!user) {
      return reply.status(401).send({ error: 'Invalid or expired token' });
    }

    // Everyone except an admin works inside one training centre. A user with no centre must not see all of them.
    if (user.role !== 'ADMIN' && !user.centreId) {
      return reply.status(403).send({ error: 'Your account is not assigned to a training centre' });
    }

    request.user = user;
  });

  app.decorate('authenticateDevice', async (request: any, reply: any) => {
    const key = request.headers['x-device-key'];
    if (config.DEVICE_API_KEY && typeof key === 'string' && sameKey(key, config.DEVICE_API_KEY)) {
      request.user = { userId: 'device', email: 'device@local', role: 'DEVICE' };
      return;
    }
    return app.authenticate(request, reply);
  });

  // Role-based access decorators
  app.decorate('requireRole', (...roles: string[]) => {
    return async (request: any, reply: any) => {
      if (!request.user) {
        return reply.status(401).send({ error: 'Authentication required' });
      }
      if (!roles.includes(request.user.role)) {
        return reply.status(403).send({ error: 'Insufficient permissions' });
      }
    };
  });

  app.decorate('requireCentreAccess', async (request: any, reply: any) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Authentication required' });
    }
    if (request.user.role !== 'ADMIN' && request.user.role !== 'MONITORING_OFFICER') {
      const centreId = request.params.centreId || request.body?.centreId || request.query?.centreId;
      if (centreId && request.user.centreId !== centreId) {
        return reply.status(403).send({ error: 'Access denied to this centre' });
      }
    }
  });
}

export const authPlugin = fp(authPluginFn);
