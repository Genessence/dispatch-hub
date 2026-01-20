import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { invoicesApi, scheduleApi, auditApi, logsApi } from "@/lib/api";
import { getCustomerCode } from "@/lib/customerCodes";
import { 
  initSocket, 
  disconnectSocket, 
  subscribeToInvoicesUpdated, 
  subscribeToScheduleUpdated,
  subscribeToAuditProgress,
  subscribeToAuditScan,
  subscribeToDispatchCompleted 
} from "@/lib/socket";

// Schedule data from the schedule file (each row from each sheet)
export interface ScheduleItem {
  customerCode?: string; // Optional - schedule files no longer contain customer code
  customerPart: string;
  partNumber?: string;
  qadPart: string;
  description: string;
  snp: number;
  bin: number;
  sheetName: string;
  deliveryDate?: Date;
  deliveryTime?: string;
  plant?: string;
  unloadingLoc?: string;
  quantity?: number;
}

export interface ScheduleData {
  items: ScheduleItem[];
  uploadedAt: Date;
  scheduledDate: Date;
  uploadedBy: string;
}

export interface InvoiceData {
  id: string;
  customer: string;
  invoiceDate: Date;
  totalQty: number;
  binCapacity: number;
  expectedBins: number;
  scannedBins: number;
  binsLoaded: number;
  auditComplete: boolean;
  auditDate?: Date;
  items: any[];
  validatedBarcodes?: Array<{
    customerBarcode: string;
    autolivBarcode: string;
  }>;
  uploadedBy?: string;
  auditedBy?: string;
  dispatchedBy?: string;
  uploadedAt?: Date;
  auditedAt?: Date;
  dispatchedAt?: Date;
  billTo?: string;
  scheduledDate?: Date;
  selectedPlant?: string;
  deliveryTime?: string;
  deliveryDate?: Date;
  unloadingLoc?: string;
  plant?: string;
  blocked?: boolean;
  blockedAt?: Date;
  vehicleNumber?: string;
  gatepassNumber?: string;
}

export interface LogEntry {
  id: string;
  user: string;
  action: string;
  details: string;
  timestamp: Date;
  type: 'upload' | 'audit' | 'dispatch';
}

export interface MismatchAlert {
  id: string;
  user: string;
  customer: string;
  invoiceId: string;
  step: 'doc-audit' | 'loading-dispatch';
  validationStep?: string;
  customerScan: {
    partCode: string;
    quantity: string;
    binNumber: string;
    rawValue: string;
  };
  autolivScan: {
    partCode: string;
    quantity: string;
    binNumber: string;
    rawValue: string;
  };
  timestamp: Date;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: Date;
}

interface SessionContextType {
  currentUser: string;
  currentUserRole: 'admin' | 'user';
  setCurrentUser: (user: string) => void;
  setCurrentUserRole: (role: 'admin' | 'user') => void;
  sharedInvoices: InvoiceData[];
  addInvoices: (invoices: InvoiceData[], uploadedBy: string) => void;
  updateInvoiceAudit: (invoiceId: string, auditData: Partial<InvoiceData>, auditedBy: string) => void;
  updateInvoiceDispatch: (invoiceId: string, dispatchedBy: string, vehicleNumber?: string, binNumber?: string, quantity?: number) => void;
  getUploadedInvoices: () => InvoiceData[];
  getAuditedInvoices: () => InvoiceData[];
  getDispatchableInvoices: () => InvoiceData[];
  logs: LogEntry[];
  getUploadLogs: () => LogEntry[];
  getAuditLogs: () => LogEntry[];
  getDispatchLogs: () => LogEntry[];
  mismatchAlerts: MismatchAlert[];
  addMismatchAlert: (alert: Omit<MismatchAlert, 'id' | 'timestamp' | 'status'>) => void;
  updateMismatchStatus: (alertId: string, status: 'approved' | 'rejected', reviewedBy: string) => void;
  getPendingMismatches: () => MismatchAlert[];
  scheduleData: ScheduleData | null;
  addScheduleData: (items: ScheduleItem[], uploadedBy: string) => void;
  clearScheduleData: () => void;
  getScheduleForCustomer: (customerCode: string) => ScheduleItem[];
  getInvoicesWithSchedule: () => InvoiceData[];
  getScheduledDispatchableInvoices: () => InvoiceData[];
  selectedCustomer: string | null;
  selectedSite: string | null;
  setSelectedCustomer: (customer: string | null) => void;
  setSelectedSite: (site: string) => void;
  refreshData: () => Promise<void>;
  isLoading: boolean;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

const STORAGE_KEYS = {
  SELECTED_CUSTOMER: 'dispatch-hub-selected-customer',
  SELECTED_SITE: 'dispatch-hub-selected-site',
};

// Helper to parse stored customer data (now single string, but handle legacy array format)
const parseStoredCustomer = (stored: string | null): string | null => {
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    // Handle legacy array format - take first element if array
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed[0] || null;
    }
    if (typeof parsed === 'string') return parsed;
    return null;
  } catch {
    // If not JSON, treat as plain string (legacy format)
    return stored || null;
  }
};

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState(() => {
    const user = localStorage.getItem('user');
    if (user) {
      try {
        return JSON.parse(user).username || "User 1";
      } catch {
        return "User 1";
      }
    }
    return "User 1";
  });
  
  const [currentUserRole, setCurrentUserRole] = useState<'admin' | 'user'>(() => {
    const user = localStorage.getItem('user');
    if (user) {
      try {
        return JSON.parse(user).role || "user";
      } catch {
        return "user";
      }
    }
    return "user";
  });
  
  const [scheduleData, setScheduleData] = useState<ScheduleData | null>(null);
  const [sharedInvoices, setSharedInvoices] = useState<InvoiceData[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [mismatchAlerts, setMismatchAlerts] = useState<MismatchAlert[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [selectedCustomer, setSelectedCustomerState] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return parseStoredCustomer(localStorage.getItem(STORAGE_KEYS.SELECTED_CUSTOMER));
    }
    return null;
  });

  const [selectedSite, setSelectedSiteState] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEYS.SELECTED_SITE);
    }
    return null;
  });

  // Persist selections to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (selectedCustomer) {
        localStorage.setItem(STORAGE_KEYS.SELECTED_CUSTOMER, selectedCustomer);
      } else {
        localStorage.removeItem(STORAGE_KEYS.SELECTED_CUSTOMER);
      }
    }
  }, [selectedCustomer]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (selectedSite) {
        localStorage.setItem(STORAGE_KEYS.SELECTED_SITE, selectedSite);
      } else {
        localStorage.removeItem(STORAGE_KEYS.SELECTED_SITE);
      }
    }
  }, [selectedSite]);

  // Fetch data from API
  const refreshData = useCallback(async () => {
    const token = localStorage.getItem('authToken');
    if (!token) return;

    setIsLoading(true);
    try {
      // Fetch invoices
      const invoicesResponse = await invoicesApi.getAll();
      if (invoicesResponse.success) {
        setSharedInvoices(invoicesResponse.invoices.map((inv: any) => ({
          ...inv,
          invoiceDate: inv.invoiceDate ? new Date(inv.invoiceDate) : new Date(),
          uploadedAt: inv.uploadedAt ? new Date(inv.uploadedAt) : undefined,
          auditedAt: inv.auditedAt ? new Date(inv.auditedAt) : undefined,
          dispatchedAt: inv.dispatchedAt ? new Date(inv.dispatchedAt) : undefined,
          blockedAt: inv.blockedAt ? new Date(inv.blockedAt) : undefined,
          auditDate: inv.auditDate ? new Date(inv.auditDate) : undefined,
          deliveryDate: inv.deliveryDate ? new Date(inv.deliveryDate) : undefined,
          deliveryTime: inv.deliveryTime || undefined,
          unloadingLoc: inv.unloadingLoc || undefined,
        })));
      }

      // Fetch schedule
      const scheduleResponse = await scheduleApi.getAll();
      if (scheduleResponse.success && scheduleResponse.scheduleData) {
        const items = scheduleResponse.scheduleData.items.map((item: any) => ({
          ...item,
          deliveryDate: item.deliveryDate ? new Date(item.deliveryDate) : undefined,
        }));
        
        if (items.length > 0) {
          setScheduleData({
            items,
            uploadedAt: scheduleResponse.scheduleData.uploadedAt ? new Date(scheduleResponse.scheduleData.uploadedAt) : new Date(),
            scheduledDate: new Date(),
            uploadedBy: scheduleResponse.scheduleData.uploadedBy || 'Unknown'
          });
        }
      }

      // Fetch logs
      const logsResponse = await logsApi.getAll(undefined, 100);
      if (logsResponse.success) {
        setLogs(logsResponse.logs.map((log: any) => ({
          ...log,
          timestamp: new Date(log.timestamp)
        })));
      }
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initialize socket and fetch data on mount
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (token) {
      initSocket(token);
      refreshData();

      // Subscribe to real-time updates
      const unsubInvoices = subscribeToInvoicesUpdated(() => {
        console.log('📦 Invoices updated, refreshing...');
        refreshData();
      });

      const unsubSchedule = subscribeToScheduleUpdated(() => {
        console.log('📅 Schedule updated, refreshing...');
        refreshData();
      });

      const unsubAudit = subscribeToAuditProgress((data) => {
        console.log('🔍 Audit progress:', data);
        // Update local state for the specific invoice
        setSharedInvoices(prev => prev.map(inv => 
          inv.id === data.invoiceId 
            ? { 
                ...inv, 
                scannedBins: data.scannedBins ?? inv.scannedBins,
                expectedBins: data.expectedBins ?? inv.expectedBins,
                auditComplete: data.auditComplete ?? inv.auditComplete,
                blocked: data.blocked ?? inv.blocked,
                auditedBy: data.auditedBy ?? inv.auditedBy
              }
            : inv
        ));
      });

      const unsubAuditScan = subscribeToAuditScan((data) => {
        console.log('📸 Audit scan recorded:', data);
        // Refresh invoice data to update scanned_bins count
        // Components will fetch scans themselves when needed
        setSharedInvoices(prev => prev.map(inv => 
          inv.id === data.invoiceId 
            ? { 
                ...inv,
                scannedBins: (inv.scannedBins || 0) + 1
              }
            : inv
        ));
        // Also trigger full refresh to ensure consistency
        refreshData();
      });

      const unsubDispatch = subscribeToDispatchCompleted((data) => {
        console.log('🚚 Dispatch completed:', data);
        refreshData();
      });

      return () => {
        unsubInvoices();
        unsubSchedule();
        unsubAudit();
        unsubAuditScan();
        unsubDispatch();
        disconnectSocket();
      };
    }
  }, [refreshData]);

  const setSelectedCustomer = (customer: string | null) => {
    setSelectedCustomerState(customer);
  };

  const setSelectedSite = (site: string) => {
    setSelectedSiteState(site);
  };

  // Add invoices - now uses API
  const addInvoices = useCallback(async (invoices: InvoiceData[], uploadedBy: string) => {
    // For now, update local state optimistically
    const newInvoices = invoices.map(inv => ({
      ...inv,
      uploadedBy,
      uploadedAt: new Date(),
      auditComplete: false,
      scannedBins: 0,
      binsLoaded: 0
    }));
    
    setSharedInvoices(prev => {
      const existingIds = new Set(prev.map(inv => inv.id));
      const uniqueNewInvoices = newInvoices.filter(inv => !existingIds.has(inv.id));
      return [...prev, ...uniqueNewInvoices];
    });
  }, []);

  // Update invoice audit - now uses API
  const updateInvoiceAudit = useCallback(async (invoiceId: string, auditData: Partial<InvoiceData>, auditedBy: string) => {
    // Update local state optimistically
    setSharedInvoices(prev => prev.map(inv => 
      inv.id === invoiceId 
        ? { 
            ...inv, 
            ...auditData,
            auditedBy,
            auditedAt: new Date()
          }
        : inv
    ));

    // Call API
    try {
      await auditApi.updateStatus(invoiceId, {
        scannedBins: auditData.scannedBins,
        expectedBins: auditData.expectedBins,
        auditComplete: auditData.auditComplete,
        blocked: auditData.blocked,
        deliveryDate: auditData.deliveryDate ? auditData.deliveryDate.toISOString() : undefined,
        deliveryTime: auditData.deliveryTime,
        unloadingLoc: auditData.unloadingLoc
      });
    } catch (error) {
      console.error('Error updating audit:', error);
    }
  }, []);

  // Update invoice dispatch
  const updateInvoiceDispatch = useCallback(async (invoiceId: string, dispatchedBy: string, vehicleNumber?: string, _binNumber?: string, _quantity?: number) => {
    setSharedInvoices(prev => prev.map(inv => 
      inv.id === invoiceId 
        ? { 
            ...inv, 
            dispatchedBy,
            dispatchedAt: new Date(),
            vehicleNumber
          }
        : inv
    ));
  }, []);

  const getUploadedInvoices = useCallback(() => {
    return sharedInvoices.filter(inv => inv.uploadedBy !== undefined);
  }, [sharedInvoices]);

  const getAuditedInvoices = useCallback(() => {
    return sharedInvoices.filter(inv => inv.auditComplete);
  }, [sharedInvoices]);

  const getDispatchableInvoices = useCallback(() => {
    return sharedInvoices.filter(inv => inv.auditComplete && !inv.dispatchedBy);
  }, [sharedInvoices]);

  const getUploadLogs = useCallback(() => {
    return logs.filter(log => log.type === 'upload');
  }, [logs]);

  const getAuditLogs = useCallback(() => {
    return logs.filter(log => log.type === 'audit');
  }, [logs]);

  const getDispatchLogs = useCallback(() => {
    return logs.filter(log => log.type === 'dispatch');
  }, [logs]);

  const addMismatchAlert = useCallback(async (alert: Omit<MismatchAlert, 'id' | 'timestamp' | 'status'>) => {
    const newAlert: MismatchAlert = {
      ...alert,
      id: `mismatch-${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
      status: 'pending'
    };
    setMismatchAlerts(prev => [...prev, newAlert]);

    // Call API
    try {
      await auditApi.reportMismatch({
        invoiceId: alert.invoiceId,
        customer: alert.customer,
        step: alert.step,
        validationStep: alert.validationStep,
        customerScan: alert.customerScan,
        autolivScan: alert.autolivScan
      });
    } catch (error) {
      console.error('Error reporting mismatch:', error);
    }
  }, []);

  const updateMismatchStatus = useCallback((alertId: string, status: 'approved' | 'rejected', reviewedBy: string) => {
    setMismatchAlerts(prev => prev.map(alert =>
      alert.id === alertId
        ? { ...alert, status, reviewedBy, reviewedAt: new Date() }
        : alert
    ));
  }, []);

  const getPendingMismatches = useCallback(() => {
    return mismatchAlerts.filter(alert => alert.status === 'pending');
  }, [mismatchAlerts]);

  // Schedule methods
  const addScheduleData = useCallback((items: ScheduleItem[], uploadedBy: string) => {
    const now = new Date();
    setScheduleData({
      items,
      uploadedAt: now,
      scheduledDate: now,
      uploadedBy
    });
  }, []);

  const clearScheduleData = useCallback(() => {
    setScheduleData(null);
  }, []);

  const getScheduleForCustomer = useCallback((_customerCode: string): ScheduleItem[] => {
    // Invoice-first: schedule is not customer-scoped anymore (customer_code may be null).
    // Return all schedule rows (already filtered during upload on qty vs qty dispatched).
    if (!scheduleData) return [];
    return scheduleData.items;
  }, [scheduleData]);

  const getInvoicesWithSchedule = useCallback((): InvoiceData[] => {
    if (!selectedCustomer) return [];
    const selectedCustomerCode = getCustomerCode(selectedCustomer);
    if (!selectedCustomerCode) return [];
    
    // Invoice-first: invoices are filtered by selected customer's BillTo only.
    return sharedInvoices.filter(inv => inv.billTo && String(inv.billTo) === String(selectedCustomerCode));
  }, [sharedInvoices, selectedCustomer]);

  const getScheduledDispatchableInvoices = useCallback((): InvoiceData[] => {
    if (!selectedCustomer) return [];
    const selectedCustomerCode = getCustomerCode(selectedCustomer);
    if (!selectedCustomerCode) return [];
    
    // Invoice-first: dispatch readiness depends on audited status, not schedule presence.
    return sharedInvoices.filter(inv => 
      inv.billTo && 
      String(inv.billTo) === String(selectedCustomerCode) && 
      inv.auditComplete && 
      !inv.dispatchedBy
    );
  }, [sharedInvoices, selectedCustomer]);

  return (
    <SessionContext.Provider
      value={{
        currentUser,
        currentUserRole,
        setCurrentUser,
        setCurrentUserRole,
        sharedInvoices,
        addInvoices,
        updateInvoiceAudit,
        updateInvoiceDispatch,
        getUploadedInvoices,
        getAuditedInvoices,
        getDispatchableInvoices,
        logs,
        getUploadLogs,
        getAuditLogs,
        getDispatchLogs,
        mismatchAlerts,
        addMismatchAlert,
        updateMismatchStatus,
        getPendingMismatches,
        scheduleData,
        addScheduleData,
        clearScheduleData,
        getScheduleForCustomer,
        getInvoicesWithSchedule,
        getScheduledDispatchableInvoices,
        selectedCustomer,
        selectedSite,
        setSelectedCustomer,
        setSelectedSite,
        refreshData,
        isLoading
      }}
    >
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return context;
};
