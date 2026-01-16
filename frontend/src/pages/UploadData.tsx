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

interface UploadedRow {
  invoice: string;
  customer: string;
  part: string;
  qty: number;
  status: 'valid-matched' | 'valid-unmatched' | 'error' | 'warning';
  errorMessage?: string;
  customerItem?: string;
  partDescription?: string;
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
  const [dragActive, setDragActive] = useState(false);
  const [scheduleDragActive, setScheduleDragActive] = useState(false);
  const [uploadedData, setUploadedData] = useState<UploadedRow[]>([]);
  const [processedInvoices, setProcessedInvoices] = useState<InvoiceData[]>([]);
  const [parsedScheduleItems, setParsedScheduleItems] = useState<ScheduleItem[]>([]);
  const [showUploadLogs, setShowUploadLogs] = useState(false);

  // Debug: Log when uploadedData changes to verify state updates
  useEffect(() => {
    if (uploadedData.length > 0) {
      const matchedCount = uploadedData.filter(r => r.status === 'valid-matched').length;
      const unmatchedCount = uploadedData.filter(r => r.status === 'valid-unmatched').length;
      const errorCount = uploadedData.filter(r => r.status === 'error').length;
      console.log('📊 [useEffect] uploadedData state changed:', {
        total: uploadedData.length,
        matched: matchedCount,
        unmatched: unmatchedCount,
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

  // Helper function to format date as YYYY-MM-DD in local timezone
  const formatDateAsLocalString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      setFile(droppedFile);
      toast.success("Invoices file selected!");
    }
  };

  const handleScheduleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setScheduleDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setScheduleFile(e.dataTransfer.files[0]);
      toast.success("Schedule file selected!");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      toast.success("Invoices file selected!");
    }
  };

  const handleScheduleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setScheduleFile(e.target.files[0]);
      toast.success("Schedule file selected!");
    }
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
          
          let jsonData: any[];
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
            
            if (jsonData.length > 0 && typeof jsonData[0] === 'object') {
              headers = Object.keys(jsonData[0]);
              dataRows = jsonData.map((row: any) => headers.map(header => row[header] || ''));
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
          
          const parsedData: UploadedRow[] = dataRows.map((row: string[], index: number) => {
            const rowObj: any = {};
            headers.forEach((header, colIndex) => {
              rowObj[header] = row[colIndex] || '';
            });
            
            const invoice = rowObj['Invoice Number'] || rowObj['Invoice'] || rowObj['invoice'] || rowObj['Invoice No'] || rowObj['InvoiceNo'] || `INV-${index + 1}`;
            const customer = rowObj['Cust Name'] || rowObj['Customer'] || rowObj['customer'] || rowObj['Customer Name'] || rowObj['CustomerName'] || 'Unknown Customer';
            const part = rowObj['Item Number'] || rowObj['Part'] || rowObj['part'] || rowObj['Part Code'] || rowObj['PartCode'] || rowObj['Part Number'] || 'Unknown Part';
            const qty = parseInt(rowObj['Quantity Invoiced'] || rowObj['Qty'] || rowObj['qty'] || rowObj['Quantity'] || rowObj['quantity'] || '0');
            const customerItem = rowObj['Customer Item'] || rowObj['CustomerItem'] || rowObj['customer item'] || rowObj['Customer-Item'] || rowObj['Cust Item'] || rowObj['CustItem'] || rowObj['Customer Part'] || rowObj['CustomerPart'] || '';
            const partDescription = rowObj['Part Description'] || rowObj['PartDescription'] || rowObj['part description'] || rowObj['Part-Description'] || rowObj['Description'] || rowObj['description'] || rowObj['Part Desc'] || rowObj['PartDesc'] || '';
            
            let status: 'valid-matched' | 'valid-unmatched' | 'error' | 'warning' = 'valid-unmatched';
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
          
          const invoiceMap = new Map<string, InvoiceData>();
          
          dataRows.forEach((row: string[], index: number) => {
            const rowObj: any = {};
            headers.forEach((header, colIndex) => {
              rowObj[header] = row[colIndex] || '';
            });
            
            const invoiceNum = rowObj['Invoice Number'] || rowObj['Invoice'] || rowObj['invoice'] || `INV-${index + 1}`;
            const customer = rowObj['Cust Name'] || rowObj['Customer'] || rowObj['customer'] || 'Unknown Customer';
            const qty = parseInt(rowObj['Quantity Invoiced'] || rowObj['Qty'] || rowObj['qty'] || rowObj['Quantity'] || '0');
            const billTo = rowObj['Bill To'] || rowObj['BillTo'] || rowObj['bill to'] || rowObj['Bill-To'] || '';
            const plant = rowObj['Ship To'] || rowObj['ShipTo'] || rowObj['Ship-To'] || 
                         rowObj['Plant'] || rowObj['plant'] || 
                         rowObj['Delivery Location'] || rowObj['DeliveryLocation'] || 
                         rowObj['Destination'] || rowObj['destination'] || '';
            
            const invoiceDate = new Date();
            
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
          
          // Helper function to parse date from various formats
          const parseDate = (dateStr: any): Date | undefined => {
            if (!dateStr) return undefined;
            if (dateStr instanceof Date) return dateStr;
            if (typeof dateStr === 'number') {
              return excelDateToJSDate(dateStr);
            }
            if (typeof dateStr === 'string') {
              const trimmed = dateStr.trim();
              if (!trimmed) return undefined;
              
              const dateFormats = [
                /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
                /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,
                /^(\d{1,2})\/(\d{1,2})\/(\d{4})/,
                /^(\d{1,2})-(\d{1,2})-(\d{4})/,
              ];
              
              for (const format of dateFormats) {
                const match = trimmed.match(format);
                if (match) {
                  if (format === dateFormats[0] || format === dateFormats[1]) {
                    const [_, year, month, day] = match;
                    const parsed = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                    if (!isNaN(parsed.getTime())) return parsed;
                  } else {
                    const [_, part1, part2, year] = match;
                    let parsed = new Date(parseInt(year), parseInt(part1) - 1, parseInt(part2));
                    if (!isNaN(parsed.getTime())) return parsed;
                    parsed = new Date(parseInt(year), parseInt(part2) - 1, parseInt(part1));
                    if (!isNaN(parsed.getTime())) return parsed;
                  }
                }
              }
              
              const parsed = new Date(trimmed);
              if (!isNaN(parsed.getTime())) return parsed;
            }
            
            return undefined;
          };
          
          // Helper function for case-insensitive column lookup
          const getColumnValue = (row: any, variations: string[]): string => {
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
          const parseQuantity = (value: any): number | null => {
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
          let rowsExcludedMissingColumns = 0; // Rows with both columns missing
          
          // Parse each sheet
          workbook.SheetNames.forEach((sheetName) => {
            // Skip generic sheet names only if there are multiple sheets
            // If it's a single sheet, process it regardless of name
            if (!isSingleSheet && (sheetName.toLowerCase() === 'sheet1' || sheetName.toLowerCase() === 'sheet2')) {
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
                return;
              }

              // Check first 5 rows to see if PART NUMBER column exists
              const firstFiveRows = jsonData.slice(0, Math.min(5, jsonData.length));
              let partNumberColumnExists = false;
              
              for (const checkRow of firstFiveRows) {
                const partNumCheck = getColumnValue(checkRow, ['PART NUMBER', 'Part Number', 'PartNumber', 'part number', 'Part_Number']);
                if (partNumCheck && partNumCheck.trim() !== '') {
                  partNumberColumnExists = true;
                  break;
                }
              }

              if (!partNumberColumnExists) {
                console.warn(`PART NUMBER column not found in first 5 rows of sheet "${sheetName}". Treating partNumber as null for all rows.`);
              }
              
              jsonData.forEach((row: any) => {
                totalRowsProcessed++;
                
                // Customer Code removed - schedule no longer contains customer code column
                const customerPart = getColumnValue(row, ['Custmer Part', 'Customer Part', 'CustomerPart', 'customer part']) || '';
                // Only extract PART NUMBER if column was found in first 5 rows, otherwise use empty string
                const partNumber = partNumberColumnExists ? getColumnValue(row, ['PART NUMBER', 'Part Number', 'PartNumber', 'part number', 'Part_Number']) || '' : '';
                const qadPart = getColumnValue(row, ['QAD part', 'QAD Part', 'QADPart', 'qad part']) || '';
                const description = getColumnValue(row, ['Description', 'description']) || '';
                const snp = parseInt(getColumnValue(row, ['SNP', 'snp']) || '0') || 0;
                const bin = parseInt(getColumnValue(row, ['Bin', 'bin']) || '0') || 0;
                
                // Extract Quantity and Quantity Dispatched columns
                const quantityStr = getColumnValue(row, ['Quantity', 'quantity', 'Qty', 'qty', 'QUANTITY']);
                const quantityDispatchedStr = getColumnValue(row, [
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
                
                const deliveryDateTime = getColumnValue(row, [
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
                
                const supplyTime = getColumnValue(row, [
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
                
                const unloadingLoc = getColumnValue(row, [
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
                
                // Include row if it has PART NUMBER (customer code no longer required)
                if (partNumber) {
                  // Normalize partNumber - ensure it's a string and trimmed
                  const normalizedPartNumber = String(partNumber).trim();
                  
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
    if (!scheduleFile) {
      toast.error("Please upload Schedule file");
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
      const parseSchedulePromise = parseScheduleFile(scheduleFile);
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
      
      // Helper function to normalize values for comparison
      const normalizeValue = (value: any): string => {
        if (value === null || value === undefined) return '';
        return String(value).trim();
      };
      
      // ============================================
      // VALIDATION - Happens immediately on "Continue to Validation"
      // ============================================
      console.log('\n\n🔵 ============================================');
      console.log('🔵 VALIDATION - STARTING (On Continue to Validation)');
      console.log('🔵 ============================================');
      
      // Build schedule PART NUMBERS set
      const schedulePartNumbers = new Set<string>();
      validScheduleItems.forEach(item => {
        const partNumber = normalizeValue(item.partNumber);
        if (partNumber) {
          schedulePartNumbers.add(partNumber);
        }
      });
      
      console.log('Schedule PART NUMBERS:', schedulePartNumbers.size);
      console.log('Invoice rows to validate:', invoiceResult.rows.length);
      
      // Validate all invoice items immediately
      const validatedData = invoiceResult.rows.map((row, index) => {
        const customerItem = normalizeValue(row.customerItem);
        
        // Check if customer_item is missing
        if (!customerItem) {
          return {
            ...row,
            status: 'error' as const,
            errorMessage: 'Missing Customer Item'
          };
        }
        
        // Global matching: Check if Customer Item matches any PART NUMBER in schedule
        const exactMatch = schedulePartNumbers.has(customerItem);
        
        if (exactMatch) {
          console.log(`[MATCHED] Row ${index + 1} - Invoice ${row.invoice} - CustomerItem: "${customerItem}" ✅ MATCHED`);
          return {
            ...row,
            status: 'valid-matched' as const,
            errorMessage: undefined
          };
        } else {
          console.log(`[UNMATCHED] Row ${index + 1} - Invoice ${row.invoice} - CustomerItem: "${customerItem}" ❌ NOT FOUND`);
          return {
            ...row,
            status: 'valid-unmatched' as const,
            errorMessage: undefined
          };
        }
      });
      
      // Update state with validated data
      setUploadedData(validatedData);
      
      // Move to validate stage to show results
      setUploadStage('validate');
      
      // Log validation summary
      const matchedCount = validatedData.filter(r => r.status === 'valid-matched').length;
      const unmatchedCount = validatedData.filter(r => r.status === 'valid-unmatched').length;
      const errorCount = validatedData.filter(r => r.status === 'error').length;
      
      console.log('\n=== VALIDATION SUMMARY ===');
      console.log(`Matched: ${matchedCount}, Unmatched: ${unmatchedCount}, Errors: ${errorCount}`);
      console.log('🔵 ============================================');
      console.log('🔵 VALIDATION - COMPLETED');
      console.log('🔵 ============================================\n');
      
      toast.dismiss(loadingToast);
      toast.success(`Validation complete!`, {
        description: `Matched: ${matchedCount}, Unmatched: ${unmatchedCount}, Errors: ${errorCount}`
      });
    } catch (error: any) {
      toast.dismiss(loadingToast);
      toast.error(`Failed to parse files: ${error.message || 'Unknown error'}`);
      console.error('File parsing error:', error);
    }
  };

  const handleImport = async () => {
    if (!file || !scheduleFile) {
      toast.error("Please upload both files");
      return;
    }

    // Validate schedule data before uploading
    const itemsWithDates = parsedScheduleItems.filter(i => i.deliveryDate).length;
    const itemsWithTimes = parsedScheduleItems.filter(i => i.deliveryTime).length;
    const itemsWithPartNumbers = parsedScheduleItems.filter(i => i.partNumber).length;
    
    console.log('=== IMPORT VALIDATION ===');
    console.log('Total schedule items:', parsedScheduleItems.length);
    console.log('Items with deliveryDate:', itemsWithDates);
    console.log('Items with deliveryTime:', itemsWithTimes);
    console.log('Items with partNumber:', itemsWithPartNumbers);
    
    if (parsedScheduleItems.length > 0 && itemsWithDates === 0) {
      toast.warning("⚠️ No delivery dates found in schedule", {
        description: "Doc Audit may not show delivery date options. Please check your schedule file format.",
        duration: 6000
      });
    }
    
    if (parsedScheduleItems.length > 0 && itemsWithPartNumbers === 0) {
      toast.warning("⚠️ No part numbers found in schedule", {
        description: "Schedule items need PART NUMBER field to match with invoice Customer Items.",
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

      // Upload schedule file first
      const scheduleResult = await scheduleApi.upload(scheduleFile, selectedCustomerCode);
      console.log('Schedule upload result:', scheduleResult);
      if (scheduleResult.success) {
        toast.success(`Schedule uploaded: ${scheduleResult.itemCount || 0} items`);
      }
      
      // Upload invoice file
      const invoiceResult = await invoicesApi.upload(file, selectedCustomerCode);
      console.log('Invoice upload result:', invoiceResult);
      if (invoiceResult.success) {
        toast.success(`Invoices uploaded: ${invoiceResult.invoiceCount || 0} invoices`);
      }

      // Refresh data from backend (this will trigger WebSocket update to all devices)
      await refreshData();
      
      // Check if upload was successful
      if (!scheduleResult.success) {
        toast.error('Schedule upload failed. Please try again.');
        toast.dismiss(loadingToast);
        return;
      }
      
      if (!invoiceResult.success) {
        toast.error('Invoice upload failed. Please try again.');
        toast.dismiss(loadingToast);
        return;
      }
      
      // Get validation results from uploaded data
      const matchedCount = uploadedData.filter(r => r.status === 'valid-matched').length;
      const unmatchedCount = uploadedData.filter(r => r.status === 'valid-unmatched').length;
      const errorCount = uploadedData.filter(r => r.status === 'error').length;
      
      console.log('=== UPLOAD COMPLETE ===');
      console.log(`Schedule items uploaded: ${scheduleResult.itemCount || 0}`);
      console.log(`Invoices uploaded: ${invoiceResult.invoiceCount || 0}`);
      console.log(`Invoice items: ${invoiceResult.itemCount || 0}`);
      console.log(`Matched items: ${matchedCount}`);
      console.log(`Unmatched items: ${unmatchedCount}`);
      console.log(`Error items: ${errorCount}`);
      
      // Move to complete stage to show success page
      setUploadStage('complete');
      
      toast.dismiss(loadingToast);
      toast.success(`Data imported successfully!`, {
        description: `Schedule: ${scheduleResult.itemCount || 0} items, Invoices: ${invoiceResult.invoiceCount || 0} invoices (${matchedCount} matched, ${unmatchedCount} unmatched)`
      });
    } catch (error: any) {
      console.error('\n❌ ============================================');
      console.error('❌ UPLOAD ERROR - CAUGHT IN OUTER TRY-CATCH');
      console.error('❌ ============================================');
      console.error('Error:', error);
      console.error('Error message:', error?.message);
      console.error('Error stack:', error?.stack);
      toast.dismiss(loadingToast);
      toast.error(`Upload failed: ${error?.message || 'Unknown error'}`);
      // Keep preview data visible so user can retry - don't clear uploadedData, processedInvoices, or parsedScheduleItems
      // Don't change uploadStage - stay on 'validate' stage so user can see preview and try again
    }
  };

  // Calculate validation results
  // Note: Schedule no longer has customer codes, so invoice matching is based on PART NUMBER matching only
  const matchedInvoicesCount = processedInvoices.filter(inv => {
    // An invoice is considered "matched" if it has at least one item with valid-matched status
    return uploadedData.some(row => 
      row.invoice === inv.id && row.status === 'valid-matched'
    );
  }).length;
  const unmatchedInvoicesCount = processedInvoices.length - matchedInvoicesCount;
  
  // Count matched and unmatched items based on PART NUMBER matching
  const matchedItemsCount = uploadedData.filter(row => row.status === 'valid-matched').length;
  const unmatchedItemsCount = uploadedData.filter(row => row.status === 'valid-unmatched').length;
  
  const validationResults = {
    total: uploadedData.length,
    valid: uploadedData.filter(row => row.status === 'valid-matched' || row.status === 'valid-unmatched').length,
    matchedItems: matchedItemsCount,
    unmatchedItems: unmatchedItemsCount,
    errors: uploadedData.filter(row => row.status === 'error').length,
    warnings: uploadedData.filter(row => row.status === 'warning').length,
    invoiceCount: processedInvoices.length,
    scheduleItemCount: parsedScheduleItems.length,
    matchedInvoices: matchedInvoicesCount,
    unmatchedInvoices: unmatchedInvoicesCount
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50 shadow-sm">
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
                <h1 className="text-lg sm:text-2xl font-bold text-foreground">Upload Sales Data</h1>
                <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">Import and schedule dispatch orders</p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => setShowUploadLogs(true)}
              className="flex items-center gap-2 w-full sm:w-auto justify-center"
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

      <main className="container mx-auto px-4 sm:px-6 py-4 sm:py-8 pb-24 sm:pb-8 max-w-5xl">
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
                <CardTitle>Select Excel Files</CardTitle>
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
                    <h4 className="font-semibold text-blue-700 dark:text-blue-300 mb-3">Schedule Matching (Customer Item ↔ PART NUMBER)</h4>
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
                        <p className="text-xl font-bold text-green-600">{validationResults.matchedItems}</p>
                        <p className="text-xs text-muted-foreground">Matched Items</p>
                      </div>
                      <div>
                        <p className="text-xl font-bold text-orange-600">{validationResults.unmatchedItems}</p>
                        <p className="text-xs text-muted-foreground">Unmatched Items</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Items are matched when Customer Item (invoice) exactly matches PART NUMBER (schedule) for the same customer code. Matched items will be available in Doc Audit.
                    </p>
                  </div>

                  {/* Data Table */}
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
                            
                            // Determine status text based on validation status
                            let statusText: string;
                            if (row.status === 'error') {
                              statusText = 'error';
                            } else if (row.status === 'warning') {
                              statusText = 'warning';
                            } else if (row.status === 'valid-matched') {
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
                                  row.status === 'valid-matched' ? 'default' : 
                                  row.status === 'valid-unmatched' ? 'outline' :
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
        open={showUploadLogs}
        onOpenChange={setShowUploadLogs}
        title="Upload Logs"
        logs={getUploadLogs()}
      />
    </div>
  );
};

export default UploadData;
