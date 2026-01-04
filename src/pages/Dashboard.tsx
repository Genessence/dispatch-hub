import { useState, useEffect, useMemo, useRef } from "react";
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
  MapPin,
  X
} from "lucide-react";
import { BarcodeScanButton, type BarcodeData } from "@/components/BarcodeScanner";
import { useSession } from "@/contexts/SessionContext";
import { LogsDialog } from "@/components/LogsDialog";
import type { LogEntry, ScheduleItem, InvoiceData } from "@/contexts/SessionContext";
import { QRCodeSVG } from "qrcode.react";
import jsPDF from "jspdf";

type ViewType = 'dashboard' | 'upload' | 'doc-audit' | 'dispatch';

interface UploadedRow {
  invoice: string;
  customer: string;
  part: string;
  qty: number;
  status: 'valid-matched' | 'valid-unmatched' | 'error' | 'warning';
  errorMessage?: string;
  customerItem?: string; // Customer Item from invoice file for matching with schedule
  partDescription?: string; // Part Description from invoice file
}

interface ValidatedBarcodePair {
  customerBarcode: string;
  autolivBarcode: string; // Optional for dispatch, required for doc audit
  binNumber?: string;
  quantity?: string;
  partCode?: string;
  // Dispatch-specific fields from invoice data
  customerItem?: string;
  itemNumber?: string;
  actualQuantity?: number; // Quantity from invoice, not barcode
}

// InvoiceData is imported from SessionContext

const Dashboard = () => {
  const { 
    currentUser, 
    sharedInvoices, 
    addInvoices, 
    updateInvoiceAudit, 
    updateInvoiceDispatch, 
    getAuditedInvoices, 
    getDispatchableInvoices, 
    getUploadLogs, 
    getAuditLogs, 
    getDispatchLogs, 
    addMismatchAlert, 
    getPendingMismatches,
    // Schedule-related
    scheduleData,
    addScheduleData,
    getScheduleForCustomer,
    getInvoicesWithSchedule,
    getScheduledDispatchableInvoices
  } = useSession();
  const [activeView, setActiveView] = useState<ViewType>('dashboard');
  
  // Logs states
  const [showUploadLogs, setShowUploadLogs] = useState(false);
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  const [showDispatchLogs, setShowDispatchLogs] = useState(false);
  
  // Upload Data states
  const [file, setFile] = useState<File | null>(null);
  const [scheduleFile, setScheduleFile] = useState<File | null>(null);
  const [uploadStage, setUploadStage] = useState<'upload' | 'validate' | 'complete'>('upload');
  const [dragActive, setDragActive] = useState(false);
  const [scheduleDragActive, setScheduleDragActive] = useState(false);
  const [uploadedData, setUploadedData] = useState<UploadedRow[]>([]);
  const [processedInvoices, setProcessedInvoices] = useState<InvoiceData[]>([]);
  const [parsedScheduleItems, setParsedScheduleItems] = useState<ScheduleItem[]>([]);
  
  // Doc Audit states
  const [selectedInvoice, setSelectedInvoice] = useState("");
  const [customerScan, setCustomerScan] = useState<BarcodeData | null>(null);
  const [autolivScan, setAutolivScan] = useState<BarcodeData | null>(null);
  const [scannerConnected, setScannerConnected] = useState(true);
  const [firstScanType, setFirstScanType] = useState<'customer' | 'autoliv' | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date | undefined>(undefined);
  
  // Doc Audit selection states (customer code, delivery date, delivery time)
  const [selectedCustomerCode, setSelectedCustomerCode] = useState<string>("");
  const [selectedDeliveryDate, setSelectedDeliveryDate] = useState<Date | undefined>(undefined);
  const [selectedDeliveryTime, setSelectedDeliveryTime] = useState<string>("");
  
  // Helper function to format date as YYYY-MM-DD in local timezone (not UTC)
  // This avoids timezone issues where toISOString() converts to UTC
  const formatDateAsLocalString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const [validatedBins, setValidatedBins] = useState<Array<{
    customerItem: string;
    itemNumber: string;
    partDescription: string;
    quantity: number; // from invoice, not barcode
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
  const [selectInvoiceValue, setSelectInvoiceValue] = useState<string>("");
  const [gatepassNumber, setGatepassNumber] = useState<string>("");

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

  // Get invoices with schedule
  const invoicesWithSchedule = getInvoicesWithSchedule();
  
  // Helper to check if date is today
  const isDateToday = (date: Date | undefined): boolean => {
    if (!date) return false;
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };
  
  // Overall System Metrics
  // Pending Doc Audits: all invoices with schedule, not dispatched, not audited
  const pendingDocAudits = invoicesWithSchedule.filter(inv => 
    !inv.dispatchedBy && !inv.auditComplete
  ).length;
  
  // Ready for Dispatch: all invoices with schedule, audited but not dispatched
  const readyForDispatch = invoicesWithSchedule.filter(inv => 
    !inv.dispatchedBy && inv.auditComplete
  ).length;
  
  // Completed Today: all audits and dispatches completed today
  const completedTodayAudits = sharedInvoices.filter(inv => 
    inv.auditComplete && inv.auditedAt && isDateToday(inv.auditedAt)
  ).length;
  
  const completedTodayDispatches = sharedInvoices.filter(inv => 
    inv.dispatchedBy !== undefined && inv.dispatchedAt && isDateToday(inv.dispatchedAt)
  ).length;
  
  // Upcoming Schedule: invoices scheduled for future dates
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcomingScheduled = invoicesWithSchedule.filter(inv => {
    if (!inv.scheduledDate) return false;
    const scheduledDate = new Date(inv.scheduledDate);
    scheduledDate.setHours(0, 0, 0, 0);
    return scheduledDate > today;
  }).length;
  
  const hasRealData = sharedInvoices.length > 0;

  // Overall System KPIs
  const overallSystemKPIs = [
    {
      title: "Pending Doc Audits",
      value: hasRealData ? pendingDocAudits.toString() : "0",
      subtitle: "Requires audit",
      icon: ScanBarcode,
      trend: pendingDocAudits > 0 ? "Active" : "Empty"
    },
    {
      title: "Ready for Dispatch",
      value: hasRealData ? readyForDispatch.toString() : "0",
      subtitle: "Audited & ready",
      icon: Truck,
      trend: readyForDispatch > 0 ? "Active" : "Empty"
    },
    {
      title: "Completed Today",
      value: hasRealData ? (completedTodayAudits + completedTodayDispatches).toString() : "0",
      subtitle: `${completedTodayAudits} audits, ${completedTodayDispatches} dispatches`,
      icon: CheckCircle2,
      trend: (completedTodayAudits + completedTodayDispatches) > 0 ? "Active" : "None"
    },
    {
      title: "Upcoming Schedule",
      value: hasRealData ? upcomingScheduled.toString() : "0",
      subtitle: "Future scheduled",
      icon: CalendarIcon,
      trend: upcomingScheduled > 0 ? "Scheduled" : "None"
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

  const handleScheduleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setScheduleDragActive(true);
    } else if (e.type === "dragleave") {
      setScheduleDragActive(false);
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
              WTF: false
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
            console.log('Step 1: Trying universal data extraction');
            console.log('Sheet info:', {
              sheetName: workbook.SheetNames[0],
              isMobile: isMobile,
              sheetKeys: Object.keys(firstSheet).slice(0, 10)
            });
            
            // Try object format first (most compatible across all browsers)
            console.log('Step 2: Attempting object format parsing...');
            jsonData = XLSX.utils.sheet_to_json(firstSheet, {
              defval: '',
              raw: false,
              range: isMobile ? 1000 : undefined // Limit rows on mobile
            });
            
            console.log('Step 3: Object format result:', {
              dataLength: jsonData?.length || 0,
              dataType: typeof jsonData,
              isArray: Array.isArray(jsonData),
              firstRowType: jsonData && jsonData.length > 0 ? typeof jsonData[0] : 'none',
              firstRowKeys: jsonData && jsonData.length > 0 && typeof jsonData[0] === 'object' ? Object.keys(jsonData[0]) : []
            });
            
            if (!jsonData || jsonData.length === 0) {
              console.error('Object format returned empty data');
              throw new Error('No data with object format');
            }
            
            // Convert object format to headers and data rows
            if (jsonData.length > 0 && typeof jsonData[0] === 'object') {
              headers = Object.keys(jsonData[0]);
              dataRows = jsonData.map((row: any) => headers.map(header => row[header] || ''));
              console.log('✅ Universal object format successful', {
                headersCount: headers.length,
                rowsCount: dataRows.length
              });
            } else {
              console.error('Object format data is not in expected format');
              throw new Error('Invalid object format');
            }
          } catch (objectError) {
            console.log('❌ Object format failed, trying array format:', objectError);
            
            try {
              // Fallback to array format
              console.log('Step 4: Attempting array format parsing...');
              jsonData = XLSX.utils.sheet_to_json(firstSheet, {
                header: 1,
                defval: '',
                raw: false,
                range: isMobile ? 1000 : undefined
              });
              
              console.log('Step 5: Array format result:', {
                dataLength: jsonData?.length || 0,
                dataType: typeof jsonData,
                isArray: Array.isArray(jsonData),
                firstRowType: jsonData && jsonData.length > 0 ? typeof jsonData[0] : 'none',
                firstRowIsArray: jsonData && jsonData.length > 0 ? Array.isArray(jsonData[0]) : false
              });
              
              if (!jsonData || jsonData.length === 0) {
                console.error('Array format returned empty data');
                throw new Error('No data with array format');
              }
              
              // Convert array format to headers and data rows
              if (Array.isArray(jsonData[0])) {
                headers = jsonData[0] as string[];
                dataRows = jsonData.slice(1) as string[][];
                console.log('✅ Universal array format successful', {
                  headersCount: headers.length,
                  rowsCount: dataRows.length
                });
              } else {
                console.error('Array format data is not in expected format');
                throw new Error('Invalid array format');
              }
            } catch (arrayError) {
              console.error('❌ Both parsing methods failed');
              console.error('Object error:', objectError);
              console.error('Array error:', arrayError);
              console.error('Sheet structure:', {
                sheetKeys: Object.keys(firstSheet).slice(0, 20),
                sheetRef: firstSheet['!ref'],
                sheetRange: firstSheet['!range']
              });
              
              // Last resort: Try to manually extract data from sheet cells
              console.log('Step 6: Attempting manual cell extraction...');
              try {
                const range = XLSX.utils.decode_range(firstSheet['!ref'] || 'A1');
                console.log('Sheet range:', range);
                
                // Extract headers from first row
                const tempHeaders: string[] = [];
                for (let col = range.s.c; col <= range.e.c; col++) {
                  const cellAddress = XLSX.utils.encode_cell({ r: range.s.r, c: col });
                  const cell = firstSheet[cellAddress];
                  tempHeaders.push(cell ? String(cell.v || cell.w || '') : '');
                }
                
                console.log('Extracted headers:', tempHeaders);
                
                // Extract data rows
                const tempRows: string[][] = [];
                for (let row = range.s.r + 1; row <= Math.min(range.e.r, isMobile ? 1000 : range.e.r); row++) {
                  const rowData: string[] = [];
                  for (let col = range.s.c; col <= range.e.c; col++) {
                    const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
                    const cell = firstSheet[cellAddress];
                    rowData.push(cell ? String(cell.v || cell.w || '') : '');
                  }
                  tempRows.push(rowData);
                }
                
                console.log('Extracted rows:', tempRows.length);
                
                if (tempHeaders.length > 0 && tempRows.length > 0) {
                  headers = tempHeaders;
                  dataRows = tempRows;
                  console.log('✅ Manual extraction successful!');
                } else {
                  throw new Error('Manual extraction failed - no data found');
                }
              } catch (manualError) {
                console.error('❌ Manual extraction also failed:', manualError);
                reject(new Error('Unable to read file. Please try a different Excel file or contact support.'));
                return;
              }
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
            // Extract Customer Item for matching with schedule
            const customerItem = rowObj['Customer Item'] || rowObj['CustomerItem'] || rowObj['customer item'] || rowObj['Customer-Item'] || rowObj['Cust Item'] || rowObj['CustItem'] || rowObj['Customer Part'] || rowObj['CustomerPart'] || '';
            // Extract Part Description from invoice
            const partDescription = rowObj['Part Description'] || rowObj['PartDescription'] || rowObj['part description'] || rowObj['Part-Description'] || rowObj['Description'] || rowObj['description'] || rowObj['Part Desc'] || rowObj['PartDesc'] || '';
            
            // Validation logic
            let status: 'valid-matched' | 'valid-unmatched' | 'error' | 'warning' = 'valid-unmatched'; // Default to unmatched, will be updated during matching if match found
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
              errorMessage,
              customerItem: customerItem ? customerItem.toString() : undefined,
              partDescription: partDescription ? partDescription.toString() : undefined
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
            // Extract Bill To for customer code matching with schedule
            const billTo = rowObj['Bill To'] || rowObj['BillTo'] || rowObj['bill to'] || rowObj['Bill-To'] || '';
            // Extract Plant from invoice data (where invoice is being delivered to)
            const plant = rowObj['Ship To'] || rowObj['ShipTo'] || rowObj['Ship-To'] || 
                         rowObj['Plant'] || rowObj['plant'] || 
                         rowObj['Delivery Location'] || rowObj['DeliveryLocation'] || 
                         rowObj['Destination'] || rowObj['destination'] || '';
            
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
                items: [],
                billTo: billTo.toString(), // Customer code for matching with schedule
                plant: plant ? plant.toString() : undefined // Plant where invoice is being delivered to
              });
            }
            
            const invoice = invoiceMap.get(invoiceNum.toString())!;
            invoice.totalQty += Math.abs(qty);
            invoice.items.push(parsedData[index]);
          });
          
          // Calculate expected Customer Items count (number of unique Customer Items)
          invoiceMap.forEach((invoice) => {
            // Count unique Customer Items
            const uniqueCustomerItems = new Set<string>();
            invoice.items.forEach((item: UploadedRow) => {
              if (item.customerItem && item.customerItem.trim() !== '') {
                uniqueCustomerItems.add(item.customerItem.trim());
              }
            });
            invoice.expectedBins = uniqueCustomerItems.size; // Use expectedBins to store Customer Items count
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

  // Parse schedule file with multiple sheets - extract all customer schedules
  const parseScheduleFile = async (file: File): Promise<ScheduleItem[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          if (!data) {
            reject(new Error('Failed to read schedule file data'));
            return;
          }
          
          const workbook = XLSX.read(data, { 
            type: 'array',
            cellDates: false,
            raw: false
          });
          
          if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
            reject(new Error('No sheets found in the schedule file'));
            return;
          }
          
          console.log('Schedule file sheets:', workbook.SheetNames);
          
          const allScheduleItems: ScheduleItem[] = [];
          
          // Parse each sheet
          workbook.SheetNames.forEach((sheetName) => {
            // Skip sheets that don't seem like customer schedules (e.g., "Sheet1")
            if (sheetName.toLowerCase() === 'sheet1' || sheetName.toLowerCase() === 'sheet2') {
              console.log(`Skipping sheet: ${sheetName}`);
              return;
            }
            
            const sheet = workbook.Sheets[sheetName];
            if (!sheet) return;
            
            try {
              const jsonData = XLSX.utils.sheet_to_json(sheet, {
                defval: '',
                raw: false
              });
              
              if (!jsonData || jsonData.length === 0) {
                console.log(`Sheet ${sheetName} is empty, skipping`);
                return;
              }
              
              console.log(`Parsing sheet: ${sheetName}, rows: ${jsonData.length}`);
              
              // Helper function to parse date from various formats
              const parseDate = (dateStr: any): Date | undefined => {
                if (!dateStr) return undefined;
                // If it's already a Date object
                if (dateStr instanceof Date) return dateStr;
                // If it's an Excel serial date number
                if (typeof dateStr === 'number') {
                  return excelDateToJSDate(dateStr);
                }
                // If it's a string, try multiple parsing strategies
                if (typeof dateStr === 'string') {
                  const trimmed = dateStr.trim();
                  if (!trimmed) return undefined;
                  
                  // Try parsing common date formats first (to avoid timezone issues with YYYY-MM-DD)
                  // Handle formats like "01/15/2024" or "15-01-2024" or "2024-01-15"
                  const dateFormats = [
                    /^(\d{4})-(\d{1,2})-(\d{1,2})$/,    // YYYY-MM-DD (handle first to avoid UTC parsing)
                    /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,  // YYYY/MM/DD
                    /^(\d{1,2})\/(\d{1,2})\/(\d{4})/,   // MM/DD/YYYY or DD/MM/YYYY
                    /^(\d{1,2})-(\d{1,2})-(\d{4})/,     // DD-MM-YYYY or MM-DD-YYYY
                  ];
                  
                  for (const format of dateFormats) {
                    const match = trimmed.match(format);
                    if (match) {
                      if (format === dateFormats[0] || format === dateFormats[1]) {
                        // YYYY-MM-DD or YYYY/MM/DD - parse as local date to avoid timezone issues
                        const [_, year, month, day] = match;
                        const parsed = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                        if (!isNaN(parsed.getTime())) return parsed;
                      } else {
                        // MM/DD/YYYY or DD-MM-YYYY - try both interpretations
                        const [_, part1, part2, year] = match;
                        // Try MM/DD/YYYY first (US format)
                        let parsed = new Date(parseInt(year), parseInt(part1) - 1, parseInt(part2));
                        if (!isNaN(parsed.getTime())) return parsed;
                        // Try DD/MM/YYYY (European format)
                        parsed = new Date(parseInt(year), parseInt(part2) - 1, parseInt(part1));
                        if (!isNaN(parsed.getTime())) return parsed;
                      }
                    }
                  }
                  
                  // Try parsing as ISO date string (only if format patterns didn't match)
                  // This handles full ISO datetime strings like "2024-01-15T10:30:00Z"
                  const parsed = new Date(trimmed);
                  if (!isNaN(parsed.getTime())) return parsed;
                }
                
                return undefined;
              };
              
              // Helper function for case-insensitive column lookup
              const getColumnValue = (row: any, variations: string[]): string => {
                for (const variation of variations) {
                  // Try exact match first
                  if (row[variation] !== undefined && row[variation] !== '') {
                    return row[variation];
                  }
                  // Try case-insensitive match
                  const rowKeys = Object.keys(row);
                  const matchedKey = rowKeys.find(key => 
                    key.toLowerCase().trim() === variation.toLowerCase().trim()
                  );
                  if (matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== '') {
                    return row[matchedKey];
                  }
                }
                return '';
              };
              
              // Parse each row in the sheet
              jsonData.forEach((row: any) => {
                const customerCode = getColumnValue(row, ['Customer Code', 'CustomerCode', 'customer code']) || '';
                const customerPart = getColumnValue(row, ['Custmer Part', 'Customer Part', 'CustomerPart', 'customer part']) || '';
                const partNumber = getColumnValue(row, ['PART NUMBER', 'Part Number', 'PartNumber', 'part number', 'PART NUMBER', 'Part_Number']) || '';
                const qadPart = getColumnValue(row, ['QAD part', 'QAD Part', 'QADPart', 'qad part']) || '';
                const description = getColumnValue(row, ['Description', 'description']) || '';
                const snp = parseInt(getColumnValue(row, ['SNP', 'snp']) || '0') || 0;
                const bin = parseInt(getColumnValue(row, ['Bin', 'bin']) || '0') || 0;
                
                // Extract delivery date/time from various column name variations (case-insensitive)
                // Including "SUPPLY DATE" (all uppercase) as specified
                const deliveryDateTime = getColumnValue(row, [
                  'SUPPLY DATE',  // Exact match for the user's file
                  'Supply Date',
                  'SupplyDate',
                  'supply date',
                  'Delivery Date & Time', 
                  'Delivery Date and Time', 
                  'DeliveryDateTime', 
                  'Delivery Date',
                  'delivery date'
                ]);
                
                const supplyTime = getColumnValue(row, [
                  'Supply Time',
                  'SupplyTime',
                  'SUPPLY TIME',
                  'supply time',
                  'Delivery Time',
                  'DeliveryTime',
                  'delivery time'
                ]);
                
                // Parse delivery date
                const deliveryDate = parseDate(deliveryDateTime);
                
                // Extract delivery time (from combined datetime or separate time field)
                const timeStr = supplyTime || deliveryDateTime;
                
                // Extract plant if available in schedule
                const plant = getColumnValue(row, [
                  'Plant',
                  'plant',
                  'PLANT',
                  'Plant Code',
                  'PlantCode',
                  'Delivery Location',
                  'DeliveryLocation',
                  'delivery location'
                ]);
                
                // Only add items with valid customer code
                if (customerCode) {
                  allScheduleItems.push({
                    customerCode: customerCode.toString(),
                    customerPart: customerPart.toString(),
                    partNumber: partNumber ? partNumber.toString() : undefined,
                    qadPart: qadPart.toString(),
                    description: description.toString(),
                    snp,
                    bin,
                    sheetName,
                    deliveryDate,
                    deliveryTime: timeStr ? timeStr.toString() : undefined,
                    plant: plant ? plant.toString() : undefined
                  });
                }
              });
            } catch (sheetError) {
              console.error(`Error parsing sheet ${sheetName}:`, sheetError);
            }
          });
          
          console.log(`Total schedule items parsed: ${allScheduleItems.length}`);
          console.log('Unique customer codes:', [...new Set(allScheduleItems.map(i => i.customerCode))]);
          const itemsWithDeliveryDate = allScheduleItems.filter(i => i.deliveryDate);
          console.log(`Items with delivery date: ${itemsWithDeliveryDate.length} out of ${allScheduleItems.length}`);
          if (itemsWithDeliveryDate.length > 0) {
            const uniqueDates = [...new Set(itemsWithDeliveryDate.map(i => i.deliveryDate ? formatDateAsLocalString(i.deliveryDate) : undefined).filter(Boolean))];
            console.log('Unique delivery dates found:', uniqueDates);
          }
          
          resolve(allScheduleItems);
        } catch (error) {
          console.error('Error parsing schedule file:', error);
          reject(error);
        }
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read schedule file'));
      };
      
      reader.readAsArrayBuffer(file);
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      setFile(droppedFile);
      toast.success("Invoices file selected!");
      // Don't auto-advance - wait for both files
    }
  };

  const handleScheduleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setScheduleDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setScheduleFile(e.dataTransfer.files[0]);
      toast.success("Schedule file selected!");
      // Don't auto-advance - wait for both files
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      toast.success("Invoices file selected!");
      // Don't auto-advance - wait for both files
    }
  };

  const handleScheduleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setScheduleFile(e.target.files[0]);
      toast.success("Schedule file selected!");
      // Don't auto-advance - wait for both files
    }
  };

  const handleProceedToValidation = async () => {
    if (!file) {
      toast.error("Please upload Invoices file");
      return;
    }
    if (!scheduleFile) {
      toast.error("Please upload Schedule file");
      return;
    }

    // Parse both files
    const loadingToast = toast.loading("Parsing files...", {
      duration: 0
    });
    
    try {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
        || (window.innerWidth < 768 && ('ontouchstart' in window));
      
      const timeoutDuration = isMobile ? 10000 : 15000;
      
      // Parse both files in parallel
      const parseInvoicesPromise = parseFile(file);
      const parseSchedulePromise = parseScheduleFile(scheduleFile);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('File parsing timeout - please try a smaller file')), timeoutDuration)
      );
      
      const [invoiceResult, scheduleItems] = await Promise.race([
        Promise.all([parseInvoicesPromise, parseSchedulePromise]),
        timeoutPromise
      ]) as [{ rows: UploadedRow[], invoices: InvoiceData[] }, ScheduleItem[]];
      
      const { rows, invoices } = invoiceResult;
      
      if (!rows || !invoices) {
        throw new Error('Invalid invoice file format - no data found');
      }
      
      if (!scheduleItems || scheduleItems.length === 0) {
        throw new Error('No schedule data found in the schedule file');
      }
      
      // Get unique customer codes from schedule
      const scheduledCustomerCodes = new Set(scheduleItems.map(item => String(item.customerCode)));
      
      // Create schedule index: Map<customerCode, Set<partNumber>> for fast lookup
      const scheduleIndex = new Map<string, Set<string>>();
      scheduleItems.forEach(item => {
        const customerCode = String(item.customerCode);
        const partNumber = item.partNumber ? String(item.partNumber) : '';
        // Only add items that have a partNumber
        if (partNumber) {
          if (!scheduleIndex.has(customerCode)) {
            scheduleIndex.set(customerCode, new Set());
          }
          scheduleIndex.get(customerCode)!.add(partNumber);
        }
      });
      
      // Group invoices by customer code (billTo)
      const invoicesByCustomerCode = new Map<string, InvoiceData[]>();
      invoices.forEach(inv => {
        const customerCode = inv.billTo ? String(inv.billTo) : 'UNKNOWN';
        if (!invoicesByCustomerCode.has(customerCode)) {
          invoicesByCustomerCode.set(customerCode, []);
        }
        invoicesByCustomerCode.get(customerCode)!.push(inv);
      });
      
      // Match invoice items with schedule items
      // For each row (invoice item), check if it matches schedule
      const matchedRows = rows.map(row => {
        // Only match items that are not in error/warning state
        if (row.status === 'error' || row.status === 'warning') {
          return row;
        }
        
        // Find the invoice this row belongs to
        const invoice = invoices.find(inv => inv.id === row.invoice);
        if (!invoice || !invoice.billTo) {
          // Invoice has no customer code, keep as unmatched
          return { ...row, status: 'valid-unmatched' as const };
        }
        
        const invoiceCustomerCode = String(invoice.billTo);
        const partNumbersSet = scheduleIndex.get(invoiceCustomerCode);
        
        // If invoice customer code doesn't exist in schedule, keep as unmatched
        if (!partNumbersSet) {
          return { ...row, status: 'valid-unmatched' as const };
        }
        
        // If row doesn't have customerItem, keep as unmatched
        if (!row.customerItem || row.customerItem.trim() === '') {
          return { ...row, status: 'valid-unmatched' as const };
        }
        
        // Check if customerItem matches any PART NUMBER in schedule for this customer code
        const customerItem = String(row.customerItem).trim();
        if (partNumbersSet.has(customerItem)) {
          return { ...row, status: 'valid-matched' as const };
        } else {
          return { ...row, status: 'valid-unmatched' as const };
        }
      });
      
      // Update invoice items with matched rows
      invoices.forEach(invoice => {
        invoice.items = matchedRows.filter(row => row.invoice === invoice.id);
      });
      
      // Calculate matching statistics
      const matchedInvoices = invoices.filter(inv => inv.billTo && scheduledCustomerCodes.has(String(inv.billTo)));
      const unmatchedInvoices = invoices.filter(inv => !inv.billTo || !scheduledCustomerCodes.has(String(inv.billTo)));
      
      const matchedItemsCount = matchedRows.filter(row => row.status === 'valid-matched').length;
      const unmatchedItemsCount = matchedRows.filter(row => row.status === 'valid-unmatched').length;
      
      console.log('Matching results:', {
        totalInvoices: invoices.length,
        matchedInvoices: matchedInvoices.length,
        unmatchedInvoices: unmatchedInvoices.length,
        scheduleItemCount: scheduleItems.length,
        scheduledCustomerCodes: [...scheduledCustomerCodes],
        invoicesByCustomerCode: Object.fromEntries(Array.from(invoicesByCustomerCode.entries()).map(([code, invs]) => [code, invs.length])),
        matchedItems: matchedItemsCount,
        unmatchedItems: unmatchedItemsCount
      });
      
      if (isMobile && matchedRows.length > 100) {
        toast.loading(`Processing ${matchedRows.length} records...`, { id: 'processing' });
      }
      
      setUploadedData(matchedRows);
      setProcessedInvoices(invoices);
      setParsedScheduleItems(scheduleItems);
      setUploadStage('validate');
      toast.dismiss(loadingToast);
      toast.dismiss('processing');
      toast.success(`Files parsed! ${invoices.length} invoices, ${scheduleItems.length} schedule items. ${matchedInvoices.length} matched.`);
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.dismiss('processing');
      console.error('File parsing error:', error);
      
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
      
      setFile(null);
      setScheduleFile(null);
      setUploadedData([]);
      setProcessedInvoices([]);
      setParsedScheduleItems([]);
    }
  };

  const handleImport = () => {
    // Add schedule data to shared session
    if (parsedScheduleItems.length > 0) {
      addScheduleData(parsedScheduleItems, currentUser);
    }
    
    // Add invoices to shared session
    addInvoices(processedInvoices, currentUser);
    
    setUploadStage('complete');
    toast.success(`Data imported successfully by ${currentUser}!`, {
      description: "Invoices are now available for all users to audit"
    });
  };

  // Calculate validation results from actual uploaded data
  const scheduledCustomerCodes = new Set(parsedScheduleItems.map(item => String(item.customerCode)));
  const matchedInvoicesCount = processedInvoices.filter(inv => inv.billTo && scheduledCustomerCodes.has(String(inv.billTo))).length;
  const unmatchedInvoicesCount = processedInvoices.length - matchedInvoicesCount;
  
  // Group invoices by customer code for statistics
  const invoicesByCustomerCode = new Map<string, number>();
  processedInvoices.forEach(inv => {
    const customerCode = inv.billTo ? String(inv.billTo) : 'UNKNOWN';
    invoicesByCustomerCode.set(customerCode, (invoicesByCustomerCode.get(customerCode) || 0) + 1);
  });
  
  const validationResults = {
    total: uploadedData.length,
    valid: uploadedData.filter(row => row.status === 'valid-matched' || row.status === 'valid-unmatched').length,
    matchedItems: uploadedData.filter(row => row.status === 'valid-matched').length,
    unmatchedItems: uploadedData.filter(row => row.status === 'valid-unmatched').length,
    errors: uploadedData.filter(row => row.status === 'error').length,
    warnings: uploadedData.filter(row => row.status === 'warning').length,
    // Schedule matching info
    invoiceCount: processedInvoices.length,
    scheduleItemCount: parsedScheduleItems.length,
    matchedInvoices: matchedInvoicesCount,
    unmatchedInvoices: unmatchedInvoicesCount,
    invoicesByCustomerCode: Object.fromEntries(invoicesByCustomerCode)
  };

  // Doc Audit data and handlers

  // Get available customer codes from invoices with schedule
  const availableCustomerCodes = useMemo(() => {
    const codes = new Set<string>();
    invoicesWithSchedule.forEach(inv => {
      if (inv.billTo) codes.add(inv.billTo);
    });
    // Only return actual customer codes from data - no dummy codes
    return Array.from(codes).sort();
  }, [invoicesWithSchedule, scheduleData]);

  // Get available delivery dates for selected customer code (from schedule items that match invoice items)
  const availableDeliveryDates = useMemo(() => {
    if (!selectedCustomerCode || !scheduleData) return [];
    
    const dates = new Set<string>();
    
    // Get invoices for the selected customer code
    const invoicesForCustomer = invoicesWithSchedule.filter(inv => inv.billTo === selectedCustomerCode);
    if (invoicesForCustomer.length === 0) return [];
    
    // Get all customer items from invoices for this customer
    const customerItemsSet = new Set<string>();
    invoicesForCustomer.forEach(invoice => {
      invoice.items?.forEach((item: any) => {
        if (item.customerItem && item.status === 'valid-matched') {
          customerItemsSet.add(String(item.customerItem).trim());
        }
      });
    });
    
    // Find schedule items that match these customer items (via partNumber)
    const scheduleItems = scheduleData.items.filter(
      item => String(item.customerCode) === String(selectedCustomerCode)
    );
    scheduleItems.forEach(item => {
      if (item.deliveryDate && item.partNumber && customerItemsSet.has(String(item.partNumber).trim())) {
        dates.add(formatDateAsLocalString(item.deliveryDate)); // Format as YYYY-MM-DD in local timezone
      }
    });
    
    return Array.from(dates).sort();
  }, [selectedCustomerCode, scheduleData, invoicesWithSchedule]);

  // Get available delivery times for selected customer code and delivery date (from schedule items that match invoice items)
  const availableDeliveryTimes = useMemo(() => {
    if (!selectedCustomerCode || !selectedDeliveryDate || !scheduleData) return [];
    const times = new Set<string>();
    
    // Get invoices for the selected customer code
    const invoicesForCustomer = invoicesWithSchedule.filter(inv => inv.billTo === selectedCustomerCode);
    if (invoicesForCustomer.length === 0) return [];
    
    // Get all customer items from invoices for this customer
    const customerItemsSet = new Set<string>();
    invoicesForCustomer.forEach(invoice => {
      invoice.items?.forEach((item: any) => {
        if (item.customerItem && item.status === 'valid-matched') {
          customerItemsSet.add(String(item.customerItem).trim());
        }
      });
    });
    
    // Find schedule items that match customer code, delivery date, and customer items (via partNumber)
    const scheduleItems = scheduleData.items.filter(
      item => {
        if (String(item.customerCode) !== String(selectedCustomerCode)) return false;
        if (!item.deliveryDate) return false;
        const itemDate = formatDateAsLocalString(item.deliveryDate);
        const selectedDate = formatDateAsLocalString(selectedDeliveryDate);
        return itemDate === selectedDate;
      }
    );
    scheduleItems.forEach(item => {
      if (item.deliveryTime && item.partNumber && customerItemsSet.has(String(item.partNumber).trim())) {
        times.add(item.deliveryTime);
      }
    });
    
    return Array.from(times).sort();
  }, [selectedCustomerCode, selectedDeliveryDate, scheduleData, invoicesWithSchedule]);

  // Get invoices with schedule for Doc Audit - filtered by selections
  // Reuse invoicesWithSchedule declared above for KPIs
  const invoices = useMemo(() => {
    if (!selectedCustomerCode || !selectedDeliveryDate || !selectedDeliveryTime || !scheduleData) {
      // If not all selections are made, return empty array
      return [];
    }
    
    // First, filter by customer code
    let filtered = invoicesWithSchedule.filter(inv => {
      // Hide dispatched invoices
      if (inv.dispatchedBy) return false;
      
      // Filter by customer code
      if (inv.billTo !== selectedCustomerCode) return false;
      
      return true;
    });
    
    // Get all customer items from invoices for this customer
    const customerItemsSet = new Set<string>();
    filtered.forEach(invoice => {
      invoice.items?.forEach((item: any) => {
        if (item.customerItem && item.status === 'valid-matched') {
          customerItemsSet.add(String(item.customerItem).trim());
        }
      });
    });
    
    // Find schedule items that match the criteria (customer code, delivery date, delivery time, and partNumber)
    const matchingScheduleItems = scheduleData.items.filter(item => {
      if (String(item.customerCode) !== String(selectedCustomerCode)) return false;
      if (!item.deliveryDate || !item.deliveryTime || !item.partNumber) return false;
      const itemDate = formatDateAsLocalString(item.deliveryDate);
      const selectedDate = formatDateAsLocalString(selectedDeliveryDate);
      return itemDate === selectedDate 
        && item.deliveryTime === selectedDeliveryTime
        && customerItemsSet.has(String(item.partNumber).trim());
    });
    
    // Get part numbers from matching schedule items
    const matchingPartNumbers = new Set(matchingScheduleItems.map(item => String(item.partNumber).trim()));
    
    // Filter invoices that have items matching these part numbers
    filtered = filtered.filter(invoice => {
      return invoice.items?.some((item: any) => {
        return item.customerItem && item.status === 'valid-matched' 
          && matchingPartNumbers.has(String(item.customerItem).trim());
      });
    });
    
    // Sort invoices: customer code → delivery date → delivery time → invoice ID
    return filtered.sort((a, b) => {
      // Customer code (already filtered, so same)
      // Delivery date (already filtered, so same)
      // Delivery time (already filtered, so same)
      // Invoice ID
      return a.id.localeCompare(b.id);
    });
  }, [invoicesWithSchedule, selectedCustomerCode, selectedDeliveryTime, selectedDeliveryDate, scheduleData]);
  
  // Group invoices by scheduled date for display
  const groupedByDate = invoices.reduce((acc, inv) => {
    const dateKey = inv.scheduledDate 
      ? inv.scheduledDate.toLocaleDateString() 
      : (scheduleData?.scheduledDate?.toLocaleDateString() || 'No Schedule');
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(inv);
    return acc;
  }, {} as Record<string, typeof invoices>);

  const currentInvoice = invoices.find(inv => inv.id === selectedInvoice);
  // Get invoice from sharedInvoices for accurate scannedBins count (most up-to-date)
  const currentInvoiceFromShared = sharedInvoices.find(inv => inv.id === selectedInvoice);
  // Use sharedInvoices version for accurate scanning progress - prefer sharedInvoices as it has latest scannedBins
  const invoiceForProgress = currentInvoiceFromShared || currentInvoice;
  const invoiceForDisplay = currentInvoiceFromShared || currentInvoice; // Use sharedInvoices version for display
  
  // Helper function to extract unique Customer Items from invoice items
  const getUniqueCustomerItems = (invoice: InvoiceData | undefined) => {
    if (!invoice || !invoice.items || invoice.items.length === 0) return [];
    
    const customerItemMap = new Map<string, {
      customerItem: string;
      itemNumber: string;
      partDescription: string;
      quantity: number;
    }>();
    
    invoice.items.forEach((item: UploadedRow) => {
      const customerItem = item.customerItem || '';
      if (customerItem) {
        // If this Customer Item already exists, aggregate quantities
        if (customerItemMap.has(customerItem)) {
          const existing = customerItemMap.get(customerItem)!;
          existing.quantity += item.qty;
        } else {
          customerItemMap.set(customerItem, {
            customerItem: customerItem,
            itemNumber: item.part || '',
            partDescription: item.partDescription || '',
            quantity: item.qty
          });
        }
      }
    });
    
    return Array.from(customerItemMap.values());
  };
  
  const uniqueCustomerItems = getUniqueCustomerItems(invoiceForDisplay);
  const scannedCustomerItemsCount = validatedBins.length;
  const totalCustomerItemsCount = uniqueCustomerItems.length;
  const progress = totalCustomerItemsCount > 0 ? (scannedCustomerItemsCount / totalCustomerItemsCount) * 100 : 0;


  // Clear validated bins when invoice selection changes
  useEffect(() => {
    setValidatedBins([]);
    setCustomerScan(null);
    setAutolivScan(null);
    setFirstScanType(null);
    // Note: scannedBins count is preserved in invoice data, so progress is maintained
    // When invoice is selected again, user will see correct progress but needs to re-scan to see details
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

  // Prevent auto-selection: Ensure selectInvoiceValue stays empty unless explicitly set
  // This prevents invoices from being auto-selected when they become audited
  useEffect(() => {
    // If selectInvoiceValue is set but not intentionally selected, reset it
    if (selectInvoiceValue && selectInvoiceValue !== "" && !selectedInvoices.includes(selectInvoiceValue)) {
      // If the value doesn't match any selected invoice, reset it
      setSelectInvoiceValue("");
    }
  }, [sharedInvoices, selectInvoiceValue, selectedInvoices]);

  // Reset select value when switching to dispatch view
  useEffect(() => {
    if (activeView === 'dispatch') {
      setSelectInvoiceValue("");
    }
  }, [activeView]);

  // Track which label was scanned first
  useEffect(() => {
    if (customerScan && !autolivScan) {
      // Only set if not already set (customer scanned first)
      if (!firstScanType) {
        setFirstScanType('customer');
      }
    } else if (autolivScan && !customerScan) {
      // Only set if not already set (autoliv scanned first)
      if (!firstScanType) {
        setFirstScanType('autoliv');
      }
    }
  }, [customerScan, autolivScan]); // Removed firstScanType from dependencies to avoid reset loops

  // Auto-validate when both barcodes are scanned
  useEffect(() => {
    if (customerScan && autolivScan) {
      // Automatically trigger validation
      handleValidateBarcodes();
    }
  }, [customerScan, autolivScan]);

  const handleValidateBarcodes = () => {
    // Check if invoice is blocked
    const invoiceToCheck = invoiceForDisplay || currentInvoiceFromShared;
    if (invoiceToCheck?.blocked) {
      toast.error("⚠️ Invoice is Blocked", {
        description: "This invoice has a mismatch. Please wait for admin to mark it as corrected.",
        duration: 5000,
      });
      return;
    }

    if (!customerScan || !autolivScan) {
      toast.error("Please scan both barcodes");
      return;
    }
    
    // Determine scan order: Customer Label first = match, Autoliv Label first = mismatch
    const customerScannedFirst = firstScanType === 'customer';
    const autolivScannedFirst = firstScanType === 'autoliv';
    
    // Check if barcodes match (comparing raw values)
    const barcodesMatch = customerScan.rawValue.trim() === autolivScan.rawValue.trim();
    
    // Enforce scan order rule:
    // - Customer Label first + Autoliv Label second = should match
    // - Autoliv Label first + Customer Label second = should mismatch (even if barcodes match)
    let shouldMatch = false;
    if (customerScannedFirst && barcodesMatch) {
      shouldMatch = true;
    } else if (autolivScannedFirst) {
      // Always mismatch if Autoliv scanned first
      shouldMatch = false;
    } else if (customerScannedFirst && !barcodesMatch) {
      // Customer scanned first but barcodes don't match = mismatch
      shouldMatch = false;
    }
    
    if (shouldMatch) {
      // Get invoice from sharedInvoices for accurate state (prefer sharedInvoices, fallback to invoices array)
      const invoiceInSharedState = sharedInvoices.find(inv => inv.id === selectedInvoice);
      const invoiceForScanning = invoiceInSharedState || currentInvoice;
      
      if (!invoiceForScanning || !invoiceForScanning.items || invoiceForScanning.items.length === 0) {
        toast.error("⚠️ Invoice not found or has no items!", {
          description: "The selected invoice could not be found or has no line items. Please select an invoice again.",
          duration: 4000,
        });
        setCustomerScan(null);
        setAutolivScan(null);
        setFirstScanType(null);
        return;
      }
      
      let matchedInvoiceItem: UploadedRow | undefined;
      
      // When Customer Label is scanned first, skip part code matching and use first unscaned Customer Item
      if (customerScannedFirst) {
        // Get unique Customer Items that haven't been scanned yet
        const uniqueCustomerItems = getUniqueCustomerItems(invoiceForScanning);
        const scannedCustomerItems = new Set(validatedBins.map(bin => bin.customerItem));
        const unscanedCustomerItems = uniqueCustomerItems.filter(item => 
          !scannedCustomerItems.has(item.customerItem)
        );
        
        if (unscanedCustomerItems.length === 0) {
          toast.error("⚠️ All Customer Items already scanned!", {
            description: "All Customer Items for this invoice have already been scanned.",
            duration: 4000,
          });
          setCustomerScan(null);
          setAutolivScan(null);
          setFirstScanType(null);
          return;
        }
        
        // Use the first unscaned Customer Item
        const selectedCustomerItem = unscanedCustomerItems[0];
        
        // Find an invoice item with this Customer Item to get the full details
        matchedInvoiceItem = invoiceForScanning.items.find((item: UploadedRow) => 
          item.customerItem && item.customerItem.trim() === selectedCustomerItem.customerItem
        );
        
        if (!matchedInvoiceItem) {
          // Fallback: create a dummy item from the unique customer item data
          matchedInvoiceItem = {
            invoice: invoiceForScanning.id,
            customer: invoiceForScanning.customer,
            part: selectedCustomerItem.itemNumber,
            qty: selectedCustomerItem.quantity,
            status: 'valid-matched',
            customerItem: selectedCustomerItem.customerItem,
            partDescription: selectedCustomerItem.partDescription
          } as UploadedRow;
        }
      } else {
        // Original logic: Match scanned barcode's part code with invoice items
        const scannedPartCode = customerScan.partCode?.trim();
        if (!scannedPartCode) {
          toast.error("⚠️ Invalid barcode!", {
            description: "Could not extract part code from scanned barcode. Please scan again.",
            duration: 4000,
          });
          setCustomerScan(null);
          setAutolivScan(null);
          setFirstScanType(null);
          return;
        }
        
        // Find invoice item where Item Number (part) matches scanned part code
        matchedInvoiceItem = invoiceForScanning.items.find((item: UploadedRow) => 
          item.part && item.part.toString().trim() === scannedPartCode
        );
        
        if (!matchedInvoiceItem) {
          toast.error("⚠️ Part code mismatch!", {
            description: `Scanned part code "${scannedPartCode}" does not match any Item Number in this invoice.`,
            duration: 4000,
          });
          setCustomerScan(null);
          setAutolivScan(null);
          setFirstScanType(null);
          return;
        }
      }
      
      const customerItem = matchedInvoiceItem.customerItem;
      if (!customerItem || customerItem.trim() === '') {
        toast.error("⚠️ Missing Customer Item!", {
          description: "The matched invoice item does not have a Customer Item. Cannot proceed with scan.",
          duration: 4000,
        });
        setCustomerScan(null);
        setAutolivScan(null);
        setFirstScanType(null);
        return;
      }
      
      // Check if this Customer Item has already been scanned
      const alreadyScanned = validatedBins.some(bin => bin.customerItem === customerItem.trim());
      
      if (alreadyScanned) {
        toast.error("⚠️ Customer Item already scanned!", {
          description: `Customer Item "${customerItem}" has already been scanned for this invoice.`,
          duration: 4000,
        });
        setCustomerScan(null);
        setAutolivScan(null);
        setFirstScanType(null);
        return;
      }
      
      // Get quantity from invoice data (not from barcode)
      const invoiceQuantity = matchedInvoiceItem.qty || 0;
      
      // Create new validated entry using invoice data
      const newScannedItem = {
        customerItem: customerItem.trim(),
        itemNumber: matchedInvoiceItem.part || '',
        partDescription: matchedInvoiceItem.partDescription || '',
        quantity: invoiceQuantity, // Use invoice quantity, not barcode quantity
        status: 'matched',
        scannedBy: currentUser,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        customerBarcode: customerScan.rawValue,
        autolivBarcode: autolivScan.rawValue
      };
      
      // Get unique Customer Items count
      const uniqueCustomerItems = getUniqueCustomerItems(invoiceForScanning);
      const totalCustomerItems = uniqueCustomerItems.length;
      const newScannedCount = validatedBins.length + 1;
      const isComplete = newScannedCount >= totalCustomerItems;
      
      // Add to validated bins
      setValidatedBins(prev => [...prev, newScannedItem]);
      
      // Update the invoice's scanned Customer Items count in shared session
      if (invoiceForScanning) {
        // Update scannedBins to represent scanned Customer Items count
        // Update expectedBins to represent total Customer Items count
        const invoiceToUpdate = invoiceInSharedState || invoiceForScanning;
        
        // If invoice is not in sharedInvoices yet, add it first (for dummy invoices)
        if (!invoiceInSharedState && currentInvoice) {
          addInvoices([currentInvoice], 'System');
          updateInvoiceAudit(currentInvoice.id, {
            scannedBins: newScannedCount,
            expectedBins: totalCustomerItems,
            auditComplete: isComplete,
            auditDate: isComplete ? new Date() : currentInvoice.auditDate,
            validatedBarcodes: [
              ...(currentInvoice.validatedBarcodes || []), 
              { customerBarcode: customerScan.rawValue, autolivBarcode: autolivScan.rawValue }
            ]
          }, currentUser);
        } else {
          updateInvoiceAudit(invoiceToUpdate.id, {
            scannedBins: newScannedCount,
            expectedBins: totalCustomerItems,
            auditComplete: isComplete,
            auditDate: isComplete ? new Date() : invoiceToUpdate.auditDate,
            validatedBarcodes: [
              ...(invoiceToUpdate.validatedBarcodes || []), 
              { customerBarcode: customerScan.rawValue, autolivBarcode: autolivScan.rawValue }
            ]
          }, currentUser);
        }
        
        if (isComplete) {
          toast.success(`🎉 Invoice audit completed by ${currentUser}!`, {
            description: `All ${totalCustomerItems} Customer Items scanned successfully.`
          });
        }
      }
      
      toast.success("✅ Barcodes matched! Customer Item added to list.", {
        description: `Customer Item: ${customerItem} - Qty: ${invoiceQuantity}`
      });
      
      // Clear the input fields and reset scan order
      setCustomerScan(null);
      setAutolivScan(null);
      setFirstScanType(null);
    } else {
      // Barcodes don't match or wrong scan order - automatically send approval request and record mismatch
      const currentInvoice = sharedInvoices.find(inv => inv.id === selectedInvoice);
      
      // Block the invoice and record the mismatch in the system
      if (currentInvoice) {
        // Block the invoice
        updateInvoiceAudit(currentInvoice.id, {
          blocked: true,
          blockedAt: new Date()
        }, currentUser);

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
      
      // Show appropriate error message based on scan order
      let errorDescription = "Part code or quantity doesn't match. Invoice has been blocked.";
      if (autolivScannedFirst) {
        errorDescription = "⚠️ Wrong scan order! Please scan Customer Label first, then Autoliv Label. Invoice has been blocked.";
      } else if (customerScannedFirst && !barcodesMatch) {
        errorDescription = "Part code or quantity doesn't match. Invoice has been blocked.";
      }
      
      toast.error("⚠️ Barcode Mismatch Detected!", {
        description: errorDescription,
        duration: 5000,
      });
      
      // Automatically show approval message
      setTimeout(() => {
        toast.info("📨 Message sent to senior for approval", {
          description: "Request has been sent to supervisor for correction.",
          duration: 5000,
        });
      }, 500);
      
      // Clear scans after mismatch
      setCustomerScan(null);
      setAutolivScan(null);
      setFirstScanType(null);
    }
  };

  // Dispatch handlers
  // For dispatch, we only scan customer barcodes, so count is based on scannedBins (items scanned during audit)
  const getExpectedBarcodes = () => {
    const selectedInvoiceData = sharedInvoices.filter(inv => 
      selectedInvoices.includes(inv.id) && inv.auditComplete
    );
    // Return the total number of items to load (sum of scannedBins from all selected invoices)
    // Each scannedBin represents one item that needs to be loaded
    return selectedInvoiceData.reduce((total, inv) => total + (inv.scannedBins || 0), 0);
  };

  // Get next unscanned customer barcode for dispatch
  // Since we only scan customer barcodes in dispatch, we check against customer barcodes from validatedBarcodes
  const getNextUnscannedBarcodePair = () => {
    const selectedInvoiceData = sharedInvoices.filter(inv => 
      selectedInvoices.includes(inv.id) && inv.auditComplete
    );
    
    // Get all validated customer barcodes from selected invoices
    const allValidatedBarcodes = selectedInvoiceData.flatMap(inv => inv.validatedBarcodes || []);
    
    // Find the first customer barcode that hasn't been loaded yet
    return allValidatedBarcodes.find(pair => 
      !loadedBarcodes.find(loaded => 
        loaded.customerBarcode === pair.customerBarcode
      )
    );
  };

  // Auto-validate dispatch when customer barcode is scanned (only customer scan needed for dispatch)
  useEffect(() => {
    if (dispatchCustomerScan) {
      // Automatically trigger validation for dispatch (only customer scan needed)
      handleDispatchScan();
    }
  }, [dispatchCustomerScan]);

  const handleDispatchScan = () => {
    if (!dispatchCustomerScan) {
      toast.error("Please scan customer barcode");
      return;
    }

    // For dispatch, we only need customer barcode (no autoliv scan required)
    // Check if already loaded (based on customer barcode only)
    const alreadyLoaded = loadedBarcodes.find(pair => 
      pair.customerBarcode === dispatchCustomerScan.rawValue
    );

    if (alreadyLoaded) {
      toast.error("⚠️ Already Loaded!", {
        description: "This item has already been loaded onto the vehicle.",
      });
      return;
    }

    // Find the invoice item that matches the scanned part code to get Customer Item, Item Number, and quantity
    let matchedInvoiceItem: UploadedRow | undefined;
    const scannedPartCode = dispatchCustomerScan.partCode?.trim();
    
    // Search through selected invoices to find the matching item
    for (const invoiceId of selectedInvoices) {
      const invoice = sharedInvoices.find(inv => inv.id === invoiceId);
      if (invoice && invoice.items && scannedPartCode) {
        matchedInvoiceItem = invoice.items.find((item: UploadedRow) => 
          item.part && item.part.toString().trim() === scannedPartCode
        );
        if (matchedInvoiceItem) {
          break; // Found the matching item, exit loop
        }
      }
    }
    
    // If no match found, try to use the first unscanned Customer Item from selected invoices (for demo mode)
    if (!matchedInvoiceItem && selectedInvoices.length > 0) {
      for (const invoiceId of selectedInvoices) {
        const invoice = sharedInvoices.find(inv => inv.id === invoiceId);
        if (invoice && invoice.items) {
          // Get all Customer Items from this invoice that haven't been loaded yet
          const uniqueCustomerItems = getUniqueCustomerItems(invoice);
          const loadedCustomerItems = new Set(
            loadedBarcodes.map(pair => pair.customerItem).filter(Boolean)
          );
          const unloadedCustomerItem = uniqueCustomerItems.find(item => 
            !loadedCustomerItems.has(item.customerItem)
          );
          
          if (unloadedCustomerItem) {
            // Find an invoice item with this Customer Item
            matchedInvoiceItem = invoice.items.find((item: UploadedRow) => 
              item.customerItem && item.customerItem.trim() === unloadedCustomerItem.customerItem
            );
            if (matchedInvoiceItem) {
              break;
            }
          }
        }
      }
    }

    // Add to loaded list with the scanned barcode data including invoice item details
    // Autoliv barcode is not required for dispatch, so we set it to empty string
    const newPair: ValidatedBarcodePair = {
      customerBarcode: dispatchCustomerScan.rawValue,
      autolivBarcode: "", // Not required for dispatch
      binNumber: dispatchCustomerScan.binNumber,
      quantity: dispatchCustomerScan.quantity,
      partCode: dispatchCustomerScan.partCode,
      // Add invoice item data if found
      customerItem: matchedInvoiceItem?.customerItem || undefined,
      itemNumber: matchedInvoiceItem?.part || undefined,
      actualQuantity: matchedInvoiceItem?.qty || undefined
    };
    
    setLoadedBarcodes(prev => [...prev, newPair]);
    
    // Update the invoice's binsLoaded count
    selectedInvoices.forEach(invoiceId => {
      const invoice = sharedInvoices.find(inv => inv.id === invoiceId);
      if (invoice) {
        invoice.binsLoaded = (invoice.binsLoaded || 0) + 1;
      }
    });
    
    const displayInfo = matchedInvoiceItem 
      ? `${matchedInvoiceItem.customerItem || dispatchCustomerScan.partCode} - Qty: ${matchedInvoiceItem.qty || dispatchCustomerScan.quantity}`
      : `${dispatchCustomerScan.partCode} - Qty: ${dispatchCustomerScan.quantity}`;
    
    toast.success("✅ Item loaded successfully!", {
      description: displayInfo
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
    if (loadedBarcodes.length < expectedBarcodes) {
      toast.error("⚠️ Not All Items Loaded!", {
        description: `Please scan all items. Loaded: ${loadedBarcodes.length}/${expectedBarcodes}`,
      });
      return;
    }

    // Mark invoices as dispatched by current user
    const dispatchedInvoicesList = selectedInvoices.join(', ');
    selectedInvoices.forEach(invoiceId => {
      // Get bin number and quantity from the first loaded barcode
      const binNumber = loadedBarcodes.length > 0 ? loadedBarcodes[0].binNumber : undefined;
      const totalQuantity = loadedBarcodes.reduce((sum, b) => sum + (parseInt(b.quantity || '0') || 0), 0);
      
      console.log('Dispatching with:', {
        invoiceId,
        vehicleNumber,
        binNumber,
        totalQuantity,
        loadedBarcodesCount: loadedBarcodes.length
      });
      
      updateInvoiceDispatch(invoiceId, currentUser, vehicleNumber, binNumber, totalQuantity || undefined);
    });

    // Generate gatepass number
    const newGatepassNumber = `GP-${Date.now().toString().slice(-8)}`;
    setGatepassNumber(newGatepassNumber);

    setGatepassGenerated(true);
    toast.success(`✅ Gatepass generated successfully by ${currentUser}!`, {
      description: `Vehicle ${vehicleNumber} dispatched with ${selectedInvoices.length} invoice(s). Invoices removed from workflow.`,
      duration: 6000
    });
  };

  // Generate QR code data with all gatepass information
  const generateGatepassQRData = () => {
    const selectedInvoiceData = sharedInvoices.filter(inv => selectedInvoices.includes(inv.id));
    const customers = [...new Set(selectedInvoiceData.map(inv => inv.customer))];
    const customerName = customers.join(", ");
    
    // Collect all part codes, bin numbers, and quantities from loaded barcodes
    const partCodes = [...new Set(loadedBarcodes.map(b => b.partCode).filter(Boolean))];
    const binNumbers = [...new Set(loadedBarcodes.map(b => b.binNumber).filter(Boolean))];
    const totalQuantity = loadedBarcodes.reduce((sum, b) => sum + (parseInt(b.quantity || '0') || 0), 0);
    
    // Create detailed items list with part code, bin number, and quantity for each item
    const items = loadedBarcodes.map((barcode, index) => ({
      itemNumber: index + 1,
      partCode: barcode.partCode || "N/A",
      binNumber: barcode.binNumber || "N/A",
      quantity: barcode.quantity || "0",
      customerBarcode: barcode.customerBarcode
    }));
    
    const qrData = {
      gatepassNumber: gatepassNumber || `GP-${Date.now().toString().slice(-8)}`,
      vehicleNumber: vehicleNumber,
      dateTime: new Date().toISOString(),
      authorizedBy: currentUser,
      customer: customerName,
      invoices: selectedInvoices,
      summary: {
        totalItems: loadedBarcodes.length,
        invoiceCount: selectedInvoices.length,
        totalQuantity: totalQuantity,
        uniquePartCodes: partCodes.length,
        uniqueBinNumbers: binNumbers.length
      },
      partCodes: partCodes,
      binNumbers: binNumbers,
      items: items // Detailed list of all items with part code, bin number, and quantity
    };
    
    // Remove formatting to minimize QR code size - improves Android scanning compatibility
    return JSON.stringify(qrData);
  };

  // Print gatepass functionality
  const handlePrintGatepass = () => {
    // Create a printable content element
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error("Please allow popups to print the gatepass");
      return;
    }

    const selectedInvoiceData = sharedInvoices.filter(inv => selectedInvoices.includes(inv.id));
    const customers = [...new Set(selectedInvoiceData.map(inv => inv.customer))];
    const customerName = customers.join(", ");
    const totalQuantity = loadedBarcodes.reduce((sum, b) => sum + (parseInt(b.quantity || '0') || 0), 0);
    const currentDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const currentTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    
    // Get QR code data
    const qrData = generateGatepassQRData();
    // Encode QR data for URL
    const encodedQRData = encodeURIComponent(qrData);
    // Use QR code API to generate QR code image with larger size and better error correction
    const qrCodeImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&ecc=H&margin=4&data=${encodedQRData}`;

    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Gatepass ${gatepassNumber}</title>
          <style>
            @media print {
              @page { margin: 1cm; }
            }
            body {
              font-family: Arial, sans-serif;
              padding: 20px;
              max-width: 800px;
              margin: 0 auto;
            }
            .header {
              text-align: center;
              border-bottom: 3px solid #000;
              padding-bottom: 20px;
              margin-bottom: 20px;
            }
            .header h1 {
              margin: 0;
              font-size: 24px;
              font-weight: bold;
            }
            .header p {
              margin: 5px 0;
              color: #666;
            }
            .info-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 15px;
              margin-bottom: 20px;
            }
            .info-item {
              padding: 10px;
              border-bottom: 1px solid #ddd;
            }
            .info-label {
              font-weight: bold;
              color: #666;
              font-size: 12px;
              margin-bottom: 5px;
            }
            .info-value {
              font-size: 14px;
            }
            .invoices-section {
              margin: 20px 0;
            }
            .items-table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 15px;
            }
            .items-table th,
            .items-table td {
              border: 1px solid #ddd;
              padding: 8px;
              text-align: left;
              font-size: 12px;
            }
            .items-table th {
              background-color: #f5f5f5;
              font-weight: bold;
            }
            .qr-section {
              text-align: center;
              margin-top: 30px;
              padding-top: 20px;
              border-top: 2px solid #000;
            }
            .footer {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #ddd;
              text-align: center;
              font-size: 11px;
              color: #666;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>MANUFACTURING DISPATCH</h1>
            <p>Vehicle Exit Authorization</p>
            <p><strong>Gatepass #${gatepassNumber}</strong></p>
          </div>

          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">Vehicle Number</div>
              <div class="info-value">${vehicleNumber}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Date & Time</div>
              <div class="info-value">${currentDate} at ${currentTime}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Customer</div>
              <div class="info-value">${customerName}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Authorized By</div>
              <div class="info-value">${currentUser}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Total Quantity</div>
              <div class="info-value">${totalQuantity}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Total Items</div>
              <div class="info-value">${loadedBarcodes.length}</div>
            </div>
          </div>

          <div class="invoices-section">
            <h3 style="margin-bottom: 10px; font-size: 16px;">Invoice Numbers:</h3>
            <p style="margin: 0;">${selectedInvoices.join(", ")}</p>
          </div>

          <div class="invoices-section">
            <h3 style="margin-bottom: 10px; font-size: 16px;">Items Loaded:</h3>
            <table class="items-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Part Code</th>
                  <th>Bin Number</th>
                  <th>Quantity</th>
                </tr>
              </thead>
              <tbody>
                ${loadedBarcodes.map((item, index) => `
                  <tr>
                    <td>${index + 1}</td>
                    <td>${item.partCode || "N/A"}</td>
                    <td>${item.binNumber || "N/A"}</td>
                    <td>${item.quantity || "0"}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <div class="qr-section">
            <h3 style="margin-bottom: 15px; font-size: 16px; text-align: center;">QR Code:</h3>
            <div style="text-align: center; padding: 20px;">
              <div style="display: inline-block; padding: 20px; background: white; border: 2px solid #ddd; border-radius: 8px;">
                <img src="${qrCodeImageUrl}" alt="Gatepass QR Code" style="width: 300px; height: 300px; display: block;" />
              </div>
            </div>
            <p style="margin-top: 10px; font-size: 11px; color: #666; text-align: center;">Scan QR code to verify gatepass details</p>
          </div>

          <div class="footer">
            <p>This gatepass is authorized for vehicle exit. Please verify all items before dispatch.</p>
            <p>Generated on ${currentDate} at ${currentTime}</p>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
    
    // Wait for QR code image to load, then print
    printWindow.onload = () => {
      const img = printWindow.document.querySelector('img[alt="Gatepass QR Code"]') as HTMLImageElement;
      if (img) {
        if (img.complete) {
          setTimeout(() => {
            printWindow.print();
            printWindow.onafterprint = () => printWindow.close();
          }, 100);
        } else {
          img.onload = () => {
            setTimeout(() => {
              printWindow.print();
              printWindow.onafterprint = () => printWindow.close();
            }, 100);
          };
          img.onerror = () => {
            // If QR code fails to load, still allow printing
            setTimeout(() => {
              printWindow.print();
              printWindow.onafterprint = () => printWindow.close();
            }, 100);
          };
        }
      } else {
        // Fallback if image element not found
        setTimeout(() => {
          printWindow.print();
          printWindow.onafterprint = () => printWindow.close();
        }, 500);
      }
    };
    
    toast.success("Print dialog opened");
  };

  // Download PDF functionality
  const handleDownloadPDF = () => {
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      let yPos = margin;

      const selectedInvoiceData = sharedInvoices.filter(inv => selectedInvoices.includes(inv.id));
      const customers = [...new Set(selectedInvoiceData.map(inv => inv.customer))];
      const customerName = customers.join(", ");
      const totalQuantity = loadedBarcodes.reduce((sum, b) => sum + (parseInt(b.quantity || '0') || 0), 0);
      const currentDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      const currentTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

      // Header
      pdf.setFontSize(20);
      pdf.setFont(undefined, 'bold');
      pdf.text('MANUFACTURING DISPATCH', pageWidth / 2, yPos, { align: 'center' });
      yPos += 8;

      pdf.setFontSize(12);
      pdf.setFont(undefined, 'normal');
      pdf.text('Vehicle Exit Authorization', pageWidth / 2, yPos, { align: 'center' });
      yPos += 8;

      pdf.setFontSize(14);
      pdf.setFont(undefined, 'bold');
      pdf.text(`Gatepass #${gatepassNumber}`, pageWidth / 2, yPos, { align: 'center' });
      yPos += 15;

      // Gatepass Information
      pdf.setFontSize(10);
      pdf.setFont(undefined, 'bold');
      pdf.text('Gatepass Information:', margin, yPos);
      yPos += 7;

      pdf.setFont(undefined, 'normal');
      pdf.setFontSize(9);
      pdf.text(`Vehicle Number: ${vehicleNumber}`, margin, yPos);
      yPos += 6;
      pdf.text(`Date & Time: ${currentDate} at ${currentTime}`, margin, yPos);
      yPos += 6;
      pdf.text(`Customer: ${customerName}`, margin, yPos);
      yPos += 6;
      pdf.text(`Authorized By: ${currentUser}`, margin, yPos);
      yPos += 6;
      pdf.text(`Total Quantity: ${totalQuantity}`, margin, yPos);
      yPos += 6;
      pdf.text(`Total Items: ${loadedBarcodes.length}`, margin, yPos);
      yPos += 10;

      // Invoice Numbers
      pdf.setFont(undefined, 'bold');
      pdf.text('Invoice Numbers:', margin, yPos);
      yPos += 6;
      pdf.setFont(undefined, 'normal');
      const invoiceText = selectedInvoices.join(", ");
      const splitInvoices = pdf.splitTextToSize(invoiceText, pageWidth - 2 * margin);
      pdf.text(splitInvoices, margin, yPos);
      yPos += splitInvoices.length * 5 + 5;

      // Items Table
      if (yPos > pageHeight - 60) {
        pdf.addPage();
        yPos = margin;
      }

      pdf.setFont(undefined, 'bold');
      pdf.text('Items Loaded:', margin, yPos);
      yPos += 7;

      // Table headers
      const tableStartY = yPos;
      pdf.setFontSize(8);
      pdf.setFont(undefined, 'bold');
      pdf.text('#', margin, yPos);
      pdf.text('Part Code', margin + 20, yPos);
      pdf.text('Bin Number', margin + 70, yPos);
      pdf.text('Quantity', margin + 120, yPos);
      yPos += 5;

      // Draw line under header
      pdf.setDrawColor(200, 200, 200);
      pdf.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 3;

      // Table rows
      pdf.setFont(undefined, 'normal');
      loadedBarcodes.forEach((item, index) => {
        if (yPos > pageHeight - 20) {
          pdf.addPage();
          yPos = margin;
        }
        pdf.text(String(index + 1), margin, yPos);
        pdf.text(item.partCode || "N/A", margin + 20, yPos);
        pdf.text(item.binNumber || "N/A", margin + 70, yPos);
        pdf.text(item.quantity || "0", margin + 120, yPos);
        yPos += 6;
      });

      // Footer
      yPos = pageHeight - 20;
      pdf.setFontSize(8);
      pdf.setFont(undefined, 'italic');
      pdf.text('This gatepass is authorized for vehicle exit. Please verify all items before dispatch.', pageWidth / 2, yPos, { align: 'center' });
      yPos += 5;
      pdf.text(`Generated on ${currentDate} at ${currentTime}`, pageWidth / 2, yPos, { align: 'center' });

      // Download PDF
      const fileName = `Gatepass_${gatepassNumber}_${vehicleNumber}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);
      
      toast.success("PDF downloaded successfully!");
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate PDF. Please try again.");
    }
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
            {/* Overall System Metrics */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-4">
                <Badge variant="default" className="text-sm px-3 py-1">
                  📊 System Overview
                </Badge>
                <h2 className="text-lg font-semibold">Overall System Metrics</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {overallSystemKPIs.map((kpi, index) => (
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
                          kpi.trend === 'Active' || kpi.trend === 'Scheduled' ? 'text-primary' : 
                          kpi.trend === 'None' || kpi.trend === 'Empty' ? 'text-muted-foreground' : 
                          'text-success'
                        }`}>
                          {kpi.trend}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
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
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Select Excel File</CardTitle>
                    <CardDescription>Upload Excel files containing invoices data and schedule data</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid md:grid-cols-2 gap-6">
                      {/* Upload Invoices */}
                      <Card className="h-full flex flex-col">
                        <CardHeader className="pb-4">
                          <div className="flex items-center gap-2">
                            <div className="p-2 bg-primary/10 rounded-lg">
                              <FileSpreadsheet className="h-5 w-5 text-primary" />
                            </div>
                            <CardTitle className="text-lg">Upload Invoices</CardTitle>
                          </div>
                        </CardHeader>
                        <CardContent className="flex-1 flex flex-col">
                          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                            <p className="text-xs font-medium mb-1">Expected Format:</p>
                            <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                              <li>Invoice Number</li>
                              <li>Customer Name</li>
                              <li>Part Code</li>
                              <li>Quantity</li>
                            </ul>
                          </div>
                          <div
                            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors flex-1 flex items-center justify-center min-h-[200px] ${
                              dragActive ? 'border-primary bg-primary/5' : 'border-border'
                            }`}
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                          >
                            <div className="flex flex-col items-center gap-3 w-full">
                              <div className="p-2 bg-primary/10 rounded-full">
                                <Upload className="h-8 w-8 text-primary" />
                              </div>
                              <div>
                                <p className="text-sm font-medium mb-1">Drag and drop your file here</p>
                                <p className="text-xs text-muted-foreground mb-2">or</p>
                                <Button 
                                  type="button"
                                  variant="outline" 
                                  className="cursor-pointer" 
                                  size="sm"
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
                              {file && (
                                <p className="text-xs text-primary font-medium mt-1">
                                  ✓ {file.name}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground">Supported: .xlsx, .xls, .csv</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Upload Schedule */}
                      <Card className="h-full flex flex-col">
                        <CardHeader className="pb-4">
                          <div className="flex items-center gap-2">
                            <div className="p-2 bg-primary/10 rounded-lg">
                              <CalendarIcon className="h-5 w-5 text-primary" />
                            </div>
                            <CardTitle className="text-lg">Upload Schedule</CardTitle>
                          </div>
                        </CardHeader>
                        <CardContent className="flex-1 flex flex-col">
                          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                            <p className="text-xs font-medium mb-1">Expected Format:</p>
                            <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                              <li>Schedule data</li>
                              <li>Dispatch dates</li>
                              <li>Time slots</li>
                            </ul>
                          </div>
                          <div
                            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors flex-1 flex items-center justify-center min-h-[200px] ${
                              scheduleDragActive ? 'border-primary bg-primary/5' : 'border-border'
                            }`}
                            onDragEnter={handleScheduleDrag}
                            onDragLeave={handleScheduleDrag}
                            onDragOver={handleScheduleDrag}
                            onDrop={handleScheduleDrop}
                          >
                            <div className="flex flex-col items-center gap-3 w-full">
                              <div className="p-2 bg-primary/10 rounded-full">
                                <CalendarIcon className="h-8 w-8 text-primary" />
                              </div>
                              <div>
                                <p className="text-sm font-medium mb-1">Drag and drop your schedule file here</p>
                                <p className="text-xs text-muted-foreground mb-2">or</p>
                                <Button 
                                  type="button"
                                  variant="outline" 
                                  className="cursor-pointer" 
                                  size="sm"
                                  onClick={() => document.getElementById('schedule-file-upload')?.click()}
                                >
                                  Browse Files
                                </Button>
                                <input
                                  id="schedule-file-upload"
                                  type="file"
                                  className="hidden"
                                  accept=".xlsx,.xls,.csv"
                                  onChange={handleScheduleFileChange}
                                />
                              </div>
                              {scheduleFile && (
                                <p className="text-xs text-primary font-medium mt-1">
                                  ✓ {scheduleFile.name}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground">Supported: .xlsx, .xls, .csv</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </CardContent>
                </Card>

                {/* Continue Button - Only enabled when both files are uploaded */}
                <Card className="mt-6">
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center gap-4">
                      <div className="flex items-center gap-4 w-full max-w-md">
                        <div className={`flex-1 p-3 rounded-lg border-2 ${
                          file ? 'border-green-500 bg-green-50 dark:bg-green-950' : 'border-border bg-muted'
                        }`}>
                          <div className="flex items-center gap-2">
                            <FileSpreadsheet className={`h-5 w-5 ${file ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} />
                            <div className="flex-1">
                              <p className={`text-sm font-medium ${file ? 'text-green-700 dark:text-green-300' : 'text-muted-foreground'}`}>
                                Invoices
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {file ? file.name : 'Not uploaded'}
                              </p>
                            </div>
                            {file && <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />}
                          </div>
                        </div>
                        <div className={`flex-1 p-3 rounded-lg border-2 ${
                          scheduleFile ? 'border-green-500 bg-green-50 dark:bg-green-950' : 'border-border bg-muted'
                        }`}>
                          <div className="flex items-center gap-2">
                            <CalendarIcon className={`h-5 w-5 ${scheduleFile ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} />
                            <div className="flex-1">
                              <p className={`text-sm font-medium ${scheduleFile ? 'text-green-700 dark:text-green-300' : 'text-muted-foreground'}`}>
                                Schedule
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {scheduleFile ? scheduleFile.name : 'Not uploaded'}
                              </p>
                            </div>
                            {scheduleFile && <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />}
                          </div>
                        </div>
                      </div>
                      <Button
                        onClick={handleProceedToValidation}
                        disabled={!file || !scheduleFile}
                        className="h-12 px-8 text-base font-semibold"
                        size="lg"
                      >
                        {!file || !scheduleFile ? (
                          <>
                            {!file && !scheduleFile ? (
                              "Upload Both Files to Continue"
                            ) : !file ? (
                              "Upload Invoices File to Continue"
                            ) : (
                              "Upload Schedule File to Continue"
                            )}
                          </>
                        ) : (
                          <>
                            ✓ Continue to Validation
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </>
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
                    setScheduleFile(null);
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
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                      
                      {/* Schedule Matching Summary */}
                      <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                        <h4 className="font-semibold text-blue-700 dark:text-blue-300 mb-3">Schedule Matching</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <p className="text-xl font-bold text-foreground">{validationResults.invoiceCount}</p>
                            <p className="text-xs text-muted-foreground">Total Invoices</p>
                          </div>
                          <div>
                            <p className="text-xl font-bold text-foreground">{validationResults.scheduleItemCount}</p>
                            <p className="text-xs text-muted-foreground">Schedule Items</p>
                          </div>
                          <div>
                            <p className="text-xl font-bold text-green-600">{validationResults.matchedInvoices}</p>
                            <p className="text-xs text-muted-foreground">Matched Invoices</p>
                          </div>
                          <div>
                            <p className="text-xl font-bold text-orange-600">{validationResults.unmatchedInvoices}</p>
                            <p className="text-xs text-muted-foreground">Unmatched Invoices</p>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          Matched invoices will be available in Doc Audit. Only audited invoices can be dispatched.
                        </p>
                      </div>

                      {/* Actual Data Table */}
                      <div className="border rounded-lg overflow-hidden max-h-96 overflow-x-auto overflow-y-auto">
                        <table className="w-full text-xs sm:text-sm min-w-[600px]">
                          <thead className="bg-muted sticky top-0">
                            <tr>
                              <th className="text-left p-3 font-semibold">Invoice No</th>
                              <th className="text-left p-3 font-semibold">Customer</th>
                              <th className="text-left p-3 font-semibold">Customer Code</th>
                              <th className="text-left p-3 font-semibold">Part Code</th>
                              <th className="text-left p-3 font-semibold">Customer Item</th>
                              <th className="text-left p-3 font-semibold">Qty</th>
                              <th className="text-left p-3 font-semibold">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {uploadedData.length > 0 ? (
                              uploadedData.map((row, i) => {
                                const invoice = processedInvoices.find(inv => inv.id === row.invoice);
                                const customerCode = invoice?.billTo || '-';
                                const scheduledCustomerCodes = new Set(parsedScheduleItems.map(item => String(item.customerCode)));
                                const isInvoiceMatched = invoice?.billTo && scheduledCustomerCodes.has(String(invoice.billTo));
                                
                                // Determine status display text based on invoice-level matching
                                let statusText: string = row.status;
                                if (row.status === 'error' || row.status === 'warning') {
                                  statusText = row.status;
                                } else if (isInvoiceMatched) {
                                  statusText = 'matched';
                                } else {
                                  statusText = 'unmatched';
                                }
                                
                                return (
                                <tr key={i} className="border-t hover:bg-muted/50">
                                  <td className="p-3">{row.invoice}</td>
                                  <td className="p-3">{row.customer}</td>
                                  <td className="p-3">{customerCode}</td>
                                  <td className="p-3">{row.part}</td>
                                  <td className="p-3">{row.customerItem || '-'}</td>
                                  <td className="p-3">{row.qty}</td>
                                  <td className="p-3">
                                    <Badge variant={
                                      (row.status === 'valid-matched' || row.status === 'valid-unmatched') && isInvoiceMatched ? 'default' : 
                                      (row.status === 'valid-matched' || row.status === 'valid-unmatched') && !isInvoiceMatched ? 'outline' :
                                      row.status === 'error' ? 'destructive' : 
                                      'secondary'
                                    }>
                                      {row.status === 'error' && <XCircle className="h-3 w-3 mr-1" />}
                                      {row.status === 'warning' && <AlertTriangle className="h-3 w-3 mr-1" />}
                                      {statusText}
                                      {row.errorMessage && ` - ${row.errorMessage}`}
                                    </Badge>
                                  </td>
                                </tr>
                                );
                              })
                            ) : (
                              <tr>
                                <td colSpan={7} className="p-8 text-center text-muted-foreground">
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
                  // Reset selection states
                  setSelectedCustomerCode("");
                  setSelectedDeliveryDate(undefined);
                  setSelectedDeliveryTime("");
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
            
            {!scheduleData && (
              <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-sm font-medium">
                  ⚠️ No schedule uploaded yet. Please go to <strong>Upload Sales Data</strong> to import both schedule and invoice files first.
                </p>
              </div>
            )}
            
            {scheduleData && invoices.length === 0 && (
              <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-sm font-medium">
                  ⚠️ No invoices match the uploaded schedule. Please ensure the "Bill To" codes in your invoices match the "Customer Code" in the schedule.
                </p>
              </div>
            )}
            
            {scheduleData && invoices.length > 0 && (
              <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                  <p className="text-sm font-medium">
                    📊 Schedule-Based Doc Audit
                  </p>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>• Showing invoices that match the uploaded schedule</p>
                  <p>• Schedule uploaded: {scheduleData.uploadedAt.toLocaleString()}</p>
                  <p>• Current user: <strong>{currentUser}</strong></p>
                  {sharedInvoices.filter(inv => inv.dispatchedBy).length > 0 && (
                    <p>• ✅ <strong>{sharedInvoices.filter(inv => inv.dispatchedBy).length}</strong> invoice(s) already dispatched</p>
                  )}
                </div>
              </div>
            )}
            
            {/* Selection Fields: Customer Code, Delivery Date, Delivery Time */}
            {scheduleData && (
              <Card className="mb-6 border-2 border-primary">
                <CardHeader>
                  <CardTitle>Configure Dispatch Details</CardTitle>
                  <CardDescription>Select customer code, delivery date, and delivery time before selecting an invoice</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-3 gap-4">
                    {/* Customer Code Selection */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        Customer Code <span className="text-destructive">*</span>
                      </Label>
                      <Select 
                        value={selectedCustomerCode} 
                        onValueChange={(value) => {
                          setSelectedCustomerCode(value);
                          // Reset delivery date and delivery time when customer code changes
                          setSelectedDeliveryDate(undefined);
                          setSelectedDeliveryTime("");
                          setSelectedInvoice(""); // Reset invoice selection
                        }}
                      >
                        <SelectTrigger className={!selectedCustomerCode ? "border-destructive" : ""}>
                          <SelectValue placeholder="Select customer code" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableCustomerCodes.length === 0 ? (
                            <div className="p-4 text-center text-sm text-muted-foreground">
                              No customer codes available
                            </div>
                          ) : (
                            availableCustomerCodes.map(code => {
                              return (
                                <SelectItem key={code} value={code}>
                                  {code}
                                </SelectItem>
                              );
                            })
                          )}
                        </SelectContent>
                      </Select>
                      {!selectedCustomerCode && (
                        <p className="text-xs text-destructive">⚠️ Please select a customer code</p>
                      )}
                    </div>

                    {/* Delivery Date Selection */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <CalendarIcon className="h-4 w-4" />
                        Delivery Date <span className="text-destructive">*</span>
                      </Label>
                      <Select 
                        value={selectedDeliveryDate ? formatDateAsLocalString(selectedDeliveryDate) : ""} 
                        onValueChange={(value) => {
                          // Parse date string (YYYY-MM-DD) to Date object
                          // Use local date to avoid timezone issues
                          const [year, month, day] = value.split('-').map(Number);
                          const date = new Date(year, month - 1, day);
                          setSelectedDeliveryDate(date);
                          setSelectedInvoice(""); // Reset invoice selection
                        }}
                        disabled={!selectedCustomerCode}
                      >
                        <SelectTrigger className={!selectedDeliveryDate ? "border-destructive" : ""} disabled={!selectedCustomerCode}>
                          <SelectValue placeholder={selectedCustomerCode ? "Select delivery date" : "Select customer code first"}>
                            {selectedDeliveryDate 
                              ? selectedDeliveryDate.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
                              : undefined}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {availableDeliveryDates.length === 0 ? (
                            <div className="p-4 text-center text-sm text-muted-foreground">
                              {selectedCustomerCode ? "No delivery dates available" : "Select customer code first"}
                            </div>
                          ) : (
                            availableDeliveryDates.map(dateStr => {
                              // Parse date string (YYYY-MM-DD) to Date object in local timezone to avoid timezone issues
                              const [year, month, day] = dateStr.split('-').map(Number);
                              const date = new Date(year, month - 1, day);
                              return (
                                <SelectItem key={dateStr} value={dateStr}>
                                  {date.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                                </SelectItem>
                              );
                            })
                          )}
                        </SelectContent>
                      </Select>
                      {!selectedDeliveryDate && selectedCustomerCode && (
                        <p className="text-xs text-destructive">⚠️ Please select a delivery date</p>
                      )}
                      {!selectedCustomerCode && (
                        <p className="text-xs text-muted-foreground">Select customer code first</p>
                      )}
                    </div>

                    {/* Delivery Time Selection */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Delivery Time <span className="text-destructive">*</span>
                      </Label>
                      <Select 
                        value={selectedDeliveryTime} 
                        onValueChange={(value) => {
                          setSelectedDeliveryTime(value);
                          setSelectedInvoice(""); // Reset invoice selection
                        }}
                        disabled={!selectedCustomerCode || !selectedDeliveryDate}
                      >
                        <SelectTrigger className={!selectedDeliveryTime ? "border-destructive" : ""} disabled={!selectedCustomerCode || !selectedDeliveryDate}>
                          <SelectValue placeholder={selectedCustomerCode && selectedDeliveryDate ? "Select delivery time" : !selectedCustomerCode ? "Select customer code first" : "Select delivery date first"}>
                            {selectedDeliveryTime || undefined}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {availableDeliveryTimes.length === 0 ? (
                            <div className="p-4 text-center text-sm text-muted-foreground">
                              {selectedCustomerCode && selectedDeliveryDate ? "No delivery times available" : !selectedCustomerCode ? "Select customer code first" : "Select delivery date first"}
                            </div>
                          ) : (
                            availableDeliveryTimes.map(time => (
                              <SelectItem key={time} value={time}>
                                {time}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      {!selectedDeliveryTime && selectedCustomerCode && selectedDeliveryDate && (
                        <p className="text-xs text-destructive">⚠️ Please select a delivery time</p>
                      )}
                      {!selectedCustomerCode && (
                        <p className="text-xs text-muted-foreground">Select customer code first</p>
                      )}
                      {selectedCustomerCode && !selectedDeliveryDate && (
                        <p className="text-xs text-muted-foreground">Select delivery date first</p>
                      )}
                    </div>
                  </div>
                  
                  {/* Selection Status */}
                  <div className="mt-4 p-3 bg-muted rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold">Selection Status:</p>
                      {(selectedCustomerCode || selectedDeliveryDate || selectedDeliveryTime) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedCustomerCode("");
                            setSelectedDeliveryDate(undefined);
                            setSelectedDeliveryTime("");
                            setSelectedInvoice("");
                          }}
                          className="h-7 text-xs"
                        >
                          <X className="h-3 w-3 mr-1" />
                          Clear All
                        </Button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={selectedCustomerCode ? "default" : "outline"}>
                        Customer Code: {selectedCustomerCode || "Not selected"}
                      </Badge>
                      <Badge variant={selectedDeliveryDate ? "default" : "outline"}>
                        Delivery Date: {selectedDeliveryDate ? selectedDeliveryDate.toLocaleDateString() : "Not selected"}
                      </Badge>
                      <Badge variant={selectedDeliveryTime ? "default" : "outline"}>
                        Delivery Time: {selectedDeliveryTime || "Not selected"}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            
            {/* Invoice Selection */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Select Invoice</CardTitle>
                <CardDescription>
                  Choose an invoice to begin document audit
                  {selectedCustomerCode && selectedDeliveryDate && selectedDeliveryTime && (
                    <span className="block mt-1 text-success text-sm font-medium">
                      ✅ All selections made - Invoice selection is now enabled
                    </span>
                  )}
                  {(!selectedCustomerCode || !selectedDeliveryDate || !selectedDeliveryTime) && (
                    <span className="block mt-1 text-destructive text-sm font-medium">
                      ⚠️ Please select customer code, delivery date, and delivery time first
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {invoices.length === 0 ? (
                  <div className="p-4 bg-muted rounded-lg text-center">
                    <p className="text-sm text-muted-foreground">
                      {!selectedCustomerCode || !selectedDeliveryDate || !selectedDeliveryTime
                        ? "Please complete the selections above to see invoices"
                        : "No invoices matching your selections"}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="mb-3 p-2 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        📅 Showing {invoices.length} invoice(s). Scheduled for {selectedDeliveryDate?.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) || 'N/A'} and {selectedDeliveryTime || 'N/A'}
                      </p>
                    </div>
                <Select 
                  value={selectedInvoice} 
                  onValueChange={setSelectedInvoice}
                  disabled={!selectedCustomerCode || !selectedDeliveryDate || !selectedDeliveryTime}
                >
                  <SelectTrigger 
                    className={`h-12 text-base ${(!selectedCustomerCode || !selectedDeliveryDate || !selectedDeliveryTime) ? "opacity-50 cursor-not-allowed" : ""}`}
                    disabled={!selectedCustomerCode || !selectedDeliveryDate || !selectedDeliveryTime}
                  >
                    <SelectValue 
                      placeholder={
                        !selectedCustomerCode || !selectedDeliveryDate || !selectedDeliveryTime
                          ? "Complete selections above first"
                          : invoices.length === 0 
                          ? "No invoices available" 
                          : "Select an invoice"
                      } 
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {invoices.length === 0 ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        No invoices with matching schedule
                      </div>
                    ) : (
                      invoices.map(invoice => {
                        const scheduleItems = getScheduleForCustomer(invoice.billTo || '');
                        // Get updated scannedBins from sharedInvoices for accurate display
                        const invoiceInShared = sharedInvoices.find(inv => inv.id === invoice.id);
                        const scannedCount = invoiceInShared?.scannedBins ?? invoice.scannedBins;
                        const expectedCount = invoiceInShared?.expectedBins ?? invoice.expectedBins;
                        const isAudited = invoiceInShared?.auditComplete ?? invoice.auditComplete;
                        const isBlocked = invoiceInShared?.blocked ?? invoice.blocked ?? false;
                        // Calculate unique Customer Items for display
                        const invoiceItems = invoiceInShared?.items || invoice.items || [];
                        const uniqueCustItems = new Set<string>();
                        invoiceItems.forEach((item: UploadedRow) => {
                          if (item.customerItem && item.customerItem.trim() !== '') {
                            uniqueCustItems.add(item.customerItem.trim());
                          }
                        });
                        const totalCustItems = uniqueCustItems.size;
                        return (
                          <SelectItem key={invoice.id} value={invoice.id} disabled={isBlocked}>
                            {invoice.id} - {invoice.customer} ({scannedCount}/{totalCustItems} Customer Items)
                            {isAudited && ' ✓ Audited'}
                            {isBlocked && ' ⛔ Blocked'}
                          </SelectItem>
                        );
                      })
                    )}
                  </SelectContent>
                </Select>
                  </>
                )}

                {invoiceForDisplay && (
                  <div className="mt-6 p-4 bg-muted rounded-lg">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-3">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Invoice No</p>
                        <p className="font-semibold">{invoiceForDisplay.id}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Customer</p>
                        <p className="font-semibold">{invoiceForDisplay.customer}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Customer Code</p>
                        <p className="font-semibold">{invoiceForDisplay.billTo || 'N/A'}</p>
                      </div>
                    </div>
                    
                    {/* Line Items Section */}
                    {uniqueCustomerItems.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-border">
                        <p className="text-xs font-semibold text-muted-foreground mb-2">Line Items</p>
                        <div className="border rounded-lg overflow-hidden">
                          <table className="w-full text-xs">
                            <thead className="bg-muted/50">
                              <tr>
                                <th className="text-left p-2 font-semibold">Customer Item</th>
                                <th className="text-left p-2 font-semibold">Item Number</th>
                                <th className="text-left p-2 font-semibold">Part Description</th>
                              </tr>
                            </thead>
                            <tbody>
                              {uniqueCustomerItems.map((item, index) => {
                                const isScanned = validatedBins.some(bin => bin.customerItem === item.customerItem);
                                return (
                                  <tr key={index} className={`border-t ${isScanned ? 'bg-green-50 dark:bg-green-950/20' : ''}`}>
                                    <td className="p-2 font-medium">{item.customerItem}</td>
                                    <td className="p-2">{item.itemNumber}</td>
                                    <td className="p-2 text-muted-foreground">{item.partDescription || 'N/A'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    
                    <div className="flex gap-2 flex-wrap pt-2 border-t border-border mt-3">
                      {invoiceForDisplay?.uploadedBy && (
                        <Badge variant="outline" className="text-xs">
                          <Upload className="h-3 w-3 mr-1" />
                          Uploaded by: {invoiceForDisplay.uploadedBy}
                        </Badge>
                      )}
                      {invoiceForDisplay?.auditedBy && (
                        <Badge variant="default" className="text-xs">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Audited by: {invoiceForDisplay.auditedBy}
                        </Badge>
                      )}
                      {invoiceForDisplay?.blocked && (
                        <Badge variant="destructive" className="text-xs">
                          <XCircle className="h-3 w-3 mr-1" />
                          Blocked
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
                    setCustomerScan(null);
                    setAutolivScan(null);
                  }}
                  className="flex items-center gap-2 mb-4 text-sm sm:text-base"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Change Invoice</span>
                  <span className="sm:hidden">Back</span>
                </Button>

                {/* Blocked Warning Card */}
                {invoiceForDisplay?.blocked && (
                  <Card className="mb-6 border-2 border-red-500 bg-red-50 dark:bg-red-950">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-red-900 dark:text-red-100">
                        <XCircle className="h-5 w-5" />
                        Admin Approval Needed
                      </CardTitle>
                      <CardDescription className="text-red-700 dark:text-red-300">
                        This invoice has a barcode mismatch and cannot be scanned until an admin marks it as corrected.
                        Please contact your supervisor to resolve this issue.
                      </CardDescription>
                    </CardHeader>
                  </Card>
                )}
                
              <Card className={`mb-6 ${invoiceForDisplay?.blocked ? "opacity-60" : ""}`}>
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <ScanBarcode className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Barcode Scanning & Validation</CardTitle>
                      <CardDescription>
                        {invoiceForDisplay?.blocked 
                          ? "Admin approval needed - Scanning disabled" 
                          : "Scan both customer and Autoliv labels to validate"}
                      </CardDescription>
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
                            if (invoiceForDisplay?.blocked) {
                              toast.error("⚠️ Invoice is Blocked", {
                                description: "This invoice has a mismatch. Please wait for admin to mark it as corrected.",
                                duration: 5000,
                              });
                              return;
                            }
                            setCustomerScan(data);
                            toast.success("Customer barcode scanned!");
                          }}
                          label={customerScan ? "Scan Again" : "Scan Customer Barcode"}
                          variant="default"
                          matchValue={autolivScan?.rawValue || undefined}
                          shouldMismatch={!!autolivScan}
                          matchData={autolivScan || undefined}
                          totalQuantity={invoiceForDisplay?.totalQty}
                          binCapacity={invoiceForDisplay?.binCapacity}
                          expectedBins={invoiceForDisplay?.expectedBins}
                          currentBinIndex={invoiceForDisplay?.scannedBins}
                          disabled={invoiceForDisplay?.blocked}
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
                          totalQuantity={invoiceForDisplay?.totalQty}
                          binCapacity={invoiceForDisplay?.binCapacity}
                          expectedBins={invoiceForDisplay?.expectedBins}
                          currentBinIndex={invoiceForDisplay?.scannedBins}
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
                            setFirstScanType(null);
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

            {/* Scanned Customer Items Table */}
              <Card>
                <CardHeader>
                  <CardTitle>Scanned Customer Items ({validatedBins.length})</CardTitle>
                  <CardDescription>Real-time list of scanned and validated Customer Items</CardDescription>
                </CardHeader>
                <CardContent>
                  {validatedBins.length > 0 ? (
                    <>
                      <div className="border rounded-lg overflow-hidden overflow-x-auto">
                        <table className="w-full text-xs sm:text-sm min-w-[600px]">
                        <thead className="bg-muted">
                          <tr>
                            <th className="text-left p-3 font-semibold">Customer Item</th>
                            <th className="text-left p-3 font-semibold">Item Number</th>
                            <th className="text-left p-3 font-semibold">Quantity</th>
                            <th className="text-left p-3 font-semibold">Status</th>
                            <th className="text-left p-3 font-semibold">Scanned By</th>
                            <th className="text-left p-3 font-semibold">Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {validatedBins.map((bin, i) => (
                            <tr key={i} className="border-t hover:bg-muted/50">
                              <td className="p-3 font-medium">{bin.customerItem}</td>
                              <td className="p-3 font-mono">{bin.itemNumber}</td>
                              <td className="p-3 font-semibold">{bin.quantity}</td>
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
                      
                      {/* Complete Audit Button - appears when all Customer Items are scanned */}
                      {invoiceForProgress && scannedCustomerItemsCount >= totalCustomerItemsCount && !invoiceForProgress.auditComplete && (
                        <div className="mt-6 p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-green-700 dark:text-green-300 mb-1">
                                ✅ All Customer Items Scanned: {scannedCustomerItemsCount}/{totalCustomerItemsCount}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                All Customer Items scanned and validated. Click "Complete Audit" to finish.
                              </p>
                            </div>
                            <Button
                              onClick={() => {
                                if (invoiceForProgress) {
                                  updateInvoiceAudit(invoiceForProgress.id, {
                                    auditComplete: true,
                                    auditDate: new Date()
                                  }, currentUser);
                                  toast.success("🎉 Audit completed successfully!");
                                  setSelectedInvoice("");
                                  setCustomerScan(null);
                                  setAutolivScan(null);
                                  setFirstScanType(null);
                                  setValidatedBins([]);
                                }
                              }}
                              className="flex items-center gap-2 h-10 w-full sm:w-auto"
                              variant="default"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Complete Audit
                            </Button>
                          </div>
                        </div>
                      )}
                      
                      {/* Audit Complete Message - appears after audit is completed */}
                      {invoiceForProgress?.auditComplete && (
                        <div className="mt-6 p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-green-700 dark:text-green-300 mb-1">
                                ✅ Audit Complete for {invoiceForProgress.id}
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
                                setFirstScanType(null);
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
                                    <p className="text-muted-foreground">Customer Items</p>
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
                    setDispatchCustomerScan(null);
                    setDispatchAutolivScan(null);
                    setLoadedBarcodes([]);
                    setGatepassGenerated(false);
                    setSelectInvoiceValue("");
                    setGatepassNumber("");
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
            
            {!scheduleData && (
              <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-sm font-medium">
                  ⚠️ No schedule uploaded yet. Please go to <strong>Upload Sales Data</strong> to import both schedule and invoice files first.
                </p>
              </div>
            )}
            
            {scheduleData && getScheduledDispatchableInvoices().length === 0 && (
              <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-sm font-medium mb-2">
                  📋 No scheduled invoices available for dispatch.
                </p>
                <p className="text-xs text-muted-foreground">
                  {sharedInvoices.filter(inv => inv.dispatchedBy).length > 0 
                    ? `✅ All scheduled invoices have been dispatched. Upload new data or complete pending audits.`
                    : `Please complete document audit for scheduled invoices before dispatch.`
                  }
                </p>
              </div>
            )}
            
            {scheduleData && getScheduledDispatchableInvoices().length > 0 && (
              <div className="mb-4 p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-sm font-medium mb-2">
                  ✅ Scheduled Dispatch Available
                </p>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>• Showing {getScheduledDispatchableInvoices().length} audited invoice(s) with matching schedule</p>
                  <p>• Schedule uploaded: {scheduleData.uploadedAt.toLocaleString()}</p>
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
                            value={selectInvoiceValue}
                            onValueChange={(value) => {
                              // Reset the select value immediately to prevent auto-selection
                              setSelectInvoiceValue("");
                              
                              // Only process if value is explicitly selected and not empty/no-invoices
                              if (value && value !== "no-invoices" && value.trim() !== "") {
                                const selectedInvoice = sharedInvoices.find(inv => inv.id === value);
                                if (selectedInvoice) {
                                  // Ensure invoice is audited and not dispatched
                                  if (!selectedInvoice.auditComplete) {
                                    toast.error("Invoice not audited", {
                                      description: "Please complete audit before selecting for dispatch"
                                    });
                                    return;
                                  }
                                  if (selectedInvoice.dispatchedBy) {
                                    toast.error("Invoice already dispatched", {
                                      description: "This invoice has already been dispatched"
                                    });
                                    return;
                                  }
                                  
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
                              {getScheduledDispatchableInvoices().filter(inv => inv.id !== "No Data").length > 0 ? (
                                getScheduledDispatchableInvoices().filter(inv => inv.id !== "No Data").map(invoice => {
                                  const currentCustomer = selectedInvoices.length > 0 
                                    ? sharedInvoices.find(inv => inv.id === selectedInvoices[0])?.customer 
                                    : null;
                                  const isDifferentCustomer = currentCustomer && currentCustomer !== invoice.customer;
                                  const isAlreadySelected = selectedInvoices.includes(invoice.id);
                                  const scheduleItems = getScheduleForCustomer(invoice.billTo || '');

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
                                          {scheduleItems.length > 0 && (
                                            <Badge variant="secondary" className="text-xs">
                                              {scheduleItems.length} items
                                            </Badge>
                                          )}
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
                                <div className="p-4 text-center text-sm text-muted-foreground">
                                  No scheduled audited invoices available for dispatch
                                </div>
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
                                  setSelectInvoiceValue("");
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
                                          <p className="text-muted-foreground">Customer Items</p>
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
                                        setSelectInvoiceValue("");
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
                          <CardDescription>Scan customer barcode for each item to load onto the vehicle</CardDescription>
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
                              {loadedBarcodes.length} of {getExpectedBarcodes()} items loaded
                            </span>
                          </div>
                          <Progress 
                            value={getExpectedBarcodes() > 0 ? (loadedBarcodes.length / getExpectedBarcodes()) * 100 : 0} 
                            className="h-2"
                          />
                        </div>

                        {/* Scanning Inputs - Only Customer Barcode for Dispatch */}
                        <div className="flex justify-center">
                          <div className="w-full max-w-lg">
                            {/* Customer Label Scan */}
                            <div className="space-y-4">
                              <div className="text-center mb-4">
                                <Label htmlFor="dispatch-customer-barcode" className="flex items-center justify-center gap-2 text-base font-semibold">
                                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-bold">1</span>
                                  Scan Customer Label
                                </Label>
                                <p className="text-sm text-muted-foreground mt-2">
                                  Scan the customer barcode to load the item
                                </p>
                              </div>
                              
                              {dispatchCustomerScan && (
                                <div className="p-4 bg-muted rounded-lg border-2 border-primary/20">
                                  <p className="text-sm font-semibold text-foreground mb-3 text-center">Scanned Data:</p>
                                  <div className="grid grid-cols-3 gap-4">
                                    <div className="text-center">
                                      <p className="text-xs text-muted-foreground mb-1">Part Code</p>
                                      <p className="text-sm font-mono font-bold break-all">{dispatchCustomerScan.partCode}</p>
                                    </div>
                                    <div className="text-center">
                                      <p className="text-xs text-muted-foreground mb-1">Quantity</p>
                                      <p className="text-sm font-mono font-bold">{dispatchCustomerScan.quantity}</p>
                                    </div>
                                    <div className="text-center">
                                      <p className="text-xs text-muted-foreground mb-1">Bin Number</p>
                                      <p className="text-sm font-mono font-bold break-all">{dispatchCustomerScan.binNumber}</p>
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
                                matchValue={getNextUnscannedBarcodePair()?.customerBarcode}
                                shouldMismatch={false}
                                totalQuantity={selectedInvoices.length > 0 ? sharedInvoices.find(inv => selectedInvoices.includes(inv.id))?.totalQty : undefined}
                                binCapacity={selectedInvoices.length > 0 ? sharedInvoices.find(inv => selectedInvoices.includes(inv.id))?.binCapacity : undefined}
                                expectedBins={selectedInvoices.length > 0 ? sharedInvoices.find(inv => selectedInvoices.includes(inv.id))?.expectedBins : undefined}
                                currentBinIndex={loadedBarcodes.length}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Status and Clear Button */}
                        {dispatchCustomerScan && (
                          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                            <div className="flex items-center gap-2">
                              <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
                              <span className="text-sm font-medium text-green-700 dark:text-green-300">
                                ✓ Customer Label Scanned - Item loaded automatically
                              </span>
                            </div>
                            <Button 
                              variant="outline"
                              onClick={() => {
                                setDispatchCustomerScan(null);
                                setDispatchAutolivScan(null);
                              }}
                              className="h-9 text-sm"
                            >
                              Clear Scan
                            </Button>
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
                                    {barcodePair.customerItem && (
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground min-w-[100px]">Customer Item:</span>
                                        <span className="font-medium text-xs">{barcodePair.customerItem}</span>
                                      </div>
                                    )}
                                    {barcodePair.itemNumber && (
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground min-w-[100px]">Item Number:</span>
                                        <span className="font-mono text-xs">{barcodePair.itemNumber}</span>
                                      </div>
                                    )}
                                    {(barcodePair.actualQuantity !== undefined) && (
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground min-w-[100px]">Quantity:</span>
                                        <span className="font-semibold text-xs">{barcodePair.actualQuantity}</span>
                                      </div>
                                    )}
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
                {selectedInvoices.length > 0 && loadedBarcodes.length === getExpectedBarcodes() && (
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
                  onClick={() => {
                    setGatepassGenerated(false);
                    setGatepassNumber("");
                  }}
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
                  <CardDescription>Gatepass #{gatepassNumber || `GP-${Date.now().toString().slice(-8)}`}</CardDescription>
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
                        <p className="font-semibold">{currentUser}</p>
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

                    {/* QR Code with Gatepass Data */}
                    <div className="flex flex-col items-center pt-4 border-t">
                      <p className="text-sm font-semibold mb-3 text-muted-foreground">Scan QR Code for Details</p>
                      <div className="p-4 bg-white rounded-lg border-2 border-border shadow-sm">
                        <QRCodeSVG
                          value={generateGatepassQRData()}
                          size={300}
                          level="H"
                          includeMargin={true}
                          marginSize={4}
                          bgColor="#FFFFFF"
                          fgColor="#000000"
                        />
                      </div>
                      <div className="mt-4 p-3 bg-muted rounded-lg w-full max-w-md">
                        <p className="text-xs font-semibold text-muted-foreground mb-2">QR Code Contains:</p>
                        <div className="text-xs space-y-1 text-foreground">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Customer:</span>
                            <span className="font-medium">{[...new Set(sharedInvoices.filter(inv => selectedInvoices.includes(inv.id)).map(inv => inv.customer))].join(", ")}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Part Codes:</span>
                            <span className="font-medium">{[...new Set(loadedBarcodes.map(b => b.partCode).filter(Boolean))].length} unique</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Bin Numbers:</span>
                            <span className="font-medium">{[...new Set(loadedBarcodes.map(b => b.binNumber).filter(Boolean))].length} unique</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Total Quantity:</span>
                            <span className="font-medium">{loadedBarcodes.reduce((sum, b) => sum + (parseInt(b.quantity || '0') || 0), 0)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Vehicle:</span>
                            <span className="font-medium">{vehicleNumber}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="grid grid-cols-2 gap-3">
                    <Button 
                      variant="outline" 
                      className="h-12"
                      onClick={handlePrintGatepass}
                    >
                      <Printer className="h-5 w-5 mr-2" />
                      Print Gatepass
                    </Button>
                    <Button 
                      variant="outline" 
                      className="h-12"
                      onClick={handleDownloadPDF}
                    >
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
                        setSelectInvoiceValue("");
                        setGatepassNumber("");
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
                        setSelectInvoiceValue("");
                        setGatepassNumber("");
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
