/**
 * WebSocket Client for Real-time Updates
 */

import { io, Socket } from 'socket.io-client';

// Get WebSocket URL - socket.io automatically handles protocol conversion (http -> ws)
const getWsUrl = () => {
  // If VITE_API_URL is set, use it
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // In development, use current origin (Vite proxy handles WebSocket)
  if (import.meta.env.DEV) {
    return window.location.origin;
  }
  
  // Fallback
  return 'http://localhost:3001';
};

const WS_URL = getWsUrl();

let socket: Socket | null = null;

// Event listeners storage
type EventCallback = (...args: any[]) => void;
const eventListeners: Map<string, Set<EventCallback>> = new Map();

/**
 * Initialize socket connection
 */
export const initSocket = (token?: string): Socket => {
  if (socket?.connected) {
    return socket;
  }

  // If socket exists but not connected, clean it up first
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  socket = io(WS_URL, {
    auth: { token },
    transports: ['websocket', 'polling'], // Try websocket first, fallback to polling
    reconnection: true,
    reconnectionAttempts: Infinity, // Keep trying indefinitely
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
    forceNew: false
  });

  socket.on('connect', () => {
    console.log('🔌 WebSocket connected successfully');
    
    // Re-attach all event listeners after reconnection
    eventListeners.forEach((callbacks, event) => {
      callbacks.forEach(callback => {
        socket?.on(event, callback);
      });
    });
  });

  socket.on('disconnect', (reason) => {
    console.log('🔌 WebSocket disconnected:', reason);
    if (reason === 'io server disconnect') {
      // Server disconnected, need to manually reconnect
      socket.connect();
    }
  });

  socket.on('connect_error', (error) => {
    console.error('🔌 WebSocket connection error:', error.message);
    console.log('Attempting to reconnect...');
  });

  socket.on('reconnect_attempt', (attemptNumber) => {
    console.log(`🔄 WebSocket reconnection attempt ${attemptNumber}`);
  });

  socket.on('reconnect', (attemptNumber) => {
    console.log(`✅ WebSocket reconnected after ${attemptNumber} attempts`);
  });

  socket.on('reconnect_error', (error) => {
    console.error('❌ WebSocket reconnection error:', error.message);
  });

  socket.on('reconnect_failed', () => {
    console.error('❌ WebSocket reconnection failed - maximum attempts reached');
  });

  return socket;
};

/**
 * Get current socket instance
 */
export const getSocket = (): Socket | null => socket;

/**
 * Disconnect socket
 */
export const disconnectSocket = (): void => {
  if (socket) {
    socket.disconnect();
    socket = null;
    eventListeners.clear();
  }
};

/**
 * Subscribe to an event
 */
export const subscribe = (event: string, callback: EventCallback): () => void => {
  if (!eventListeners.has(event)) {
    eventListeners.set(event, new Set());
  }
  
  eventListeners.get(event)!.add(callback);
  
  if (socket?.connected) {
    socket.on(event, callback);
  }

  // Return unsubscribe function
  return () => {
    eventListeners.get(event)?.delete(callback);
    socket?.off(event, callback);
  };
};

/**
 * Emit an event
 */
export const emit = (event: string, data?: any): void => {
  if (socket?.connected) {
    socket.emit(event, data);
  } else {
    console.warn('Socket not connected, cannot emit:', event);
  }
};

/**
 * Join a room
 */
export const joinRoom = (roomType: 'customer' | 'site', value: string): void => {
  emit('join:room', { [roomType]: value });
};

/**
 * Leave a room
 */
export const leaveRoom = (roomType: 'customer' | 'site', value: string): void => {
  emit('leave:room', { [roomType]: value });
};

// =============================================
// EVENT TYPES
// =============================================

export interface InvoicesUpdatedEvent {
  action: 'upload' | 'delete' | 'update';
  count?: number;
  invoiceId?: string;
  uploadedBy?: string;
}

export interface ScheduleUpdatedEvent {
  action: 'upload' | 'clear';
  count?: number;
  uploadedBy?: string;
}

export interface AuditProgressEvent {
  invoiceId: string;
  scannedBins?: number;
  expectedBins?: number;
  auditComplete?: boolean;
  blocked?: boolean;
  auditedBy?: string;
}

export interface AuditScanEvent {
  invoiceId: string;
  customerItem: string;
  scannedBy?: string;
}

export interface AuditStageScanEvent {
  invoiceId: string;
  invoiceItemId?: string;
  stage: 'customer' | 'inbd';
  scannedBy?: string;
  scanContext?: 'doc-audit' | 'loading-dispatch';
}

export interface DispatchCompletedEvent {
  gatepassNumber: string;
  vehicleNumber: string;
  invoiceIds: string[];
  dispatchedBy?: string;
}

export interface AlertEvent {
  type: 'mismatch';
  invoiceId?: string;
  customer?: string;
  reportedBy?: string;
}

export interface AlertResolvedEvent {
  alertId: string;
  status: 'approved' | 'rejected';
  invoiceId?: string;
  reviewedBy?: string;
}

// =============================================
// TYPED EVENT SUBSCRIPTIONS
// =============================================

export const subscribeToInvoicesUpdated = (callback: (data: InvoicesUpdatedEvent) => void) => {
  return subscribe('invoices:updated', callback);
};

export const subscribeToScheduleUpdated = (callback: (data: ScheduleUpdatedEvent) => void) => {
  return subscribe('schedule:updated', callback);
};

export const subscribeToAuditProgress = (callback: (data: AuditProgressEvent) => void) => {
  return subscribe('audit:progress', callback);
};

export const subscribeToAuditScan = (callback: (data: AuditScanEvent) => void) => {
  return subscribe('audit:scan', callback);
};

export const subscribeToAuditStageScan = (callback: (data: AuditStageScanEvent) => void) => {
  return subscribe('audit:stage-scan', callback);
};

export const subscribeToDispatchCompleted = (callback: (data: DispatchCompletedEvent) => void) => {
  return subscribe('dispatch:completed', callback);
};

export const subscribeToNewAlert = (callback: (data: AlertEvent) => void) => {
  return subscribe('alert:new', callback);
};

export const subscribeToAlertResolved = (callback: (data: AlertResolvedEvent) => void) => {
  return subscribe('alert:resolved', callback);
};

export default {
  initSocket,
  getSocket,
  disconnectSocket,
  subscribe,
  emit,
  joinRoom,
  leaveRoom,
  subscribeToInvoicesUpdated,
  subscribeToScheduleUpdated,
  subscribeToAuditProgress,
  subscribeToAuditScan,
  subscribeToAuditStageScan,
  subscribeToDispatchCompleted,
  subscribeToNewAlert,
  subscribeToAlertResolved
};

