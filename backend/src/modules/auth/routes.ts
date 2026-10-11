import { FastifyInstance } from 'fastify';
import { prisma } from '@/shared/database/prisma';
import { config } from '@/config';
import { updateProfileSchema, loginSchema, registerSchema, refreshTokenSchema, changePasswordSchema, forgotPasswordSchema, resetPasswordSchema } from './schemas';
import {
  authenticateUser,
  registerUser,
  createAccessToken,
  createRefreshToken,
  verifyRefreshToken,
  changePassword,
  generateResetToken,
  resetPassword,
  getUserById,
  invalidateUserCache,
} from './service';

// Brute-force protection: far stricter than the global limit
const strictLimit = { rateLimit: { max: 10, timeWindow: '1 minute' } };

export async function authRoutes(app: FastifyInstance) {
  // Login
  app.post('/login', { schema: loginSchema, config: strictLimit }, async (request, reply) => {
    const { email, password } = request.body as any;
    const { user, error } = await authenticateUser(email, password);

    if (error || !user) {
      return reply.status(401).send({ error });
    }

    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      centreId: user.centreId || undefined,
    };

    const accessToken = await createAccessToken(payload);
    const refreshToken = await createRefreshToken(payload);

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        centreId: user.centreId,
        centre: user.centre,
      },
      accessToken,
      refreshToken,
    };
  });

  // Register: only the very first account (set-up) is open; after that only an admin can create accounts
  const registerGuard = async (request: any, reply: any) => {
    if ((await prisma.user.count()) === 0) return;
    await app.authenticate(request, reply);
    if (reply.sent) return reply;
    await app.requireRole('ADMIN')(request, reply);
    if (reply.sent) return reply;
  };

  app.post('/register', { schema: registerSchema, preHandler: [registerGuard], config: strictLimit }, async (request, reply) => {
    const isFirstAccount = (await prisma.user.count()) === 0;
    const input = { ...(request.body as any) };
    if (isFirstAccount) input.role = 'ADMIN'; // the account that sets the system up must be able to run it
    const { user, error } = await registerUser(input);

    if (error || !user) {
      return reply.status(400).send({ error: error || 'Failed to register' });
    }

    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      centreId: user.centreId || undefined,
    };

    const accessToken = await createAccessToken(payload);
    const refreshToken = await createRefreshToken(payload);

    return reply.status(201).send({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        centreId: user.centreId,
        centre: user.centre,
      },
      accessToken,
      refreshToken,
    });
  });

  // Refresh token
  app.post('/refresh', { schema: refreshTokenSchema }, async (request, reply) => {
    const { refreshToken } = request.body as any;
    const payload = await verifyRefreshToken(refreshToken);

    if (!payload) {
      return reply.status(401).send({ error: 'Invalid or expired refresh token' });
    }

    const user = await getUserById(payload.userId);
    if (!user || !user.isActive) {
      return reply.status(401).send({ error: 'User not found or inactive' });
    }

    const newPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      centreId: user.centreId || undefined,
    };

    const accessToken = await createAccessToken(newPayload);
    const newRefreshToken = await createRefreshToken(newPayload);

    return { accessToken, refreshToken: newRefreshToken };
  });

  // Get current user
  app.get('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = await getUserById((request.user as any).userId);
    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        centreId: user.centreId,
        centre: user.centre,
        lastLoginAt: user.lastLoginAt,
      },
    };
  });

  // Update own profile (the sign-in email can only be changed by an admin)
  app.patch('/me', { preHandler: [app.authenticate], schema: updateProfileSchema }, async (request, reply) => {
    const userId = (request.user as any).userId;
    const { fullName } = request.body as any;
    const user = await prisma.user.update({ where: { id: userId }, data: { fullName }, include: { centre: true } });
    invalidateUserCache(userId);
    return {
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role, centreId: user.centreId, centre: user.centre },
    };
  });

  // Change password
  app.post('/change-password', { preHandler: [app.authenticate], schema: changePasswordSchema }, async (request, reply) => {
    const { currentPassword, newPassword } = request.body as any;
    const { success, error } = await changePassword((request.user as any).userId, currentPassword, newPassword);

    if (!success) {
      return reply.status(400).send({ error });
    }

    return { success: true };
  });

  // Forgot password
  app.post('/forgot-password', { schema: forgotPasswordSchema, config: strictLimit }, async (request, reply) => {
    const { email } = request.body as any;
    const { token, error } = await generateResetToken(email);

    // The token must never be returned to the caller: whoever knows an email address could otherwise take the account.
    // There is no e-mail sender yet, so in development it is printed in this server's own log.
    if (token && config.NODE_ENV !== 'production') {
      request.log.warn(`PASSWORD RESET TOKEN for ${email} (shown only here, never sent to the browser): ${token}`);
    }

    return { message: 'If the email exists, a reset link will be sent' };
  });

  // Reset password
  app.post('/reset-password', { schema: resetPasswordSchema, config: strictLimit }, async (request, reply) => {
    const { token, password } = request.body as any;
    const { success, error } = await resetPassword(token, password);

    if (!success) {
      return reply.status(400).send({ error });
    }

    return { success: true };
  });

  // Logout (client-side token removal)
  app.post('/logout', { preHandler: [app.authenticate] }, async () => {
    return { success: true };
  });
}