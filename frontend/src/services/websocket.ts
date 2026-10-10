import { io, Socket } from 'socket.io-client';
import { getAuthTokens } from '@/store/auth';
import { useAuthStore } from '@/store/auth';

const WS_URL = import.meta.env.VITE_WS_URL || 'https://sterility-upheld-attic.ngrok-free.dev';

class WebSocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<Function>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  connect(): Socket {
    if (this.socket?.connected) return this.socket;

    const tokens = getAuthTokens();
    this.socket = io(WS_URL, {
      path: '/ws',
      auth: { token: tokens?.accessToken },
      transports: ['websocket', 'polling'],
      extraHeaders: {
        'ngrok-skip-browser-warning': 'true',
      },
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.socket.on('connect', () => {
      console.log('🔌 WebSocket connected:', this.socket?.id);
      this.reconnectAttempts = 0;
      this.emit('connected', {});
    });

    this.socket.on('disconnect', (reason) => {
      console.log('🔌 WebSocket disconnected:', reason);
      this.emit('disconnected', { reason });
    });

    this.socket.on('connect_error', (error) => {
      console.error('🔌 WebSocket connection error:', error);
      this.reconnectAttempts++;
      this.emit('error', { error: error.message });
    });

    this.socket.on('authenticated', (data) => {
      if (data.success) {
        console.log('✅ WebSocket authenticated');
        this.emit('authenticated', data);
      } else {
        console.error('❌ WebSocket authentication failed:', data.error);
        this.emit('auth_error', { error: data.error });
      }
    });

    // Forward all events to listeners
    this.socket.onAny((event, data) => {
      this.emit(event, data);
    });

    return this.socket;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  authenticate(token: string): void {
    if (this.socket) {
      this.socket.emit('authenticate', token);
    }
  }

  joinCentre(centreId: string): void {
    if (this.socket) {
      this.socket.emit('join-centre', centreId);
    }
  }

  leaveCentre(centreId: string): void {
    if (this.socket) {
      this.socket.emit('leave-centre', centreId);
    }
  }

  on(event: string, callback: Function): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  off(event: string, callback: Function): void {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, data: unknown): void {
    this.listeners.get(event)?.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in WebSocket listener for ${event}:`, error);
      }
    });
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

export const ws = new WebSocketService();

// React hook for WebSocket
export function useWebSocket() {
  const { accessToken } = useAuthStore();

  // Auto-connect when token changes
  // This would be used in a component with useEffect
  return ws;
}