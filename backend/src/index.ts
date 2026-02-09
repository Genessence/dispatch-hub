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
import { checkConnection, closePool } from './config/database';
import { setupSocketHandlers } from './websocket/socketHandler';

const app = express();
const httpServer = createServer(app);

// CORS origins configuration
const getCorsOrigins = (): string[] => {
  const origins: string[] = [];
  
  // Production origin from environment variable
  if (process.env.FRONTEND_URL) {
    origins.push(process.env.FRONTEND_URL);
  }
  
  // Development origins (localhost only)
  if (process.env.NODE_ENV === 'development') {
    origins.push('http://localhost:5173');
    origins.push('http://localhost:8080');
  }
  
  return origins;
};

// CORS origin checker function
const corsOriginChecker = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
  // Allow requests with no origin (curl, Postman, etc.)
  if (!origin) {
    return callback(null, true);
  }
  
  const allowedOrigins = getCorsOrigins();
  const isAllowed = allowedOrigins.includes(origin);
  
  if (!isAllowed) {
    console.warn(`⚠️ CORS: Blocked request from origin: ${origin}`);
  }
  
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

// Middleware - CORS configuration
app.use(cors({
  origin: (origin, callback) => corsOriginChecker(origin, callback),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204
}));

// Explicitly handle OPTIONS preflight requests
app.options('*', cors());
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
let isShuttingDown = false;
const shutdown = (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`🛑 ${signal} received. Shutting down gracefully...`);

  // Stop accepting new connections
  httpServer.close(async () => {
    console.log('✅ Server closed');
    try {
      await closePool();
    } catch (e) {
      console.warn('⚠️ Failed to close PostgreSQL pool cleanly:', e);
    } finally {
      process.exit(0);
    }
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startServer();

export { io };

