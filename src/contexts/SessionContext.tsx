import { createContext, useContext, useState, ReactNode } from "react";

export interface InvoiceData {
  id: string;
  customer: string;
  invoiceDate: Date;
  totalQty: number;
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
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState("User 1");
  const [sharedInvoices, setSharedInvoices] = useState<InvoiceData[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);

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
        getDispatchLogs
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

