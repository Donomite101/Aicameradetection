import { prisma } from '@/shared/database/prisma';
import { config } from '@/config';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { createHash, randomUUID } from 'crypto';

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
    .setJti(randomUUID())
    .sign(secret);
}

export async function createRefreshToken(payload: TokenPayload): Promise<string> {
  return new SignJWT({ ...payload, type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(config.JWT_REFRESH_EXPIRES_IN)
    .setJti(randomUUID())
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    // Refresh and password-reset tokens are signed with the same secret: they must never work as access tokens
    if (payload.type) return null;
    return payload as unknown as TokenPayload;
  } catch {
    return null;
  }
}

export interface SessionUser {
  userId: string;
  email: string;
  role: string;
  centreId?: string;
}

const SESSION_CACHE_MS = 15_000;
const sessionCache = new Map<string, { user: SessionUser | null; expires: number }>();

/** Forget cached sessions (one user, or all) after a role / centre / active / password change. */
export function invalidateUserCache(userId?: string) {
  if (userId) sessionCache.delete(userId);
  else sessionCache.clear();
}

/**
 * Turn an access token into the CURRENT state of that user. The token only proves who it is;
 * role, centre and active status come from the database, so a deactivated or re-assigned user is not
 * trusted for the full token lifetime.
 */
export async function resolveSessionUser(token: string): Promise<SessionUser | null> {
  const payload = await verifyAccessToken(token);
  if (!payload?.userId) return null;
  return loadSessionUser(payload.userId);
}

async function loadSessionUser(userId: string): Promise<SessionUser | null> {
  const hit = sessionCache.get(userId);
  if (hit && hit.expires > Date.now()) return hit.user;

  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, centreId: true, isActive: true },
  });
  const user: SessionUser | null =
    row && row.isActive ? { userId: row.id, email: row.email, role: row.role, centreId: row.centreId ?? undefined } : null;
  sessionCache.set(userId, { user, expires: Date.now() + SESSION_CACHE_MS });
  return user;
}

/** A 5-minute ticket for the live video / snapshot address. It cannot be used for anything else. */
export async function createStreamTicket(userId: string): Promise<string> {
  return new SignJWT({ userId, type: 'stream' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(secret);
}

export async function resolveStreamTicketUser(ticket: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(ticket, secret);
    if (payload.type !== 'stream' || typeof payload.userId !== 'string') return null;
    return loadSessionUser(payload.userId);
  } catch {
    return null;
  }
}

/** A reset token is only valid while the password it was issued for is unchanged (so it works once). */
function passwordFingerprint(passwordHash: string): string {
  return createHash('sha256').update(passwordHash).digest('hex').slice(0, 16);
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
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
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
  invalidateUserCache(userId);

  return { success: true, error: null };
}

export async function generateResetToken(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return { token: null, error: 'If the email exists, a reset link will be sent' };

  const token = await new SignJWT({ userId: user.id, type: 'reset', pf: passwordFingerprint(user.passwordHash) })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .setJti(randomUUID())
    .sign(secret);

  return { token, error: null };
}

export async function resetPassword(token: string, newPassword: string) {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (payload.type !== 'reset') return { success: false, error: 'Invalid token' };

    const user = await prisma.user.findUnique({ where: { id: payload.userId as string } });
    if (!user || !user.isActive || payload.pf !== passwordFingerprint(user.passwordHash)) {
      return { success: false, error: 'Invalid or expired token' };
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
    invalidateUserCache(user.id);

    return { success: true, error: null };
  } catch {
    return { success: false, error: 'Invalid or expired token' };
  }
}