import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import * as XLSX from 'xlsx';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  ArrowLeft,
  Calendar as CalendarIcon,
  XCircle,
  AlertTriangle
} from "lucide-react";
import { useSession } from "@/contexts/SessionContext";
import { LogsDialog } from "@/components/LogsDialog";
import type { ScheduleItem, InvoiceData } from "@/contexts/SessionContext";
import { invoicesApi, scheduleApi } from "@/lib/api";
import { getCustomerCode } from "@/lib/customerCodes";
import { UploadDropzoneCard } from "@/components/upload/UploadDropzoneCard";

interface UploadedRow {
  invoice: string;
  customer: string;
  part: string;
  qty: number;
  status: 'valid' | 'error' | 'warning';
  errorMessage?: string;
  customerItem?: string;
  partDescription?: string;
  billTo?: string;
  invoiceDate?: Date;
}

const UploadData = () => {
  const navigate = useNavigate();
  const {
    currentUser,
    refreshData,
    getUploadLogs,
    selectedCustomer
  } = useSession();

  const [file, setFile] = useState<File | null>(null);
  const [scheduleFile, setScheduleFile] = useState<File | null>(null);
  const [uploadStage, setUploadStage] = useState<'upload' | 'validate' | 'complete'>('upload');
  const [uploadedData, setUploadedData] = useState<UploadedRow[]>([]);
  const [processedInvoices, setProcessedInvoices] = useState<InvoiceData[]>([]);
  const [parsedScheduleItems, setParsedScheduleItems] = useState<ScheduleItem[]>([]);
  const [showUploadLogs, setShowUploadLogs] = useState(false);

  // Debug: Log when uploadedData changes to verify state updates
  useEffect(() => {
    if (uploadedData.length > 0) {
      const validCount = uploadedData.filter(r => r.status === 'valid').length;
      const errorCount = uploadedData.filter(r => r.status === 'error').length;
      console.log('📊 [useEffect] uploadedData state changed:', {
        total: uploadedData.length,
        valid: validCount,
        error: errorCount
      });
    }
  }, [uploadedData]);

  // Helper function to convert Excel date serial number to Date
  const excelDateToJSDate = (serial: number): Date => {
    const utc_days = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;
    const date_info = new Date(utc_value * 1000);
    return new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate());
  };

  // Helper function to parse date from various formats (shared for invoice and schedule parsing).
  // IMPORTANT: Avoid JS Date overflow bugs (e.g. "21/01/2026" accidentally becoming "2027-09-01").
  // Prefer DD/MM/YYYY for customer files.
  const parseDate = (value: unknown): Date | undefined => {
    if (value === null || value === undefined || value === '') return undefined;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }

    const isLikelyExcelSerial = (n: number) => Number.isFinite(n) && n >= 30000 && n <= 80000;

    if (typeof value === 'number') {
      if (!isLikelyExcelSerial(Math.floor(value))) return undefined;
      return excelDateToJSDate(value);
    }

    const s = (typeof value === 'string' ? value : String(value)).trim();
    if (!s) return undefined;

    // Numeric strings might be Excel serial dates.
    if (/^\d+(\.\d+)?$/.test(s)) {
      const n = Number(s);
      if (isLikelyExcelSerial(Math.floor(n))) return excelDateToJSDate(n);
      return undefined;
    }

    const makeLocalDateStrict = (year: number, month1to12: number, day1to31: number): Date | undefined => {
      if (!Number.isInteger(year) || year < 1900 || year > 2200) return undefined;
      if (!Number.isInteger(month1to12) || month1to12 < 1 || month1to12 > 12) return undefined;
      if (!Number.isInteger(day1to31) || day1to31 < 1 || day1to31 > 31) return undefined;
      const dim = new Date(year, month1to12, 0).getDate();
      if (day1to31 > dim) return undefined;
      const d = new Date(year, month1to12 - 1, day1to31);
      if (d.getFullYear() !== year || d.getMonth() !== month1to12 - 1 || d.getDate() !== day1to31) return undefined;
      return d;
    };

    // ISO date-only or ISO-ish (strip time part)
    const datePart = s.split('T')[0].trim();
    {
      const m = datePart.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
      if (m) {
        const year = parseInt(m[1], 10);
        const month = parseInt(m[2], 10);
        const day = parseInt(m[3], 10);
        return makeLocalDateStrict(year, month, day);
      }
    }

    // DD/MM/YYYY or MM/DD/YYYY (prefer DD/MM/YYYY)
    {
      const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+.*)?$/);
      if (m) {
        const a = parseInt(m[1], 10);
        const b = parseInt(m[2], 10);
        const year = parseInt(m[3], 10);

        const dmy = makeLocalDateStrict(year, b, a);
        if (dmy) return dmy;
        const mdy = makeLocalDateStrict(year, a, b);
        if (mdy) return mdy;
      }
    }

    // Month-name formats (e.g., 21-Jan-2026 / 21 January 2026) with optional trailing time text
    {
      const monthMap: Record<string, number> = {
        jan: 1, january: 1,
        feb: 2, february: 2,
        mar: 3, march: 3,
        apr: 4, april: 4,
        may: 5,
        jun: 6, june: 6,
        jul: 7, july: 7,
        aug: 8, august: 8,
        sep: 9, sept: 9, september: 9,
        oct: 10, october: 10,
        nov: 11, november: 11,
        dec: 12, december: 12,
      };

      // 21-Jan-2026 / 21-Jan-26
      const m1 = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{2}|\d{4})(?:\s+.*)?$/);
      if (m1) {
        const day = parseInt(m1[1], 10);
        const monthToken = m1[2].toLowerCase();
        const month = monthMap[monthToken];
        if (month) {
          let year = parseInt(m1[3], 10);
          if (m1[3].length === 2) year = 2000 + year;
          const d = makeLocalDateStrict(year, month, day);
          if (d) return d;
        }
      }

      // 21 January 2026 / 21 January 26
      const m2 = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2}|\d{4})(?:\s+.*)?$/);
      if (m2) {
        const day = parseInt(m2[1], 10);
        const monthToken = m2[2].toLowerCase();
        const month = monthMap[monthToken];
        if (month) {
          let year = parseInt(m2[3], 10);
          if (m2[3].length === 2) year = 2000 + year;
          const d = makeLocalDateStrict(year, month, day);
          if (d) return d;
        }
      }
    }

    return undefined;
  };

  // Helper function to format date as YYYY-MM-DD in local timezone
  const formatDateAsLocalString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleInvoiceFileSelected = (selected: File) => {
    setFile(selected);
    toast.success("Invoices file selected!");
  };

  const handleScheduleFileSelected = (selected: File) => {
    setScheduleFile(selected);
    toast.success("Schedule file selected!");
  };

  // Parse invoice file (see Dashboard.tsx lines 327-736 for full implementation)
  const parseFile = async (file: File) => {
    return new Promise<{ rows: UploadedRow[], invoices: InvoiceData[] }>((resolve, reject) => {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
        || (window.innerWidth < 768 && ('ontouchstart' in window));
      const maxSize = isMobile ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
      
      if (file.size > maxSize) {
        reject(new Error(`File too large. Please use files smaller than ${Math.round(maxSize / (1024 * 1024))}MB.`));
        return;
      }
      
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
          
          let workbook;
          try {
            workbook = XLSX.read(data, { 
              type: 'array',
              cellDates: false,
              raw: false,
              WTF: false
            });
          } catch (parseError) {
            workbook = XLSX.read(data, { 
              type: 'array',
              cellDates: false,
              raw: false
            });
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
          
          let jsonData: unknown[];
          let headers: string[] = [];
          let dataRows: string[][] = [];
          
          try {
            jsonData = XLSX.utils.sheet_to_json(firstSheet, {
              defval: '',
              raw: false,
              range: isMobile ? 1000 : undefined
            });
            
            if (!jsonData || jsonData.length === 0) {
              throw new Error('No data with object format');
            }
            
            if (jsonData.length > 0 && typeof jsonData[0] === 'object' && jsonData[0] !== null) {
              headers = Object.keys(jsonData[0] as Record<string, unknown>);
              dataRows = jsonData.map((row) => {
                const rec = (row && typeof row === 'object') ? (row as Record<string, unknown>) : {};
                return headers.map((header) => String(rec[header] ?? ''));
              });
            } else {
              throw new Error('Invalid object format');
            }
          } catch (objectError) {
            try {
              jsonData = XLSX.utils.sheet_to_json(firstSheet, {
                header: 1,
                defval: '',
                raw: false,
                range: isMobile ? 1000 : undefined
              });
              
              if (!jsonData || jsonData.length === 0) {
                throw new Error('No data with array format');
              }
              
              if (Array.isArray(jsonData[0])) {
                headers = jsonData[0] as string[];
                dataRows = jsonData.slice(1) as string[][];
              } else {
                throw new Error('Invalid array format');
              }
            } catch (arrayError) {
              try {
                const range = XLSX.utils.decode_range(firstSheet['!ref'] || 'A1');
                
                const tempHeaders: string[] = [];
                for (let col = range.s.c; col <= range.e.c; col++) {
                  const cellAddress = XLSX.utils.encode_cell({ r: range.s.r, c: col });
                  const cell = firstSheet[cellAddress];
                  tempHeaders.push(cell ? String(cell.v || cell.w || '') : '');
                }
                
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
                
                if (tempHeaders.length > 0 && tempRows.length > 0) {
                  headers = tempHeaders;
                  dataRows = tempRows;
                } else {
                  throw new Error('Manual extraction failed - no data found');
                }
              } catch (manualError) {
                reject(new Error('Unable to read file. Please try a different Excel file or contact support.'));
                return;
              }
            }
          }
          
          if (isMobile && dataRows.length > 500) {
            reject(new Error('File has too many rows for mobile processing. Please use a file with fewer than 500 rows.'));
            return;
          }
          
          if (!headers || headers.length === 0) {
            reject(new Error('No headers found in the file'));
            return;
          }
          
          // Debug: Log detected headers
          console.log('\n🔍 DEBUG: Invoice File Headers');
          console.log(`  Total headers: ${headers.length}`);
          console.log(`  Headers:`, headers);
          console.log(`  Looking for "Customer Item":`, headers.some(h => h.toLowerCase().includes('customer') && h.toLowerCase().includes('item')));
          console.log(`  Headers containing "Customer":`, headers.filter(h => h.toLowerCase().includes('customer')));
          console.log(`  Headers containing "Item":`, headers.filter(h => h.toLowerCase().includes('item')));
          console.log('================================\n');
          
          const parsedData: UploadedRow[] = dataRows.map((row: string[], index: number) => {
            const rowObj: Record<string, string> = {};
            headers.forEach((header, colIndex) => {
              rowObj[header] = row[colIndex] || '';
            });
            
            const invoice = rowObj['Invoice Number'] || rowObj['Invoice'] || rowObj['invoice'] || rowObj['Invoice No'] || rowObj['InvoiceNo'] || '';
            const customer = rowObj['Customer Name'] || rowObj['Cust Name'] || rowObj['Customer'] || rowObj['customer'] || rowObj['CustomerName'] || '';
            const billTo = rowObj['Bill To'] || rowObj['BillTo'] || rowObj['bill to'] || rowObj['Bill-To'] || '';
            const part = rowObj['Item Number'] || rowObj['ItemNumber'] || rowObj['Part'] || rowObj['part'] || rowObj['Part Code'] || rowObj['PartCode'] || rowObj['Part Number'] || '';
            const qtyRaw = rowObj['Quantity Invoiced'] || rowObj['Qty'] || rowObj['qty'] || rowObj['Quantity'] || rowObj['quantity'] || '';
            const qty = Math.round(parseFloat(String(qtyRaw || '')));
            const customerItem = rowObj['Customer Item'] || rowObj['CustomerItem'] || rowObj['customer item'] || rowObj['Customer-Item'] || rowObj['Cust Item'] || rowObj['CustItem'] || rowObj['Customer Part'] || rowObj['CustomerPart'] || '';
            const partDescription = rowObj['Part Description'] || rowObj['PartDescription'] || rowObj['part description'] || rowObj['Part-Description'] || rowObj['Description'] || rowObj['description'] || rowObj['Part Desc'] || rowObj['PartDesc'] || '';

            const invoiceDateCell =
              rowObj['Invoice Date'] || rowObj['InvoiceDate'] || rowObj['invoice date'] || rowObj['Inv Date'] || rowObj['Date'] || '';
            const invoiceDate = parseDate(invoiceDateCell);
            
            let status: 'valid' | 'error' | 'warning' = 'valid';
            let errorMessage = '';
            
            if (!invoice || invoice.toString().trim() === '') {
              status = 'error';
              errorMessage = 'Missing invoice number';
            } else if (!billTo || billTo.toString().trim() === '') {
              status = 'error';
              errorMessage = 'Missing Bill To';
            } else if (!invoiceDate) {
              status = 'error';
              errorMessage = 'Missing/Invalid Invoice Date';
            } else if (!customer || customer.toString().trim() === '') {
              status = 'error';
              errorMessage = 'Missing customer name';
            } else if (!part || part.toString().trim() === '') {
              status = 'error';
              errorMessage = 'Missing item number';
            } else if (!customerItem || customerItem.toString().trim() === '') {
              status = 'error';
              errorMessage = 'Missing Customer Item';
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
              partDescription: partDescription ? partDescription.toString() : undefined,
              billTo: billTo ? billTo.toString() : undefined,
              invoiceDate
            };
          });
          
          const invoiceMap = new Map<string, InvoiceData>();
          
          dataRows.forEach((row: string[], index: number) => {
            const rowObj: Record<string, string> = {};
            headers.forEach((header, colIndex) => {
              rowObj[header] = row[colIndex] || '';
            });
            
            const invoiceNum = rowObj['Invoice Number'] || rowObj['Invoice'] || rowObj['invoice'] || '';
            const customer = rowObj['Customer Name'] || rowObj['Cust Name'] || rowObj['Customer'] || rowObj['customer'] || '';
            const qtyRaw = rowObj['Quantity Invoiced'] || rowObj['Qty'] || rowObj['qty'] || rowObj['Quantity'] || rowObj['quantity'] || '';
            const qty = Math.round(parseFloat(String(qtyRaw || '')));
            const billTo = rowObj['Bill To'] || rowObj['BillTo'] || rowObj['bill to'] || rowObj['Bill-To'] || '';
            const plant = rowObj['Ship To'] || rowObj['ShipTo'] || rowObj['Ship-To'] || 
                         rowObj['Plant'] || rowObj['plant'] || 
                         rowObj['Delivery Location'] || rowObj['DeliveryLocation'] || 
                         rowObj['Destination'] || rowObj['destination'] || '';
            const parsedInvoiceDate = parsedData[index]?.invoiceDate;
            const invoiceDate = parsedInvoiceDate || new Date();
            
            if (!invoiceMap.has(invoiceNum.toString())) {
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
                billTo: billTo.toString(),
                plant: plant ? plant.toString() : undefined
              });
            }
            
            const invoice = invoiceMap.get(invoiceNum.toString())!;
            invoice.totalQty += Math.abs(qty);
            invoice.items.push(parsedData[index]);
          });
          
          invoiceMap.forEach((invoice) => {
            const uniqueCustomerItems = new Set<string>();
            invoice.items.forEach((item: UploadedRow) => {
              if (item.customerItem && item.customerItem.trim() !== '') {
                uniqueCustomerItems.add(item.customerItem.trim());
              }
            });
            invoice.expectedBins = uniqueCustomerItems.size;
          });
          
          const invoices = Array.from(invoiceMap.values());
          
          resolve({ rows: parsedData, invoices });
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read file. Please ensure the file is not corrupted and try again.'));
      };
      
      reader.onabort = () => {
        reject(new Error('File reading was cancelled. Please try again.'));
      };
      
      reader.readAsArrayBuffer(file);
    });
  };

  // Parse schedule file (see Dashboard.tsx lines 739-958 for full implementation)
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
          
          const allScheduleItems: ScheduleItem[] = [];
          
          // Helper function for case-insensitive column lookup
          const getColumnValue = (row: Record<string, unknown>, variations: string[]): string => {
            for (const variation of variations) {
              if (row[variation] !== undefined && row[variation] !== '') {
                // Convert to string to handle numbers from Excel
                return String(row[variation]);
              }
              const rowKeys = Object.keys(row);
              const matchedKey = rowKeys.find(key => 
                key.toLowerCase().trim() === variation.toLowerCase().trim()
              );
              if (matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== '') {
                // Convert to string to handle numbers from Excel
                return String(row[matchedKey]);
              }
            }
            return '';
          };
          
          // Helper to parse numeric value from quantity columns
          const parseQuantity = (value: unknown): number | null => {
            if (value === null || value === undefined || value === '') {
              return null;
            }
            if (typeof value === 'number') {
              return isNaN(value) ? null : value;
            }
            if (typeof value === 'string') {
              const trimmed = value.trim();
              if (!trimmed) return null;
              const parsed = parseFloat(trimmed);
              return isNaN(parsed) ? null : parsed;
            }
            return null;
          };
          
          const isSingleSheet = workbook.SheetNames.length === 1;
          
          // Track filtering statistics
          let totalRowsProcessed = 0;
          let rowsFilteredOut = 0; // Rows where quantity === quantityDispatched
          const rowsExcludedMissingColumns = 0; // Rows with both columns missing
          
          // Parse each sheet
          workbook.SheetNames.forEach((sheetName) => {
            // Do NOT skip "Sheet1/Sheet2" etc.
            // Many customer files keep real data in default sheet names, and skipping them causes "0 schedule items parsed".
            
            const sheet = workbook.Sheets[sheetName];
            if (!sheet) return;
            
            try {
              const jsonData = XLSX.utils.sheet_to_json(sheet, {
                defval: '',
                raw: false
              });
              
              if (!jsonData || jsonData.length === 0) {
                return;
              }

              // Debug: Log schedule file headers
              if (jsonData.length > 0) {
                const scheduleHeaders = Object.keys(jsonData[0]);
                console.log(`\n🔍 DEBUG: Schedule Sheet "${sheetName}" Headers`);
                console.log(`  Total headers: ${scheduleHeaders.length}`);
                console.log(`  Headers:`, scheduleHeaders);
                console.log(`  Looking for "PART NUMBER":`, scheduleHeaders.some(h => h.toLowerCase().includes('part') && h.toLowerCase().includes('number')));
                console.log(`  Headers containing "PART":`, scheduleHeaders.filter(h => h.toLowerCase().includes('part')));
                console.log(`  Headers containing "NUMBER":`, scheduleHeaders.filter(h => h.toLowerCase().includes('number')));
                console.log('================================\n');
              }
              
              // Check first 5 rows to see if PART NUMBER column exists
              const firstFiveRows = jsonData.slice(0, Math.min(5, jsonData.length));
              let partNumberColumnExists = false;
              
              for (const checkRow of firstFiveRows) {
                const checkRowObj =
                  (checkRow && typeof checkRow === 'object') ? (checkRow as Record<string, unknown>) : {};
                const partNumCheck = getColumnValue(checkRowObj, ['PART NUMBER', 'Part Number', 'PartNumber', 'part number', 'Part_Number']);
                if (partNumCheck && partNumCheck.trim() !== '') {
                  partNumberColumnExists = true;
                  break;
                }
              }

              if (!partNumberColumnExists) {
                console.warn(`⚠️ PART NUMBER column not found in first 5 rows of sheet "${sheetName}". Treating partNumber as null for all rows.`);
                const sampleRow = firstFiveRows[0];
                const sampleObj =
                  (sampleRow && typeof sampleRow === 'object') ? (sampleRow as Record<string, unknown>) : {};
                console.warn(`  Available columns:`, Object.keys(sampleObj));
              } else {
                console.log(`✓ PART NUMBER column detected in sheet "${sheetName}"`);
              }
              
              jsonData.forEach((row) => {
                const rowObj = (row && typeof row === 'object') ? (row as Record<string, unknown>) : {};
                totalRowsProcessed++;
                
                // Customer Code removed - schedule no longer contains customer code column
                const customerPart = getColumnValue(rowObj, ['Custmer Part', 'Customer Part', 'CustomerPart', 'customer part']) || '';
                // Only extract PART NUMBER if column was found in first 5 rows, otherwise use empty string
                // Normalize: convert to string, trim, and collapse multiple spaces
                const partNumberRaw = partNumberColumnExists ? getColumnValue(rowObj, ['PART NUMBER', 'Part Number', 'PartNumber', 'part number', 'Part_Number']) || '' : '';
                const partNumber = String(partNumberRaw).trim().replace(/\s+/g, ' ');
                const qadPart = getColumnValue(rowObj, ['QAD part', 'QAD Part', 'QADPart', 'qad part']) || '';
                const description = getColumnValue(rowObj, ['Description', 'description']) || '';
                const snp = parseInt(getColumnValue(rowObj, ['SNP', 'snp']) || '0') || 0;
                const bin = parseInt(getColumnValue(rowObj, ['Bin', 'bin']) || '0') || 0;
                
                // Extract Quantity and Quantity Dispatched columns
                const quantityStr = getColumnValue(rowObj, ['Quantity', 'quantity', 'Qty', 'qty', 'QUANTITY']);
                const quantityDispatchedStr = getColumnValue(rowObj, [
                  'Quantity Dispatched', 'QuantityDispatched', 'quantity dispatched', 
                  'Qty Dispatched', 'QtyDispatched', 'QUANTITY DISPATCHED'
                ]);
                
                // Parse numeric values
                const quantity = parseQuantity(quantityStr);
                const quantityDispatched = parseQuantity(quantityDispatchedStr);
                
                // Filtering logic for schedule:
                // Exclude row ONLY if:
                //   quantity !== null AND quantity === quantityDispatched (already dispatched)
                // Include row if:
                //   * quantityDispatched is empty/null (not yet dispatched, needs to be dispatched)
                //   * quantity is null/empty/zero BUT has PART NUMBER (for validation purposes)
                //   * Both columns missing BUT has PART NUMBER (for validation purposes)
                //   * Quantity exists but quantityDispatched is empty (needs to be dispatched)
                //   * Quantities are not equal (partially dispatched)
                
                // Exclude if quantity equals quantityDispatched (quantity must exist and equal dispatched)
                if (quantity !== null && quantity === quantityDispatched) {
                    rowsFilteredOut++;
                  console.log(`Row filtered out: Quantity (${quantity}) equals Quantity Dispatched (${quantityDispatched}) - already dispatched for part ${partNumber || customerPart}`);
                    return; // Skip this row
                  }
                
                // Include all other cases - continue processing
                // Note: We include rows that have PART NUMBER (even if quantity is null/zero/empty)
                // This is because for validation, we only need PART NUMBER, not quantity
                
                const deliveryDateTime = getColumnValue(rowObj, [
                  'SUPPLY DATE',
                  'Supply Date',
                  'SupplyDate',
                  'supply date',
                  'Delivery Date & Time', 
                  'Delivery Date and Time', 
                  'DeliveryDateTime', 
                  'Delivery Date',
                  'delivery date'
                ]);
                
                const supplyTime = getColumnValue(rowObj, [
                  'Supply Time',
                  'SupplyTime',
                  'SUPPLY TIME',
                  'supply time',
                  'Delivery Time',
                  'DeliveryTime',
                  'delivery time'
                ]);
                
                const deliveryDate = parseDate(deliveryDateTime);
                
                // Extract time from datetime string
                let timeStr: string | undefined;
                if (supplyTime) {
                  timeStr = supplyTime.toString();
                } else if (deliveryDateTime && typeof deliveryDateTime === 'string') {
                  // Try to extract time from datetime string
                  const timeMatch = deliveryDateTime.match(/(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)/);
                  if (timeMatch) {
                    timeStr = timeMatch[1];
                  } else {
                    // If no time pattern found, use the full string as fallback
                    timeStr = deliveryDateTime.toString();
                  }
                } else {
                  timeStr = undefined;
                }
                
                const plant = getColumnValue(rowObj, [
                  'Plant',
                  'plant',
                  'PLANT',
                  'Plant Code',
                  'PlantCode',
                  'Delivery Location',
                  'DeliveryLocation',
                  'delivery location'
                ]);
                
                const unloadingLoc = getColumnValue(rowObj, [
                  'UNLOADING LOC',
                  'UnloadingLoc',
                  'Unloading Location',
                  'UnloadingLocation',
                  'Unload Location',
                  'UnloadLocation',
                  'Location',
                  'unloading loc',
                  'unloading location',
                  'unload location',
                  'location',
                  'LOCATION'
                ]);
                
                // Invoice-first: schedule is used for logging (delivery time + unloading loc), so PART NUMBER is optional.
                const hasAnyUsefulField =
                  !!partNumber ||
                  !!deliveryDate ||
                  !!timeStr ||
                  (!!unloadingLoc && String(unloadingLoc).trim() !== '') ||
                  (!!plant && String(plant).trim() !== '') ||
                  (!!customerPart && String(customerPart).trim() !== '') ||
                  (!!qadPart && String(qadPart).trim() !== '') ||
                  (!!description && String(description).trim() !== '');

                if (hasAnyUsefulField) {
                  const normalizedPartNumber = partNumber ? String(partNumber).trim() : undefined;

                  allScheduleItems.push({
                    customerCode: undefined, // Customer code removed from schedule
                    customerPart: customerPart.toString().trim(),
                    partNumber: normalizedPartNumber,
                    qadPart: qadPart.toString().trim(),
                    description: description.toString().trim(),
                    snp,
                    bin,
                    sheetName,
                    deliveryDate,
                    deliveryTime: timeStr ? timeStr.toString().trim() : undefined,
                    plant: plant ? plant.toString().trim() : undefined,
                    unloadingLoc: unloadingLoc ? unloadingLoc.toString().trim() : undefined,
                    quantity: quantity !== null ? Math.round(quantity) : undefined
                  });
                }
              });
            } catch (sheetError) {
              console.error(`Error parsing sheet ${sheetName}:`, sheetError);
            }
          });
          
          // Debug logging for schedule parsing
          console.log('=== SCHEDULE PARSING DEBUG ===');
          console.log('Total rows processed:', totalRowsProcessed);
          console.log('Total schedule items imported:', allScheduleItems.length);
          console.log('Rows filtered out (quantity matched):', rowsFilteredOut);
          console.log('Rows excluded (missing columns):', rowsExcludedMissingColumns);
          console.log('Items with deliveryDate:', allScheduleItems.filter(i => i.deliveryDate).length);
          console.log('Items with deliveryTime:', allScheduleItems.filter(i => i.deliveryTime).length);
          console.log('Items with partNumber:', allScheduleItems.filter(i => i.partNumber).length);
          console.log('Sample schedule items:', allScheduleItems.slice(0, 3));
          // Customer codes removed from schedule - no longer logged
          console.log('Part numbers (first 10):', [...new Set(allScheduleItems.map(i => i.partNumber).filter(Boolean))].slice(0, 10));
          if (allScheduleItems.length > 0) {
            const sampleWithDate = allScheduleItems.find(i => i.deliveryDate);
            if (sampleWithDate) {
              console.log('Sample item with date:', {
                customerCode: sampleWithDate.customerCode,
                partNumber: sampleWithDate.partNumber,
                deliveryDate: sampleWithDate.deliveryDate,
                deliveryTime: sampleWithDate.deliveryTime
              });
            }
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

  const handleProceedToValidation = async () => {
    if (!file) {
      toast.error("Please upload Invoices file");
      return;
    }

    // Check if customer is selected
    if (!selectedCustomer) {
      toast.error("Please select a customer first from the Customer Selection page");
      return;
    }

    const selectedCustomerCode = getCustomerCode(selectedCustomer);
    if (!selectedCustomerCode) {
      toast.error("Invalid customer selected. Please select a valid MSIL customer.");
      return;
    }

    const loadingToast = toast.loading("Parsing files...", {
      duration: 0
    });
    
    try {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
        || (window.innerWidth < 768 && ('ontouchstart' in window));
      
      const timeoutDuration = isMobile ? 10000 : 15000;
      
      const parseInvoicesPromise = parseFile(file);
      const parseSchedulePromise = scheduleFile ? parseScheduleFile(scheduleFile) : Promise.resolve([]);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('File parsing timeout - please try a smaller file')), timeoutDuration)
      );
      
      const [invoiceResult, scheduleItems] = await Promise.race([
        Promise.all([parseInvoicesPromise, parseSchedulePromise]),
        timeoutPromise
      ]) as [{ rows: UploadedRow[], invoices: InvoiceData[] }, ScheduleItem[]];
      
      // Invoice customer code validation removed - use all invoices
      // Schedule customer code validation removed - schedule no longer contains customer code
      
      // No filtering - use all invoices and schedule items
      const validInvoices = invoiceResult.invoices;
      const validScheduleItems = scheduleItems;
      
      // Store parsed data
      setProcessedInvoices(validInvoices);
      setParsedScheduleItems(validScheduleItems);
      
      // ============================================
      // VALIDATION - Happens immediately on "Continue to Validation"
      // ============================================
      console.log('\n\n🔵 ============================================');
      console.log('🔵 VALIDATION - STARTING (On Continue to Validation)');
      console.log('🔵 ============================================');

      console.log('\n🔍 DEBUG: Parsed Data Summary');
      console.log(`  Schedule items parsed (post filter): ${validScheduleItems.length}`);
      console.log(`  Invoice rows parsed: ${invoiceResult.rows.length}`);
      console.log('================================\n');

      // Validate invoice rows only (invoice-first; no schedule matching)
      const validatedData: UploadedRow[] = invoiceResult.rows.map((row) => {
        const missing: string[] = [];
        if (!row.invoice || row.invoice.toString().trim() === '') missing.push('Invoice Number');
        if (!row.billTo || row.billTo.toString().trim() === '') missing.push('Bill To');
        if (!row.invoiceDate) missing.push('Invoice Date');
        if (!row.customer || row.customer.toString().trim() === '') missing.push('Customer Name');
        if (!row.customerItem || row.customerItem.toString().trim() === '') missing.push('Customer Item');
        if (!row.part || row.part.toString().trim() === '') missing.push('Item Number');
        if (row.qty === undefined || row.qty === null || isNaN(row.qty)) missing.push('Quantity Invoiced');

        if (missing.length > 0) {
          return {
            ...row,
            status: 'error' as const,
            errorMessage: row.errorMessage || `Missing/invalid: ${missing.join(', ')}`,
          };
        }

        // Keep existing warnings (e.g., qty=0/large) if set; otherwise mark valid
        if (row.status === 'warning') return row;
        return { ...row, status: 'valid' as const, errorMessage: row.errorMessage || undefined };
      });
      
      // Update state with validated data
      setUploadedData(validatedData);
      
      // Move to validate stage to show results
      setUploadStage('validate');
      
      // Log validation summary
      const validCount = validatedData.filter(r => r.status === 'valid').length;
      const warningCount = validatedData.filter(r => r.status === 'warning').length;
      const errorCount = validatedData.filter(r => r.status === 'error').length;
      
      console.log('\n=== VALIDATION SUMMARY ===');
      console.log(`Valid: ${validCount}, Warnings: ${warningCount}, Errors: ${errorCount}`);
      console.log('🔵 ============================================');
      console.log('🔵 VALIDATION - COMPLETED');
      console.log('🔵 ============================================\n');
      
      toast.dismiss(loadingToast);

      toast.success(`Validation complete!`, {
        description: `Valid: ${validCount}, Warnings: ${warningCount}, Errors: ${errorCount}`,
      });
    } catch (error: unknown) {
      toast.dismiss(loadingToast);
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to parse files: ${message}`);
      console.error('File parsing error:', error);
    }
  };

  const handleImport = async () => {
    if (!file) {
      toast.error("Please upload Invoices file");
      return;
    }

    // Validate schedule data before uploading
    const itemsWithDates = parsedScheduleItems.filter(i => i.deliveryDate).length;
    const itemsWithTimes = parsedScheduleItems.filter(i => i.deliveryTime).length;
    const itemsWithUnloadingLocs = parsedScheduleItems.filter(i => i.unloadingLoc).length;
    
    console.log('=== IMPORT VALIDATION ===');
    console.log('Total schedule items:', parsedScheduleItems.length);
    console.log('Items with deliveryDate:', itemsWithDates);
    console.log('Items with deliveryTime:', itemsWithTimes);
    console.log('Items with unloadingLoc:', itemsWithUnloadingLocs);
    
    if (parsedScheduleItems.length > 0 && itemsWithDates === 0) {
      toast.warning("⚠️ No delivery dates found in schedule", {
        description: "Doc Audit may not show delivery date options. Please check your schedule file format.",
        duration: 6000
      });
    }
    
    if (parsedScheduleItems.length > 0 && itemsWithTimes === 0) {
      toast.warning("⚠️ No delivery times found in schedule", {
        description: "Doc Audit will have limited delivery time options. Please check your schedule file format.",
        duration: 6000
      });
    }
    if (parsedScheduleItems.length > 0 && itemsWithUnloadingLocs === 0) {
      toast.warning("⚠️ No unloading locations found in schedule", {
        description: "Doc Audit will have limited unloading location options. Please check your schedule file format.",
        duration: 6000
      });
    }

    const loadingToast = toast.loading("Uploading files to server...", {
      duration: 0
    });

    try {
      // Check if customer is selected
      if (!selectedCustomer) {
        toast.error("Please select a customer first from the Customer Selection page");
        return;
      }

      const selectedCustomerCode = getCustomerCode(selectedCustomer);
      if (!selectedCustomerCode) {
        toast.error("Invalid customer selected. Please select a valid MSIL customer.");
        return;
      }

      // Schedule upload is optional (Doc Audit is invoice-driven)
      const scheduleResult = scheduleFile
        ? await scheduleApi.upload(scheduleFile, selectedCustomerCode)
        : null;

      if (scheduleResult) {
        console.log('\n📤 ===== SCHEDULE UPLOAD RESULT =====');
        console.log('Schedule upload result:', scheduleResult);
        console.log('====================================\n');

        if (scheduleResult.success) {
          toast.success(`Schedule uploaded: ${scheduleResult.itemCount || 0} items`);
        } else {
          toast.warning('Schedule upload failed (continuing with invoice-only flow).');
        }
      }
      
      // Upload invoice file
      const invoiceResult = await invoicesApi.upload(file, selectedCustomerCode);
      console.log('\n📤 ===== INVOICE UPLOAD RESULT =====');
      console.log('Invoice upload result:', invoiceResult);
      
      if (invoiceResult.diagnostics) {
        console.log('📊 Unique customer items:', invoiceResult.diagnostics.uniqueCustomerItems);
        console.log('📋 Sample customer items:', invoiceResult.diagnostics.sampleCustomerItems);
      }
      
      if (invoiceResult.validationStats) {
        console.log('✅ Validation stats:', invoiceResult.validationStats);
        if (invoiceResult.validationStats.diagnostics) {
          console.log('📋 Validation diagnostics:', invoiceResult.validationStats.diagnostics);
        }
      }
      console.log('====================================\n');
      
      if (invoiceResult.success) {
        toast.success(`Invoices uploaded: ${invoiceResult.invoiceCount || 0} invoices`);
      }

      // Refresh data from backend (this will trigger WebSocket update to all devices)
      await refreshData();

      // Schedule is optional; only block if invoice upload failed
      if (!invoiceResult.success) {
        toast.error('Invoice upload failed. Please try again.');
        toast.dismiss(loadingToast);
        return;
      }
      
      // Get validation results from uploaded data
      const validCount = uploadedData.filter(r => r.status === 'valid').length;
      const warningCount = uploadedData.filter(r => r.status === 'warning').length;
      const errorCount = uploadedData.filter(r => r.status === 'error').length;
      
      console.log('=== UPLOAD COMPLETE ===');
      console.log(`Schedule items uploaded: ${scheduleResult?.itemCount || 0}`);
      console.log(`Invoices uploaded: ${invoiceResult.invoiceCount || 0}`);
      console.log(`Invoice items: ${invoiceResult.itemCount || 0}`);
      console.log(`Valid items: ${validCount}`);
      console.log(`Warning items: ${warningCount}`);
      console.log(`Error items: ${errorCount}`);
      
      // Move to complete stage to show success page
      setUploadStage('complete');
      
      toast.dismiss(loadingToast);
      toast.success(`Data imported successfully!`, {
        description: `Invoices: ${invoiceResult.invoiceCount || 0} invoices (valid: ${validCount}, warnings: ${warningCount})`
      });
    } catch (error: unknown) {
      console.error('\n❌ ============================================');
      console.error('❌ UPLOAD ERROR - CAUGHT IN OUTER TRY-CATCH');
      console.error('❌ ============================================');
      console.error('Error:', error);
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
      toast.dismiss(loadingToast);
      toast.error(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // Keep preview data visible so user can retry - don't clear uploadedData, processedInvoices, or parsedScheduleItems
      // Don't change uploadStage - stay on 'validate' stage so user can see preview and try again
    }
  };

  // Calculate validation results
  // Invoice-first: no invoice↔schedule matching
  
  const validationResults = {
    total: uploadedData.length,
    valid: uploadedData.filter(row => row.status === 'valid' || row.status === 'warning').length,
    errors: uploadedData.filter(row => row.status === 'error').length,
    warnings: uploadedData.filter(row => row.status === 'warning').length,
    invoiceCount: processedInvoices.length,
    scheduleItemCount: parsedScheduleItems.length
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Header */}
      <header className="relative bg-card/80 backdrop-blur border-b border-border sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 sm:h-10 sm:w-10"
                onClick={() => navigate("/home")}
              >
                <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
              <div className="flex-1">
                <h1 className="text-lg sm:text-2xl font-bold text-foreground">Upload invoices &amp; schedule</h1>
                <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">Import files, validate, then start dispatch</p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => setShowUploadLogs(true)}
              className="flex items-center gap-2 w-full sm:w-auto justify-center bg-card/60"
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span>Upload Logs</span>
              {getUploadLogs().length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {getUploadLogs().length}
                </Badge>
              )}
            </Button>
          </div>
        </div>
      </header>

      <main className="relative container mx-auto px-4 sm:px-6 py-4 sm:py-8 pb-24 sm:pb-8 max-w-7xl">
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
            <Card className="bg-card/70 backdrop-blur border-border/60 shadow-md">
              <CardHeader>
                <CardTitle className="text-xl">Select Excel files</CardTitle>
                <CardDescription>Upload invoices (required) and schedule (optional) to proceed</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-6 items-stretch">
                  <UploadDropzoneCard
                    title="Upload invoices"
                    titleIcon={<FileSpreadsheet />}
                    dropzoneIcon={<Upload />}
                    requirementsTitle="Expected invoice columns"
                    requirements={
                      <ul className="space-y-0.5 list-disc list-inside">
                        <li>Bill To</li>
                        <li>Invoice Number</li>
                        <li>Invoice Date</li>
                        <li>Customer Name</li>
                        <li>Customer Item</li>
                        <li>Item Number</li>
                        <li>Part Description (optional)</li>
                        <li>Quantity Invoiced</li>
                      </ul>
                    }
                    selectedFile={file}
                    onFileSelected={handleInvoiceFileSelected}
                    accept=".xlsx,.xls"
                    helperText="Supported: .xlsx, .xls"
                  />

                  <UploadDropzoneCard
                    title="Upload schedule"
                    titleIcon={<CalendarIcon />}
                    dropzoneIcon={<Upload />}
                    optionalBadge={
                      <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
                        Optional
                      </Badge>
                    }
                    requirementsTitle="Expected schedule columns (recommended)"
                    requirements={
                      <ul className="space-y-0.5 list-disc list-inside">
                        <li>PART NUMBER (recommended)</li>
                        <li>SUPPLY DATE (or Delivery Date &amp; Time)</li>
                        <li>SUPPLY TIME (or Delivery Time)</li>
                        <li>UNLOADING LOC</li>
                        <li>Plant</li>
                        <li>Quantity and Quantity Dispatched</li>
                        <li>Description / SNP / Bin (optional)</li>
                      </ul>
                    }
                    selectedFile={scheduleFile}
                    onFileSelected={handleScheduleFileSelected}
                    accept=".xlsx,.xls"
                    helperText="Supported: .xlsx, .xls"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Continue Button */}
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
                    disabled={!file}
                    className="h-12 px-8 text-base font-semibold shadow-sm"
                    size="lg"
                  >
                    {!file ? (
                      <>
                        Upload invoices file to continue
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
                  
                  {/* Data Table */}
                  <div className="border rounded-lg overflow-hidden max-h-96 overflow-x-auto overflow-y-auto">
                    <table className="w-full text-xs sm:text-sm min-w-[600px]">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="text-left p-3 font-semibold">Invoice No</th>
                          <th className="text-left p-3 font-semibold">Customer</th>
                          <th className="text-left p-3 font-semibold">Customer Code</th>
                          <th className="text-left p-3 font-semibold">Item Number</th>
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
                            
                            // Determine status text based on validation status
                            let statusText: string;
                            if (row.status === 'error') {
                              statusText = 'error';
                            } else if (row.status === 'warning') {
                              statusText = 'warning';
                            } else {
                              statusText = 'valid';
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
                                  row.status === 'valid' ? 'default' :
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
                        setScheduleFile(null);
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
            <Button
              variant="ghost"
              onClick={() => navigate("/home")}
              className="flex items-center gap-2 mb-4 text-sm sm:text-base"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back to Home</span>
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
                  <Button onClick={() => navigate("/home")}>
                    Return to Home
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => {
                      setUploadStage('upload');
                      setFile(null);
                      setScheduleFile(null);
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
      </main>

      {/* Upload Logs Dialog */}
      <LogsDialog
        isOpen={showUploadLogs}
        onClose={() => setShowUploadLogs(false)}
        title="Upload Logs"
        logs={getUploadLogs()}
        type="upload"
      />
    </div>
  );
};

export default UploadData;
