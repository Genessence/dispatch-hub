import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Import routes
import authRoutes from './routes/auth';
import invoiceRoutes from './routes/invoices';
import scheduleRoutes from './routes/schedule';
import auditRoutes from './routes/audit';
import dispatchRoutes from './routes/dispatch';
import adminRoutes from './routes/admin';
import logsRoutes from './routes/logs';

// Import database and socket handler
import { checkConnection } from './config/database';
import { setupSocketHandlers } from './websocket/socketHandler';

const app = express();
const httpServer = createServer(app);

// Socket.IO setup with CORS - allow both localhost and network IP
const getCorsOrigins = () => {
  const origins: (string | RegExp)[] = [];
  // Add localhost
  origins.push(process.env.FRONTEND_URL || 'http://localhost:8080');
  // Add network IP
  const localIP = process.env.LOCAL_IP || '192.168.1.8';
  origins.push(`http://${localIP}:8080`);
  // In development, allow any origin from the local network (192.168.x.x)
  if (process.env.NODE_ENV === 'development') {
    origins.push(/^http:\/\/192\.168\.\d+\.\d+:8080$/);
  }
  return origins;
};

// CORS origin checker function for more flexible matching
const corsOriginChecker = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
  if (!origin) {
    // Allow requests with no origin (like mobile apps or Postman)
    return callback(null, true);
  }
  
  const allowedOrigins = getCorsOrigins();
  const isAllowed = allowedOrigins.some(allowed => {
    if (typeof allowed === 'string') {
      return origin === allowed;
    } else if (allowed instanceof RegExp) {
      return allowed.test(origin);
    }
    return false;
  });
  
  callback(null, isAllowed);
};

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: (origin, callback) => corsOriginChecker(origin, callback),
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

// Make io accessible to routes
app.set('io', io);

const PORT: number = Number(process.env.PORT) || 3001;

// Middleware - CORS configuration for mobile access
app.use(cors({
  origin: (origin, callback) => corsOriginChecker(origin, callback),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging middleware (development only)
if (process.env.NODE_ENV === 'development') {
  app.use((req: Request, _res: Response, next: NextFunction) => {
    console.log(`📨 ${req.method} ${req.path}`);
    next();
  });
}

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/dispatch', dispatchRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/logs', logsRoutes);

// Health check endpoint
app.get('/api/health', async (_req: Request, res: Response) => {
  const dbConnected = await checkConnection();
  res.json({ 
    status: 'OK', 
    message: 'Server is running',
    database: dbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('❌ Server error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Setup WebSocket handlers
setupSocketHandlers(io);

// Start server
const startServer = async () => {
  try {
    // Check database connection
    const dbConnected = await checkConnection();
    if (!dbConnected) {
      console.warn('⚠️ Database connection failed. Server will start but database features may not work.');
    }

    // Listen on all network interfaces (0.0.0.0) to allow mobile access
    const localIP = process.env.LOCAL_IP || '192.168.1.8'; // Default local IP, update if different
    httpServer.listen({
      port: PORT,
      host: '0.0.0.0'
    }, () => {
      console.log('');
      console.log('🚀 ==========================================');
      console.log(`🚀 Dispatch Hub Backend Server`);
      console.log('🚀 ==========================================');
      console.log(`📡 Server (Local):  http://localhost:${PORT}`);
      console.log(`📡 Server (Network): http://${localIP}:${PORT}`);
      console.log(`📡 Health:          http://${localIP}:${PORT}/api/health`);
      console.log(`🔐 Login:           POST http://${localIP}:${PORT}/api/auth/login`);
      console.log(`🔌 WebSocket:        ws://${localIP}:${PORT}`);
      console.log(`📦 Database:        ${dbConnected ? '✅ Connected' : '❌ Disconnected'}`);
      console.log('🚀 ==========================================');
      console.log(`📱 Mobile Access:   http://${localIP}:8080`);
      console.log('');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received. Shutting down gracefully...');
  httpServer.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received. Shutting down gracefully...');
  httpServer.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

startServer();

export { io };

