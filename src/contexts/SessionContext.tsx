import { createContext, useContext, useState, ReactNode } from "react";

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
  updateInvoiceDispatch: (invoiceId: string, dispatchedBy: string) => void;
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
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState("User 1");
  
  // Initialize with default invoices (16 invoices scheduled for today)
  const [sharedInvoices, setSharedInvoices] = useState<InvoiceData[]>([
    // First batch - 6 invoices
    {
      id: 'INV-2024-101',
      customer: 'Acme Corporation',
      invoiceDate: new Date(),
      totalQty: 240,
      binCapacity: 80,
      expectedBins: 3,
      scannedBins: 0,
      binsLoaded: 0,
      auditComplete: false,
      items: [],
      uploadedBy: 'Admin',
      uploadedAt: new Date(Date.now() - 1800000) // 30 minutes ago
    },
    {
      id: 'INV-2024-102',
      customer: 'Tech Solutions Inc',
      invoiceDate: new Date(),
      totalQty: 150,
      binCapacity: 50,
      expectedBins: 3,
      scannedBins: 0,
      binsLoaded: 0,
      auditComplete: false,
      items: [],
      uploadedBy: 'Admin',
      uploadedAt: new Date(Date.now() - 1800000)
    },
    {
      id: 'INV-2024-103',
      customer: 'Global Industries',
      invoiceDate: new Date(),
      totalQty: 160,
      binCapacity: 80,
      expectedBins: 2,
      scannedBins: 0,
      binsLoaded: 0,
      auditComplete: false,
      items: [],
      uploadedBy: 'Admin',
      uploadedAt: new Date(Date.now() - 1800000)
    },
    {
      id: 'INV-2024-104',
      customer: 'Manufacturing Co',
      invoiceDate: new Date(),
      totalQty: 100,
      binCapacity: 50,
      expectedBins: 2,
      scannedBins: 0,
      binsLoaded: 0,
      auditComplete: false,
      items: [],
      uploadedBy: 'Admin',
      uploadedAt: new Date(Date.now() - 1800000)
    },
    {
      id: 'INV-2024-105',
      customer: 'Auto Parts Ltd',
      invoiceDate: new Date(),
      totalQty: 240,
      binCapacity: 80,
      expectedBins: 3,
      scannedBins: 0,
      binsLoaded: 0,
      auditComplete: false,
      items: [],
      uploadedBy: 'Admin',
      uploadedAt: new Date(Date.now() - 1800000)
    },
    {
      id: 'INV-2024-106',
      customer: 'Precision Engineering',
      invoiceDate: new Date(),
      totalQty: 80,
      binCapacity: 80,
      expectedBins: 1,
      scannedBins: 0,
      binsLoaded: 0,
      auditComplete: false,
      items: [],
      uploadedBy: 'Admin',
      uploadedAt: new Date(Date.now() - 1800000)
    },
    // Second batch - 5 invoices
    {
      id: 'INV-2024-107',
      customer: 'Delta Automotive',
      invoiceDate: new Date(),
      totalQty: 200,
      binCapacity: 50,
      expectedBins: 4,
      scannedBins: 0,
      binsLoaded: 0,
      auditComplete: false,
      items: [],
      uploadedBy: 'Admin',
      uploadedAt: new Date(Date.now() - 1800000)
    },
    {
      id: 'INV-2024-108',
      customer: 'Omega Components',
      invoiceDate: new Date(),
      totalQty: 160,
      binCapacity: 80,
      expectedBins: 2,
      scannedBins: 0,
      binsLoaded: 0,
      auditComplete: false,
      items: [],
      uploadedBy: 'Admin',
      uploadedAt: new Date(Date.now() - 1800000)
    },
    {
      id: 'INV-2024-109',
      customer: 'Sigma Systems',
      invoiceDate: new Date(),
      totalQty: 150,
      binCapacity: 50,
      expectedBins: 3,
      scannedBins: 0,
      binsLoaded: 0,
      auditComplete: false,
      items: [],
      uploadedBy: 'Admin',
      uploadedAt: new Date(Date.now() - 1800000)
    },
    {
      id: 'INV-2024-110',
      customer: 'Alpha Manufacturing',
      invoiceDate: new Date(),
      totalQty: 240,
      binCapacity: 80,
      expectedBins: 3,
      scannedBins: 0,
      binsLoaded: 0,
      auditComplete: false,
      items: [],
      uploadedBy: 'Admin',
      uploadedAt: new Date(Date.now() - 1800000)
    },
    {
      id: 'INV-2024-111',
      customer: 'Beta Industries',
      invoiceDate: new Date(),
      totalQty: 100,
      binCapacity: 50,
      expectedBins: 2,
      scannedBins: 0,
      binsLoaded: 0,
      auditComplete: false,
      items: [],
      uploadedBy: 'Admin',
      uploadedAt: new Date(Date.now() - 1800000)
    },
    // Third batch - 5 invoices
    {
      id: 'INV-2024-112',
      customer: 'Gamma Technologies',
      invoiceDate: new Date(),
      totalQty: 160,
      binCapacity: 80,
      expectedBins: 2,
      scannedBins: 0,
      binsLoaded: 0,
      auditComplete: false,
      items: [],
      uploadedBy: 'Admin',
      uploadedAt: new Date(Date.now() - 1800000)
    },
    {
      id: 'INV-2024-113',
      customer: 'Theta Solutions',
      invoiceDate: new Date(),
      totalQty: 200,
      binCapacity: 50,
      expectedBins: 4,
      scannedBins: 0,
      binsLoaded: 0,
      auditComplete: false,
      items: [],
      uploadedBy: 'Admin',
      uploadedAt: new Date(Date.now() - 1800000)
    },
    {
      id: 'INV-2024-114',
      customer: 'Epsilon Engineering',
      invoiceDate: new Date(),
      totalQty: 80,
      binCapacity: 80,
      expectedBins: 1,
      scannedBins: 0,
      binsLoaded: 0,
      auditComplete: false,
      items: [],
      uploadedBy: 'Admin',
      uploadedAt: new Date(Date.now() - 1800000)
    },
    {
      id: 'INV-2024-115',
      customer: 'Zeta Automotive',
      invoiceDate: new Date(),
      totalQty: 150,
      binCapacity: 50,
      expectedBins: 3,
      scannedBins: 0,
      binsLoaded: 0,
      auditComplete: false,
      items: [],
      uploadedBy: 'Admin',
      uploadedAt: new Date(Date.now() - 1800000)
    },
    {
      id: 'INV-2024-116',
      customer: 'Kappa Components',
      invoiceDate: new Date(),
      totalQty: 240,
      binCapacity: 80,
      expectedBins: 3,
      scannedBins: 0,
      binsLoaded: 0,
      auditComplete: false,
      items: [],
      uploadedBy: 'Admin',
      uploadedAt: new Date(Date.now() - 1800000)
    }
  ]);
  
  // Initialize with upload logs
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 'log-1',
      user: 'Admin',
      action: 'Uploaded 6 invoice(s)',
      details: 'Invoices: INV-2024-101, INV-2024-102, INV-2024-103, INV-2024-104, INV-2024-105, INV-2024-106',
      timestamp: new Date(Date.now() - 1800000), // 30 minutes ago
      type: 'upload'
    },
    {
      id: 'log-2',
      user: 'Admin',
      action: 'Uploaded 5 invoice(s)',
      details: 'Invoices: INV-2024-107, INV-2024-108, INV-2024-109, INV-2024-110, INV-2024-111',
      timestamp: new Date(Date.now() - 1800000),
      type: 'upload'
    },
    {
      id: 'log-3',
      user: 'Admin',
      action: 'Uploaded 5 invoice(s)',
      details: 'Invoices: INV-2024-112, INV-2024-113, INV-2024-114, INV-2024-115, INV-2024-116',
      timestamp: new Date(Date.now() - 1800000),
      type: 'upload'
    }
  ]);
  const [mismatchAlerts, setMismatchAlerts] = useState<MismatchAlert[]>([
    // Pre-populate with 2-3 sample mismatches from different steps
    {
      id: 'mismatch-1',
      user: 'User 1',
      customer: 'Acme Corporation',
      invoiceId: 'INV-2024-001',
      step: 'doc-audit',
      customerScan: {
        partCode: '2023919386001',
        quantity: '5',
        binNumber: '76480M66T01',
        rawValue: '123456789012'
      },
      autolivScan: {
        partCode: '2023919386099',
        quantity: '7',
        binNumber: '76480M66T99',
        rawValue: '999999999999'
      },
      timestamp: new Date(Date.now() - 3600000), // 1 hour ago
      status: 'pending'
    },
    {
      id: 'mismatch-2',
      user: 'User 2',
      customer: 'Tech Solutions Inc',
      invoiceId: 'INV-2024-002',
      step: 'loading-dispatch',
      customerScan: {
        partCode: '2023919386002',
        quantity: '8',
        binNumber: '76480M66T02',
        rawValue: '234567890123'
      },
      autolivScan: {
        partCode: '2023919386088',
        quantity: '4',
        binNumber: '76480M66T88',
        rawValue: '888888888888'
      },
      timestamp: new Date(Date.now() - 7200000), // 2 hours ago
      status: 'pending'
    },
    {
      id: 'mismatch-3',
      user: 'User 1',
      customer: 'Global Industries',
      invoiceId: 'INV-2024-003',
      step: 'doc-audit',
      customerScan: {
        partCode: '2023919386003',
        quantity: '3',
        binNumber: '76480M66T03',
        rawValue: '345678901234'
      },
      autolivScan: {
        partCode: '2023919386077',
        quantity: '9',
        binNumber: '76480M66T77',
        rawValue: '777777777777'
      },
      timestamp: new Date(Date.now() - 10800000), // 3 hours ago
      status: 'pending'
    }
  ]);

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
    setSharedInvoices(prev => [...prev, ...newInvoices]);
    
    // Add log entry
    addLog({
      user: uploadedBy,
      action: `Uploaded ${invoices.length} invoice(s)`,
      details: `Invoices: ${invoices.map(inv => inv.id).join(', ')}`,
      type: 'upload'
    });
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

  const updateInvoiceDispatch = (invoiceId: string, dispatchedBy: string) => {
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
    
    // Add log entry
    addLog({
      user: dispatchedBy,
      action: `Dispatched invoice ${invoiceId}`,
      details: `Customer: ${invoice?.customer || 'Unknown'}, Items: ${invoice?.scannedBins || 0}`,
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
        getPendingMismatches
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

