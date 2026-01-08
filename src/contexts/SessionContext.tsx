import { createContext, useContext, useState, useEffect, ReactNode } from "react";

// Schedule data from the schedule file (each row from each sheet)
export interface ScheduleItem {
  customerCode: string;
  customerPart: string;
  partNumber?: string; // PART NUMBER field for matching with invoice Customer Item
  qadPart: string;
  description: string;
  snp: number;
  bin: number;
  sheetName: string;
  deliveryDate?: Date; // Extracted from schedule file columns like "Delivery Date & Time" or "Supply Date"
  deliveryTime?: string; // Extracted from schedule file (will be converted to shift A/B)
  plant?: string; // Plant code/name from schedule (if available)
}

export interface ScheduleData {
  items: ScheduleItem[];
  uploadedAt: Date;
  scheduledDate: Date; // The upload date becomes the scheduled dispatch date
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
  // New fields for schedule matching
  billTo?: string; // Customer code from invoice for matching with schedule
  scheduledDate?: Date; // When this invoice is scheduled for dispatch
  // Doc audit selection fields
  selectedPlant?: string; // User-selected plant for this invoice during doc audit (deprecated, use deliveryTime)
  deliveryTime?: string; // Delivery time from schedule (user-selected during doc audit)
  deliveryDate?: Date; // Delivery date from schedule
  plant?: string; // Plant from invoice data (extracted during upload)
  blocked?: boolean; // Invoice is blocked due to mismatch, requires admin correction
  blockedAt?: Date; // When the invoice was blocked
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
  setCurrentUser: (user: string) => void;
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
  // Schedule-related
  scheduleData: ScheduleData | null;
  addScheduleData: (items: ScheduleItem[], uploadedBy: string) => void;
  clearScheduleData: () => void;
  getScheduleForCustomer: (customerCode: string) => ScheduleItem[];
  getInvoicesWithSchedule: () => InvoiceData[];
  getScheduledDispatchableInvoices: () => InvoiceData[];
  // Customer and Site selection
  selectedCustomer: string[];
  selectedSite: string | null;
  setSelectedCustomer: (customers: string[]) => void;
  setSelectedSite: (site: string) => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

const STORAGE_KEYS = {
  SELECTED_CUSTOMER: 'dispatch-hub-selected-customer',
  SELECTED_SITE: 'dispatch-hub-selected-site',
};

// Helper to parse stored customer data (handles backward compatibility)
const parseStoredCustomers = (stored: string | null): string[] => {
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    // If it's already an array, return it
    if (Array.isArray(parsed)) return parsed;
    // If it's a string (old format), convert to array
    if (typeof parsed === 'string') return [parsed];
    return [];
  } catch {
    // If JSON parsing fails, it's an old plain string format
    return stored ? [stored] : [];
  }
};

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState("User 1");
  
  // Schedule data state
  const [scheduleData, setScheduleData] = useState<ScheduleData | null>(null);
  
  // Initialize with empty arrays - no dummy data
  const [sharedInvoices, setSharedInvoices] = useState<InvoiceData[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [mismatchAlerts, setMismatchAlerts] = useState<MismatchAlert[]>([]);

  // Customer selection with localStorage persistence (now supports array)
  const [selectedCustomer, setSelectedCustomerState] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      return parseStoredCustomers(localStorage.getItem(STORAGE_KEYS.SELECTED_CUSTOMER));
    }
    return [];
  });

  const [selectedSite, setSelectedSiteState] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEYS.SELECTED_SITE);
    }
    return null;
  });

  // Persist to localStorage when selections change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (selectedCustomer.length > 0) {
        localStorage.setItem(STORAGE_KEYS.SELECTED_CUSTOMER, JSON.stringify(selectedCustomer));
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

  const setSelectedCustomer = (customers: string[]) => {
    setSelectedCustomerState(customers);
  };

  const setSelectedSite = (site: string) => {
    setSelectedSiteState(site);
  };

  const addLog = (log: Omit<LogEntry, 'id' | 'timestamp'>) => {
    const newLog: LogEntry = {
      ...log,
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date()
    };
    setLogs(prev => [...prev, newLog]);
  };

  const addInvoices = (invoices: InvoiceData[], uploadedBy: string) => {
    const newInvoices = invoices.map(inv => ({
      ...inv,
      uploadedBy,
      uploadedAt: new Date(),
      auditComplete: false,
      scannedBins: 0,
      binsLoaded: 0
    }));
    
    // Track which invoices were actually added (for logging)
    let addedInvoiceIds: string[] = [];
    
    setSharedInvoices(prev => {
      // Get existing invoice IDs to prevent duplicates
      const existingIds = new Set(prev.map(inv => inv.id));
      
      // Filter out invoices that already exist (keep existing ones, skip duplicates)
      const uniqueNewInvoices = newInvoices.filter(inv => {
        const isNew = !existingIds.has(inv.id);
        if (isNew) {
          addedInvoiceIds.push(inv.id);
        }
        return isNew;
      });
      
      // Return combined array: existing invoices + only new unique invoices
      return [...prev, ...uniqueNewInvoices];
    });
    
    // Add log entry (log only the invoices that were actually added)
    if (addedInvoiceIds.length > 0) {
      addLog({
        user: uploadedBy,
        action: `Uploaded ${addedInvoiceIds.length} invoice(s)`,
        details: `Invoices: ${addedInvoiceIds.join(', ')}`,
        type: 'upload'
      });
    }
    
    // Note: Duplicate invoices are silently skipped to preserve existing data
    // (e.g., if an invoice was already audited, we don't want to overwrite it)
  };

  const updateInvoiceAudit = (invoiceId: string, auditData: Partial<InvoiceData>, auditedBy: string) => {
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
    
    // Add log entry when audit is complete
    if (auditData.auditComplete) {
      const invoice = sharedInvoices.find(inv => inv.id === invoiceId);
      addLog({
        user: auditedBy,
        action: `Completed audit for invoice ${invoiceId}`,
        details: `Customer: ${invoice?.customer || 'Unknown'}, Items: ${auditData.scannedBins || 0}`,
        type: 'audit'
      });
    }
  };

  const updateInvoiceDispatch = (invoiceId: string, dispatchedBy: string, vehicleNumber?: string, binNumber?: string, quantity?: number) => {
    const invoice = sharedInvoices.find(inv => inv.id === invoiceId);
    
    setSharedInvoices(prev => prev.map(inv => 
      inv.id === invoiceId 
        ? { 
            ...inv, 
            dispatchedBy,
            dispatchedAt: new Date()
          }
        : inv
    ));
    
    // Build detailed dispatch log with bin number and quantity
    const binInfo = binNumber || 'N/A';
    const qtyInfo = quantity || invoice?.totalQty || 0;
    const vehicleInfo = vehicleNumber || 'N/A';
    
    // Add log entry with enhanced details
    addLog({
      user: dispatchedBy,
      action: `Dispatched invoice ${invoiceId}`,
      details: `Customer: ${invoice?.customer || 'Unknown'}, Bin Number: ${binInfo}, Quantity: ${qtyInfo}, Vehicle: ${vehicleInfo}`,
      type: 'dispatch'
    });
  };

  const getUploadedInvoices = () => {
    return sharedInvoices.filter(inv => inv.uploadedBy !== undefined);
  };

  const getAuditedInvoices = () => {
    return sharedInvoices.filter(inv => inv.auditComplete);
  };

  const getDispatchableInvoices = () => {
    return sharedInvoices.filter(inv => inv.auditComplete && !inv.dispatchedBy);
  };

  const getUploadLogs = () => {
    return logs.filter(log => log.type === 'upload');
  };

  const getAuditLogs = () => {
    return logs.filter(log => log.type === 'audit');
  };

  const getDispatchLogs = () => {
    return logs.filter(log => log.type === 'dispatch');
  };

  const addMismatchAlert = (alert: Omit<MismatchAlert, 'id' | 'timestamp' | 'status'>) => {
    const newAlert: MismatchAlert = {
      ...alert,
      id: `mismatch-${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
      status: 'pending'
    };
    setMismatchAlerts(prev => [...prev, newAlert]);
  };

  const updateMismatchStatus = (alertId: string, status: 'approved' | 'rejected', reviewedBy: string) => {
    setMismatchAlerts(prev => prev.map(alert =>
      alert.id === alertId
        ? { ...alert, status, reviewedBy, reviewedAt: new Date() }
        : alert
    ));
  };

  const getPendingMismatches = () => {
    return mismatchAlerts.filter(alert => alert.status === 'pending');
  };

  // Schedule-related methods
  const addScheduleData = (items: ScheduleItem[], uploadedBy: string) => {
    const now = new Date();
    setScheduleData({
      items,
      uploadedAt: now,
      scheduledDate: now, // Upload date becomes scheduled date
      uploadedBy
    });
    
    addLog({
      user: uploadedBy,
      action: `Uploaded schedule with ${items.length} item(s)`,
      details: `Customer codes: ${[...new Set(items.map(i => i.customerCode))].join(', ')}`,
      type: 'upload'
    });
  };

  const clearScheduleData = () => {
    setScheduleData(null);
  };

  const getScheduleForCustomer = (customerCode: string): ScheduleItem[] => {
    if (!scheduleData) return [];
    return scheduleData.items.filter(item => String(item.customerCode) === String(customerCode));
  };

  // Get invoices that have matching schedule data
  const getInvoicesWithSchedule = (): InvoiceData[] => {
    if (!scheduleData) return [];
    const scheduledCustomerCodes = new Set(scheduleData.items.map(item => String(item.customerCode)));
    return sharedInvoices.filter(inv => inv.billTo && scheduledCustomerCodes.has(String(inv.billTo)));
  };

  // Get invoices that are ready for dispatch (have schedule AND audit complete)
  const getScheduledDispatchableInvoices = (): InvoiceData[] => {
    if (!scheduleData) return [];
    const scheduledCustomerCodes = new Set(scheduleData.items.map(item => String(item.customerCode)));
    return sharedInvoices.filter(inv => 
      inv.billTo && 
      scheduledCustomerCodes.has(String(inv.billTo)) && 
      inv.auditComplete && 
      !inv.dispatchedBy
    );
  };

  return (
    <SessionContext.Provider
      value={{
        currentUser,
        setCurrentUser,
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
        // Schedule-related
        scheduleData,
        addScheduleData,
        clearScheduleData,
        getScheduleForCustomer,
        getInvoicesWithSchedule,
        getScheduledDispatchableInvoices,
        // Customer and Site selection
        selectedCustomer,
        selectedSite,
        setSelectedCustomer,
        setSelectedSite
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

