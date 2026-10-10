import { FastifyInstance } from 'fastify';
import { loginSchema, registerSchema, refreshTokenSchema, changePasswordSchema, forgotPasswordSchema, resetPasswordSchema } from './schemas';
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
} from './service';

export async function authRoutes(app: FastifyInstance) {
  // Login
  app.post('/login', { schema: loginSchema }, async (request, reply) => {
    const { email, password } = request.body;
    const { user, error } = await authenticateUser(email, password);

    if (error || !user) {
      return reply.status(401).send({ error });
    }

    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      centreId: user.centreId,
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

  // Register (admin only in production)
  app.post('/register', { schema: registerSchema }, async (request, reply) => {
    const { user, error } = await registerUser(request.body);

    if (error) {
      return reply.status(400).send({ error });
    }

    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      centreId: user.centreId,
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
    const { refreshToken } = request.body;
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
      centreId: user.centreId,
    };

    const accessToken = await createAccessToken(newPayload);
    const newRefreshToken = await createRefreshToken(newPayload);

    return { accessToken, refreshToken: newRefreshToken };
  });

  // Get current user
  app.get('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = await getUserById(request.user.userId);
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

  // Change password
  app.post('/change-password', { preHandler: [app.authenticate], schema: changePasswordSchema }, async (request, reply) => {
    const { currentPassword, newPassword } = request.body;
    const { success, error } = await changePassword(request.user.userId, currentPassword, newPassword);

    if (!success) {
      return reply.status(400).send({ error });
    }

    return { success: true };
  });

  // Forgot password
  app.post('/forgot-password', { schema: forgotPasswordSchema }, async (request, reply) => {
    const { email } = request.body;
    const { token, error } = await generateResetToken(email);

    // In production, send email with token
    // For development, return token in response
    if (config.NODE_ENV === 'development') {
      return { message: 'Reset token generated', resetToken: token };
    }

    return { message: 'If the email exists, a reset link will be sent' };
  });

  // Reset password
  app.post('/reset-password', { schema: resetPasswordSchema }, async (request, reply) => {
    const { token, password } = request.body;
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