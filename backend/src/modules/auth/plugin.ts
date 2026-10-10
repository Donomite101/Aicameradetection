import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { verifyAccessToken } from './service';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      userId: string;
      email: string;
      role: string;
      centreId?: string;
    };
  }
  interface FastifyInstance {
    authenticate: (request: any, reply: any) => Promise<void>;
    requireRole: (...roles: string[]) => (request: any, reply: any) => Promise<void>;
    requireCentreAccess: (request: any, reply: any) => Promise<void>;
  }
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

    const token = authHeader.substring(7);
    const payload = await verifyAccessToken(token);

    if (!payload) {
      return reply.status(401).send({ error: 'Invalid or expired token' });
    }

    request.user = {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
      centreId: payload.centreId,
    };
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
      const centreId = request.params.centreId || request.body.centreId || request.query.centreId;
      if (centreId && request.user.centreId !== centreId) {
        return reply.status(403).send({ error: 'Access denied to this centre' });
      }
    }
  });
}

export const authPlugin = fp(authPluginFn);