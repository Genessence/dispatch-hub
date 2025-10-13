import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import * as XLSX from 'xlsx';
import { 
  Upload, 
  ScanBarcode, 
  Truck, 
  Database, 
  BarChart3, 
  AlertTriangle,
  CheckCircle2,
  Clock,
  Package,
  Home,
  FileSpreadsheet,
  XCircle,
  Radio,
  QrCode,
  Printer,
  Download,
  Users,
  ArrowLeft,
  Calendar as CalendarIcon,
  X
} from "lucide-react";
import { BarcodeScanButton, type BarcodeData } from "@/components/BarcodeScanner";
import { useSession } from "@/contexts/SessionContext";
import { LogsDialog } from "@/components/LogsDialog";
import type { LogEntry } from "@/contexts/SessionContext";

type ViewType = 'dashboard' | 'upload' | 'doc-audit' | 'dispatch';

interface UploadedRow {
  invoice: string;
  customer: string;
  part: string;
  qty: number;
  status: 'valid' | 'error' | 'warning';
  errorMessage?: string;
}

interface ValidatedBarcodePair {
  customerBarcode: string;
  autolivBarcode: string;
}

interface InvoiceData {
  id: string;
  customer: string;
  invoiceDate: Date;
  totalQty: number;
  binCapacity: number; // Maximum quantity per bin
  expectedBins: number;
  scannedBins: number;
  binsLoaded: number;
  auditComplete: boolean;
  auditDate?: Date;
  items: UploadedRow[];
  validatedBarcodes?: ValidatedBarcodePair[];
}

const Dashboard = () => {
  const { currentUser, sharedInvoices, addInvoices, updateInvoiceAudit, updateInvoiceDispatch, getAuditedInvoices, getDispatchableInvoices, getUploadLogs, getAuditLogs, getDispatchLogs, addMismatchAlert, getPendingMismatches } = useSession();
  const [activeView, setActiveView] = useState<ViewType>('dashboard');
  
  // Logs states
  const [showUploadLogs, setShowUploadLogs] = useState(false);
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  const [showDispatchLogs, setShowDispatchLogs] = useState(false);
  
  // Upload Data states
  const [file, setFile] = useState<File | null>(null);
  const [uploadStage, setUploadStage] = useState<'upload' | 'validate' | 'complete'>('upload');
  const [dragActive, setDragActive] = useState(false);
  const [uploadedData, setUploadedData] = useState<UploadedRow[]>([]);
  const [processedInvoices, setProcessedInvoices] = useState<InvoiceData[]>([]);
  
  // Doc Audit states
  const [selectedInvoice, setSelectedInvoice] = useState("");
  const [customerScan, setCustomerScan] = useState<BarcodeData | null>(null);
  const [autolivScan, setAutolivScan] = useState<BarcodeData | null>(null);
  const [scannerConnected, setScannerConnected] = useState(true);
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date | undefined>(undefined);
  
  
  const [validatedBins, setValidatedBins] = useState<Array<{
    binNo: string;
    partCode: string;
    qty: number;
    status: string;
    scannedBy: string;
    time: string;
    customerBarcode: string;
    autolivBarcode: string;
  }>>([]);
  
  // Dispatch states
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [gatepassGenerated, setGatepassGenerated] = useState(false);
  const [dispatchCustomerScan, setDispatchCustomerScan] = useState<BarcodeData | null>(null);
  const [dispatchAutolivScan, setDispatchAutolivScan] = useState<BarcodeData | null>(null);
  const [loadedBarcodes, setLoadedBarcodes] = useState<ValidatedBarcodePair[]>([]);

  const factoryOperations = [
    {
      title: "Upload Sales Data",
      description: "Import and schedule dispatch orders",
      icon: Upload,
      link: "/upload",
      color: "text-primary",
      bgColor: "bg-primary/10",
      tabValue: "upload"
    },
    {
      title: "Doc Audit",
      description: "Scan and validate barcode labels",
      icon: ScanBarcode,
      link: "/doc-audit",
      color: "text-accent",
      bgColor: "bg-accent/10",
      tabValue: "doc-audit"
    },
    {
      title: "Loading & Dispatch",
      description: "Manage vehicle loading and gatepass",
      icon: Truck,
      link: "/dispatch",
      color: "text-success",
      bgColor: "bg-success/10",
      tabValue: "dispatch"
    }
  ];

  const otherModules = [
    {
      title: "Master Data",
      description: "Manage part codes and tags",
      icon: Database,
      link: "/master-data",
      color: "text-secondary",
      bgColor: "bg-secondary/10"
    },
    {
      title: "Analytics & Reports",
      description: "View performance metrics",
      icon: BarChart3,
      link: "/analytics",
      color: "text-warning",
      bgColor: "bg-warning/10"
    },
    {
      title: "Exception Alerts",
      description: "Review mismatches and overrides",
      icon: AlertTriangle,
      link: "/exceptions",
      color: "text-destructive",
      bgColor: "bg-destructive/10"
    }
  ];

  // Calculate status with initial demo values
  const totalInvoices = sharedInvoices.length;
  const pendingAudits = sharedInvoices.filter(inv => !inv.auditComplete && !inv.dispatchedBy).length;
  const completedDispatches = sharedInvoices.filter(inv => inv.dispatchedBy).length;
  const readyToDispatch = sharedInvoices.filter(inv => inv.auditComplete && !inv.dispatchedBy).length;
  
  // Show initial demo numbers if no real data exists
  const hasRealData = sharedInvoices.length > 0;

  const kpis = [
    {
      title: "Total Invoices",
      value: hasRealData ? totalInvoices.toString() : "7",
      subtitle: "In system",
      icon: Package,
      trend: hasRealData ? (totalInvoices > 0 ? "Active" : "Empty") : "Active"
    },
    {
      title: "Pending Audits",
      value: hasRealData ? pendingAudits.toString() : "3",
      subtitle: "Awaiting scan",
      icon: Clock,
      trend: hasRealData ? (pendingAudits > 0 ? "Pending" : "Clear") : "Pending"
    },
    {
      title: "Completed Dispatches",
      value: hasRealData ? completedDispatches.toString() : "2",
      subtitle: "Dispatched",
      icon: CheckCircle2,
      trend: hasRealData ? (completedDispatches > 0 ? "Active" : "None") : "Active"
    },
    {
      title: "Ready to Dispatch",
      value: hasRealData ? readyToDispatch.toString() : "2",
      subtitle: "Audited & Ready",
      icon: Truck,
      trend: hasRealData ? (readyToDispatch > 0 ? "Available" : "None") : "Available"
    }
  ];

  // Upload handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  // Helper function to convert Excel date serial number to Date
  const excelDateToJSDate = (serial: number): Date => {
    const utc_days = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;
    const date_info = new Date(utc_value * 1000);
    return new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate());
  };

  const parseFile = async (file: File) => {
    return new Promise<{ rows: UploadedRow[], invoices: InvoiceData[] }>((resolve, reject) => {
      // Check file size (limit to 5MB for mobile devices)
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
        || (window.innerWidth < 768 && ('ontouchstart' in window));
      const maxSize = isMobile ? 5 * 1024 * 1024 : 10 * 1024 * 1024; // 5MB for mobile, 10MB for desktop
      
      if (file.size > maxSize) {
        reject(new Error(`File too large. Please use files smaller than ${Math.round(maxSize / (1024 * 1024))}MB.`));
        return;
      }
      
      // Check file type compatibility
      if (!file.name.match(/\.(xlsx|xls)$/i)) {
        reject(new Error('Please upload a valid Excel file (.xlsx or .xls format).'));
        return;
      }
      
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          if (!data) {
            reject(new Error('Failed to read file data'));
            return;
          }
          
          // Detect mobile device more accurately
          const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
            || (window.innerWidth < 768 && ('ontouchstart' in window));
          
          console.log('Mobile detection:', {
            userAgent: navigator.userAgent,
            isMobile: isMobile,
            screenWidth: window.innerWidth,
            hasTouch: 'ontouchstart' in window
          });
          
          // Use most compatible parsing strategy for all devices
          let workbook;
          console.log('Using universal parsing strategy for maximum compatibility');
          
          try {
            // Try the most basic parsing first (works on all browsers)
            workbook = XLSX.read(data, { 
              type: 'array',
              cellDates: false,
              cellNF: false,
              cellText: false,
              raw: false,
              sheetStubs: false,
              bookVBA: false,
              bookSheets: false,
              bookProps: false,
              bookFiles: false,
              WTF: false,
              codepage: false, // Disable codepage detection
              dense: false // Use sparse mode for better compatibility
            });
            console.log('Universal parsing successful');
          } catch (parseError) {
            console.error('Universal parsing failed:', parseError);
            // Fallback to even more basic parsing
            workbook = XLSX.read(data, { 
              type: 'array',
              cellDates: false,
              raw: false,
              WTF: false
            });
            console.log('Fallback parsing successful');
          }
          
          if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
            reject(new Error('No sheets found in the file'));
            return;
          }
          
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          if (!firstSheet) {
            reject(new Error('First sheet is empty or invalid'));
            return;
          }
          
          // Try array format first, fallback to object format for better compatibility
          let jsonData: any[];
          let headers: string[] = [];
          let dataRows: string[][] = [];
          
          // Use universal parsing approach that works on all devices
          try {
            console.log('Trying universal data extraction');
            
            // Try object format first (most compatible across all browsers)
            jsonData = XLSX.utils.sheet_to_json(firstSheet, {
              defval: '',
              raw: false,
              range: isMobile ? 1000 : undefined // Limit rows on mobile
            });
            
            if (!jsonData || jsonData.length === 0) {
              throw new Error('No data with object format');
            }
            
            // Convert object format to headers and data rows
            if (jsonData.length > 0 && typeof jsonData[0] === 'object') {
              headers = Object.keys(jsonData[0]);
              dataRows = jsonData.map((row: any) => headers.map(header => row[header] || ''));
              console.log('Universal object format successful');
            } else {
              throw new Error('Invalid object format');
            }
          } catch (objectError) {
            console.log('Object format failed, trying array format:', objectError);
            
            try {
              // Fallback to array format
              jsonData = XLSX.utils.sheet_to_json(firstSheet, {
                header: 1,
                defval: '',
                raw: false,
                range: isMobile ? 1000 : undefined
              });
              
              if (!jsonData || jsonData.length === 0) {
                throw new Error('No data with array format');
              }
              
              // Convert array format to headers and data rows
              if (Array.isArray(jsonData[0])) {
                headers = jsonData[0] as string[];
                dataRows = jsonData.slice(1) as string[][];
                console.log('Universal array format successful');
              } else {
                throw new Error('Invalid array format');
              }
            } catch (arrayError) {
              console.error('Both parsing methods failed:', arrayError);
              reject(new Error('File parsing failed. Please ensure your file is a valid Excel file (.xlsx or .xls) and try again.'));
              return;
            }
          }
          
          // Additional mobile checks
          if (isMobile && dataRows.length > 500) {
            reject(new Error('File has too many rows for mobile processing. Please use a file with fewer than 500 rows.'));
            return;
          }
          
          if (!headers || headers.length === 0) {
            reject(new Error('No headers found in the file'));
            return;
          }
          
            console.log('Headers found:', headers);
            console.log('Data rows count:', dataRows.length);
            console.log('Is mobile device:', isMobile);
            console.log('Browser info:', {
              userAgent: navigator.userAgent,
              platform: navigator.platform,
              cookieEnabled: navigator.cookieEnabled
            });
            
            // Debug: Log first few rows for troubleshooting
            if (dataRows.length > 0) {
              console.log('First data row:', dataRows[0]);
              console.log('Sample row object:', headers.reduce((obj, header, index) => {
                obj[header] = dataRows[0][index] || '';
                return obj;
              }, {} as any));
            }
          
          // Parse and validate the data
          const parsedData: UploadedRow[] = dataRows.map((row: string[], index: number) => {
            // Create row object from array
            const rowObj: any = {};
            headers.forEach((header, colIndex) => {
              rowObj[header] = row[colIndex] || '';
            });
            
            // Try to find the columns (case-insensitive, flexible naming)
            const invoice = rowObj['Invoice Number'] || rowObj['Invoice'] || rowObj['invoice'] || rowObj['Invoice No'] || rowObj['InvoiceNo'] || `INV-${index + 1}`;
            const customer = rowObj['Cust Name'] || rowObj['Customer'] || rowObj['customer'] || rowObj['Customer Name'] || rowObj['CustomerName'] || 'Unknown Customer';
            const part = rowObj['Item Number'] || rowObj['Part'] || rowObj['part'] || rowObj['Part Code'] || rowObj['PartCode'] || rowObj['Part Number'] || 'Unknown Part';
            const qty = parseInt(rowObj['Quantity Invoiced'] || rowObj['Qty'] || rowObj['qty'] || rowObj['Quantity'] || rowObj['quantity'] || '0');
            
            // Validation logic
            let status: 'valid' | 'error' | 'warning' = 'valid';
            let errorMessage = '';
            
            if (!invoice || invoice.toString().trim() === '') {
              status = 'error';
              errorMessage = 'Missing invoice number';
            } else if (!customer || customer.toString().trim() === '') {
              status = 'error';
              errorMessage = 'Missing customer name';
            } else if (!part || part.toString().trim() === '') {
              status = 'error';
              errorMessage = 'Missing part code';
            } else if (isNaN(qty)) {
              status = 'error';
              errorMessage = 'Invalid quantity';
            } else if (qty < 0) {
              status = 'warning';
              errorMessage = 'Negative quantity (return/credit)';
            } else if (qty === 0) {
              status = 'warning';
              errorMessage = 'Zero quantity';
            } else if (qty > 1000) {
              status = 'warning';
              errorMessage = 'Large quantity (>1000)';
            }
            
            return {
              invoice: invoice.toString(),
              customer: customer.toString(),
              part: part.toString(),
              qty: qty,
              status,
              errorMessage
            };
          });
          
          // Group data by invoice and extract invoice date
          const invoiceMap = new Map<string, InvoiceData>();
          
          dataRows.forEach((row: string[], index: number) => {
            // Create row object from array
            const rowObj: any = {};
            headers.forEach((header, colIndex) => {
              rowObj[header] = row[colIndex] || '';
            });
            
            const invoiceNum = rowObj['Invoice Number'] || rowObj['Invoice'] || rowObj['invoice'] || `INV-${index + 1}`;
            const customer = rowObj['Cust Name'] || rowObj['Customer'] || rowObj['customer'] || 'Unknown Customer';
            const invoiceDateSerial = rowObj['Invoice Date'] || rowObj['invoice date'] || rowObj['Date'];
            const qty = parseInt(rowObj['Quantity Invoiced'] || rowObj['Qty'] || rowObj['qty'] || rowObj['Quantity'] || '0');
            
            // Always use today's date for uploaded invoices so they show in Doc Audit
            const invoiceDate = new Date();
            
            if (!invoiceMap.has(invoiceNum.toString())) {
              // Randomly assign bin capacity: 50 or 80
              const binCapacity = Math.random() < 0.5 ? 50 : 80;
              
              invoiceMap.set(invoiceNum.toString(), {
                id: invoiceNum.toString(),
                customer: customer.toString(),
                invoiceDate: invoiceDate,
                totalQty: 0,
                binCapacity: binCapacity,
                expectedBins: 0,
                scannedBins: 0,
                binsLoaded: 0,
                auditComplete: false,
                items: []
              });
            }
            
            const invoice = invoiceMap.get(invoiceNum.toString())!;
            invoice.totalQty += Math.abs(qty);
            invoice.items.push(parsedData[index]);
          });
          
          // Calculate expected bins based on total quantity and bin capacity
          invoiceMap.forEach((invoice) => {
            // Calculate minimum bins needed to hold total quantity given bin capacity
            invoice.expectedBins = Math.ceil(invoice.totalQty / invoice.binCapacity);
          });
          
          const invoices = Array.from(invoiceMap.values());
          
          // Debug logging for invoice dates
          console.log('Created invoices with dates:');
          invoices.forEach(invoice => {
            console.log(`Invoice ${invoice.id}: ${invoice.invoiceDate.toLocaleDateString()} (Customer: ${invoice.customer})`);
          });
          
          const today = new Date();
          const todayInvoices = invoices.filter(inv => 
            inv.invoiceDate.getDate() === today.getDate() &&
            inv.invoiceDate.getMonth() === today.getMonth() &&
            inv.invoiceDate.getFullYear() === today.getFullYear()
          );
          console.log(`Invoices for today (${today.toLocaleDateString()}): ${todayInvoices.length}`);
          
          resolve({ rows: parsedData, invoices });
        } catch (error) {
          reject(error);
        }
      };
      
        reader.onerror = (error) => {
          console.error('FileReader error:', error);
          console.error('File details:', {
            name: file.name,
            size: file.size,
            type: file.type,
            lastModified: file.lastModified
          });
          reject(new Error('Failed to read file. Please ensure the file is not corrupted and try again.'));
        };
        
        reader.onabort = () => {
          console.log('File reading was aborted by user or browser');
          reject(new Error('File reading was cancelled. Please try again.'));
        };
      
      reader.readAsArrayBuffer(file);
    });
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      setFile(droppedFile);
      
      const loadingToast = toast.loading("Parsing file...", {
        duration: 0 // Prevent auto-dismiss
      });
      
      try {
        // Add timeout for mobile devices (reduce to 10 seconds for mobile)
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
          || (window.innerWidth < 768 && ('ontouchstart' in window));
        
        const timeoutDuration = isMobile ? 10000 : 15000; // 10s mobile, 15s desktop
        
        const parsePromise = parseFile(droppedFile);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('File parsing timeout - please try a smaller file')), timeoutDuration)
        );
        
        const { rows, invoices } = await Promise.race([parsePromise, timeoutPromise]) as { rows: UploadedRow[], invoices: InvoiceData[] };
        
        // Validate results
        if (!rows || !invoices) {
          throw new Error('Invalid file format - no data found');
        }
        
        // Show progress for large files on mobile
        if (isMobile && rows.length > 100) {
          toast.loading(`Processing ${rows.length} records...`, { id: 'processing' });
        }
        
        setUploadedData(rows);
        setProcessedInvoices(invoices);
        setUploadStage('validate');
        toast.dismiss(loadingToast);
        toast.dismiss('processing');
        toast.success(`File uploaded successfully! Found ${rows.length} records from ${invoices.length} invoices.`);
      } catch (error) {
        toast.dismiss(loadingToast);
        toast.dismiss('processing');
        console.error('File parsing error:', error);
        
        // More specific error messages for mobile
        let errorMessage = "Error parsing file. Please check the file format and try again.";
        if (error instanceof Error) {
          if (error.message.includes('timeout')) {
            errorMessage = "File is too large or complex for mobile processing. Please try a smaller file.";
          } else if (error.message.includes('File too large')) {
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
              || (window.innerWidth < 768 && ('ontouchstart' in window));
            const maxSize = isMobile ? '5MB' : '10MB';
            errorMessage = `File is too large. Please use files smaller than ${maxSize}.`;
          } else if (error.message.includes('No data found')) {
            errorMessage = "No data found in the file. Please check the file format.";
          } else if (error.message.includes('too many rows')) {
            errorMessage = "File has too many rows for mobile processing. Please use a file with fewer than 500 rows.";
          } else if (error.message.includes('No headers found')) {
            errorMessage = "File format is invalid. Please ensure your Excel file has proper column headers.";
          } else if (error.message.includes('File parsing failed')) {
            errorMessage = "Unable to read the Excel file. Please ensure it's a valid .xlsx or .xls file and try again.";
          } else {
            errorMessage = error.message;
          }
        }
        
        toast.error(errorMessage);
        
        // Reset file state on error
        setFile(null);
        setUploadedData([]);
        setProcessedInvoices([]);
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      
      const loadingToast = toast.loading("Parsing file...", {
        duration: 0 // Prevent auto-dismiss
      });
      
      try {
        // Add timeout for mobile devices (reduce to 10 seconds for mobile)
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
          || (window.innerWidth < 768 && ('ontouchstart' in window));
        
        const timeoutDuration = isMobile ? 10000 : 15000; // 10s mobile, 15s desktop
        
        const parsePromise = parseFile(selectedFile);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('File parsing timeout - please try a smaller file')), timeoutDuration)
        );
        
        const { rows, invoices } = await Promise.race([parsePromise, timeoutPromise]) as { rows: UploadedRow[], invoices: InvoiceData[] };
        
        // Validate results
        if (!rows || !invoices) {
          throw new Error('Invalid file format - no data found');
        }
        
        // Show progress for large files on mobile
        if (isMobile && rows.length > 100) {
          toast.loading(`Processing ${rows.length} records...`, { id: 'processing' });
        }
        
        setUploadedData(rows);
        setProcessedInvoices(invoices);
        setUploadStage('validate');
        toast.dismiss(loadingToast);
        toast.dismiss('processing');
        toast.success(`File uploaded successfully! Found ${rows.length} records from ${invoices.length} invoices.`);
      } catch (error) {
        toast.dismiss(loadingToast);
        toast.dismiss('processing');
        console.error('File parsing error:', error);
        
        // More specific error messages for mobile
        let errorMessage = "Error parsing file. Please check the file format and try again.";
        if (error instanceof Error) {
          if (error.message.includes('timeout')) {
            errorMessage = "File is too large or complex for mobile processing. Please try a smaller file.";
          } else if (error.message.includes('File too large')) {
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
              || (window.innerWidth < 768 && ('ontouchstart' in window));
            const maxSize = isMobile ? '5MB' : '10MB';
            errorMessage = `File is too large. Please use files smaller than ${maxSize}.`;
          } else if (error.message.includes('No data found')) {
            errorMessage = "No data found in the file. Please check the file format.";
          } else if (error.message.includes('too many rows')) {
            errorMessage = "File has too many rows for mobile processing. Please use a file with fewer than 500 rows.";
          } else if (error.message.includes('No headers found')) {
            errorMessage = "File format is invalid. Please ensure your Excel file has proper column headers.";
          } else if (error.message.includes('File parsing failed')) {
            errorMessage = "Unable to read the Excel file. Please ensure it's a valid .xlsx or .xls file and try again.";
          } else {
            errorMessage = error.message;
          }
        }
        
        toast.error(errorMessage);
        
        // Reset file state on error
        setFile(null);
        setUploadedData([]);
        setProcessedInvoices([]);
      }
    }
  };

  const handleImport = () => {
    // Add invoices to shared session
    addInvoices(processedInvoices, currentUser);
    setUploadStage('complete');
    toast.success(`Data imported successfully by ${currentUser}!`, {
      description: "Invoices are now available for all users to audit"
    });
  };

  // Calculate validation results from actual uploaded data
  const validationResults = {
    total: uploadedData.length,
    valid: uploadedData.filter(row => row.status === 'valid').length,
    errors: uploadedData.filter(row => row.status === 'error').length,
    warnings: uploadedData.filter(row => row.status === 'warning').length
  };

  // Doc Audit data and handlers
  // Helper function to check if a date is today
  const isToday = (date: Date): boolean => {
  const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };

  // Use shared invoices from session - show only today's non-dispatched invoices
  const invoices = sharedInvoices.length > 0 
    ? sharedInvoices.filter(inv => 
        !inv.dispatchedBy && // Hide dispatched invoices
        isToday(inv.invoiceDate) // Only show invoices scheduled for today
      )
      : [
          { id: "No Data", customer: "Please upload sales data first", totalQty: 0, binCapacity: 0, expectedBins: 0, scannedBins: 0, binsLoaded: 0, auditComplete: false, invoiceDate: new Date(), items: [] }
        ];

  const currentInvoice = invoices.find(inv => inv.id === selectedInvoice);
  const progress = currentInvoice ? (currentInvoice.scannedBins / currentInvoice.expectedBins) * 100 : 0;

  // Clear validated bins when invoice selection changes
  useEffect(() => {
    setValidatedBins([]);
    setCustomerScan(null);
    setAutolivScan(null);
  }, [selectedInvoice]);

  // Clear selected invoice in Doc Audit if it gets dispatched
  useEffect(() => {
    if (selectedInvoice) {
      const invoice = sharedInvoices.find(inv => inv.id === selectedInvoice);
      if (invoice?.dispatchedBy) {
        setSelectedInvoice("");
        toast.info("This invoice has been dispatched and removed from the workflow");
      }
    }
  }, [sharedInvoices, selectedInvoice]);

  // Clear selected invoices in Dispatch if they've been dispatched
  useEffect(() => {
    if (selectedInvoices.length > 0) {
      const stillAvailable = selectedInvoices.filter(id => {
        const invoice = sharedInvoices.find(inv => inv.id === id);
        return invoice && !invoice.dispatchedBy;
      });
      
      if (stillAvailable.length !== selectedInvoices.length) {
        setSelectedInvoices(stillAvailable);
        if (stillAvailable.length === 0) {
          toast.info("Selected invoices have been dispatched and removed from the list");
        }
      }
    }
  }, [sharedInvoices, selectedInvoices]);

  // Auto-validate when both barcodes are scanned
  useEffect(() => {
    if (customerScan && autolivScan) {
      // Automatically trigger validation
      handleValidateBarcodes();
    }
  }, [customerScan, autolivScan]);

  const handleValidateBarcodes = () => {
    if (!customerScan || !autolivScan) {
      toast.error("Please scan both barcodes");
      return;
    }
    
    // Check if barcodes match (comparing raw values)
    const barcodesMatch = customerScan.rawValue.trim() === autolivScan.rawValue.trim();
    
    if (barcodesMatch) {
      // Create new validated bin entry using extracted barcode data
      const newBin = {
        binNo: customerScan.binNumber, // Use actual bin number from barcode
        partCode: customerScan.partCode, // Use actual part code from barcode
        qty: parseInt(customerScan.quantity) || 1, // Use actual quantity from barcode
        status: 'matched',
        scannedBy: currentUser,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        customerBarcode: customerScan.rawValue,
        autolivBarcode: autolivScan.rawValue
      };
      
      // Add to validated bins list
      setValidatedBins(prev => [...prev, newBin]);
      
      // Update the current invoice's scanned bins count in shared session
      if (currentInvoice) {
        const newScannedCount = currentInvoice.scannedBins + 1;
        const isComplete = newScannedCount >= currentInvoice.expectedBins;
        
        updateInvoiceAudit(currentInvoice.id, {
                scannedBins: newScannedCount,
                auditComplete: isComplete,
                auditDate: isComplete ? new Date() : currentInvoice.auditDate,
                validatedBarcodes: [
                  ...(currentInvoice.validatedBarcodes || []), 
                  { customerBarcode: customerScan.rawValue, autolivBarcode: autolivScan.rawValue }
                ]
              }, currentUser);
        
        if (isComplete) {
          toast.success(`🎉 Invoice audit completed by ${currentUser}!`, {
            description: `All ${currentInvoice.expectedBins} items have been scanned and validated. Available for dispatch.`
          });
        }
      }
      
      toast.success("✅ Barcodes matched! Item added to list.", {
        description: `${newBin.partCode} - Qty: ${newBin.qty} - ${newBin.binNo}`
      });
      
      // Clear the input fields
      setCustomerScan(null);
      setAutolivScan(null);
    } else {
      // Barcodes don't match - automatically send approval request and record mismatch
      const currentInvoice = sharedInvoices.find(inv => inv.id === selectedInvoice);
      
      // Record the mismatch in the system
      if (currentInvoice) {
        addMismatchAlert({
          user: currentUser,
          customer: currentInvoice.customer,
          invoiceId: currentInvoice.id,
          step: 'doc-audit',
          customerScan: {
            partCode: customerScan.partCode,
            quantity: customerScan.quantity,
            binNumber: customerScan.binNumber,
            rawValue: customerScan.rawValue
          },
          autolivScan: {
            partCode: autolivScan.partCode,
            quantity: autolivScan.quantity,
            binNumber: autolivScan.binNumber,
            rawValue: autolivScan.rawValue
          }
        });
      }
      
      toast.error("⚠️ Barcode Mismatch Detected!", {
        description: "The customer barcode and Autoliv barcode do not match.",
        duration: 5000,
      });
      
      // Automatically show approval message
      setTimeout(() => {
        toast.info("📨 Message sent to senior for approval", {
          description: "Request has been sent to supervisor for correction.",
          duration: 5000,
        });
      }, 500);
    }
  };

  // Dispatch handlers
  const getExpectedBarcodes = () => {
    const selectedInvoiceData = sharedInvoices.filter(inv => 
      selectedInvoices.includes(inv.id) && inv.auditComplete
    );
    return selectedInvoiceData.flatMap(inv => inv.validatedBarcodes || []);
  };

  // Get next unscanned barcode pair for dispatch
  const getNextUnscannedBarcodePair = () => {
    const expectedBarcodes = getExpectedBarcodes();
    return expectedBarcodes.find(pair => 
      !loadedBarcodes.find(loaded => 
        loaded.customerBarcode === pair.customerBarcode && 
        loaded.autolivBarcode === pair.autolivBarcode
      )
    );
  };

  // Auto-validate dispatch when both barcodes are scanned
  useEffect(() => {
    if (dispatchCustomerScan && dispatchAutolivScan) {
      // Automatically trigger validation for dispatch
      handleDispatchScan();
    }
  }, [dispatchCustomerScan, dispatchAutolivScan]);

  const handleDispatchScan = () => {
    if (!dispatchCustomerScan || !dispatchAutolivScan) {
      toast.error("Please scan both barcodes");
      return;
    }

    // Check if customer and autoliv scans match each other (same data)
    const customerAutolivMatch = 
      dispatchCustomerScan.partCode === dispatchAutolivScan.partCode &&
      dispatchCustomerScan.quantity === dispatchAutolivScan.quantity &&
      dispatchCustomerScan.binNumber === dispatchAutolivScan.binNumber;

    if (!customerAutolivMatch) {
      // Record the mismatch in the system for Loading & Dispatch
      const currentInvoice = sharedInvoices.find(inv => 
        selectedInvoices.includes(inv.id) && inv.auditComplete
      );
      
      if (currentInvoice) {
        addMismatchAlert({
          user: currentUser,
          customer: currentInvoice.customer,
          invoiceId: currentInvoice.id,
          step: 'loading-dispatch',
          customerScan: {
            partCode: dispatchCustomerScan.partCode,
            quantity: dispatchCustomerScan.quantity,
            binNumber: dispatchCustomerScan.binNumber,
            rawValue: dispatchCustomerScan.rawValue
          },
          autolivScan: {
            partCode: dispatchAutolivScan.partCode,
            quantity: dispatchAutolivScan.quantity,
            binNumber: dispatchAutolivScan.binNumber,
            rawValue: dispatchAutolivScan.rawValue
          }
        });
      }
      
      toast.error("⚠️ Barcode Mismatch Detected!", {
        description: "The customer barcode and Autoliv barcode do not match.",
        duration: 5000,
      });
      
      // Automatically show approval message
      setTimeout(() => {
        toast.info("📨 Message sent to senior for approval", {
          description: "Request has been sent to supervisor for correction.",
          duration: 5000,
        });
      }, 500);
      return;
    }

    // Check if already loaded (based on barcode data)
    const alreadyLoaded = loadedBarcodes.find(pair => 
      pair.customerBarcode === dispatchCustomerScan.rawValue && 
      pair.autolivBarcode === dispatchAutolivScan.rawValue
    );

    if (alreadyLoaded) {
      toast.error("⚠️ Already Loaded!", {
        description: "This item has already been loaded onto the vehicle.",
      });
      return;
    }

    // Add to loaded list with the scanned barcode rawValues
    const newPair: ValidatedBarcodePair = {
      customerBarcode: dispatchCustomerScan.rawValue,
      autolivBarcode: dispatchAutolivScan.rawValue
    };
    
    setLoadedBarcodes(prev => [...prev, newPair]);
    
    // Update the invoice's binsLoaded count
    selectedInvoices.forEach(invoiceId => {
      const invoice = sharedInvoices.find(inv => inv.id === invoiceId);
      if (invoice) {
        invoice.binsLoaded = (invoice.binsLoaded || 0) + 1;
      }
    });
    
    toast.success("✅ Item loaded successfully!", {
      description: `${dispatchCustomerScan.partCode} - Qty: ${dispatchCustomerScan.quantity} - ${dispatchCustomerScan.binNumber}`
    });
    
    // Clear the input fields
    setDispatchCustomerScan(null);
    setDispatchAutolivScan(null);
  };

  const handleGenerateGatepass = () => {
    if (!vehicleNumber) {
      toast.error("Please enter vehicle number");
      return;
    }
    if (selectedInvoices.length === 0) {
      toast.error("Please select at least one invoice");
      return;
    }

    const expectedBarcodes = getExpectedBarcodes();
    if (loadedBarcodes.length < expectedBarcodes.length) {
      toast.error("⚠️ Not All Items Loaded!", {
        description: `Please scan all items. Loaded: ${loadedBarcodes.length}/${expectedBarcodes.length}`,
      });
      return;
    }

    // Mark invoices as dispatched by current user
    const dispatchedInvoicesList = selectedInvoices.join(', ');
    selectedInvoices.forEach(invoiceId => {
      updateInvoiceDispatch(invoiceId, currentUser);
    });

    setGatepassGenerated(true);
    toast.success(`✅ Gatepass generated successfully by ${currentUser}!`, {
      description: `Vehicle ${vehicleNumber} dispatched with ${selectedInvoices.length} invoice(s). Invoices removed from workflow.`,
      duration: 6000
    });
  };

  const toggleInvoice = (invoiceId: string) => {
    const invoice = sharedInvoices.find(inv => inv.id === invoiceId);
    if (!invoice) return;

    // If deselecting, just remove it
    if (selectedInvoices.includes(invoiceId)) {
      setSelectedInvoices(prev => prev.filter(id => id !== invoiceId));
      // Clear loaded barcodes when selection changes
      setLoadedBarcodes([]);
      setDispatchCustomerScan(null);
      setDispatchAutolivScan(null);
      return;
    }

    // If selecting, check if it's the same customer
    if (selectedInvoices.length > 0) {
      const firstSelectedInvoice = sharedInvoices.find(inv => inv.id === selectedInvoices[0]);
      if (firstSelectedInvoice && firstSelectedInvoice.customer !== invoice.customer) {
        toast.error("❌ Different Customer Not Allowed!", {
          description: `Cannot load ${invoice.customer} with ${firstSelectedInvoice.customer}. Only same customer invoices can be loaded on one vehicle.`,
          duration: 5000,
        });
        return;
      }
    }

    // Add to selection
    setSelectedInvoices(prev => [...prev, invoiceId]);
    // Clear loaded barcodes when selection changes
    setLoadedBarcodes([]);
    setDispatchCustomerScan(null);
    setDispatchAutolivScan(null);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-primary rounded-lg">
                <Package className="h-5 w-5 sm:h-6 sm:w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-foreground">Manufacturing Dispatch</h1>
                <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">Factory Operations Management</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
              <Badge variant="outline" className="text-xs sm:text-sm px-2 sm:px-3 py-1">
                <div className="h-2 w-2 bg-success rounded-full mr-1 sm:mr-2 animate-pulse" />
                <span className="hidden sm:inline">System </span>Online
              </Badge>
              <Badge className="text-xs sm:text-sm px-2 sm:px-3 py-1 bg-primary">
                <Users className="h-3 w-3 mr-1" />
                {currentUser}
              </Badge>
              <div className="text-right hidden md:block">
                <p className="text-sm font-medium">{currentUser}</p>
                <p className="text-xs text-muted-foreground">Multi-Session Mode</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Buttons */}
      <div className="bg-background border-b border-border overflow-x-auto">
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex gap-2 sm:gap-3 min-w-max sm:min-w-0">
            <Button
              variant={activeView === 'dashboard' ? 'default' : 'outline'}
              onClick={() => setActiveView('dashboard')}
              className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-4"
            >
              <Home className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Dashboard</span>
              <span className="sm:hidden">Home</span>
            </Button>
            <Button
              variant={activeView === 'upload' ? 'default' : 'outline'}
              onClick={() => setActiveView('upload')}
              className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-4"
            >
              <Upload className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Upload Sales Data</span>
              <span className="sm:hidden">Upload</span>
            </Button>
            <Button
              variant={activeView === 'doc-audit' ? 'default' : 'outline'}
              onClick={() => setActiveView('doc-audit')}
              className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-4"
            >
              <ScanBarcode className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Doc Audit</span>
              <span className="sm:hidden">Audit</span>
            </Button>
            <Button
              variant={activeView === 'dispatch' ? 'default' : 'outline'}
              onClick={() => setActiveView('dispatch')}
              className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-4"
            >
              <Truck className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Loading & Dispatch</span>
              <span className="sm:hidden">Dispatch</span>
            </Button>
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 sm:px-6 py-4 sm:py-8 pb-24 sm:pb-8">
        {/* Dashboard View */}
        {activeView === 'dashboard' && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {kpis.map((kpi, index) => (
                <Card key={index} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">{kpi.title}</p>
                        <h3 className="text-3xl font-bold text-foreground mb-1">{kpi.value}</h3>
                        <p className="text-xs text-muted-foreground">{kpi.subtitle}</p>
                      </div>
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <kpi.icon className="h-5 w-5 text-primary" />
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-border">
                      <span className={`text-xs font-semibold ${
                        kpi.trend === 'Active' || kpi.trend === 'Available' || kpi.trend === 'Pending' ? 'text-primary' : 
                        kpi.trend === 'Clear' || kpi.trend === 'None' || kpi.trend === 'Empty' ? 'text-muted-foreground' : 
                        kpi.trend.includes('+') ? 'text-success' : 
                        kpi.trend.includes('-') ? 'text-muted-foreground' : 
                        'text-destructive'
                      }`}>
                        {kpi.trend}
                      </span>
                      <span className="text-xs text-muted-foreground ml-1">
                        {kpi.trend === 'Active' || kpi.trend === 'Available' || kpi.trend === 'Pending' || kpi.trend === 'Clear' || kpi.trend === 'None' || kpi.trend === 'Empty' ? 'status' : 'vs last period'}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Other System Modules */}
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-4 text-foreground">Other System Modules</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {otherModules.map((module, index) => {
                const isAdminOnly = module.title === "Exception Alerts" || module.title === "Master Data";
                const hasPermission = !isAdminOnly || currentUser === "Admin";
                
                return (
                  <div key={index}>
                    {hasPermission ? (
                      <Link to={module.link}>
                  <Card className="hover:shadow-lg transition-all hover:scale-[1.02] cursor-pointer h-full">
                    <CardHeader>
                            <div className="flex items-start justify-between mb-3">
                              <div className={`p-4 ${module.bgColor} rounded-lg w-fit`}>
                        <module.icon className={`h-8 w-8 ${module.color}`} />
                              </div>
                              {module.title === "Exception Alerts" && getPendingMismatches().length > 0 && (
                                <Badge variant="destructive" className="text-sm">
                                  {getPendingMismatches().length} Pending
                                </Badge>
                              )}
                      </div>
                      <CardTitle className="text-xl">{module.title}</CardTitle>
                      <CardDescription className="text-base">{module.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button variant="outline" className="w-full">
                        Open Module
                      </Button>
                    </CardContent>
                  </Card>
                </Link>
                    ) : (
                      <Card className="opacity-60 cursor-not-allowed h-full">
                        <CardHeader>
                          <div className="flex items-start justify-between mb-3">
                            <div className={`p-4 ${module.bgColor} rounded-lg w-fit`}>
                              <module.icon className={`h-8 w-8 ${module.color}`} />
                            </div>
                            <Badge variant="secondary" className="text-xs">
                              Admin Only
                            </Badge>
                          </div>
                          <CardTitle className="text-xl">{module.title}</CardTitle>
                          <CardDescription className="text-base">{module.description}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <Button 
                            variant="outline" 
                            className="w-full cursor-not-allowed" 
                            onClick={() => {
                              toast.error("Permission Denied", {
                                description: "Only Admin users can access this module.",
                                duration: 4000,
                              });
                            }}
                          >
                            🔒 Permission Denied
                          </Button>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Upload Sales Data View */}
        {activeView === 'upload' && (
          <div className="max-w-5xl mx-auto">
            {/* Header with Back Button and Logs */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-0 mb-4">
              <Button
                variant="outline"
                onClick={() => setActiveView('dashboard')}
                className="flex items-center gap-2 justify-center sm:justify-start"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Back to Dashboard</span>
                <span className="sm:hidden">Back</span>
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowUploadLogs(true)}
                className="flex items-center gap-2 justify-center"
              >
                <FileSpreadsheet className="h-4 w-4" />
                <span className="hidden sm:inline">Upload Logs</span>
                <span className="sm:hidden">Logs</span>
                {getUploadLogs().length > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {getUploadLogs().length}
                  </Badge>
                )}
              </Button>
            </div>
            
            {/* Progress Steps */}
            <div className="flex items-center justify-center mb-8">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center font-semibold ${
                    uploadStage === 'upload' ? 'bg-primary text-primary-foreground' : 'bg-success text-success-foreground'
                  }`}>
                    1
                  </div>
                  <span className="text-sm font-medium">Upload</span>
                </div>
                <div className={`h-1 w-20 ${uploadStage !== 'upload' ? 'bg-success' : 'bg-border'}`} />
                <div className="flex items-center gap-2">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center font-semibold ${
                    uploadStage === 'validate' ? 'bg-primary text-primary-foreground' : 
                    uploadStage === 'complete' ? 'bg-success text-success-foreground' : 
                    'bg-muted text-muted-foreground'
                  }`}>
                    2
                  </div>
                  <span className="text-sm font-medium">Validate</span>
                </div>
                <div className={`h-1 w-20 ${uploadStage === 'complete' ? 'bg-success' : 'bg-border'}`} />
                <div className="flex items-center gap-2">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center font-semibold ${
                    uploadStage === 'complete' ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground'
                  }`}>
                    3
                  </div>
                  <span className="text-sm font-medium">Import</span>
                </div>
              </div>
            </div>

            {/* Upload Stage */}
            {uploadStage === 'upload' && (
              <Card>
                <CardHeader>
                  <CardTitle>Select Excel File</CardTitle>
                  <CardDescription>Upload an Excel file containing sales order data</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <p className="text-sm font-medium mb-2">Expected File Format:</p>
                    <p className="text-xs text-muted-foreground mb-2">Your Excel/CSV file should contain the following columns:</p>
                    <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                      <li><strong>Invoice Number</strong> (or Invoice, Invoice No) - Invoice number</li>
                      <li><strong>Cust Name</strong> (or Customer, Customer Name) - Customer name</li>
                      <li><strong>Item Number</strong> (or Part, Part Code) - Part code/number</li>
                      <li><strong>Quantity Invoiced</strong> (or Qty, Quantity) - Quantity (number)</li>
                    </ul>
                    <p className="text-xs text-muted-foreground mt-2 italic">
                      Note: Column names are flexible. Try the sample file: <strong>sales_dump_dummy.xlsx</strong> in the public folder
                    </p>
                  </div>
                  <div
                    className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                      dragActive ? 'border-primary bg-primary/5' : 'border-border'
                    }`}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                  >
                    <div className="flex flex-col items-center gap-4">
                      <div className="p-4 bg-primary/10 rounded-full">
                        <Upload className="h-12 w-12 text-primary" />
                      </div>
                      <div>
                        <p className="text-lg font-medium mb-2">Drag and drop your file here</p>
                        <p className="text-sm text-muted-foreground mb-4">or</p>
                        <Button 
                          type="button" 
                          variant="outline"
                          onClick={() => document.getElementById('file-upload')?.click()}
                        >
                          Browse Files
                        </Button>
                        <input
                          id="file-upload"
                          type="file"
                          className="hidden"
                          accept=".xlsx,.xls,.csv"
                          onChange={handleFileChange}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">Supported formats: .xlsx, .xls, .csv</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Validate Stage */}
            {uploadStage === 'validate' && (
              <div className="space-y-6">
                {/* Back Button for Validate Stage */}
                <Button
                  variant="ghost"
                  onClick={() => {
                    setUploadStage('upload');
                    setFile(null);
                    setUploadedData([]);
                    setProcessedInvoices([]);
                  }}
                  className="flex items-center gap-2 text-sm sm:text-base"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Back to Upload</span>
                  <span className="sm:hidden">Back</span>
                </Button>
                
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <FileSpreadsheet className="h-6 w-6 text-primary" />
                      <div>
                        <CardTitle>File Preview</CardTitle>
                        <CardDescription>{file?.name}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {/* Validation Summary */}
                      <div className="grid grid-cols-4 gap-4">
                        <div className="bg-muted rounded-lg p-4">
                          <p className="text-2xl font-bold text-foreground">{validationResults.total}</p>
                          <p className="text-sm text-muted-foreground">Total Records</p>
                        </div>
                        <div className="bg-success/10 rounded-lg p-4">
                          <p className="text-2xl font-bold text-success">{validationResults.valid}</p>
                          <p className="text-sm text-muted-foreground">Valid</p>
                        </div>
                        <div className="bg-destructive/10 rounded-lg p-4">
                          <p className="text-2xl font-bold text-destructive">{validationResults.errors}</p>
                          <p className="text-sm text-muted-foreground">Errors</p>
                        </div>
                        <div className="bg-warning/10 rounded-lg p-4">
                          <p className="text-2xl font-bold text-warning">{validationResults.warnings}</p>
                          <p className="text-sm text-muted-foreground">Warnings</p>
                        </div>
                      </div>

                      {/* Actual Data Table */}
                      <div className="border rounded-lg overflow-hidden max-h-96 overflow-x-auto overflow-y-auto">
                        <table className="w-full text-xs sm:text-sm min-w-[600px]">
                          <thead className="bg-muted sticky top-0">
                            <tr>
                              <th className="text-left p-3 font-semibold">Invoice No</th>
                              <th className="text-left p-3 font-semibold">Customer</th>
                              <th className="text-left p-3 font-semibold">Part Code</th>
                              <th className="text-left p-3 font-semibold">Qty</th>
                              <th className="text-left p-3 font-semibold">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {uploadedData.length > 0 ? (
                              uploadedData.map((row, i) => (
                                <tr key={i} className="border-t hover:bg-muted/50">
                                  <td className="p-3">{row.invoice}</td>
                                  <td className="p-3">{row.customer}</td>
                                  <td className="p-3">{row.part}</td>
                                  <td className="p-3">{row.qty}</td>
                                  <td className="p-3">
                                    <Badge variant={
                                      row.status === 'valid' ? 'default' : 
                                      row.status === 'error' ? 'destructive' : 
                                      'outline'
                                    }>
                                      {row.status === 'valid' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                                      {row.status === 'error' && <XCircle className="h-3 w-3 mr-1" />}
                                      {row.status === 'warning' && <AlertTriangle className="h-3 w-3 mr-1" />}
                                      {row.status}
                                      {row.errorMessage && ` - ${row.errorMessage}`}
                                    </Badge>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={5} className="p-8 text-center text-muted-foreground">
                                  No data available
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-3">
                        <Button 
                          onClick={handleImport} 
                          className="flex-1"
                          disabled={validationResults.errors > 0}
                        >
                          Import & Schedule Dispatch
                        </Button>
                        <Button 
                          variant="outline" 
                          onClick={() => {
                            setUploadStage('upload');
                            setFile(null);
                            setUploadedData([]);
                            setProcessedInvoices([]);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                      {validationResults.errors > 0 && (
                        <p className="text-sm text-destructive">
                          Please fix {validationResults.errors} error(s) before importing
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Complete Stage */}
            {uploadStage === 'complete' && (
              <>
                {/* Back Button for Complete Stage */}
                <Button
                  variant="ghost"
                  onClick={() => setActiveView('dashboard')}
                  className="flex items-center gap-2 mb-4 text-sm sm:text-base"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Back to Dashboard</span>
                  <span className="sm:hidden">Back</span>
                </Button>
                
              <Card>
                <CardContent className="pt-12 pb-12 text-center">
                  <div className="flex flex-col items-center gap-4">
                    <div className="p-4 bg-success/10 rounded-full">
                      <CheckCircle2 className="h-16 w-16 text-success" />
                    </div>
                    <h2 className="text-2xl font-bold">Data Imported Successfully!</h2>
                    <p className="text-muted-foreground max-w-md">
                      {validationResults.valid} records have been imported and scheduled for dispatch.
                    </p>
                    <div className="flex gap-3 mt-4">
                      <Button onClick={() => setActiveView('dashboard')}>
                        Return to Dashboard
                      </Button>
                      <Button 
                        variant="outline"
                        onClick={() => {
                          setUploadStage('upload');
                          setFile(null);
                          setUploadedData([]);
                          setProcessedInvoices([]);
                        }}
                      >
                        Upload Another File
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
              </>
            )}
          </div>
        )}

        {/* Doc Audit View */}
        {activeView === 'doc-audit' && (
          <>
            {/* Header with Back Button and Logs */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-0 mb-4">
              <Button
                variant="outline"
                onClick={() => {
                  setActiveView('dashboard');
                  setSelectedInvoice("");
                  setCustomerScan(null);
                  setAutolivScan(null);
                  setValidatedBins([]);
                }}
                className="flex items-center gap-2 justify-center sm:justify-start"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Back to Dashboard</span>
                <span className="sm:hidden">Back</span>
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowAuditLogs(true)}
                className="flex items-center gap-2 justify-center"
              >
                <ScanBarcode className="h-4 w-4" />
                <span className="hidden sm:inline">Audit Logs</span>
                <span className="sm:hidden">Logs</span>
                {getAuditLogs().length > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {getAuditLogs().length}
                  </Badge>
                )}
              </Button>
            </div>
            
            {sharedInvoices.length === 0 && (
              <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-sm font-medium">
                  ⚠️ No data uploaded yet. Please go to <strong>Upload Sales Data</strong> to import invoice data first.
                </p>
              </div>
            )}
            
            {sharedInvoices.length > 0 && (
              <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-sm font-medium mb-2">
                  📊 Multi-Session Management Active
                </p>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>• Showing available invoices (dispatched invoices auto-removed)</p>
                  <p>• Any user can audit any uploaded invoice</p>
                  <p>• Current user: <strong>{currentUser}</strong></p>
                  {sharedInvoices.filter(inv => inv.dispatchedBy).length > 0 && (
                    <p>• ✅ <strong>{sharedInvoices.filter(inv => inv.dispatchedBy).length}</strong> invoice(s) already dispatched</p>
                  )}
                </div>
              </div>
            )}
            
            {/* Invoice Selection */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Select Invoice</CardTitle>
                <CardDescription>Choose an invoice to begin document audit (Showing today's invoices only)</CardDescription>
              </CardHeader>
              <CardContent>
                {invoices.length === 1 && invoices[0].id === "No Data" ? (
                  <div className="p-4 bg-muted rounded-lg text-center">
                    <p className="text-sm text-muted-foreground">No invoices scheduled for today</p>
                  </div>
                ) : (
                  <>
                    <div className="mb-3 p-2 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center justify-between gap-2">
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        📅 Showing {invoices.filter(inv => inv.id !== "No Data").length} invoice(s) scheduled for {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowCalendar(true)}
                        className="h-7 px-2 text-xs flex items-center gap-1 bg-white dark:bg-gray-800"
                      >
                        <CalendarIcon className="h-3 w-3" />
                        View Schedule
                      </Button>
                    </div>
                <Select value={selectedInvoice} onValueChange={setSelectedInvoice}>
                  <SelectTrigger className="h-12 text-base">
                    <SelectValue placeholder="Select an invoice" />
                  </SelectTrigger>
                  <SelectContent>
                    {invoices.map(invoice => (
                      <SelectItem key={invoice.id} value={invoice.id}>
                        {invoice.id} - {invoice.customer} ({invoice.scannedBins}/{invoice.expectedBins} BINs)
                            {invoice.uploadedBy && ` [Uploaded by: ${invoice.uploadedBy}]`}
                            {invoice.auditedBy && ` [Audited by: ${invoice.auditedBy}]`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                  </>
                )}

                {currentInvoice && (
                  <div className="mt-6 p-4 bg-muted rounded-lg">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-3">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Invoice No</p>
                        <p className="font-semibold">{currentInvoice.id}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Customer</p>
                        <p className="font-semibold">{currentInvoice.customer}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Total Quantity</p>
                        <p className="font-semibold">{currentInvoice.totalQty}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap pt-2 border-t border-border">
                      {currentInvoice.uploadedBy && (
                        <Badge variant="outline" className="text-xs">
                          <Upload className="h-3 w-3 mr-1" />
                          Uploaded by: {currentInvoice.uploadedBy}
                        </Badge>
                      )}
                      {currentInvoice.auditedBy && (
                        <Badge variant="default" className="text-xs">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Audited by: {currentInvoice.auditedBy}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Scanning Interface */}
            {selectedInvoice && (
              <>
                {/* Back to Invoice Selection */}
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSelectedInvoice("");
                    setCustomerScan("");
                    setAutolivScan("");
                  }}
                  className="flex items-center gap-2 mb-4 text-sm sm:text-base"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Change Invoice</span>
                  <span className="sm:hidden">Back</span>
                </Button>
                
              <Card className="mb-6">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <ScanBarcode className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Barcode Scanning & Validation</CardTitle>
                      <CardDescription>Scan both customer and Autoliv labels to validate</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                      {/* Customer Label Scan */}
                      <div className="space-y-2">
                        <Label htmlFor="customer-barcode" className="flex items-center gap-2">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">1</span>
                          Customer Label
                        </Label>
                        {customerScan && (
                          <div className="p-3 bg-muted rounded-lg">
                            <p className="text-xs font-semibold text-muted-foreground mb-2">Scanned Data:</p>
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <p className="text-[10px] text-muted-foreground">Part Code</p>
                                <p className="text-xs font-mono font-bold">{customerScan.partCode}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-muted-foreground">Quantity</p>
                                <p className="text-xs font-mono font-bold">{customerScan.quantity}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-muted-foreground">Bin Number</p>
                                <p className="text-xs font-mono font-bold">{customerScan.binNumber}</p>
                              </div>
                            </div>
                          </div>
                        )}
                        <BarcodeScanButton
                          onScan={(data) => {
                            setCustomerScan(data);
                            toast.success("Customer barcode scanned!");
                          }}
                          label={customerScan ? "Scan Again" : "Scan Customer Barcode"}
                          variant="default"
                          matchValue={autolivScan?.rawValue || undefined}
                          shouldMismatch={!!autolivScan}
                          matchData={autolivScan || undefined}
                          totalQuantity={currentInvoice?.totalQty}
                          binCapacity={currentInvoice?.binCapacity}
                          expectedBins={currentInvoice?.expectedBins}
                          currentBinIndex={currentInvoice?.scannedBins}
                        />
                      </div>

                      {/* Autoliv Label Scan */}
                      <div className="space-y-2">
                        <Label htmlFor="autoliv-barcode" className="flex items-center gap-2">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-accent/10 text-accent text-xs font-bold">2</span>
                          Autoliv Label
                        </Label>
                        {autolivScan && (
                          <div className="p-3 bg-muted rounded-lg">
                            <p className="text-xs font-semibold text-muted-foreground mb-2">Scanned Data:</p>
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <p className="text-[10px] text-muted-foreground">Part Code</p>
                                <p className="text-xs font-mono font-bold">{autolivScan.partCode}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-muted-foreground">Quantity</p>
                                <p className="text-xs font-mono font-bold">{autolivScan.quantity}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-muted-foreground">Bin Number</p>
                                <p className="text-xs font-mono font-bold">{autolivScan.binNumber}</p>
                              </div>
                            </div>
                          </div>
                        )}
                        <BarcodeScanButton
                          onScan={(data) => {
                            setAutolivScan(data);
                            toast.success("Autoliv barcode scanned!");
                          }}
                          label={autolivScan ? "Scan Again" : "Scan Autoliv Barcode"}
                          variant="secondary"
                          matchValue={customerScan?.rawValue || undefined}
                          shouldMismatch={false}
                          matchData={customerScan || undefined}
                          totalQuantity={currentInvoice?.totalQty}
                          binCapacity={currentInvoice?.binCapacity}
                          expectedBins={currentInvoice?.expectedBins}
                          currentBinIndex={currentInvoice?.scannedBins}
                        />
                      </div>
                    </div>

                    {/* Clear Button Only */}
                    {(customerScan || autolivScan) && (
                      <div className="flex justify-end">
                      <Button 
                        variant="outline"
                        onClick={() => {
                            setCustomerScan(null);
                            setAutolivScan(null);
                        }}
                          className="h-12"
                      >
                          Clear Scans
                      </Button>
                    </div>
                    )}

                    {/* Status Indicator */}
                    {(customerScan || autolivScan) && (
                      <div className="p-3 bg-muted rounded-lg text-sm">
                        <div className="flex items-center gap-2">
                          <div className={`h-2 w-2 rounded-full ${customerScan ? 'bg-green-500' : 'bg-gray-300'}`} />
                          <span className={customerScan ? 'text-foreground' : 'text-muted-foreground'}>
                            Customer Label {customerScan ? 'Scanned' : 'Pending'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className={`h-2 w-2 rounded-full ${autolivScan ? 'bg-green-500' : 'bg-gray-300'}`} />
                          <span className={autolivScan ? 'text-foreground' : 'text-muted-foreground'}>
                            Autoliv Label {autolivScan ? 'Scanned' : 'Pending'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

            {/* Scanned BINs Table */}
              <Card>
                <CardHeader>
                  <CardTitle>Scanned BINs ({validatedBins.length})</CardTitle>
                  <CardDescription>Real-time list of scanned and validated BINs</CardDescription>
                </CardHeader>
                <CardContent>
                  {validatedBins.length > 0 ? (
                    <>
                      <div className="border rounded-lg overflow-hidden overflow-x-auto">
                        <table className="w-full text-xs sm:text-sm min-w-[600px]">
                        <thead className="bg-muted">
                          <tr>
                            <th className="text-left p-3 font-semibold">BIN No</th>
                            <th className="text-left p-3 font-semibold">Barcode</th>
                              <th className="text-left p-3 font-semibold">Quantity</th>
                            <th className="text-left p-3 font-semibold">Status</th>
                            <th className="text-left p-3 font-semibold">Scanned By</th>
                            <th className="text-left p-3 font-semibold">Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {validatedBins.map((bin, i) => (
                            <tr key={i} className="border-t hover:bg-muted/50">
                              <td className="p-3 font-mono">{bin.binNo}</td>
                              <td className="p-3 font-mono">{bin.partCode}</td>
                                <td className="p-3 font-semibold">{bin.qty}</td>
                              <td className="p-3">
                                <Badge variant={bin.status === 'matched' ? 'default' : 'destructive'}>
                                  {bin.status === 'matched' ? (
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                  ) : (
                                    <XCircle className="h-3 w-3 mr-1" />
                                  )}
                                  {bin.status}
                                </Badge>
                              </td>
                              <td className="p-3">{bin.scannedBy}</td>
                              <td className="p-3 text-muted-foreground">{bin.time}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                      
                      {/* Total Quantity Summary */}
                      <div className="mt-4 p-3 bg-primary/5 border border-primary/20 rounded-lg flex items-center justify-between">
                        <span className="text-sm font-medium text-muted-foreground">Total Quantity (Sum of all scanned bins):</span>
                        <span className="text-lg font-bold text-primary">
                          {validatedBins.reduce((sum, bin) => sum + bin.qty, 0)}
                        </span>
                      </div>
                      
                      {/* New Audit Button - appears after items are scanned */}
                      {currentInvoice?.auditComplete && (
                        <div className="mt-6 p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-green-700 dark:text-green-300 mb-1">
                                ✅ Audit Complete for {currentInvoice.id}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                All items scanned and validated. Ready for dispatch.
                              </p>
                            </div>
                            <Button
                              onClick={() => {
                                setSelectedInvoice("");
                                setCustomerScan(null);
                                setAutolivScan(null);
                                setValidatedBins([]);
                              }}
                              className="flex items-center gap-2 h-10"
                              variant="default"
                            >
                              <ScanBarcode className="h-4 w-4" />
                              New Audit
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <ScanBarcode className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium mb-2">No items scanned yet</p>
                      <p className="text-sm">Scan and validate barcodes to add items to this list</p>
                    </div>
                  )}
                </CardContent>
              </Card>
              </>
            )}
            
            {/* Calendar Schedule Dialog */}
            <Dialog open={showCalendar} onOpenChange={setShowCalendar}>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Monthly Invoice Schedule</DialogTitle>
                  <DialogDescription>
                    {sharedInvoices.length === 0 
                      ? "Upload sales data first to view invoice schedules"
                      : `View invoices scheduled for ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
                    }
                  </DialogDescription>
                </DialogHeader>
                
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Calendar */}
                  <div>
                    {sharedInvoices.length === 0 ? (
                      <div className="p-8 bg-muted rounded-lg text-center">
                        <div className="w-16 h-16 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-3">
                          <span className="text-2xl">📅</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Calendar will show invoice schedules after data upload
                        </p>
                      </div>
                    ) : (
                      <>
                        <Calendar
                          mode="single"
                          selected={selectedCalendarDate}
                          onSelect={setSelectedCalendarDate}
                          className="rounded-md border"
                        />
                        <div className="mt-3 p-3 bg-muted rounded-lg text-xs">
                          <p className="font-semibold mb-1">Instructions:</p>
                          <p className="text-muted-foreground">Click on any date to view scheduled invoices for that day</p>
                        </div>
                      </>
                    )}
                  </div>
                  
                  {/* Invoice List for Selected Date */}
                  <div>
                    <h3 className="font-semibold mb-3">
                      {selectedCalendarDate 
                        ? `Invoices for ${selectedCalendarDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`
                        : 'Select a date to view invoices'
                      }
                    </h3>
                    
                    {sharedInvoices.length === 0 ? (
                      <div className="p-8 bg-muted rounded-lg text-center">
                        <div className="mb-4">
                          <div className="w-16 h-16 mx-auto bg-blue-100 rounded-full flex items-center justify-center mb-3">
                            <span className="text-2xl">📊</span>
                          </div>
                          <h3 className="font-semibold text-lg mb-2">No Data Uploaded</h3>
                          <p className="text-sm text-muted-foreground mb-4">
                            Upload sales data first to view invoice schedules in the calendar
                          </p>
                          <Button 
                            onClick={() => {
                              setShowCalendar(false);
                              setActiveView('upload');
                            }}
                            className="w-full"
                          >
                            Go to Upload Data
                          </Button>
                        </div>
                      </div>
                    ) : selectedCalendarDate ? (
                      <div className="space-y-2">
                        {sharedInvoices.filter(inv => {
                          const invDate = new Date(inv.invoiceDate);
                          return selectedCalendarDate &&
                                 invDate.getDate() === selectedCalendarDate.getDate() &&
                                 invDate.getMonth() === selectedCalendarDate.getMonth() &&
                                 invDate.getFullYear() === selectedCalendarDate.getFullYear();
                        }).length > 0 ? (
                          sharedInvoices.filter(inv => {
                            const invDate = new Date(inv.invoiceDate);
                            return selectedCalendarDate &&
                                   invDate.getDate() === selectedCalendarDate.getDate() &&
                                   invDate.getMonth() === selectedCalendarDate.getMonth() &&
                                   invDate.getFullYear() === selectedCalendarDate.getFullYear();
                          }).map((invoice, idx) => (
                            <Card key={idx} className="border-2">
                              <CardContent className="p-4">
                                <div className="flex items-start justify-between mb-2">
                                  <div>
                                    <p className="font-semibold text-lg">{invoice.customer}</p>
                                    <p className="text-sm text-muted-foreground">{invoice.id}</p>
                                  </div>
                                  <Badge variant={invoice.dispatchedBy ? "default" : invoice.auditComplete ? "secondary" : "outline"}>
                                    {invoice.dispatchedBy ? "Dispatched" : invoice.auditComplete ? "Audited" : "Pending"}
                                  </Badge>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  <div>
                                    <p className="text-muted-foreground">Total Qty</p>
                                    <p className="font-semibold">{invoice.totalQty}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">Bins</p>
                                    <p className="font-semibold">{invoice.scannedBins}/{invoice.expectedBins}</p>
                                  </div>
                                </div>
                                {invoice.uploadedBy && (
                                  <p className="text-xs text-muted-foreground mt-2">
                                    Uploaded by: {invoice.uploadedBy}
                                  </p>
                                )}
                              </CardContent>
                            </Card>
                          ))
                        ) : (
                          <div className="p-4 bg-muted rounded-lg text-center text-sm text-muted-foreground">
                            No invoices scheduled for this date
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-8 bg-muted rounded-lg text-center text-sm text-muted-foreground">
                        Click on a date in the calendar to view scheduled invoices
                      </div>
                    )}
                    
                    {/* Monthly Summary - Only show when data exists */}
                    {sharedInvoices.length > 0 && (
                      <div className="mt-4 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                        <p className="text-sm font-semibold mb-2">This Month Summary:</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <p className="text-muted-foreground">Total Invoices</p>
                            <p className="font-bold text-lg">{sharedInvoices.length}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Dispatched</p>
                            <p className="font-bold text-lg">{sharedInvoices.filter(inv => inv.dispatchedBy).length}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}

        {/* Loading & Dispatch View */}
        {activeView === 'dispatch' && (
          <div className="max-w-5xl mx-auto">
            {/* Header with Back Button and Logs */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-0 mb-4">
              <Button
                variant="outline"
                onClick={() => {
                  setActiveView('dashboard');
                  setVehicleNumber("");
                  setSelectedInvoices([]);
                  setDispatchCustomerScan("");
                  setDispatchAutolivScan("");
                  setLoadedBarcodes([]);
                  setGatepassGenerated(false);
                }}
                className="flex items-center gap-2 justify-center sm:justify-start"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Back to Dashboard</span>
                <span className="sm:hidden">Back</span>
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowDispatchLogs(true)}
                className="flex items-center gap-2 justify-center"
              >
                <Truck className="h-4 w-4" />
                <span className="hidden sm:inline">Dispatch Logs</span>
                <span className="sm:hidden">Logs</span>
                {getDispatchLogs().length > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {getDispatchLogs().length}
                  </Badge>
                )}
              </Button>
            </div>
            
            {sharedInvoices.length === 0 && (
              <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-sm font-medium">
                  ⚠️ No data uploaded yet. Please go to <strong>Upload Sales Data</strong> to import invoice data first.
                </p>
              </div>
            )}
            
            {sharedInvoices.length > 0 && sharedInvoices.filter(inv => inv.auditComplete && !inv.dispatchedBy).length === 0 && (
              <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-sm font-medium mb-2">
                  📋 No audited invoices available for dispatch.
                </p>
                <p className="text-xs text-muted-foreground">
                  {sharedInvoices.filter(inv => inv.dispatchedBy).length > 0 
                    ? `✅ All invoices have been dispatched. Upload new data or complete pending audits.`
                    : `Please complete document audit before dispatch.`
                  }
                </p>
              </div>
            )}
            
            {sharedInvoices.length > 0 && sharedInvoices.filter(inv => inv.auditComplete && !inv.dispatchedBy).length > 0 && (
              <div className="mb-4 p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-sm font-medium mb-2">
                  ✅ Multi-Session Dispatch Available
                </p>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>• Showing audited invoices from all users (excluding dispatched)</p>
                  <p>• Any user can dispatch any audited invoice</p>
                  <p>• Current user: <strong>{currentUser}</strong></p>
                </div>
              </div>
            )}
            
            {!gatepassGenerated ? (
              <div className="space-y-6">
                {/* Vehicle Information */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Truck className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle>Vehicle Details</CardTitle>
                        <CardDescription>Enter the vehicle number for loading</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <Label htmlFor="vehicle">Vehicle Number</Label>
                      <Input
                        id="vehicle"
                        placeholder="Enter vehicle registration number"
                        value={vehicleNumber}
                        onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                        className="h-12 text-lg font-semibold"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Invoice Selection */}
                <Card>
                  <CardHeader>
                    <CardTitle>Select Invoice for Loading</CardTitle>
                    <CardDescription>Choose an audited invoice to load onto the vehicle</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="invoice-select">Select Invoice(s)</Label>
                        <div className="flex gap-2">
                          <Select 
                            value="" 
                            onValueChange={(value) => {
                              if (value && value !== "no-invoices") {
                                const selectedInvoice = sharedInvoices.find(inv => inv.id === value);
                                if (selectedInvoice) {
                                  // Check if this is the first invoice or if customer matches
                                  const currentCustomer = selectedInvoices.length > 0 
                                    ? sharedInvoices.find(inv => inv.id === selectedInvoices[0])?.customer 
                            : null;
                                  
                                  if (!currentCustomer || currentCustomer === selectedInvoice.customer) {
                                    // Add only if not already selected
                                    if (!selectedInvoices.includes(value)) {
                                      setSelectedInvoices(prev => [...prev, value]);
                                    }
                                  } else {
                                    toast.error("Cannot add invoice from different customer", {
                                      description: `All invoices must be from ${currentCustomer}`
                                    });
                                  }
                                }
                              }
                            }}
                          >
                            <SelectTrigger id="invoice-select" className="h-14 text-base flex-1">
                              <SelectValue placeholder="Select an invoice to add" />
                            </SelectTrigger>
                            <SelectContent>
                              {sharedInvoices.filter(inv => inv.auditComplete && !inv.dispatchedBy).length > 0 ? (
                                sharedInvoices.filter(inv => inv.auditComplete && !inv.dispatchedBy).map(invoice => {
                                  const currentCustomer = selectedInvoices.length > 0 
                                    ? sharedInvoices.find(inv => inv.id === selectedInvoices[0])?.customer 
                                    : null;
                                  const isDifferentCustomer = currentCustomer && currentCustomer !== invoice.customer;
                                  const isAlreadySelected = selectedInvoices.includes(invoice.id);

                          return (
                                    <SelectItem 
                              key={invoice.id}
                                      value={invoice.id} 
                                      className="py-3"
                                      disabled={isDifferentCustomer || isAlreadySelected}
                                    >
                                      <div className="flex items-center justify-between w-full gap-4">
                                        <div className="flex flex-col">
                                          <span className="font-semibold">{invoice.id}</span>
                                          <span className="text-xs text-muted-foreground">{invoice.customer}</span>
                                  </div>
                                        <div className="flex items-center gap-2">
                                          {isAlreadySelected && (
                                            <Badge variant="secondary" className="text-xs">
                                              Added
                                            </Badge>
                                          )}
                                          <Badge variant="outline" className="text-xs">
                                            Qty: {invoice.totalQty}
                                          </Badge>
                                          <Badge variant="default" className="text-xs">
                                      <CheckCircle2 className="h-3 w-3 mr-1" />
                                            Audited
                                    </Badge>
                                  </div>
                                </div>
                                    </SelectItem>
                                  );
                                })
                              ) : (
                                <SelectItem value="no-invoices" disabled>
                                  No audited invoices available
                                </SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Selected Invoices List */}
                      {selectedInvoices.length > 0 && (
                        <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-sm font-medium">
                              📦 Selected Invoice{selectedInvoices.length > 1 ? 's' : ''} ({selectedInvoices.length})
                            </p>
                            {selectedInvoices.length > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedInvoices([]);
                                  setLoadedBarcodes([]);
                                }}
                                className="h-8 text-xs"
                              >
                                Clear All
                              </Button>
                            )}
                                  </div>
                          <div className="space-y-2">
                            {selectedInvoices.map((invoiceId, index) => {
                              const invoice = sharedInvoices.find(inv => inv.id === invoiceId);
                              return invoice ? (
                                <div key={invoiceId} className="p-3 bg-white dark:bg-gray-900 border border-border rounded-lg">
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-2">
                                        <Badge variant="outline" className="text-xs">#{index + 1}</Badge>
                                        <p className="font-semibold text-sm">{invoice.id}</p>
                                        <p className="text-xs text-muted-foreground">{invoice.customer}</p>
                                </div>
                                      <div className="grid grid-cols-2 gap-2 text-xs">
                                  <div>
                                          <p className="text-muted-foreground">Items</p>
                                    <p className="font-medium">{invoice.scannedBins}/{invoice.expectedBins}</p>
                                  </div>
                                  <div>
                                          <p className="text-muted-foreground">Quantity</p>
                                    <p className="font-medium">{invoice.totalQty}</p>
                                  </div>
                                </div>
                              </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedInvoices(prev => prev.filter(id => id !== invoiceId));
                                        setLoadedBarcodes([]);
                                      }}
                                      className="h-8 w-8 p-0"
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                            </div>
                          </div>
                              ) : null;
                            })}
                          </div>
                          {selectedInvoices.length > 0 && (() => {
                            const firstInvoice = sharedInvoices.find(inv => inv.id === selectedInvoices[0]);
                            return firstInvoice ? (
                              <div className="mt-3 pt-3 border-t border-border">
                                <p className="text-xs text-muted-foreground mb-2">
                                  🚚 Loading for: <strong>{firstInvoice.customer}</strong>
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Only invoices from this customer can be added
                                </p>
                              </div>
                            ) : null;
                          })()}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Barcode Scanning for Loading */}
                {selectedInvoices.length > 0 && (
                  <Card>
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <ScanBarcode className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">Scan Items for Loading</CardTitle>
                          <CardDescription>Scan each item to load onto the vehicle</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {/* Progress Indicator */}
                        <div className="p-4 bg-muted rounded-lg">
                          <div className="flex justify-between text-sm mb-2">
                            <span className="font-medium">Loading Progress</span>
                            <span className="text-muted-foreground">
                              {loadedBarcodes.length} of {getExpectedBarcodes().length} items loaded
                            </span>
                          </div>
                          <Progress 
                            value={getExpectedBarcodes().length > 0 ? (loadedBarcodes.length / getExpectedBarcodes().length) * 100 : 0} 
                            className="h-2"
                          />
                        </div>

                        {/* Scanning Inputs */}
                        <div className="grid md:grid-cols-2 gap-6">
                          {/* Customer Label Scan */}
                          <div className="space-y-2">
                            <Label htmlFor="dispatch-customer-barcode" className="flex items-center gap-2">
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">1</span>
                              Customer Label
                            </Label>
                            {dispatchCustomerScan && (
                              <div className="p-3 bg-muted rounded-lg">
                                <p className="text-xs font-semibold text-muted-foreground mb-2">Scanned Data:</p>
                                <div className="grid grid-cols-3 gap-2">
                                  <div>
                                    <p className="text-[10px] text-muted-foreground">Part Code</p>
                                    <p className="text-xs font-mono font-bold">{dispatchCustomerScan.partCode}</p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] text-muted-foreground">Quantity</p>
                                    <p className="text-xs font-mono font-bold">{dispatchCustomerScan.quantity}</p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] text-muted-foreground">Bin Number</p>
                                    <p className="text-xs font-mono font-bold">{dispatchCustomerScan.binNumber}</p>
                                  </div>
                                </div>
                              </div>
                            )}
                            <BarcodeScanButton
                              onScan={(data) => {
                                setDispatchCustomerScan(data);
                                toast.success("Customer barcode scanned!");
                              }}
                              label={dispatchCustomerScan ? "Scan Again" : "Scan Customer Barcode"}
                              variant="default"
                              matchValue={dispatchAutolivScan?.rawValue || getNextUnscannedBarcodePair()?.customerBarcode}
                              shouldMismatch={!!dispatchAutolivScan}
                              matchData={dispatchAutolivScan || undefined}
                              totalQuantity={selectedInvoices.length > 0 ? sharedInvoices.find(inv => selectedInvoices.includes(inv.id))?.totalQty : undefined}
                              binCapacity={selectedInvoices.length > 0 ? sharedInvoices.find(inv => selectedInvoices.includes(inv.id))?.binCapacity : undefined}
                              expectedBins={selectedInvoices.length > 0 ? sharedInvoices.find(inv => selectedInvoices.includes(inv.id))?.expectedBins : undefined}
                              currentBinIndex={loadedBarcodes.length}
                            />
                          </div>

                          {/* Autoliv Label Scan */}
                          <div className="space-y-2">
                            <Label htmlFor="dispatch-autoliv-barcode" className="flex items-center gap-2">
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-accent/10 text-accent text-xs font-bold">2</span>
                              Autoliv Label
                            </Label>
                            {dispatchAutolivScan && (
                              <div className="p-3 bg-muted rounded-lg">
                                <p className="text-xs font-semibold text-muted-foreground mb-2">Scanned Data:</p>
                                <div className="grid grid-cols-3 gap-2">
                                  <div>
                                    <p className="text-[10px] text-muted-foreground">Part Code</p>
                                    <p className="text-xs font-mono font-bold">{dispatchAutolivScan.partCode}</p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] text-muted-foreground">Quantity</p>
                                    <p className="text-xs font-mono font-bold">{dispatchAutolivScan.quantity}</p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] text-muted-foreground">Bin Number</p>
                                    <p className="text-xs font-mono font-bold">{dispatchAutolivScan.binNumber}</p>
                                  </div>
                                </div>
                              </div>
                            )}
                            <BarcodeScanButton
                              onScan={(data) => {
                                setDispatchAutolivScan(data);
                                toast.success("Autoliv barcode scanned!");
                              }}
                              label={dispatchAutolivScan ? "Scan Again" : "Scan Autoliv Barcode"}
                              variant="secondary"
                              matchValue={dispatchCustomerScan?.rawValue || getNextUnscannedBarcodePair()?.autolivBarcode}
                              shouldMismatch={false}
                              matchData={dispatchCustomerScan || undefined}
                              totalQuantity={selectedInvoices.length > 0 ? sharedInvoices.find(inv => selectedInvoices.includes(inv.id))?.totalQty : undefined}
                              binCapacity={selectedInvoices.length > 0 ? sharedInvoices.find(inv => selectedInvoices.includes(inv.id))?.binCapacity : undefined}
                              expectedBins={selectedInvoices.length > 0 ? sharedInvoices.find(inv => selectedInvoices.includes(inv.id))?.expectedBins : undefined}
                              currentBinIndex={loadedBarcodes.length}
                            />
                          </div>
                        </div>

                        {/* Clear Button Only */}
                        {(dispatchCustomerScan || dispatchAutolivScan) && (
                          <div className="flex justify-end">
                          <Button 
                            variant="outline"
                            onClick={() => {
                                setDispatchCustomerScan(null);
                                setDispatchAutolivScan(null);
                            }}
                              className="h-12"
                          >
                              Clear Scans
                          </Button>
                        </div>
                        )}

                        {/* Status Indicator */}
                        {(dispatchCustomerScan || dispatchAutolivScan) && (
                          <div className="p-3 bg-muted rounded-lg text-sm">
                            <div className="flex items-center gap-2">
                              <div className={`h-2 w-2 rounded-full ${dispatchCustomerScan ? 'bg-green-500' : 'bg-gray-300'}`} />
                              <span className={dispatchCustomerScan ? 'text-foreground' : 'text-muted-foreground'}>
                                Customer Label {dispatchCustomerScan ? 'Scanned' : 'Pending'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <div className={`h-2 w-2 rounded-full ${dispatchAutolivScan ? 'bg-green-500' : 'bg-gray-300'}`} />
                              <span className={dispatchAutolivScan ? 'text-foreground' : 'text-muted-foreground'}>
                                Autoliv Label {dispatchAutolivScan ? 'Scanned' : 'Pending'}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Loaded Items List */}
                        {loadedBarcodes.length > 0 && (
                          <div className="border rounded-lg p-3 sm:p-4 max-h-96 overflow-y-auto">
                            <p className="text-xs sm:text-sm font-medium mb-3">Loaded Items:</p>
                            <div className="space-y-3">
                              {loadedBarcodes.map((barcodePair, index) => (
                                <div key={index} className="border rounded-lg p-3 bg-muted">
                                  <div className="flex items-start justify-between mb-2">
                                    <span className="text-xs font-semibold text-muted-foreground">Item #{index + 1}</span>
                                    <Badge variant="default" className="text-xs">
                                      <CheckCircle2 className="h-3 w-3 mr-1" />
                                      Loaded
                                    </Badge>
                                  </div>
                                  <div className="space-y-2 text-sm">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-muted-foreground min-w-[80px]">Customer:</span>
                                      <span className="font-mono text-xs">{barcodePair.customerBarcode}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-muted-foreground min-w-[80px]">Autoliv:</span>
                                      <span className="font-mono text-xs">{barcodePair.autolivBarcode}</span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Summary */}
                {selectedInvoices.length > 0 && loadedBarcodes.length === getExpectedBarcodes().length && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Loading Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="bg-muted rounded-lg p-4 space-y-3">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Vehicle Number</span>
                          <span className="font-semibold">{vehicleNumber || "Not entered"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Selected Invoices</span>
                          <span className="font-semibold">{selectedInvoices.length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total Items</span>
                          <span className="font-semibold">
                            {sharedInvoices
                              .filter(inv => selectedInvoices.includes(inv.id))
                              .reduce((sum, inv) => sum + inv.scannedBins, 0)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total Quantity</span>
                          <span className="font-semibold">
                            {sharedInvoices
                              .filter(inv => selectedInvoices.includes(inv.id))
                              .reduce((sum, inv) => sum + inv.totalQty, 0)}
                          </span>
                        </div>
                      </div>
                      <Button 
                        onClick={handleGenerateGatepass} 
                        className="w-full mt-4 h-12 text-base font-semibold"
                        disabled={!vehicleNumber || selectedInvoices.length === 0}
                      >
                        <QrCode className="h-5 w-5 mr-2" />
                        Generate Gatepass
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              /* Gatepass Preview */
              <>
                {/* Back Button for Gatepass */}
                <Button
                  variant="ghost"
                  onClick={() => setGatepassGenerated(false)}
                  className="flex items-center gap-2 mb-4 text-sm sm:text-base"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Back to Loading</span>
                  <span className="sm:hidden">Back</span>
                </Button>
                
              <Card>
                <CardHeader className="text-center pb-4">
                  <div className="flex justify-center mb-3">
                    <div className="p-3 bg-success/10 rounded-full">
                      <QrCode className="h-10 w-10 text-success" />
                    </div>
                  </div>
                  <CardTitle className="text-2xl">Gatepass Generated</CardTitle>
                  <CardDescription>Gatepass #{Math.floor(Math.random() * 10000).toString().padStart(5, '0')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Gatepass Details */}
                  <div className="border rounded-lg p-6 space-y-4">
                    <div className="text-center pb-4 border-b">
                      <h3 className="text-lg font-bold mb-1">MANUFACTURING DISPATCH</h3>
                      <p className="text-sm text-muted-foreground">Vehicle Exit Authorization</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground mb-1">Vehicle Number</p>
                        <p className="font-semibold">{vehicleNumber}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-1">Date & Time</p>
                        <p className="font-semibold">{new Date().toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-1">Authorized By</p>
                        <p className="font-semibold">John Operator</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-1">Total Invoices</p>
                        <p className="font-semibold">{selectedInvoices.length}</p>
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <p className="text-sm font-semibold mb-2">Invoices:</p>
                      <div className="space-y-1">
                        {selectedInvoices.map(id => {
                          const invoice = sharedInvoices.find(inv => inv.id === id);
                          return (
                            <div key={id} className="flex justify-between text-sm">
                              <span>{invoice?.id}</span>
                              <span className="text-muted-foreground">{invoice?.customer}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* QR Code Placeholder */}
                    <div className="flex justify-center pt-4 border-t">
                      <div className="w-40 h-40 bg-muted rounded-lg flex items-center justify-center">
                        <QrCode className="h-32 w-32 text-muted-foreground" />
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="grid grid-cols-2 gap-3">
                    <Button variant="outline" className="h-12">
                      <Printer className="h-5 w-5 mr-2" />
                      Print Gatepass
                    </Button>
                    <Button variant="outline" className="h-12">
                      <Download className="h-5 w-5 mr-2" />
                      Download PDF
                    </Button>
                  </div>

                  <div className="flex gap-3">
                    <Button 
                      className="flex-1 h-12"
                      onClick={() => {
                        setActiveView('dashboard');
                        // Reset dispatch state
                        setGatepassGenerated(false);
                        setVehicleNumber("");
                        setSelectedInvoices([]);
                        setLoadedBarcodes([]);
                        setDispatchCustomerScan(null);
                        setDispatchAutolivScan(null);
                      }}
                    >
                      Return to Dashboard
                    </Button>
                    <Button 
                      variant="outline" 
                      className="h-12"
                      onClick={() => {
                        setGatepassGenerated(false);
                        setVehicleNumber("");
                        setSelectedInvoices([]);
                        setLoadedBarcodes([]);
                        setDispatchCustomerScan(null);
                        setDispatchAutolivScan(null);
                      }}
                    >
                      New Dispatch
                    </Button>
                  </div>
                </CardContent>
              </Card>
              </>
            )}
          </div>
        )}
      </main>

      {/* Logs Dialogs */}
      <LogsDialog
        isOpen={showUploadLogs}
        onClose={() => setShowUploadLogs(false)}
        logs={getUploadLogs()}
        title="Upload Logs"
        type="upload"
      />
      
      <LogsDialog
        isOpen={showAuditLogs}
        onClose={() => setShowAuditLogs(false)}
        logs={getAuditLogs()}
        title="Audit Logs"
        type="audit"
      />
      
      <LogsDialog
        isOpen={showDispatchLogs}
        onClose={() => setShowDispatchLogs(false)}
        logs={getDispatchLogs()}
        title="Dispatch Logs"
        type="dispatch"
      />
    </div>
  );
};

export default Dashboard;
