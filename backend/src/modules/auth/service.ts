import { prisma } from '@/shared/database/prisma';
import { config } from '@/config';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { v4 as uuidv4 } from 'uuid';

const secret = new TextEncoder().encode(config.JWT_SECRET);

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  centreId?: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createAccessToken(payload: TokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(config.JWT_EXPIRES_IN)
    .setJti(uuidv4())
    .sign(secret);
}

export async function createRefreshToken(payload: TokenPayload): Promise<string> {
  return new SignJWT({ ...payload, type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(config.JWT_REFRESH_EXPIRES_IN)
    .setJti(uuidv4())
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as TokenPayload;
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (payload.type !== 'refresh') return null;
    return payload as unknown as TokenPayload;
  } catch {
    return null;
  }
}

export async function authenticateUser(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { centre: true },
  });

  if (!user || !user.isActive) {
    return { user: null, error: 'Invalid credentials' };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return { user: null, error: 'Invalid credentials' };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return { user, error: null };
}

export async function registerUser(data: {
  email: string;
  password: string;
  fullName: string;
  role?: string;
  centreId?: string;
}) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { user: null, error: 'Email already registered' };
  }

  const passwordHash = await hashPassword(data.password);

  const user = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash,
      fullName: data.fullName,
      role: (data.role as any) || 'VIEWER',
      centreId: data.centreId,
    },
    include: { centre: true },
  });

  return { user, error: null };
}

export async function getUserById(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: { centre: true },
  });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { success: false, error: 'User not found' };

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) return { success: false, error: 'Current password is incorrect' };

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  return { success: true, error: null };
}

export async function generateResetToken(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return { token: null, error: 'If the email exists, a reset link will be sent' };

  const token = await new SignJWT({ userId: user.id, type: 'reset' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .setJti(uuidv4())
    .sign(secret);

  return { token, error: null };
}

export async function resetPassword(token: string, newPassword: string) {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (payload.type !== 'reset') return { success: false, error: 'Invalid token' };

    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: payload.userId as string },
      data: { passwordHash },
    });

    return { success: true, error: null };
  } catch {
    return { success: false, error: 'Invalid or expired token' };
  }
}