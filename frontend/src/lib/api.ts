/**
 * API Service for Dispatch Hub Backend
 */

const isLoopbackHostname = (hostname: string) => {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0';
};

const isLoopbackUrl = (value: string) => {
  try {
    // Use current origin as base so relative values don't throw.
    const url = new URL(value, window.location.origin);
    return isLoopbackHostname(url.hostname);
  } catch {
    return false;
  }
};

/**
 * In production, the frontend should typically call same-origin `/api/*` (Nginx reverse-proxy),
 * so a mistakenly configured `VITE_API_URL=http://localhost:3001` would break in browsers
 * (blocked by Private Network Access + non-secure context).
 *
 * This guard makes production fail-safe by ignoring loopback API URLs and falling back to
 * same-origin relative paths.
 */
const sanitizeApiUrl = (value: string | undefined) => {
  if (!value) return '';
  if (import.meta.env.PROD && isLoopbackUrl(value)) {
    console.warn(
      `[config] Ignoring VITE_API_URL="${value}" in production (loopback). Falling back to same-origin /api.`
    );
    return '';
  }
  // Normalize trailing slash to avoid accidental double-slashes when concatenating.
  return value.replace(/\/$/, '');
};

// Get API URL - use proxy in development, or configured URL
const getApiUrl = () => {
  // If VITE_API_URL is set, use it (allows overriding for custom deployments)
  if (import.meta.env.VITE_API_URL) {
    return sanitizeApiUrl(import.meta.env.VITE_API_URL);
  }
  
  // Default to empty string - endpoints already start with /api/
  // In dev: Vite proxy handles /api -> backend
  // In prod: Nginx handles /api -> backend
  return '';
};

const API_URL = getApiUrl();

// Get auth token from localStorage
const getAuthToken = (): string | null => {
  return localStorage.getItem('authToken');
};

// Get auth headers
const getAuthHeaders = (): HeadersInit => {
  const token = getAuthToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

// Generic fetch wrapper with error handling
const fetchWithAuth = async (endpoint: string, options: RequestInit = {}): Promise<any> => {
  const url = `${API_URL}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options.headers
    }
  });

  // Handle token expiration
  if (response.status === 401) {
    const data = await response.json();
    if (data.code === 'TOKEN_EXPIRED') {
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      window.location.href = '/';
      throw new Error('Session expired. Please login again.');
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    const errorMessage = error.message || error.error || 'Request failed';
    const fullError = new Error(errorMessage);
    // Attach the full error response for better debugging
    (fullError as any).response = error;
    (fullError as any).status = response.status;
    throw fullError;
  }

  return response.json();
};

// =============================================
// AUTH API
// =============================================

export const authApi = {
  login: async (usernameOrEmail: string, password: string) => {
    try {
      const response = await fetch(`${API_URL || ''}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail, password })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Login failed' }));
        throw new Error(error.error || 'Login failed');
      }

      return response.json();
    } catch (error: any) {
      // Handle network errors (connection refused, unreachable, etc.)
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        throw new Error('Cannot connect to server. Please ensure the backend server is running on port 3001.');
      }
      // Re-throw other errors as-is
      throw error;
    }
  },

  verify: async () => {
    return fetchWithAuth('/api/auth/verify');
  },

  getMe: async () => {
    return fetchWithAuth('/api/auth/me');
  },

  saveSelections: async (selectedCustomers: string[], selectedSite: string) => {
    return fetchWithAuth('/api/auth/selections', {
      method: 'PUT',
      body: JSON.stringify({ selectedCustomers, selectedSite })
    });
  },

  getScannerPreferences: async () => {
    return fetchWithAuth('/api/auth/scanner-preferences');
  },

  saveScannerPreferences: async (preferences: {
    defaultScanMode?: 'scanner' | 'camera';
    scannerSuffix?: 'Enter' | 'Tab' | 'None';
    autoTimeoutMs?: number;
    duplicateScanThresholdMs?: number;
    showRealtimeDisplay?: boolean;
  }) => {
    return fetchWithAuth('/api/auth/scanner-preferences', {
      method: 'PUT',
      body: JSON.stringify(preferences)
    });
  }
};

// =============================================
// INVOICES API
// =============================================

export const invoicesApi = {
  getAll: async (filters?: { auditComplete?: boolean; dispatched?: boolean; billTo?: string }) => {
    let query = '';
    if (filters) {
      const params = new URLSearchParams();
      if (filters.auditComplete !== undefined) params.append('auditComplete', String(filters.auditComplete));
      if (filters.dispatched !== undefined) params.append('dispatched', String(filters.dispatched));
      if (filters.billTo) params.append('billTo', filters.billTo);
      query = `?${params.toString()}`;
    }
    return fetchWithAuth(`/api/invoices${query}`);
  },

  getById: async (id: string) => {
    return fetchWithAuth(`/api/invoices/${id}`);
  },

  upload: async (file: File, customerCode?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (customerCode) {
      formData.append('customerCode', customerCode);
    }

    const token = getAuthToken();
    const response = await fetch(`${API_URL || ''}/api/invoices/upload`, {
      method: 'POST',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Upload failed');
    }

    return response.json();
  },

  delete: async (id: string) => {
    return fetchWithAuth(`/api/invoices/${id}`, { method: 'DELETE' });
  }
};

// =============================================
// SCHEDULE API
// =============================================

export const scheduleApi = {
  getAll: async (filters?: { customerCode?: string; deliveryDate?: string }) => {
    let query = '';
    if (filters) {
      const params = new URLSearchParams();
      if (filters.customerCode) params.append('customerCode', filters.customerCode);
      if (filters.deliveryDate) params.append('deliveryDate', filters.deliveryDate);
      query = `?${params.toString()}`;
    }
    return fetchWithAuth(`/api/schedule${query}`);
  },

  upload: async (file: File, customerCode?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (customerCode) {
      formData.append('customerCode', customerCode);
    }

    const token = getAuthToken();
    const response = await fetch(`${API_URL || ''}/api/schedule/upload`, {
      method: 'POST',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Upload failed');
    }

    return response.json();
  },

  clear: async () => {
    return fetchWithAuth('/api/schedule', { method: 'DELETE' });
  }
};

// =============================================
// AUDIT API
// =============================================

export const auditApi = {
  updateStatus: async (invoiceId: string, data: {
    scannedBins?: number;
    expectedBins?: number;
    auditComplete?: boolean;
    blocked?: boolean;
    deliveryDate?: string;
    deliveryTime?: string;
    unloadingLoc?: string;
  }) => {
    return fetchWithAuth(`/api/audit/${invoiceId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  recordScan: async (invoiceId: string, scanData: {
    customerBarcode?: string;
    autolivBarcode?: string;
    customerItem?: string;
    itemNumber?: string;
    partDescription?: string;
    quantity?: number;
    binQuantity?: number;
    binNumber?: string;
    status?: string;
    scanContext?: 'doc-audit' | 'loading-dispatch';
  }) => {
    return fetchWithAuth(`/api/audit/${invoiceId}/scan`, {
      method: 'POST',
      body: JSON.stringify(scanData)
    });
  },

  recordStageScan: async (invoiceId: string, scanData: {
    stage: 'customer' | 'inbd';
    customerBarcode?: string;
    autolivBarcode?: string;
    scanContext?: 'doc-audit' | 'loading-dispatch';
  }) => {
    return fetchWithAuth(`/api/audit/${invoiceId}/scan-stage`, {
      method: 'POST',
      body: JSON.stringify(scanData)
    });
  },

  getScans: async (invoiceId: string, scanContext?: 'doc-audit' | 'loading-dispatch') => {
    const query = scanContext ? `?scanContext=${scanContext}` : '';
    return fetchWithAuth(`/api/audit/${invoiceId}/scans${query}`);
  },

  deleteScan: async (invoiceId: string, scanId: string) => {
    return fetchWithAuth(`/api/audit/${invoiceId}/scans/${scanId}`, {
      method: 'DELETE'
    });
  },

  reportMismatch: async (data: {
    invoiceId: string;
    customer: string;
    step: 'doc-audit' | 'loading-dispatch';
    validationStep?: string;
    customerScan: any;
    autolivScan: any;
  }) => {
    return fetchWithAuth('/api/audit/mismatch', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  testScan: async (scanData: {
    invoiceId?: string;
    customerBarcode?: string;
    autolivBarcode?: string;
    customerItem?: string;
    itemNumber?: string;
    partDescription?: string;
    quantity?: number;
    binQuantity?: number;
    binNumber?: string;
    status?: string;
    scanContext?: 'doc-audit' | 'loading-dispatch';
  }) => {
    return fetchWithAuth('/api/audit/test-scan', {
      method: 'POST',
      body: JSON.stringify(scanData)
    });
  }
};

// =============================================
// DISPATCH API
// =============================================

export const dispatchApi = {
  getReady: async () => {
    return fetchWithAuth('/api/dispatch/ready');
  },

  dispatch: async (data: {
    invoiceIds: string[];
    vehicleNumber: string;
    loadedBarcodes?: any[];
  }) => {
    return fetchWithAuth('/api/dispatch', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  getGatepasses: async () => {
    return fetchWithAuth('/api/dispatch/gatepasses');
  },

  getGatepass: async (number: string) => {
    return fetchWithAuth(`/api/dispatch/gatepass/${number}`);
  }
};

// =============================================
// LOGS API
// =============================================

export const logsApi = {
  getAll: async (type?: 'upload' | 'audit' | 'dispatch', limit?: number) => {
    let query = '';
    const params = new URLSearchParams();
    if (type) params.append('type', type);
    if (limit) params.append('limit', String(limit));
    if (params.toString()) query = `?${params.toString()}`;
    return fetchWithAuth(`/api/logs${query}`);
  },

  getUpload: async () => {
    return fetchWithAuth('/api/logs/upload');
  },

  getAudit: async () => {
    return fetchWithAuth('/api/logs/audit');
  },

  getDispatch: async () => {
    return fetchWithAuth('/api/logs/dispatch');
  }
};

// =============================================
// ADMIN API
// =============================================

export const adminApi = {
  getAnalytics: async () => {
    return fetchWithAuth('/api/admin/analytics');
  },

  getInvoiceReports: async (filters?: {
    status?: 'dispatched' | 'audited' | 'pending';
    dispatchFrom?: string; // YYYY-MM-DD or ISO datetime
    dispatchTo?: string;   // YYYY-MM-DD or ISO datetime
    deliveryFrom?: string; // YYYY-MM-DD or ISO datetime
    deliveryTo?: string;   // YYYY-MM-DD or ISO datetime
    deliveryTime?: string;
    unloadingLoc?: string;
    customer?: string;
    billTo?: string;
    limit?: number;
    offset?: number;
  }) => {
    let query = '';
    if (filters) {
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.dispatchFrom) params.append('dispatchFrom', filters.dispatchFrom);
      if (filters.dispatchTo) params.append('dispatchTo', filters.dispatchTo);
      if (filters.deliveryFrom) params.append('deliveryFrom', filters.deliveryFrom);
      if (filters.deliveryTo) params.append('deliveryTo', filters.deliveryTo);
      if (filters.deliveryTime) params.append('deliveryTime', filters.deliveryTime);
      if (filters.unloadingLoc) params.append('unloadingLoc', filters.unloadingLoc);
      if (filters.customer) params.append('customer', filters.customer);
      if (filters.billTo) params.append('billTo', filters.billTo);
      if (filters.limit !== undefined) params.append('limit', String(filters.limit));
      if (filters.offset !== undefined) params.append('offset', String(filters.offset));
      if (params.toString()) query = `?${params.toString()}`;
    }
    return fetchWithAuth(`/api/admin/reports/invoices${query}`);
  },

  getExceptions: async (status?: 'pending' | 'approved' | 'rejected') => {
    let query = '';
    if (status) query = `?status=${status}`;
    return fetchWithAuth(`/api/admin/exceptions${query}`);
  },

  resolveException: async (id: string, status: 'approved' | 'rejected') => {
    return fetchWithAuth(`/api/admin/exceptions/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
  },

  getMasterData: async () => {
    return fetchWithAuth('/api/admin/master-data');
  },

  getUsers: async () => {
    return fetchWithAuth('/api/admin/users');
  }
};

// =============================================
// HEALTH CHECK
// =============================================

export const checkHealth = async () => {
  try {
    const response = await fetch(`${API_URL || ''}/api/health`);
    return response.json();
  } catch (error) {
    return { status: 'error', message: 'Cannot connect to server' };
  }
};

export default {
  auth: authApi,
  invoices: invoicesApi,
  schedule: scheduleApi,
  audit: auditApi,
  dispatch: dispatchApi,
  logs: logsApi,
  admin: adminApi,
  checkHealth
};

