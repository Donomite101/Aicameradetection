import { Server as SocketIOServer, Socket } from 'socket.io';
import { FastifyInstance } from 'fastify';
import { verify } from 'jsonwebtoken';
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

  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    socket.on('authenticate', (token: string) => {
      try {
        const decoded = verify(token, config.JWT_SECRET) as {
          userId: string;
          role: string;
          centreId?: string;
        };

        socket.userId = decoded.userId;
        socket.role = decoded.role;
        socket.centreId = decoded.centreId;

        // Track user sockets
        if (!userSockets.has(decoded.userId)) {
          userSockets.set(decoded.userId, new Set());
        }
        userSockets.get(decoded.userId)!.add(socket.id);

        // Track centre sockets for centre-specific rooms
        if (decoded.centreId) {
          socket.join(`centre:${decoded.centreId}`);
          if (!centreSockets.has(decoded.centreId)) {
            centreSockets.set(decoded.centreId, new Set());
          }
          centreSockets.get(decoded.centreId)!.add(socket.id);
        }

        // Join role-based rooms
        socket.join(`role:${decoded.role}`);

        socket.emit('authenticated', { success: true });
        console.log(`✅ Socket ${socket.id} authenticated as ${decoded.role} (${decoded.userId})`);
      } catch (err) {
        socket.emit('authenticated', { success: false, error: 'Invalid token' });
        socket.disconnect();
      }
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