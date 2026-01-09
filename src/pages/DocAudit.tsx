import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ScanBarcode,
  CheckCircle2,
  Clock,
  ArrowLeft,
  Calendar as CalendarIcon,
  XCircle,
  X
} from "lucide-react";
import { BarcodeScanButton, type BarcodeData } from "@/components/BarcodeScanner";
import { useSession } from "@/contexts/SessionContext";
import { LogsDialog } from "@/components/LogsDialog";
import type { InvoiceData } from "@/contexts/SessionContext";

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

const DocAudit = () => {
  const navigate = useNavigate();
  const {
    currentUser,
    sharedInvoices,
    scheduleData,
    updateInvoiceAudit,
    getAuditLogs,
    addMismatchAlert,
    selectedCustomer,
    selectedSite
  } = useSession();

  // Route guard: Check if customer and site are selected
  useEffect(() => {
    if (!selectedCustomer || selectedCustomer.length === 0 || !selectedSite) {
      toast.error("Please select a customer and site before accessing doc audit");
      navigate("/select-customer-site");
    }
  }, [selectedCustomer, selectedSite, navigate]);

  // State management
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [customerScan, setCustomerScan] = useState<BarcodeData | null>(null);
  const [autolivScan, setAutolivScan] = useState<BarcodeData | null>(null);
  const [firstScanType, setFirstScanType] = useState<'customer' | 'autoliv' | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date | undefined>(undefined);
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  
  // Delivery date, location, and time selection states
  const [selectedDeliveryDate, setSelectedDeliveryDate] = useState<Date | undefined>(undefined);
  const [selectedUnloadingLocs, setSelectedUnloadingLocs] = useState<string[]>([]);
  const [selectedDeliveryTimes, setSelectedDeliveryTimes] = useState<string[]>([]);
  
  // Invoice QR scanning
  const [showInvoiceQRScanner, setShowInvoiceQRScanner] = useState(false);
  
  const [validatedBins, setValidatedBins] = useState<Record<string, Array<{
    customerItem: string;
    itemNumber: string;
    partDescription: string;
    quantity: number;
    status: string;
    scannedBy: string;
    time: string;
  }>>>({});

  // Helper function to format date as YYYY-MM-DD in local timezone
  const formatDateAsLocalString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Get invoices with schedule data
  const invoicesWithSchedule = useMemo(() => {
    if (!scheduleData || !sharedInvoices.length) {
      console.log('=== DOC AUDIT DEBUG: invoicesWithSchedule ===');
      console.log('scheduleData:', scheduleData ? 'exists' : 'null');
      console.log('sharedInvoices.length:', sharedInvoices.length);
      return [];
    }
    
    const scheduledCustomerCodes = new Set(
      scheduleData.items.map(item => String(item.customerCode))
    );
    
    const matched = sharedInvoices.filter(
      inv => inv.billTo && scheduledCustomerCodes.has(String(inv.billTo)) && !inv.dispatchedBy
    );
    
    console.log('=== DOC AUDIT DEBUG: invoicesWithSchedule ===');
    console.log('Total sharedInvoices:', sharedInvoices.length);
    console.log('Scheduled customer codes:', Array.from(scheduledCustomerCodes));
    console.log('Matched invoices:', matched.length);
    console.log('Sample invoice billTo:', sharedInvoices[0]?.billTo);
    
    // Check if items exist in sharedInvoices
    if (sharedInvoices.length > 0) {
      console.log('First sharedInvoice has items?', !!sharedInvoices[0]?.items);
      console.log('First sharedInvoice items length:', sharedInvoices[0]?.items?.length);
      if (sharedInvoices[0]?.items && sharedInvoices[0].items.length > 0) {
        console.log('First invoice first item:', sharedInvoices[0].items[0]);
      }
    }
    
    return matched;
  }, [sharedInvoices, scheduleData]);

  // Get available delivery dates
  const availableDeliveryDates = useMemo(() => {
    if (!scheduleData || !invoicesWithSchedule.length) {
      console.log('=== DOC AUDIT DEBUG: availableDeliveryDates ===');
      console.log('scheduleData:', scheduleData ? 'exists' : 'null');
      console.log('invoicesWithSchedule.length:', invoicesWithSchedule.length);
      return [];
    }
    
    const dates = new Set<string>();
    const customerItemsSet = new Set<string>();
    
    // Debug: Log the first invoice item structure
    console.log('=== DOC AUDIT DEBUG: Invoice items check ===');
    console.log('Number of invoicesWithSchedule:', invoicesWithSchedule.length);
    if (invoicesWithSchedule.length > 0) {
      console.log('First invoice ID:', invoicesWithSchedule[0].id);
      console.log('First invoice items:', invoicesWithSchedule[0].items);
      console.log('First invoice items length:', invoicesWithSchedule[0].items?.length);
      
      if (invoicesWithSchedule[0].items && invoicesWithSchedule[0].items.length > 0) {
        console.log('First item FULL:', JSON.stringify(invoicesWithSchedule[0].items[0], null, 2));
        console.log('Fields available:', Object.keys(invoicesWithSchedule[0].items[0]));
        console.log('part field:', invoicesWithSchedule[0].items[0].part);
        console.log('customerItem field:', invoicesWithSchedule[0].items[0].customerItem);
        console.log('status field:', invoicesWithSchedule[0].items[0].status);
        
        // Show first 5 items' part numbers
        const first5Parts = invoicesWithSchedule[0].items.slice(0, 5).map((item: any) => ({
          part: item.part,
          customerItem: item.customerItem,
          combined: item.customerItem || item.part
        }));
        console.log('First 5 items (part info):', first5Parts);
      } else {
        console.log('WARNING: First invoice has no items or items is undefined/empty!');
      }
    }
    
    invoicesWithSchedule.forEach(invoice => {
      invoice.items?.forEach((item: any) => {
        // Check both customerItem and part fields (they might be the same)
        const partNum = item.customerItem || item.part;
        // Include all items with a part number (no status check - we already filter by scheduled customer codes)
        if (partNum) {
          customerItemsSet.add(String(partNum).trim());
        }
      });
    });
    
    scheduleData.items.forEach(item => {
      if (item.deliveryDate && item.partNumber && customerItemsSet.has(String(item.partNumber).trim())) {
        dates.add(formatDateAsLocalString(item.deliveryDate));
      }
    });
    
    console.log('=== DOC AUDIT DEBUG: availableDeliveryDates ===');
    console.log('Customer items from invoices:', Array.from(customerItemsSet).slice(0, 10));
    console.log('Total customer items:', customerItemsSet.size);
    console.log('Schedule items with deliveryDate:', scheduleData.items.filter(i => i.deliveryDate).length);
    console.log('Schedule items with partNumber:', scheduleData.items.filter(i => i.partNumber).length);
    console.log('Schedule part numbers (first 10):', scheduleData.items.filter(i => i.partNumber).map(i => i.partNumber).slice(0, 10));
    
    // Check for matching - compare first few items
    const invoiceParts = Array.from(customerItemsSet).slice(0, 5);
    const scheduleParts = scheduleData.items.filter(i => i.partNumber).map(i => String(i.partNumber).trim()).slice(0, 5);
    console.log('Comparing invoice parts:', invoiceParts);
    console.log('With schedule parts:', scheduleParts);
    
    // Check if any match
    invoiceParts.forEach(invPart => {
      const found = scheduleParts.find(schPart => schPart === invPart);
      console.log(`Invoice part "${invPart}" matches schedule: ${found ? 'YES' : 'NO'}`);
    });
    
    console.log('Matching schedule items:', scheduleData.items.filter(i => 
      i.deliveryDate && i.partNumber && customerItemsSet.has(String(i.partNumber).trim())
    ).length);
    console.log('Available dates:', Array.from(dates).sort());
    
    return Array.from(dates).sort();
  }, [scheduleData, invoicesWithSchedule]);

  // Get available unloading locations for selected date
  const availableUnloadingLocs = useMemo(() => {
    if (!selectedDeliveryDate || !scheduleData || !invoicesWithSchedule.length) {
      console.log('=== DOC AUDIT DEBUG: availableUnloadingLocs ===');
      console.log('selectedDeliveryDate:', selectedDeliveryDate);
      console.log('scheduleData:', scheduleData ? 'exists' : 'null');
      console.log('invoicesWithSchedule.length:', invoicesWithSchedule.length);
      return [];
    }
    
    const locs = new Set<string>();
    const customerItemsSet = new Set<string>();
    
    invoicesWithSchedule.forEach(invoice => {
      invoice.items?.forEach((item: any) => {
        const partNum = item.customerItem || item.part;
        if (partNum) {
          customerItemsSet.add(String(partNum).trim());
        }
      });
    });
    
    const selectedDate = formatDateAsLocalString(selectedDeliveryDate);
    scheduleData.items.forEach(item => {
      if (item.deliveryDate && item.unloadingLoc && item.partNumber) {
        const itemDate = formatDateAsLocalString(item.deliveryDate);
        if (itemDate === selectedDate && customerItemsSet.has(String(item.partNumber).trim())) {
          locs.add(item.unloadingLoc);
        }
      }
    });
    
    console.log('=== DOC AUDIT DEBUG: availableUnloadingLocs ===');
    console.log('Selected date:', selectedDate);
    console.log('Customer items:', Array.from(customerItemsSet).slice(0, 5));
    console.log('Schedule items with date+unloadingLoc+partNumber:', scheduleData.items.filter(i => 
      i.deliveryDate && i.unloadingLoc && i.partNumber
    ).length);
    console.log('Available unloading locations:', Array.from(locs).sort());
    
    return Array.from(locs).sort();
  }, [selectedDeliveryDate, scheduleData, invoicesWithSchedule]);

  // Get available delivery times for selected date and unloading location(s)
  const availableDeliveryTimes = useMemo(() => {
    if (!selectedDeliveryDate || selectedUnloadingLocs.length === 0 || !scheduleData || !invoicesWithSchedule.length) {
      console.log('=== DOC AUDIT DEBUG: availableDeliveryTimes ===');
      console.log('selectedDeliveryDate:', selectedDeliveryDate);
      console.log('selectedUnloadingLocs.length:', selectedUnloadingLocs.length);
      console.log('scheduleData:', scheduleData ? 'exists' : 'null');
      console.log('invoicesWithSchedule.length:', invoicesWithSchedule.length);
      return [];
    }
    
    const times = new Set<string>();
    const customerItemsSet = new Set<string>();
    
    invoicesWithSchedule.forEach(invoice => {
      invoice.items?.forEach((item: any) => {
        const partNum = item.customerItem || item.part;
        if (partNum) {
          customerItemsSet.add(String(partNum).trim());
        }
      });
    });
    
    const selectedDate = formatDateAsLocalString(selectedDeliveryDate);
    scheduleData.items.forEach(item => {
      if (item.deliveryDate && item.deliveryTime && item.partNumber && item.unloadingLoc) {
        const itemDate = formatDateAsLocalString(item.deliveryDate);
        if (itemDate === selectedDate 
            && selectedUnloadingLocs.includes(item.unloadingLoc)
            && customerItemsSet.has(String(item.partNumber).trim())) {
          times.add(item.deliveryTime);
        }
      }
    });
    
    console.log('=== DOC AUDIT DEBUG: availableDeliveryTimes ===');
    console.log('Selected date:', selectedDate);
    console.log('Selected unloading locs:', selectedUnloadingLocs);
    console.log('Customer items:', Array.from(customerItemsSet).slice(0, 5));
    console.log('Schedule items with date+time+partNumber+unloadingLoc:', scheduleData.items.filter(i => 
      i.deliveryDate && i.deliveryTime && i.partNumber && i.unloadingLoc
    ).length);
    console.log('Matching items for date+location:', scheduleData.items.filter(i => {
      if (!i.deliveryDate || !i.deliveryTime || !i.partNumber || !i.unloadingLoc) return false;
      const itemDate = formatDateAsLocalString(i.deliveryDate);
      return itemDate === selectedDate 
        && selectedUnloadingLocs.includes(i.unloadingLoc)
        && customerItemsSet.has(String(i.partNumber).trim());
    }).length);
    console.log('Available times:', Array.from(times).sort());
    
    return Array.from(times).sort();
  }, [selectedDeliveryDate, selectedUnloadingLocs, scheduleData, invoicesWithSchedule]);

  // Get filtered invoices based on selections
  const invoices = useMemo(() => {
    if (!selectedDeliveryDate || selectedUnloadingLocs.length === 0 || selectedDeliveryTimes.length === 0 || !scheduleData) {
      console.log('=== DOC AUDIT DEBUG: invoices (filtered) ===');
      console.log('selectedDeliveryDate:', selectedDeliveryDate);
      console.log('selectedUnloadingLocs.length:', selectedUnloadingLocs.length);
      console.log('selectedDeliveryTimes.length:', selectedDeliveryTimes.length);
      console.log('scheduleData:', scheduleData ? 'exists' : 'null');
      return [];
    }
    
    const customerItemsSet = new Set<string>();
    invoicesWithSchedule.forEach(invoice => {
      invoice.items?.forEach((item: any) => {
        const partNum = item.customerItem || item.part;
        if (partNum) {
          customerItemsSet.add(String(partNum).trim());
        }
      });
    });
    
    const selectedDate = formatDateAsLocalString(selectedDeliveryDate);
    const matchingScheduleItems = scheduleData.items.filter(item => {
      if (!item.deliveryDate || !item.deliveryTime || !item.partNumber || !item.unloadingLoc) return false;
      const itemDate = formatDateAsLocalString(item.deliveryDate);
      return itemDate === selectedDate 
        && selectedUnloadingLocs.includes(item.unloadingLoc)
        && selectedDeliveryTimes.includes(item.deliveryTime)
        && customerItemsSet.has(String(item.partNumber).trim());
    });
    
    const matchingPartNumbers = new Set(matchingScheduleItems.map(item => String(item.partNumber).trim()));
    
    const filtered = invoicesWithSchedule.filter(invoice => {
      return invoice.items?.some((item: any) => {
        const partNum = item.customerItem || item.part;
        return partNum && matchingPartNumbers.has(String(partNum).trim());
      });
    });
    
    console.log('=== DOC AUDIT DEBUG: invoices (filtered) ===');
    console.log('Selected date:', selectedDate);
    console.log('Selected unloading locs:', selectedUnloadingLocs);
    console.log('Selected times:', selectedDeliveryTimes);
    console.log('Customer items from invoices:', Array.from(customerItemsSet).slice(0, 10));
    console.log('Matching schedule items:', matchingScheduleItems.length);
    console.log('Matching part numbers:', Array.from(matchingPartNumbers).slice(0, 10));
    console.log('Filtered invoices:', filtered.length);
    if (filtered.length > 0) {
      console.log('Sample filtered invoice ID:', filtered[0].id);
    }
    
    return filtered.sort((a, b) => a.id.localeCompare(b.id));
  }, [selectedDeliveryDate, selectedUnloadingLocs, selectedDeliveryTimes, invoicesWithSchedule, scheduleData]);

  // Get all selected invoices
  const selectedInvoiceObjects = invoices.filter(inv => selectedInvoices.includes(inv.id));
  
  // Helper function to extract unique Customer Items
  const getUniqueCustomerItems = (invoice: InvoiceData | undefined) => {
    if (!invoice || !invoice.items || invoice.items.length === 0) return [];
    
    const customerItemMap = new Map<string, {
      customerItem: string;
      itemNumber: string;
      partDescription: string;
      quantity: number;
    }>();
    
    invoice.items.forEach((item: UploadedRow) => {
      // Check both customerItem and part fields
      const customerItem = item.customerItem || item.part || '';
      if (customerItem) {
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
  
  // Calculate total progress across all selected invoices
  const totalScannedItems = Object.values(validatedBins).reduce((sum, bins) => sum + bins.length, 0);
  const totalExpectedItems = selectedInvoiceObjects.reduce((sum, invoice) => {
    const unique = getUniqueCustomerItems(invoice);
    return sum + unique.length;
  }, 0);

  // Clear validated bins when invoice selection changes
  useEffect(() => {
    setValidatedBins({});
    setCustomerScan(null);
    setAutolivScan(null);
    setFirstScanType(null);
  }, [selectedInvoices]);
  
  // Handle invoice QR scan - Randomly picks unscanned invoice
  const handleInvoiceQRScan = (data: BarcodeData) => {
    // Get unscanned invoices (not blocked and not already selected)
    const unscannedInvoices = invoices.filter(inv => {
      const invoiceInShared = sharedInvoices.find(i => i.id === inv.id);
      const isBlocked = invoiceInShared?.blocked ?? inv.blocked ?? false;
      const isAlreadySelected = selectedInvoices.includes(inv.id);
      return !isBlocked && !isAlreadySelected;
    });
    
    // Check if any unscanned invoices available
    if (unscannedInvoices.length === 0) {
      toast.warning("All invoices already scanned", {
        description: "All available invoices have been added to selection",
        duration: 3000
      });
      return;
    }
    
    // Randomly pick one unscanned invoice
    const randomIndex = Math.floor(Math.random() * unscannedInvoices.length);
    const randomInvoice = unscannedInvoices[randomIndex];
    
    // Add to selection
    setSelectedInvoices(prev => [...prev, randomInvoice.id]);
    toast.success(`✅ Invoice ${randomInvoice.id} added!`, {
      description: `${randomInvoice.customer} - ${selectedInvoices.length + 1} invoice(s) selected`,
      duration: 3000
    });
    
    // Don't close scanner - allow multiple scans
    // setShowInvoiceQRScanner(false); // REMOVED
  };

  // Clear selected invoices if they get dispatched
  useEffect(() => {
    if (selectedInvoices.length > 0) {
      const dispatchedInvoices = selectedInvoices.filter(invId => {
        const invoice = sharedInvoices.find(inv => inv.id === invId);
        return invoice?.dispatchedBy;
      });
      if (dispatchedInvoices.length > 0) {
        setSelectedInvoices(prev => prev.filter(id => !dispatchedInvoices.includes(id)));
        toast.info(`${dispatchedInvoices.length} invoice(s) dispatched and removed from selection`);
      }
    }
  }, [sharedInvoices, selectedInvoices]);

  // Track which label was scanned first
  useEffect(() => {
    if (customerScan && !autolivScan) {
      if (!firstScanType) {
        setFirstScanType('customer');
      }
    } else if (autolivScan && !customerScan) {
      if (!firstScanType) {
        setFirstScanType('autoliv');
      }
    }
  }, [customerScan, autolivScan, firstScanType]);

  // Auto-validate when both barcodes are scanned
  useEffect(() => {
    if (customerScan && autolivScan) {
      handleValidateBarcodes();
    }
  }, [customerScan, autolivScan]);

  const handleValidateBarcodes = () => {
    // Check if any selected invoice is blocked
    const hasBlockedInvoice = selectedInvoices.some(invoiceId => {
      const invoice = sharedInvoices.find(inv => inv.id === invoiceId);
      return invoice?.blocked;
    });
    
    if (hasBlockedInvoice) {
      toast.error("⚠️ One or more invoices are blocked", {
        description: "Please resolve mismatches before continuing.",
        duration: 5000,
      });
      return;
    }

    if (!customerScan || !autolivScan) {
      toast.error("Please scan both barcodes");
      return;
    }
    
    const customerScannedFirst = firstScanType === 'customer';
    const autolivScannedFirst = firstScanType === 'autoliv';
    const barcodesMatch = customerScan.rawValue.trim() === autolivScan.rawValue.trim();
    
    let shouldMatch = false;
    if (customerScannedFirst && barcodesMatch) {
      shouldMatch = true;
    } else if (autolivScannedFirst) {
      shouldMatch = false;
    } else if (customerScannedFirst && !barcodesMatch) {
      shouldMatch = false;
    }
    
    if (shouldMatch) {
      // Search through all selected invoices to find which one contains this customer item
      let foundInvoice: InvoiceData | null = null;
      let matchedInvoiceItem: UploadedRow | undefined;
      let scannedCustomerItemValue: string | null = null;
      
      if (customerScannedFirst) {
        // Try to match by customer item - search through all selected invoices
        for (const invoiceId of selectedInvoices) {
          const invoiceInShared = sharedInvoices.find(inv => inv.id === invoiceId);
          const invoice = invoiceInShared || selectedInvoiceObjects.find(inv => inv.id === invoiceId);
          
          if (!invoice || !invoice.items) continue;
          
          const uniqueCustomerItems = getUniqueCustomerItems(invoice);
          const invoiceBins = validatedBins[invoiceId] || [];
          const scannedCustomerItems = new Set(invoiceBins.map(bin => bin.customerItem));
          const unscannedCustomerItems = uniqueCustomerItems.filter(item => 
            !scannedCustomerItems.has(item.customerItem)
          );
          
          if (unscannedCustomerItems.length > 0) {
            // This invoice has unscanned items - use the first unscanned item
            const selectedCustomerItem = unscannedCustomerItems[0];
            matchedInvoiceItem = invoice.items.find((item: UploadedRow) => {
              const partNum = item.customerItem || item.part;
              return partNum && partNum.trim() === selectedCustomerItem.customerItem;
            });
            
            if (matchedInvoiceItem) {
              foundInvoice = invoice;
              scannedCustomerItemValue = selectedCustomerItem.customerItem;
              break;
            }
          }
        }
      } else {
        // Scanned Autoliv first - try to match by part code
        const scannedPartCode = customerScan.partCode?.trim();
        if (scannedPartCode) {
          for (const invoiceId of selectedInvoices) {
            const invoiceInShared = sharedInvoices.find(inv => inv.id === invoiceId);
            const invoice = invoiceInShared || selectedInvoiceObjects.find(inv => inv.id === invoiceId);
            
            if (!invoice || !invoice.items) continue;
            
            matchedInvoiceItem = invoice.items.find((item: UploadedRow) => 
              item.part && item.part.toString().trim() === scannedPartCode
            );
            
            if (matchedInvoiceItem) {
              foundInvoice = invoice;
              scannedCustomerItemValue = matchedInvoiceItem.customerItem || matchedInvoiceItem.part;
              break;
            }
          }
        }
      }
      
      if (!foundInvoice || !matchedInvoiceItem) {
        toast.error("⚠️ No matching item found!", {
          description: "Could not find this customer item in any of the selected invoices or all items already scanned.",
          duration: 4000,
        });
        setCustomerScan(null);
        setAutolivScan(null);
        setFirstScanType(null);
        return;
      }
      
      // Check if this specific customer item was already scanned for this invoice
      const invoiceBins = validatedBins[foundInvoice.id] || [];
      const alreadyScanned = invoiceBins.some(bin => 
        bin.customerItem === (matchedInvoiceItem.customerItem || matchedInvoiceItem.part)
      );
      
      if (alreadyScanned) {
        toast.warning("⚠️ This item was already scanned for this invoice!", {
          description: `Invoice: ${foundInvoice.id}`,
          duration: 3000,
        });
        setCustomerScan(null);
        setAutolivScan(null);
        setFirstScanType(null);
        return;
      }
      
      const newScannedItem = {
        customerItem: matchedInvoiceItem.customerItem || matchedInvoiceItem.part || 'N/A',
        itemNumber: matchedInvoiceItem.part || 'N/A',
        partDescription: matchedInvoiceItem.partDescription || 'N/A',
        quantity: matchedInvoiceItem.qty,
        status: 'matched',
        scannedBy: currentUser,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      };
      
      const uniqueCustomerItems = getUniqueCustomerItems(foundInvoice);
      const totalCustomerItems = uniqueCustomerItems.length;
      const newScannedCount = invoiceBins.length + 1;
      const isComplete = newScannedCount >= totalCustomerItems;
      
      setValidatedBins(prev => ({
        ...prev,
        [foundInvoice!.id]: [...(prev[foundInvoice!.id] || []), newScannedItem]
      }));
      
      // Update invoice audit status
      updateInvoiceAudit(foundInvoice.id, {
        scannedBins: newScannedCount,
        expectedBins: totalCustomerItems,
        auditComplete: isComplete
      }, currentUser);
      
      toast.success(`✅ Item scanned for Invoice ${foundInvoice.id}!`, {
        description: `${matchedInvoiceItem.customerItem || matchedInvoiceItem.part} | Progress: ${newScannedCount}/${totalCustomerItems}`,
        duration: 3000,
      });
      
      setCustomerScan(null);
      setAutolivScan(null);
      setFirstScanType(null);
    } else {
      toast.error("⚠️ Barcode Mismatch Detected!", {
        description: autolivScannedFirst 
          ? "Autoliv label was scanned first! Please scan Customer label first."
          : "Barcodes do not match. Invoice has been blocked.",
        duration: 5000,
      });
      
      // Block all selected invoices on mismatch (they can sort it out which one has the issue)
      if (selectedInvoices.length > 0 && customerScan && autolivScan) {
        selectedInvoices.forEach(invoiceId => {
          const invoice = sharedInvoices.find(inv => inv.id === invoiceId);
          if (invoice) {
            updateInvoiceAudit(invoice.id, {
              blocked: true,
              blockedAt: new Date()
            }, currentUser);

            addMismatchAlert({
              user: currentUser,
              customer: invoice.customer,
              invoiceId: invoice.id,
              step: 'doc-audit',
              customerScan: {
                partCode: customerScan.partCode || 'N/A',
                quantity: customerScan.quantity || 'N/A',
                binNumber: customerScan.binNumber || 'N/A',
                rawValue: customerScan.rawValue || 'N/A'
              },
              autolivScan: {
                partCode: autolivScan.partCode || 'N/A',
                quantity: autolivScan.quantity || 'N/A',
                binNumber: autolivScan.binNumber || 'N/A',
                rawValue: autolivScan.rawValue || 'N/A'
              }
            });
          }
        });
      }
      
      setTimeout(() => {
        toast.info("📨 Message sent to senior for approval", {
          description: "Approval request has been automatically sent to the supervisor.",
          duration: 5000,
        });
      }, 500);

      setCustomerScan(null);
      setAutolivScan(null);
      setFirstScanType(null);
    }
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
                <h1 className="text-lg sm:text-2xl font-bold text-foreground">Document Audit</h1>
                <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">Scan and validate BIN labels</p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => setShowAuditLogs(true)}
              className="flex items-center gap-2 w-full sm:w-auto justify-center"
            >
              <ScanBarcode className="h-4 w-4" />
              <span>Audit Logs</span>
              {getAuditLogs().length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {getAuditLogs().length}
                </Badge>
              )}
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 py-4 sm:py-8 pb-24 sm:pb-8">
        {!scheduleData && (
          <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-sm font-medium">
              ⚠️ No schedule uploaded yet. Please go to <strong>Upload Sales Data</strong> to import both schedule and invoice files first.
            </p>
          </div>
        )}
        
        {scheduleData && invoices.length === 0 && selectedDeliveryDate && selectedUnloadingLocs.length > 0 && selectedDeliveryTimes.length > 0 && (
          <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-sm font-medium">
              ⚠️ No invoices match the selected criteria. Try different delivery date, unloading location, or times.
            </p>
          </div>
        )}
        
        {scheduleData && invoicesWithSchedule.length > 0 && (
          <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
              <p className="text-sm font-medium">
                📊 Schedule-Based Doc Audit with Multi-Invoice Support
              </p>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>• Select delivery date, unloading location, and time to filter invoices</p>
              <p>• Select multiple invoices to audit them sequentially</p>
              <p>• Schedule uploaded: {scheduleData.uploadedAt.toLocaleString()}</p>
              <p>• Current user: <strong>{currentUser}</strong></p>
              {sharedInvoices.filter(inv => inv.dispatchedBy).length > 0 && (
                <p>• ✅ <strong>{sharedInvoices.filter(inv => inv.dispatchedBy).length}</strong> invoice(s) already dispatched</p>
              )}
            </div>
          </div>
        )}
        
        {/* Selection Fields: Delivery Date, Unloading Location, Delivery Times */}
        {scheduleData && (
          <Card className="mb-6 border-2 border-primary">
            <CardHeader>
              <CardTitle>Configure Dispatch Details</CardTitle>
              <CardDescription>Select delivery date, unloading location, and delivery time(s) before selecting invoices</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Step 1: Delivery Date Selection */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    Step 1: Delivery Date <span className="text-destructive">*</span>
                  </Label>
                  <Select 
                    value={selectedDeliveryDate ? formatDateAsLocalString(selectedDeliveryDate) : ""} 
                    onValueChange={(value) => {
                      const [year, month, day] = value.split('-').map(Number);
                      const date = new Date(year, month - 1, day);
                      setSelectedDeliveryDate(date);
                      setSelectedUnloadingLocs([]);
                      setSelectedDeliveryTimes([]);
                      setSelectedInvoices([]);
                    }}
                  >
                    <SelectTrigger className={!selectedDeliveryDate ? "border-destructive" : ""}>
                      <SelectValue placeholder="Select delivery date">
                        {selectedDeliveryDate 
                          ? selectedDeliveryDate.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
                          : undefined}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {availableDeliveryDates.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          No delivery dates available
                        </div>
                      ) : (
                        availableDeliveryDates.map(dateStr => {
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
                  {!selectedDeliveryDate && (
                    <p className="text-xs text-destructive">⚠️ Please select a delivery date</p>
                  )}
                </div>

                {/* Step 2: UNLOADING LOC Selection */}
                {selectedDeliveryDate && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Step 2: UNLOADING LOC <span className="text-destructive">*</span>
                      </Label>
                      {availableUnloadingLocs.length > 1 && (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedUnloadingLocs([...availableUnloadingLocs]);
                              setSelectedDeliveryTimes([]);
                              setSelectedInvoices([]);
                            }}
                            className="h-7 text-xs"
                          >
                            Select All
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedUnloadingLocs([]);
                              setSelectedDeliveryTimes([]);
                              setSelectedInvoices([]);
                            }}
                            className="h-7 text-xs"
                          >
                            Deselect All
                          </Button>
                        </div>
                      )}
                    </div>
                    
                    {availableUnloadingLocs.length === 0 ? (
                      <div className="p-4 bg-muted rounded-lg text-center">
                        <p className="text-sm text-muted-foreground">
                          No unloading locations available for the selected date
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4 bg-muted/50 rounded-lg border-2 border-muted">
                        {availableUnloadingLocs.map(loc => (
                          <div key={loc} className="flex items-center space-x-2">
                            <Checkbox
                              id={`loc-${loc}`}
                              checked={selectedUnloadingLocs.includes(loc)}
                              onCheckedChange={() => {
                                if (selectedUnloadingLocs.includes(loc)) {
                                  setSelectedUnloadingLocs(prev => prev.filter(l => l !== loc));
                                } else {
                                  setSelectedUnloadingLocs(prev => [...prev, loc]);
                                }
                                setSelectedDeliveryTimes([]);
                                setSelectedInvoices([]);
                              }}
                            />
                            <label
                              htmlFor={`loc-${loc}`}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                            >
                              {loc}
                            </label>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {selectedUnloadingLocs.length === 0 && availableUnloadingLocs.length > 0 && (
                      <p className="text-xs text-destructive">⚠️ Please select at least one unloading location</p>
                    )}
                  </div>
                )}

                {/* Step 3: Delivery Time Selection */}
                {selectedDeliveryDate && selectedUnloadingLocs.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Step 3: Delivery Time(s) <span className="text-destructive">*</span>
                      </Label>
                      {availableDeliveryTimes.length > 1 && (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedDeliveryTimes([...availableDeliveryTimes]);
                              setSelectedInvoices([]);
                            }}
                            className="h-7 text-xs"
                          >
                            Select All
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedDeliveryTimes([]);
                              setSelectedInvoices([]);
                            }}
                            className="h-7 text-xs"
                          >
                            Deselect All
                          </Button>
                        </div>
                      )}
                    </div>
                    
                    {availableDeliveryTimes.length === 0 ? (
                      <div className="p-4 bg-muted rounded-lg text-center">
                        <p className="text-sm text-muted-foreground">
                          No delivery times available for the selected date and location(s)
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4 bg-muted/50 rounded-lg border-2 border-muted">
                        {availableDeliveryTimes.map(time => (
                          <div key={time} className="flex items-center space-x-2">
                            <Checkbox
                              id={`time-${time}`}
                              checked={selectedDeliveryTimes.includes(time)}
                              onCheckedChange={() => {
                                if (selectedDeliveryTimes.includes(time)) {
                                  setSelectedDeliveryTimes(prev => prev.filter(t => t !== time));
                                } else {
                                  setSelectedDeliveryTimes(prev => [...prev, time]);
                                }
                                setSelectedInvoices([]);
                              }}
                            />
                            <label
                              htmlFor={`time-${time}`}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                            >
                              {time}
                            </label>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {selectedDeliveryTimes.length === 0 && availableDeliveryTimes.length > 0 && (
                      <p className="text-xs text-destructive">⚠️ Please select at least one delivery time</p>
                    )}
                  </div>
                )}
              </div>
              
              {/* Selection Status */}
              <div className="mt-6 p-3 bg-muted rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold">Selection Status:</p>
                  {(selectedDeliveryDate || selectedUnloadingLocs.length > 0 || selectedDeliveryTimes.length > 0) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedDeliveryDate(undefined);
                        setSelectedUnloadingLocs([]);
                        setSelectedDeliveryTimes([]);
                        setSelectedInvoices([]);
                      }}
                      className="h-7 text-xs"
                    >
                      <X className="h-3 w-3 mr-1" />
                      Clear All
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={selectedDeliveryDate ? "default" : "outline"}>
                    Delivery Date: {selectedDeliveryDate ? selectedDeliveryDate.toLocaleDateString() : "Not selected"}
                  </Badge>
                  <Badge variant={selectedUnloadingLocs.length > 0 ? "default" : "outline"}>
                    Unloading LOC: {selectedUnloadingLocs.length > 0 ? `${selectedUnloadingLocs.length} selected` : "Not selected"}
                  </Badge>
                  <Badge variant={selectedDeliveryTimes.length > 0 ? "default" : "outline"}>
                    Delivery Time(s): {selectedDeliveryTimes.length > 0 ? `${selectedDeliveryTimes.length} selected` : "Not selected"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* Invoice Selection */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Step 4: Select Invoice(s)</CardTitle>
            <CardDescription>
              Scan invoice QR codes or manually select invoices to audit
              {selectedDeliveryDate && selectedUnloadingLocs.length > 0 && selectedDeliveryTimes.length > 0 && (
                <span className="block mt-1 text-success text-sm font-medium">
                  ✅ All filters applied - Invoice selection is now enabled
                </span>
              )}
              {(!selectedDeliveryDate || selectedUnloadingLocs.length === 0 || selectedDeliveryTimes.length === 0) && (
                <span className="block mt-1 text-destructive text-sm font-medium">
                  ⚠️ Please complete all filter selections above first
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {invoices.length === 0 ? (
              <div className="p-4 bg-muted rounded-lg text-center">
                <p className="text-sm text-muted-foreground">
                  {!selectedDeliveryDate || selectedUnloadingLocs.length === 0 || selectedDeliveryTimes.length === 0
                    ? "Please complete the filter selections above to see invoices"
                    : "No invoices matching your selections"}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* PRIMARY METHOD: QR Scanner Button - Large and Prominent */}
                <div className="relative">
                  <Button
                    onClick={() => setShowInvoiceQRScanner(true)}
                    disabled={!selectedDeliveryDate || selectedUnloadingLocs.length === 0 || selectedDeliveryTimes.length === 0}
                    className="w-full h-16 text-lg font-bold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg hover:shadow-xl transition-all duration-200"
                  >
                    <ScanBarcode className="h-8 w-8 mr-3" />
                    Scan Invoice QR Code
                  </Button>
                  <p className="text-xs text-center text-muted-foreground mt-2">
                    🎯 Primary Method: Scan any invoice QR to add to selection
                  </p>
                </div>

                {/* Summary Info */}
                <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    📅 {invoices.length} invoice(s) available | 
                    {selectedDeliveryDate && ` ${selectedDeliveryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                    {selectedUnloadingLocs.length > 0 && ` | 📍 ${selectedUnloadingLocs.length} location(s)`}
                    {selectedDeliveryTimes.length > 0 && ` | ⏰ ${selectedDeliveryTimes.length} time(s)`}
                    {selectedInvoices.length > 0 && (
                      <span className="block mt-1 font-semibold text-blue-900 dark:text-blue-100">
                        ✅ {selectedInvoices.length} invoice(s) selected for audit
                      </span>
                    )}
                  </p>
                </div>

                {/* SECONDARY METHOD: Dropdown Selection */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Manual Selection - Dropdown:</Label>
                  <Select
                    value=""
                    onValueChange={(value) => {
                      if (value && !selectedInvoices.includes(value)) {
                        setSelectedInvoices(prev => [...prev, value]);
                        toast.success(`Invoice ${value} added to selection`);
                      }
                    }}
                    disabled={!selectedDeliveryDate || selectedUnloadingLocs.length === 0 || selectedDeliveryTimes.length === 0}
                  >
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="Select invoice from dropdown..." />
                    </SelectTrigger>
                    <SelectContent>
                      {invoices.map(invoice => {
                        const invoiceInShared = sharedInvoices.find(inv => inv.id === invoice.id);
                        const isBlocked = invoiceInShared?.blocked ?? invoice.blocked ?? false;
                        const isSelected = selectedInvoices.includes(invoice.id);
                        const isAudited = invoiceInShared?.auditComplete ?? invoice.auditComplete;
                        
                        return (
                          <SelectItem 
                            key={invoice.id} 
                            value={invoice.id}
                            disabled={isBlocked}
                          >
                            {isSelected && '✓ '}
                            {invoice.id} - {invoice.customer}
                            {isAudited && ' (Audited)'}
                            {isBlocked && ' ⛔'}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {/* TERTIARY METHOD: Checkbox List */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">OR Select from list below:</Label>
                    {invoices.length > 1 && (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const selectableInvoices = invoices.filter(inv => {
                              const invoiceInShared = sharedInvoices.find(i => i.id === inv.id);
                              return !(invoiceInShared?.blocked ?? inv.blocked ?? false);
                            });
                            setSelectedInvoices(selectableInvoices.map(inv => inv.id));
                          }}
                          className="h-7 text-xs"
                          disabled={!selectedDeliveryDate || selectedUnloadingLocs.length === 0 || selectedDeliveryTimes.length === 0}
                        >
                          Select All
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedInvoices([])}
                          className="h-7 text-xs"
                        >
                          Deselect All
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                  {invoices.map(invoice => {
                    const invoiceInShared = sharedInvoices.find(inv => inv.id === invoice.id);
                    const scannedCount = invoiceInShared?.scannedBins ?? invoice.scannedBins;
                    const isAudited = invoiceInShared?.auditComplete ?? invoice.auditComplete;
                    const isBlocked = invoiceInShared?.blocked ?? invoice.blocked ?? false;
                    
                    const invoiceItems = invoiceInShared?.items || invoice.items || [];
                    const uniqueCustItems = new Set<string>();
                    invoiceItems.forEach((item: UploadedRow) => {
                      const partNum = item.customerItem || item.part;
                      if (partNum && String(partNum).trim() !== '') {
                        uniqueCustItems.add(String(partNum).trim());
                      }
                    });
                    const totalCustItems = uniqueCustItems.size;
                    
                    return (
                      <div 
                        key={invoice.id} 
                        className={`p-3 border-2 rounded-lg transition-colors ${
                          selectedInvoices.includes(invoice.id)
                            ? 'border-success bg-success/5'
                            : 'border-border'
                        } ${isBlocked ? 'opacity-50' : 'hover:border-primary/50'}`}
                      >
                        <div className="flex items-start gap-3">
                          <Checkbox
                            id={`invoice-${invoice.id}`}
                            checked={selectedInvoices.includes(invoice.id)}
                            disabled={isBlocked || !selectedDeliveryDate || selectedUnloadingLocs.length === 0 || selectedDeliveryTimes.length === 0}
                            onCheckedChange={() => {
                              if (selectedInvoices.includes(invoice.id)) {
                                setSelectedInvoices(prev => prev.filter(id => id !== invoice.id));
                              } else {
                                setSelectedInvoices(prev => [...prev, invoice.id]);
                              }
                            }}
                            className="mt-1"
                          />
                          <label
                            htmlFor={`invoice-${invoice.id}`}
                            className="flex-1 cursor-pointer"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <p className="font-semibold text-sm">
                                  {invoice.id} - {invoice.customer}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Customer Code: {invoice.billTo || 'N/A'} | Progress: {scannedCount}/{totalCustItems} Customer Items
                                </p>
                              </div>
                              <div className="flex gap-1">
                                {isAudited && <Badge variant="secondary" className="text-xs">✓ Audited</Badge>}
                                {isBlocked && <Badge variant="destructive" className="text-xs">⛔ Blocked</Badge>}
                              </div>
                            </div>
                          </label>
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </div>
              </div>
            )}

            {selectedInvoices.length > 0 && (
              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-2">
                  📋 Simultaneous Multi-Invoice Audit Active
                </p>
                <p className="text-xs text-muted-foreground mb-2">
                  {selectedInvoices.length} invoice(s) selected for audit. Scan any customer item - the system will automatically detect which invoice it belongs to and update that invoice's progress.
                </p>
                <p className="text-xs font-semibold text-blue-900 dark:text-blue-100">
                  Overall Progress: {totalScannedItems}/{totalExpectedItems} items scanned
                </p>
              </div>
            )}
            
            {selectedInvoices.length > 0 && (
              <div className="mt-6 space-y-4">
                <h3 className="text-sm font-semibold">All Selected Invoices Line Items</h3>
                {selectedInvoiceObjects.map(invoice => {
                  const uniqueItems = getUniqueCustomerItems(invoice);
                  const invoiceBins = validatedBins[invoice.id] || [];
                  const scannedCount = invoiceBins.length;
                  const totalCount = uniqueItems.length;
                  const isComplete = scannedCount >= totalCount;
                  
                  return (
                    <div key={invoice.id} className={`p-4 rounded-lg border-2 ${isComplete ? 'border-green-500 bg-green-50 dark:bg-green-950/20' : 'border-border bg-muted'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="font-semibold text-sm">{invoice.id} - {invoice.customer}</p>
                          <p className="text-xs text-muted-foreground">Customer Code: {invoice.billTo || 'N/A'}</p>
                        </div>
                        <div className="text-right">
                          <Badge variant={isComplete ? "default" : "secondary"}>
                            {scannedCount}/{totalCount} items
                          </Badge>
                          {isComplete && <p className="text-xs text-green-600 dark:text-green-400 mt-1">✓ Complete</p>}
                        </div>
                      </div>
                      
                      {uniqueItems.length > 0 && (
                        <div className="border rounded-lg overflow-hidden">
                          <table className="w-full text-xs">
                            <thead className="bg-muted/50">
                              <tr>
                                <th className="text-left p-2 font-semibold">Customer Item</th>
                                <th className="text-left p-2 font-semibold">Item Number</th>
                                <th className="text-left p-2 font-semibold">Part Description</th>
                                <th className="text-left p-2 font-semibold">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {uniqueItems.map((item, index) => {
                                const isScanned = invoiceBins.some(bin => bin.customerItem === item.customerItem);
                                return (
                                  <tr key={index} className={`border-t ${isScanned ? 'bg-green-100 dark:bg-green-950/40' : ''}`}>
                                    <td className="p-2 font-medium">{item.customerItem}</td>
                                    <td className="p-2">{item.itemNumber}</td>
                                    <td className="p-2 text-muted-foreground">{item.partDescription || 'N/A'}</td>
                                    <td className="p-2">
                                      {isScanned ? (
                                        <Badge variant="default" className="text-xs">✓ Scanned</Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-xs">Pending</Badge>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Scanning Interface */}
        {selectedInvoices.length > 0 && (
          <>
            {/* Back to Invoice Selection */}
            <Button
              variant="ghost"
              onClick={() => {
                setSelectedInvoices([]);
                setCustomerScan(null);
                setAutolivScan(null);
              }}
              className="flex items-center gap-2 mb-4 text-sm sm:text-base"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Change Invoice Selection</span>
              <span className="sm:hidden">Back</span>
            </Button>

            {/* Blocked Warning Card */}
            {selectedInvoices.some(invId => {
              const inv = sharedInvoices.find(i => i.id === invId);
              return inv?.blocked;
            }) && (
              <Card className="mb-6 border-2 border-red-500 bg-red-50 dark:bg-red-950">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-red-900 dark:text-red-100">
                    <XCircle className="h-5 w-5" />
                    Admin Approval Needed
                  </CardTitle>
                  <CardDescription className="text-red-700 dark:text-red-300">
                    One or more selected invoices have barcode mismatches and cannot be scanned until an admin marks them as corrected.
                    Please contact your supervisor to resolve this issue.
                  </CardDescription>
                </CardHeader>
              </Card>
            )}
            
            <Card className={`mb-6 ${selectedInvoices.some(invId => sharedInvoices.find(i => i.id === invId)?.blocked) ? "opacity-60" : ""}`}>
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <ScanBarcode className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Barcode Scanning & Validation</CardTitle>
                    <CardDescription>
                      {selectedInvoices.some(invId => sharedInvoices.find(i => i.id === invId)?.blocked)
                        ? "Admin approval needed - Scanning disabled" 
                        : "Scan customer and Autoliv labels - system will auto-detect which invoice the item belongs to"}
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
                          const hasBlocked = selectedInvoices.some(invId => {
                            const inv = sharedInvoices.find(i => i.id === invId);
                            return inv?.blocked;
                          });
                          
                          if (hasBlocked) {
                            toast.error("⚠️ Invoices are Blocked", {
                              description: "One or more invoices have a mismatch. Please wait for admin to mark them as corrected.",
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
                        disabled={selectedInvoices.some(invId => sharedInvoices.find(i => i.id === invId)?.blocked)}
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
                      />
                    </div>
                  </div>

                  {/* Clear Button */}
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

            {/* Scanned Customer Items Table - Grouped by Invoice */}
            <Card>
              <CardHeader>
                <CardTitle>
                  Scanned Customer Items 
                  ({Object.values(validatedBins).reduce((sum, bins) => sum + bins.length, 0)} total)
                </CardTitle>
                <CardDescription>Real-time list of scanned and validated Customer Items grouped by invoice</CardDescription>
              </CardHeader>
              <CardContent>
                {Object.keys(validatedBins).length > 0 ? (
                  <div className="space-y-4">
                    {selectedInvoices.map(invoiceId => {
                      const bins = validatedBins[invoiceId] || [];
                      if (bins.length === 0) return null;
                      
                      const invoice = selectedInvoiceObjects.find(inv => inv.id === invoiceId);
                      const invoiceInShared = sharedInvoices.find(inv => inv.id === invoiceId);
                      const invoiceData = invoiceInShared || invoice;
                      
                      return (
                        <div key={invoiceId} className="border-2 rounded-lg overflow-hidden">
                          <div className="bg-muted p-3 flex items-center justify-between">
                            <div>
                              <p className="font-semibold text-sm">{invoiceId}</p>
                              <p className="text-xs text-muted-foreground">{invoiceData?.customer || 'Unknown'}</p>
                            </div>
                            <Badge variant="secondary">
                              {bins.length} scanned
                            </Badge>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs sm:text-sm min-w-[600px]">
                              <thead className="bg-muted/50">
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
                                {bins.map((bin, i) => (
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
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <ScanBarcode className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium mb-2">No items scanned yet</p>
                    <p className="text-sm">
                      {selectedInvoices.length > 0 
                        ? "Scan and validate barcodes to start auditing the selected invoices" 
                        : "Select invoices above to begin scanning"}
                    </p>
                  </div>
                )}
                
                {/* Complete Audit Buttons for Each Invoice */}
                {selectedInvoices.length > 0 && (
                  <div className="mt-6 space-y-3">
                    {selectedInvoices.map(invoiceId => {
                      const invoice = selectedInvoiceObjects.find(inv => inv.id === invoiceId);
                      const invoiceInShared = sharedInvoices.find(inv => inv.id === invoiceId);
                      const invoiceData = invoiceInShared || invoice;
                      
                      if (!invoiceData) return null;
                      
                      const uniqueItems = getUniqueCustomerItems(invoiceData);
                      const bins = validatedBins[invoiceId] || [];
                      const isComplete = bins.length >= uniqueItems.length;
                      const alreadyAudited = invoiceInShared?.auditComplete;
                      
                      if (!isComplete || alreadyAudited) return null;
                      
                      return (
                        <div key={invoiceId} className="p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-green-700 dark:text-green-300 mb-1">
                                ✅ All items scanned for {invoiceId}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {bins.length}/{uniqueItems.length} customer items validated. Click to complete audit.
                              </p>
                            </div>
                            <Button
                              onClick={() => {
                                updateInvoiceAudit(invoiceId, {
                                  auditComplete: true,
                                  auditDate: new Date()
                                }, currentUser);
                                toast.success(`🎉 Audit completed for ${invoiceId}!`);
                              }}
                              className="flex items-center gap-2 h-10 w-full sm:w-auto"
                              variant="default"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Complete Audit
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                
                {/* All Invoices Complete Message */}
                {selectedInvoices.length > 0 && selectedInvoices.every(invId => {
                  const inv = sharedInvoices.find(i => i.id === invId);
                  return inv?.auditComplete;
                }) && (
                  <div className="mt-6 p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-green-700 dark:text-green-300 mb-1">
                          ✅ All {selectedInvoices.length} Invoice(s) Audited Successfully
                        </p>
                        <p className="text-xs text-muted-foreground">
                          All selected invoices have been scanned and validated. Ready for dispatch.
                        </p>
                      </div>
                      <Button
                        onClick={() => {
                          setSelectedInvoices([]);
                          setCustomerScan(null);
                          setAutolivScan(null);
                          setFirstScanType(null);
                          setValidatedBins({});
                        }}
                        className="flex items-center gap-2 h-10"
                        variant="default"
                      >
                        <ScanBarcode className="h-4 w-4" />
                        New Audit Session
                      </Button>
                    </div>
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
                          navigate("/upload");
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
                
                {/* Monthly Summary */}
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
      </main>

      {/* Invoice QR Scanner Dialog */}
      <Dialog open={showInvoiceQRScanner} onOpenChange={setShowInvoiceQRScanner}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanBarcode className="h-5 w-5" />
              Scan Invoice QR Codes
            </DialogTitle>
            <DialogDescription>
              Camera stays open for multiple scans - each scan adds a random unscanned invoice to your selection
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Scan Counter and Summary */}
            <div className="p-4 bg-gradient-to-r from-primary/10 to-accent/10 border-2 border-primary/20 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <p className="font-semibold text-lg">
                    {selectedInvoices.length} Invoice(s) Scanned
                  </p>
                </div>
                <Badge variant="default" className="text-sm px-3 py-1">
                  {invoices.length - selectedInvoices.filter(id => invoices.some(inv => inv.id === id)).length} Remaining
                </Badge>
              </div>
              {selectedInvoices.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Keep scanning to add more invoices or close when done
                </p>
              )}
            </div>

            {/* Real-time Scanned Invoices List */}
            {selectedInvoices.length > 0 && (
              <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg max-h-48 overflow-y-auto">
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-2">
                  Scanned Invoices:
                </p>
                <div className="space-y-1">
                  {selectedInvoices.map((invId, index) => {
                    const invoice = invoices.find(inv => inv.id === invId);
                    return (
                      <div key={invId} className="flex items-center justify-between bg-white dark:bg-gray-800 p-2 rounded">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            #{index + 1}
                          </Badge>
                          <span className="text-xs font-medium">{invId}</span>
                          {invoice && (
                            <span className="text-xs text-muted-foreground">
                              - {invoice.customer}
                            </span>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedInvoices(prev => prev.filter(id => id !== invId))}
                          className="h-6 w-6 p-0"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            {/* Scanner Button */}
            <div className="space-y-3">
              <BarcodeScanButton
                onScan={handleInvoiceQRScan}
                label="Click to Scan Next Invoice QR"
                variant="default"
                scanButtonText="Scan this QR"
                cameraGuideText="Position invoice QR here"
              />
              
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs font-semibold mb-2">How it works:</p>
                <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Each scan randomly adds one unscanned invoice</li>
                  <li>Camera stays open for continuous scanning</li>
                  <li>Watch the counter above to track progress</li>
                  <li>Remove unwanted invoices using the X button</li>
                  <li>Close scanner when you're done</li>
                </ul>
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setShowInvoiceQRScanner(false)}
                className="flex-1 h-12"
              >
                <X className="h-4 w-4 mr-2" />
                Close Scanner
              </Button>
              {selectedInvoices.length > 0 && (
                <Button
                  variant="default"
                  onClick={() => {
                    setShowInvoiceQRScanner(false);
                    toast.success(`Ready to audit ${selectedInvoices.length} invoice(s)`);
                  }}
                  className="flex-1 h-12"
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Done - Start Audit
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Audit Logs Dialog */}
      <LogsDialog
        open={showAuditLogs}
        onOpenChange={setShowAuditLogs}
        title="Document Audit Logs"
        logs={getAuditLogs()}
      />
    </div>
  );
};

export default DocAudit;
