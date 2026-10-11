import fastify, { FastifyInstance } from 'fastify';
import { fastifyCors } from '@fastify/cors';
import { fastifyHelmet } from '@fastify/helmet';
import { fastifyRateLimit } from '@fastify/rate-limit';
import { fastifySwagger } from '@fastify/swagger';
import { fastifySwaggerUi } from '@fastify/swagger-ui';
import { fastifyMultipart } from '@fastify/multipart';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { config } from '@/config';
import { prisma } from '@/shared/database/prisma';
import { connectRedis, disconnectRedis } from '@/shared/queue/redis';
import { closeQueues } from '@/shared/queue/queues';
import { ensureBuckets } from '@/shared/storage/minio';
import { initializeWebSocket } from '@/shared/websocket/socket';
import { authPlugin } from '@/modules/auth/plugin';
import { authRoutes } from '@/modules/auth/routes';
import { centreRoutes } from '@/modules/centres/routes';
import { attendanceRoutes } from '@/modules/attendance/routes';
import { infrastructureRoutes } from '@/modules/infrastructure/routes';
import { alertRoutes } from '@/modules/alerts/routes';
import { dashboardRoutes } from '@/modules/dashboard/routes';
import { schemeRoutes } from '@/modules/schemes/routes';
import { officerRoutes } from '@/modules/officers/routes';
import { traineeRoutes } from '@/modules/trainees/routes';
import { detectionRoutes } from '@/modules/detection/routes';
import { aiRoutes } from '@/modules/ai/routes';
import { startSessionFinalizer } from '@/modules/attendance/finalizer';

export async function buildApp(): Promise<FastifyInstance> {
  const app = fastify({
    logger: {
      level: config.NODE_ENV === 'development' ? 'debug' : 'info',
      transport: config.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
    },
    ajv: {
      customOptions: {
        coerceTypes: 'array',
        removeAdditional: 'all',
      },
    },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Global error handler. It must be set BEFORE the routes are registered: each plugin takes a copy of the
  // handler when it is loaded, and `await app.register(...)` loads it immediately.
  app.setErrorHandler((error: any, request, reply) => {
    request.log.error(error); // the full detail stays in the server log

    let statusCode = error.statusCode || 500;
    let message: string = error.message || 'An unexpected error occurred';
    let label: string | undefined;
    // Database errors: say what went wrong in plain words, never the query or file paths
    if (error.code === 'P2002') {
      statusCode = 409;
      label = 'Conflict';
      message = 'A record with the same unique value already exists';
    } else if (error.code === 'P2025') {
      statusCode = 404;
      label = 'NotFound';
      message = 'Record not found';
    } else if (error.code === 'P2003') {
      statusCode = 400;
      label = 'BadRequest';
      message = 'A related record does not exist';
    } else if (statusCode >= 500) {
      message = 'An unexpected error occurred';
    }

    reply.status(statusCode).send({
      error: statusCode >= 500 ? 'InternalServerError' : label || error.name || 'Error',
      message,
      statusCode,
    });
  });

  // Security
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: false, // Disable for development
  });

  // CORS
  await app.register(fastifyCors, {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning', 'x-requested-with', 'Accept'],
  });

  // Rate limiting
  await app.register(fastifyRateLimit, {
    max: 1000,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.ip,
  });

  // Multipart for file uploads
  await app.register(fastifyMultipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
    },
  });

  // Swagger/OpenAPI
  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'SIH26245 Training Centre Monitor API',
        description: 'AI-based real-time monitoring of training centres for attendance and infrastructure compliance',
        version: '1.0.0',
      },
      servers: [
        { url: `http://localhost:${config.PORT}${config.API_PREFIX}`, description: 'Development server' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' };
  });

  // Authentication Plugin (decorators & helpers)
  await app.register(authPlugin);

  // API routes
  await app.register(authRoutes, { prefix: `${config.API_PREFIX}/auth` });
  await app.register(centreRoutes, { prefix: `${config.API_PREFIX}/centres` });
  await app.register(attendanceRoutes, { prefix: `${config.API_PREFIX}/attendance` });
  await app.register(infrastructureRoutes, { prefix: `${config.API_PREFIX}/infrastructure` });
  await app.register(alertRoutes, { prefix: `${config.API_PREFIX}/alerts` });
  await app.register(dashboardRoutes, { prefix: `${config.API_PREFIX}/dashboard` });
  await app.register(schemeRoutes, { prefix: `${config.API_PREFIX}/schemes` });
  await app.register(officerRoutes, { prefix: `${config.API_PREFIX}/officers` });
  await app.register(traineeRoutes, { prefix: `${config.API_PREFIX}/trainees` });
  await app.register(detectionRoutes, { prefix: `${config.API_PREFIX}/detection` });
  await app.register(aiRoutes, { prefix: `${config.API_PREFIX}/ai` });

  // Initialize WebSocket after routes
  await app.ready();
  initializeWebSocket(app);

  // Graceful shutdown
  const shutdown = async () => {
    app.log.info('Shutting down...');
    await closeQueues();
    await disconnectRedis();
    await prisma.$disconnect();
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return app;
}

export async function start(): Promise<void> {
  const app = await buildApp();

  try {
    await connectRedis();
    await ensureBuckets();
    
    // Use Fastify's built-in listen
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
    startSessionFinalizer(app.log);

    console.log(`🚀 Server running on http://localhost:${config.PORT}`);
    console.log(`📚 API Docs: http://localhost:${config.PORT}/docs`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});