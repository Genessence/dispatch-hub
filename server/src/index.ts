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

// Socket.IO setup with CORS
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:8080',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

// Make io accessible to routes
app.set('io', io);

const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:8080',
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

    httpServer.listen(PORT, () => {
      console.log('');
      console.log('🚀 ==========================================');
      console.log(`🚀 Dispatch Hub Backend Server`);
      console.log('🚀 ==========================================');
      console.log(`📡 Server:     http://localhost:${PORT}`);
      console.log(`📡 Health:     http://localhost:${PORT}/api/health`);
      console.log(`🔐 Login:      POST http://localhost:${PORT}/api/auth/login`);
      console.log(`🔌 WebSocket:  ws://localhost:${PORT}`);
      console.log(`📦 Database:   ${dbConnected ? '✅ Connected' : '❌ Disconnected'}`);
      console.log('🚀 ==========================================');
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

