import { Server as SocketIOServer, Socket } from 'socket.io';
import { FastifyInstance } from 'fastify';
import { resolveSessionUser, SessionUser } from '@/modules/auth/service';
import { createServer } from 'http';
import { config } from '@/config';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  role?: string;
  centreId?: string;
}

const userSockets = new Map<string, Set<string>>(); // userId -> Set<socketId>
const centreSockets = new Map<string, Set<string>>(); // centreId -> Set<socketId>

let ioInstance: SocketIOServer | null = null;

export function initializeWebSocket(fastify: FastifyInstance): SocketIOServer {
  // Create Socket.io server attached to Fastify's HTTP server
  const httpServer = (fastify as any).server;
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.NODE_ENV === 'production' ? false : '*',
      methods: ['GET', 'POST'],
    },
    path: '/ws',
  });

  ioInstance = io;

  // Put an authenticated user's socket into the rooms that decide which events it receives
  const attachUser = (socket: AuthenticatedSocket, user: SessionUser) => {
    socket.userId = user.userId;
    socket.role = user.role;
    socket.centreId = user.centreId;

    if (!userSockets.has(user.userId)) userSockets.set(user.userId, new Set());
    userSockets.get(user.userId)!.add(socket.id);

    if (user.centreId) {
      socket.join(`centre:${user.centreId}`);
      if (!centreSockets.has(user.centreId)) centreSockets.set(user.centreId, new Set());
      centreSockets.get(user.centreId)!.add(socket.id);
    }
    socket.join(`role:${user.role}`);
  };

  // The browser sends its token in the connection handshake. Reading it here is what makes live events work at all:
  // before, nothing ever authenticated the socket, so it never joined a room and received no event.
  io.use(async (socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(); // may connect, but receives nothing until it authenticates
    const user = await resolveSessionUser(String(token));
    if (!user) return next(new Error('Invalid or expired token'));
    attachUser(socket, user);
    next();
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`🔌 Client connected: ${socket.id}${socket.userId ? ` (${socket.role})` : ''}`);
    if (socket.userId) socket.emit('authenticated', { success: true });

    // Still supported for clients that connect first and authenticate afterwards
    socket.on('authenticate', async (token: string) => {
      const user = await resolveSessionUser(String(token || ''));
      if (!user) {
        socket.emit('authenticated', { success: false, error: 'Invalid token' });
        socket.disconnect();
        return;
      }
      attachUser(socket, user);
      socket.emit('authenticated', { success: true });
    });

    socket.on('join-centre', (centreId: string) => {
      if (socket.centreId === centreId || socket.role === 'ADMIN' || socket.role === 'MONITORING_OFFICER') {
        socket.join(`centre:${centreId}`);
        if (!centreSockets.has(centreId)) {
          centreSockets.set(centreId, new Set());
        }
        centreSockets.get(centreId)!.add(socket.id);
      }
    });

    socket.on('leave-centre', (centreId: string) => {
      socket.leave(`centre:${centreId}`);
      centreSockets.get(centreId)?.delete(socket.id);
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Client disconnected: ${socket.id}`);

      if (socket.userId) {
        userSockets.get(socket.userId)?.delete(socket.id);
        if (userSockets.get(socket.userId)?.size === 0) {
          userSockets.delete(socket.userId);
        }
      }

      if (socket.centreId) {
        centreSockets.get(socket.centreId)?.delete(socket.id);
        if (centreSockets.get(socket.centreId)?.size === 0) {
          centreSockets.delete(socket.centreId);
        }
      }
    });
  });

  return io;
}

export function getIO(): SocketIOServer | null {
  return ioInstance;
}

export function emitToCentre(centreId: string, event: string, data: unknown): void {
  const io = getIO();
  if (io) {
    io.to(`centre:${centreId}`).emit(event, data);
  }
}

export function emitToRole(role: string, event: string, data: unknown): void {
  const io = getIO();
  if (io) {
    io.to(`role:${role}`).emit(event, data);
  }
}

export function emitToUser(userId: string, event: string, data: unknown): void {
  const io = getIO();
  if (io) {
    const sockets = userSockets.get(userId);
    if (sockets) {
      sockets.forEach((socketId) => {
        io.to(socketId).emit(event, data);
      });
    }
  }
}

export function broadcastAlert(alert: {
  id: string;
  centreId: string;
  type: string;
  severity: string;
  title: string;
  message: string;
}): void {
  const io = getIO();
  if (io) {
    // Emit to centre room
    io.to(`centre:${alert.centreId}`).emit('alert:new', alert);

    // Emit to monitoring officers and admins
    io.to('role:MONITORING_OFFICER').emit('alert:new', alert);
    io.to('role:ADMIN').emit('alert:new', alert);
  }
}

export function broadcastAttendanceUpdate(centreId: string, data: {
  detectedCount: number;
  recordedCount: number;
  discrepancy: number;
  timestamp: number;
}): void {
  const io = getIO();
  if (io) {
    io.to(`centre:${centreId}`).emit('attendance:update', data);
    io.to('role:MONITORING_OFFICER').emit('attendance:update', { centreId, ...data });
    io.to('role:ADMIN').emit('attendance:update', { centreId, ...data });
  }
}

export function broadcastInfrastructureUpdate(centreId: string, data: {
  itemId: string;
  itemName: string;
  detected: boolean;
  operability: string;
  confidence: number;
  timestamp: number;
}): void {
  const io = getIO();
  if (io) {
    io.to(`centre:${centreId}`).emit('infrastructure:update', data);
    io.to('role:MONITORING_OFFICER').emit('infrastructure:update', { centreId, ...data });
    io.to('role:ADMIN').emit('infrastructure:update', { centreId, ...data });
  }
}

export function getConnectedUsers(): { userId: string; socketCount: number }[] {
  return Array.from(userSockets.entries()).map(([userId, sockets]) => ({
    userId,
    socketCount: sockets.size,
  }));
}

export function getConnectedCentres(): { centreId: string; socketCount: number }[] {
  return Array.from(centreSockets.entries()).map(([centreId, sockets]) => ({
    centreId,
    socketCount: sockets.size,
  }));
}