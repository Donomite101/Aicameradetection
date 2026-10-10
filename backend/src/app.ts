import fastify from 'fastify';
import { fastifyCors } from '@fastify/cors';
import { fastifyHelmet } from '@fastify/helmet';
import { fastifyRateLimit } from '@fastify/rate-limit';
import { fastifySwagger } from '@fastify/swagger';
import { fastifySwaggerUi } from '@fastify/swagger-ui';
import { fastifyJwt } from '@fastify/jwt';
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

export async function buildApp(): Promise<fastify.FastifyInstance> {
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

  // JWT
  await app.register(fastifyJwt, {
    secret: config.JWT_SECRET,
    sign: { expiresIn: config.JWT_EXPIRES_IN },
    verify: { algorithms: ['HS256'] },
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

  // Global error handler
  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      error: error.name || 'InternalServerError',
      message: error.message || 'An unexpected error occurred',
      statusCode,
    });
  });

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