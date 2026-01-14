import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dispatch-hub-super-secret-jwt-key-2024-change-in-production';

interface UserPayload {
  id: string;
  username: string;
  role: 'admin' | 'user';
}

interface AuthenticatedSocket extends Socket {
  user?: UserPayload;
}

/**
 * Setup WebSocket handlers for real-time communication
 */
export const setupSocketHandlers = (io: SocketIOServer) => {
  // Authentication middleware for sockets
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
    
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as UserPayload;
        socket.user = decoded;
      } catch (err) {
        // Token invalid, but we'll still allow connection for public events
        console.log('Socket: Invalid token, connecting as anonymous');
      }
    }
    
    next();
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    const username = socket.user?.username || 'anonymous';
    console.log(`🔌 Socket connected: ${socket.id} (${username})`);

    // Join user-specific room
    if (socket.user) {
      socket.join(`user:${socket.user.id}`);
      
      // Admins join admin room for alerts
      if (socket.user.role === 'admin') {
        socket.join('admins');
      }
    }

    // Handle joining customer/site room
    socket.on('join:room', (data: { customer?: string; site?: string }) => {
      if (data.customer) {
        socket.join(`customer:${data.customer}`);
        console.log(`📍 Socket ${socket.id} joined customer room: ${data.customer}`);
      }
      if (data.site) {
        socket.join(`site:${data.site}`);
        console.log(`📍 Socket ${socket.id} joined site room: ${data.site}`);
      }
    });

    // Handle leaving rooms
    socket.on('leave:room', (data: { customer?: string; site?: string }) => {
      if (data.customer) {
        socket.leave(`customer:${data.customer}`);
      }
      if (data.site) {
        socket.leave(`site:${data.site}`);
      }
    });

    // Handle audit scan event (for real-time progress updates)
    socket.on('audit:scan', (data: { invoiceId: string; customerItem: string }) => {
      // Broadcast to all connected clients
      socket.broadcast.emit('audit:scan', {
        ...data,
        scannedBy: socket.user?.username
      });
    });

    // Handle dispatch loading event
    socket.on('dispatch:loading', (data: { invoiceId: string; itemIndex: number }) => {
      socket.broadcast.emit('dispatch:loading', {
        ...data,
        loadedBy: socket.user?.username
      });
    });

    // Ping/pong for connection health
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log(`🔌 Socket disconnected: ${socket.id} (${username}) - ${reason}`);
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`❌ Socket error for ${socket.id}:`, error);
    });
  });

  console.log('🔌 WebSocket handlers initialized');
};

/**
 * Broadcast to all connected clients
 */
export const broadcastToAll = (io: SocketIOServer, event: string, data: any) => {
  io.emit(event, data);
};

/**
 * Broadcast to admins only
 */
export const broadcastToAdmins = (io: SocketIOServer, event: string, data: any) => {
  io.to('admins').emit(event, data);
};

/**
 * Broadcast to specific customer room
 */
export const broadcastToCustomer = (io: SocketIOServer, customer: string, event: string, data: any) => {
  io.to(`customer:${customer}`).emit(event, data);
};

/**
 * Broadcast to specific user
 */
export const broadcastToUser = (io: SocketIOServer, userId: string, event: string, data: any) => {
  io.to(`user:${userId}`).emit(event, data);
};

