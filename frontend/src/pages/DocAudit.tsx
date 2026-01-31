import { useState, useEffect, useMemo, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ScanBarcode,
  CheckCircle2,
  Clock,
  ArrowLeft,
  Calendar as CalendarIcon,
  XCircle,
  X,
  ChevronDown
} from "lucide-react";
import { BarcodeScanButton, type BarcodeData } from "@/components/BarcodeScanner";
import { useKeyboardBarcodeScanner } from "@/hooks/useKeyboardBarcodeScanner";
import { useSession } from "@/contexts/SessionContext";
import { LogsDialog } from "@/components/LogsDialog";
import { ScanIssueDialog, type ScanIssue } from "@/components/ScanIssueDialog";
import type { InvoiceData } from "@/contexts/SessionContext";
import { auditApi } from "@/lib/api";

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
    selectedSite,
    getInvoicesWithSchedule,
    refreshData
  } = useSession();

  // Route guard: Check if customer and site are selected
  useEffect(() => {
    if (!selectedCustomer || !selectedSite) {
      toast.error("Please select a customer and site before accessing doc audit");
      navigate("/select-customer-site");
    }
  }, [selectedCustomer, selectedSite, navigate]);

  // State management
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [customerScan, setCustomerScan] = useState<BarcodeData | null>(null);
  const [autolivScan, setAutolivScan] = useState<BarcodeData | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date | undefined>(undefined);
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  
  // Validation state tracking
  const [matchedCustomerItem, setMatchedCustomerItem] = useState<{
    invoiceId: string;
    item: UploadedRow;
  } | null>(null);
  const [matchedAutolivItem, setMatchedAutolivItem] = useState<{
    invoiceId: string;
    item: UploadedRow;
  } | null>(null);

  // Enforce strict scan order: Customer -> Autoliv
  const [scanPhase, setScanPhase] = useState<'customer' | 'autoliv'>('customer');
  const [scanOrderAlert, setScanOrderAlert] = useState<string | null>(null);

  // Scan issue popup (shown ONLY when there's an issue)
  const [scanIssue, setScanIssue] = useState<ScanIssue | null>(null);
  const [scanIssueOpen, setScanIssueOpen] = useState(false);

  const openScanIssue = (issue: ScanIssue) => {
    // De-dupe guard to prevent re-opening on repeated rejections while already shown.
    if (scanIssueOpen) return;
    setScanIssue(issue);
    setScanIssueOpen(true);
  };
  
  // Delivery date, location, and time selection states
  const [selectedDeliveryDate, setSelectedDeliveryDate] = useState<Date | undefined>(undefined);
  const [selectedUnloadingLocs, setSelectedUnloadingLocs] = useState<string[]>([]);
  const [selectedDeliveryTimes, setSelectedDeliveryTimes] = useState<string[]>([]);
  const [manualDeliveryTime, setManualDeliveryTime] = useState<string>('');
  const [manualUnloadingLoc, setManualUnloadingLoc] = useState<string>('');
  
  // Invoice QR scanning
  const [showInvoiceQRScanner, setShowInvoiceQRScanner] = useState(false);
  
  // Test scan states
  const [testCustomerScan, setTestCustomerScan] = useState<BarcodeData | null>(null);
  const [testAutolivScan, setTestAutolivScan] = useState<BarcodeData | null>(null);
  
  type ValidatedBinScanRow = {
    scanId?: string;
    customerItem: string;
    itemNumber: string;
    partDescription: string;
    customerBinNumber?: string | null;
    autolivBinNumber?: string | null;
    binNumber?: string | null;
    binQuantity?: number | null;
    quantity: number; // Display quantity for this scan row (usually binQuantity)
    status: string;
    scannedBy: string;
    scannedAt?: string | null;
    time: string; // Display time, computed from scannedAt where possible
  };

  const [validatedBins, setValidatedBins] = useState<Record<string, ValidatedBinScanRow[]>>({});

  // Pending customer-stage scans (server-side source of truth for resume behavior)
  const [pendingDocAuditCustomerScansByInvoice, setPendingDocAuditCustomerScansByInvoice] = useState<Record<string, number>>({});

  // Helper function to format date as YYYY-MM-DD in local timezone
  const formatDateAsLocalString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Get invoices with schedule data - use context method which filters by selected customer code
  const invoicesWithSchedule = useMemo(() => {
    const matched = getInvoicesWithSchedule().filter(inv => !inv.dispatchedBy);
    
    console.log('=== DOC AUDIT DEBUG: invoicesWithSchedule ===');
    console.log('Total invoices from getInvoicesWithSchedule:', matched.length);
    
    return matched;
  }, [getInvoicesWithSchedule]);

  const hasBlockedSelectedInvoice = useMemo(() => {
    if (selectedInvoices.length === 0) return false;
    return selectedInvoices.some((invId) => {
      const inv = sharedInvoices.find((i) => i.id === invId);
      return !!inv?.blocked;
    });
  }, [selectedInvoices, sharedInvoices]);

  // Server-truth resume signal: if any selected invoice has pending doc-audit customer-stage scans,
  // we should continue from Autoliv (INBD) step.
  const hasPendingCustomerStage = useMemo(() => {
    if (selectedInvoices.length === 0) return false;
    return selectedInvoices.some((invId) => (pendingDocAuditCustomerScansByInvoice[invId] || 0) > 0);
  }, [selectedInvoices, pendingDocAuditCustomerScansByInvoice]);

  // Background scanning (hardware/keyboard scanner): enabled after invoice selection.
  // IMPORTANT: Disable while invoice-selection scanner dialog is open to avoid keydown-listener conflicts.
  useKeyboardBarcodeScanner({
    enabled: selectedInvoices.length > 0 && !hasBlockedSelectedInvoice && !showInvoiceQRScanner,
    onScanAttempt: (data) => {
      // Block overlap: don’t allow a new scan while a pair is in-flight (both scans present).
      if (customerScan && autolivScan) {
        setScanOrderAlert("Validating previous pair… please wait.");
        return { accepted: false, rejectReason: "processing" };
      }

      // Require QR type detection for strict ordering.
      if (!data.qrType) {
        const msg = "Unrecognized QR type. Please scan a valid Customer label first.";
        setScanOrderAlert(msg);
        openScanIssue({
          title: "Invalid QR",
          description: msg,
          severity: "warning",
        });
        return { accepted: false, rejectReason: "unknown_type" };
      }

      if (scanPhase === 'customer') {
        if (data.qrType !== 'customer') {
          const msg = "Scan Customer label first.";
          setScanOrderAlert(msg);
          openScanIssue({
            title: "Wrong scan order",
            description: msg,
            severity: "warning",
          });
          return { accepted: false, rejectReason: "customer_first" };
        }
        setScanOrderAlert(null);
        return { accepted: true };
      }

      // scanPhase === 'autoliv'
      if (data.qrType !== 'autoliv') {
        const msg = "Scan Autoliv label for the last Customer scan first.";
        setScanOrderAlert(msg);
        openScanIssue({
          title: "Wrong scan order",
          description: msg,
          severity: "warning",
        });
        return { accepted: false, rejectReason: "autoliv_next" };
      }

      // Allow resume mode: if local customerScan is empty but backend has a pending customer-stage scan,
      // accept Autoliv scan so we can pair via scan-stage endpoint.
      if (!customerScan && !hasPendingCustomerStage) {
        setScanPhase('customer');
        const msg = "Scan Customer label first.";
        setScanOrderAlert(msg);
        openScanIssue({
          title: "Missing Customer scan",
          description: msg,
          severity: "warning",
        });
        return { accepted: false, rejectReason: "missing_customer" };
      }

      setScanOrderAlert(null);
      return { accepted: true };
    },
    onScan: (data) => {
      // Route accepted scans based on expected phase.
      if (scanPhase === 'customer') {
        setCustomerScan(data);
        setScanPhase('autoliv');
        return;
      }

      // scanPhase === 'autoliv'
      setAutolivScan(data);
    },
  });

  // Delivery date options come from invoice data (Invoice Date is the Delivery Date)
  const availableDeliveryDates = useMemo(() => {
    const dates = new Set<string>();
    invoicesWithSchedule.forEach((inv) => {
      if (inv.invoiceDate) dates.add(formatDateAsLocalString(inv.invoiceDate));
    });
    return Array.from(dates).sort();
  }, [invoicesWithSchedule]);

  // Delivery time options come from invoice-level deliveryTime + schedule for the selected invoice date
  const availableDeliveryTimes = useMemo(() => {
    if (!selectedDeliveryDate) return [];
    const selected = formatDateAsLocalString(selectedDeliveryDate);
    const times = new Set<string>();
    
    // 1) First: Check invoice-level deliveryTime for invoices matching the selected date
    invoicesWithSchedule.forEach((inv) => {
      if (!inv.invoiceDate) return;
      if (formatDateAsLocalString(inv.invoiceDate) !== selected) return;
      const deliveryTime = (inv.deliveryTime || '').trim();
      if (deliveryTime) {
        times.add(deliveryTime);
      }
    });
    
    // 2) Second: Add schedule times for the selected date only (no cross-date fallback)
    if (scheduleData?.items) {
      scheduleData.items.forEach((item) => {
        if (!item.deliveryDate || !item.deliveryTime) return;
        if (formatDateAsLocalString(item.deliveryDate) === selected) {
          const time = String(item.deliveryTime).trim();
          if (time) {
            times.add(time);
          }
        }
      });
    }
    
    return Array.from(times).sort();
  }, [selectedDeliveryDate, invoicesWithSchedule, scheduleData]);

  // Unloading location options come from invoice-level unloadingLoc + schedule for the selected invoice date + selected time(s)
  const availableUnloadingLocs = useMemo(() => {
    if (!selectedDeliveryDate) return [];
    const selected = formatDateAsLocalString(selectedDeliveryDate);
    const locs = new Set<string>();
    
    const timeFilter = selectedDeliveryTimes.length > 0 
      ? new Set(selectedDeliveryTimes.map(t => t.trim())) 
      : null;
    
    // 1) First: Check invoice-level unloadingLoc for invoices matching the selected date
    invoicesWithSchedule.forEach((inv) => {
      if (!inv.invoiceDate) return;
      if (formatDateAsLocalString(inv.invoiceDate) !== selected) return;
      const unloadingLoc = (inv.unloadingLoc || '').trim();
      if (!unloadingLoc) return;
      
      // If times are selected, only include if invoice deliveryTime matches
      if (timeFilter) {
        const invTime = (inv.deliveryTime || '').trim();
        if (invTime && timeFilter.has(invTime)) {
          locs.add(unloadingLoc);
        }
      } else {
        // If no times selected yet, include all locations for that date
        locs.add(unloadingLoc);
      }
    });
    
    // 2) Second: Add schedule unloading locs for the selected date only (no cross-date fallback)
    if (scheduleData?.items) {
      scheduleData.items.forEach((item) => {
        if (!item.deliveryDate || !item.unloadingLoc) return;
        if (formatDateAsLocalString(item.deliveryDate) !== selected) return;
        
        const loc = String(item.unloadingLoc).trim();
        if (!loc) return;
        
        if (timeFilter) {
          // Filter by selected times
          const itemTime = (item.deliveryTime || '').toString().trim();
          if (itemTime && timeFilter.has(itemTime)) {
            locs.add(loc);
          }
        } else {
          // If times are not selected yet, still show all locations for that day
          locs.add(loc);
        }
      });
    }
    
    return Array.from(locs).sort();
  }, [selectedDeliveryDate, selectedDeliveryTimes, invoicesWithSchedule, scheduleData]);


  // Invoices are filtered by selected delivery date (which is Invoice Date).
  // Delivery time + unloading location selection is only used for logging on completion.
  const invoices = useMemo(() => {
    if (!selectedDeliveryDate) return [];
    const selected = formatDateAsLocalString(selectedDeliveryDate);
    return [...invoicesWithSchedule]
      .filter((inv) => inv.invoiceDate && formatDateAsLocalString(inv.invoiceDate) === selected)
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [selectedDeliveryDate, invoicesWithSchedule]);

  // Mismatch diagnostics: Check if schedule has rows matching selected invoice date
  const mismatchDiagnostics = useMemo(() => {
    if (!selectedDeliveryDate) {
      return { scheduleMatchesForDate: 0, invoiceDeliveryFieldsForDate: 0, hasMismatch: false };
    }
    
    const selected = formatDateAsLocalString(selectedDeliveryDate);
    let scheduleMatchesForDate = 0;
    let invoiceDeliveryFieldsForDate = 0;
    
    // Count schedule items matching the selected date
    if (scheduleData?.items) {
      scheduleMatchesForDate = scheduleData.items.filter((item) => {
        if (!item.deliveryDate) return false;
        return formatDateAsLocalString(item.deliveryDate) === selected;
      }).length;
    }
    
    // Count invoices with deliveryTime or unloadingLoc for the selected date
    invoicesWithSchedule.forEach((inv) => {
      if (!inv.invoiceDate) return;
      if (formatDateAsLocalString(inv.invoiceDate) !== selected) return;
      if ((inv.deliveryTime || '').trim() || (inv.unloadingLoc || '').trim()) {
        invoiceDeliveryFieldsForDate++;
      }
    });
    
    // Has mismatch if schedule exists but has 0 matches for selected date
    const hasMismatch = scheduleData && scheduleData.items.length > 0 && scheduleMatchesForDate === 0;
    
    // Console logging for diagnostics
    if (selectedDeliveryDate) {
      console.log('🔍 DocAudit Date Mismatch Diagnostics:', {
        selectedDate: selected,
        scheduleTotalItems: scheduleData?.items.length || 0,
        scheduleMatchesForDate,
        invoiceDeliveryFieldsForDate,
        hasMismatch
      });
    }
    
    return { scheduleMatchesForDate, invoiceDeliveryFieldsForDate, hasMismatch };
  }, [selectedDeliveryDate, scheduleData, invoicesWithSchedule]);

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
  const totalScannedItems = selectedInvoiceObjects.reduce((sum, invoice) => {
    const inv = sharedInvoices.find(i => i.id === invoice.id) || invoice;
    return sum + (inv.scannedBins || 0);
  }, 0);
  const totalExpectedItems = selectedInvoiceObjects.reduce((sum, invoice) => {
    const inv = sharedInvoices.find(i => i.id === invoice.id) || invoice;
    const fallback = getUniqueCustomerItems(invoice).length;
    return sum + ((inv.expectedBins && inv.expectedBins > 0) ? inv.expectedBins : fallback);
  }, 0);

  // Clear validated bins when invoice selection changes
  useEffect(() => {
    setValidatedBins({});
    setPendingDocAuditCustomerScansByInvoice({});
    setCustomerScan(null);
    setAutolivScan(null);
  }, [selectedInvoices]);

  const refreshInvoiceScans = async (invoiceIds: string[]) => {
    try {
      const results = await Promise.all(
        invoiceIds.map(async (id) => {
          const resp = await auditApi.getScans(id, 'doc-audit');
          return { invoiceId: id, resp };
        })
      );

      // Compute pending counts (status='pending' in doc-audit are customer-stage scans awaiting pairing)
      setPendingDocAuditCustomerScansByInvoice(prev => {
        const next = { ...prev };
        for (const { invoiceId, resp } of results) {
          if (!resp?.success || !Array.isArray(resp.scans)) continue;
          const pendingCount = resp.scans.filter((s: any) => s?.status === 'pending').length;
          next[invoiceId] = pendingCount;
        }
        return next;
      });

      setValidatedBins(prev => {
        const next = { ...prev };
        for (const { invoiceId, resp } of results) {
          if (!resp?.success || !Array.isArray(resp.scans)) continue;
          const rows = resp.scans
            .filter((s: any) => s?.status === 'matched')
            .map((s: any) => ({
              scanId: s.id || undefined,
              customerItem: s.customerItem || 'N/A',
              itemNumber: s.itemNumber || 'N/A',
              partDescription: s.partDescription || 'N/A',
              customerBinNumber: s.customerBinNumber ?? null,
              autolivBinNumber: s.autolivBinNumber ?? null,
              binNumber: s.customerBinNumber ?? s.binNumber ?? null,
              binQuantity: (s.binQuantity ?? null) as number | null,
              quantity: (s.binQuantity ?? s.quantity ?? 0) as number,
              status: s.status || 'unknown',
              scannedBy: s.scannedBy || 'N/A',
              scannedAt: s.scannedAt ?? null,
              time: s.scannedAt
                ? new Date(s.scannedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                : new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            }));
          next[invoiceId] = rows;
        }
        return next;
      });
    } catch (e) {
      console.error('Failed to refresh invoice scans:', e);
    }
  };

  const groupScansByItem = (rows: ValidatedBinScanRow[]) => {
    const map = new Map<
      string,
      {
        key: string;
        customerItem: string;
        itemNumber: string;
        partDescription: string;
        scans: ValidatedBinScanRow[];
        totalQty: number;
        lastScannedAtMs: number;
      }
    >();

    for (const r of rows) {
      const customerItem = (r.customerItem || 'N/A').trim();
      const itemNumber = (r.itemNumber || 'N/A').trim();
      const key = `${customerItem}||${itemNumber}`;
      const partDescription = r.partDescription || 'N/A';
      const qty = Number(r.quantity ?? 0) || 0;
      const scannedAtMs = r.scannedAt ? new Date(r.scannedAt).getTime() : 0;

      const existing = map.get(key);
      if (existing) {
        existing.scans.push(r);
        existing.totalQty += qty;
        existing.lastScannedAtMs = Math.max(existing.lastScannedAtMs, scannedAtMs);
      } else {
        map.set(key, {
          key,
          customerItem,
          itemNumber,
          partDescription,
          scans: [r],
          totalQty: qty,
          lastScannedAtMs: scannedAtMs,
        });
      }
    }

    return Array.from(map.values())
      .map((g) => ({
        ...g,
        scans: [...g.scans].sort((a, b) => {
          const ta = a.scannedAt ? new Date(a.scannedAt).getTime() : 0;
          const tb = b.scannedAt ? new Date(b.scannedAt).getTime() : 0;
          return tb - ta; // newest first
        }),
      }))
      .sort((a, b) => b.lastScannedAtMs - a.lastScannedAtMs);
  };

  useEffect(() => {
    if (selectedInvoices.length > 0) {
      refreshInvoiceScans(selectedInvoices);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInvoices.join(',')]);

  // If an invoice was blocked and then becomes unblocked (admin corrected), refresh scans so we
  // immediately detect pending customer-stage scans and resume from Autoliv.
  const prevBlockedSelectedInvoiceRef = useRef<boolean>(false);
  useEffect(() => {
    const prev = prevBlockedSelectedInvoiceRef.current;
    if (prev && !hasBlockedSelectedInvoice && selectedInvoices.length > 0) {
      refreshInvoiceScans(selectedInvoices);
    }
    prevBlockedSelectedInvoiceRef.current = hasBlockedSelectedInvoice;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasBlockedSelectedInvoice, selectedInvoices.join(',')]);
  
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

  // Auto-validate when both barcodes are scanned
  // Handle QR scans - STRICT ORDER: customer then autoliv
  useEffect(() => {
    if (customerScan && customerScan.qrType === 'customer') {
      handleCustomerQRValidation().catch((e) => console.error('Customer QR validation error:', e));
    } else if (customerScan && customerScan.qrType !== 'customer') {
      // Safety: should not happen (we block out-of-order scans at capture time),
      // but keep the state clean if it does.
      setCustomerScan(null);
    }
  }, [customerScan]);

  useEffect(() => {
    if (autolivScan && autolivScan.qrType === 'autoliv') {
      handleAutolivQRValidation().catch((e) => console.error('Autoliv QR validation error:', e));
    } else if (autolivScan && autolivScan.qrType !== 'autoliv') {
      setAutolivScan(null);
    }
  }, [autolivScan]);

  // Keep scan phase in sync with current scan state (and prevent overlapping pairs).
  useEffect(() => {
    // While a pair is being processed (both scans present), keep phase at autoliv (UI shows “processing” separately).
    if (customerScan && !autolivScan) {
      setScanPhase('autoliv');
    } else if (!customerScan) {
      // If the backend indicates there is a pending customer-stage scan,
      // we must resume from Autoliv even if local state is empty.
      setScanPhase(hasPendingCustomerStage ? 'autoliv' : 'customer');
    }
  }, [customerScan, autolivScan, hasPendingCustomerStage]);

  // Reset scan order UI when scanning is disabled / selection cleared.
  useEffect(() => {
    if (selectedInvoices.length === 0 || hasBlockedSelectedInvoice) {
      setScanPhase('customer');
      setScanOrderAlert(null);
    }
  }, [selectedInvoices.length, hasBlockedSelectedInvoice]);

  // When both are validated, proceed to steps 3 and 4
  useEffect(() => {
    if (matchedCustomerItem && matchedAutolivItem) {
      handleFinalValidation();
    }
  }, [matchedCustomerItem, matchedAutolivItem]);

  // Step 1: Validate Customer QR - Match with customer_item
  const handleCustomerQRValidation = async () => {
    if (!customerScan || customerScan.qrType !== 'customer') {
      return;
    }

    // Check if any selected invoice is blocked
    const hasBlockedInvoice = selectedInvoices.some(invoiceId => {
      const invoice = sharedInvoices.find(inv => inv.id === invoiceId);
      return invoice?.blocked;
    });
    
    if (hasBlockedInvoice) {
      openScanIssue({
        title: "Invoices blocked",
        description: "One or more selected invoices are blocked.\nPlease resolve mismatches before continuing.",
        severity: "error",
      });
      setCustomerScan(null);
      return;
    }

    if (selectedInvoices.length === 0) {
      openScanIssue({
        title: "No invoices selected",
        description: "Please select invoices before scanning.",
        severity: "warning",
      });
      setCustomerScan(null);
      return;
    }

    const customerPartCode = customerScan.partCode?.trim();
    if (!customerPartCode) {
      openScanIssue({
        title: "Invalid Customer QR",
        description: "Could not extract part code from the Customer QR.\nPlease ensure the QR code is valid.",
        severity: "error",
      });
      setCustomerScan(null);
      return;
    }

    // Search through all selected invoices to find matching customer_item
    const matchedItems: Array<{ invoiceId: string; item: UploadedRow; invoice: InvoiceData }> = [];
    
    for (const invoiceId of selectedInvoices) {
      const invoiceInShared = sharedInvoices.find(inv => inv.id === invoiceId);
      const invoice = invoiceInShared || selectedInvoiceObjects.find(inv => inv.id === invoiceId);
      
      if (!invoice || !invoice.items) continue;
      
      // Find invoice_item where customer_item matches customer QR part code
      const matchedItem = invoice.items.find((item: UploadedRow) => {
        const itemCustomerItem = item.customerItem?.toString().trim() || '';
        return itemCustomerItem === customerPartCode;
      });
      
      if (matchedItem) {
        matchedItems.push({ invoiceId, item: matchedItem, invoice });
      }
    }

    if (matchedItems.length === 0) {
      // STEP 1 MISMATCH: Customer QR part code not found
      openScanIssue({
        title: "Customer QR mismatch (Step 1)",
        description:
          `Part code "${customerPartCode}" not found in any selected invoice.\nInvoice(s) blocked.\n\nAn exception alert has been sent to admin.`,
        severity: "error",
        context: [
          { label: "Customer part code", value: customerPartCode },
          { label: "Selected invoices", value: selectedInvoices.length },
        ],
      });

      // Block all selected invoices
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
            validationStep: 'customer_qr_no_match',
            customerScan: {
              partCode: customerScan.partCode || 'N/A',
              quantity: customerScan.binQuantity || customerScan.quantity || 'N/A',
              binNumber: customerScan.binNumber || 'N/A',
              rawValue: customerScan.rawValue || 'N/A'
            },
            autolivScan: {
              partCode: 'N/A',
              quantity: 'N/A',
              binNumber: 'N/A',
              rawValue: 'N/A'
            }
          });
        }
      });

      setCustomerScan(null);
      return;
    }

    // If multiple matches (edge case), block all matching invoices
    if (matchedItems.length > 1) {
      openScanIssue({
        title: "Ambiguous match",
        description: `Part code "${customerPartCode}" was found in ${matchedItems.length} invoices.\nAll matching invoices will be blocked for admin review.`,
        severity: "warning",
        context: [
          { label: "Customer part code", value: customerPartCode },
          { label: "Matches", value: matchedItems.length },
        ],
      });

      matchedItems.forEach(({ invoiceId }) => {
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
            validationStep: 'customer_qr_no_match',
            customerScan: {
              partCode: customerScan.partCode || 'N/A',
              quantity: customerScan.binQuantity || customerScan.quantity || 'N/A',
              binNumber: customerScan.binNumber || 'N/A',
              rawValue: customerScan.rawValue || 'N/A'
            },
            autolivScan: {
              partCode: 'N/A',
              quantity: 'N/A',
              binNumber: 'N/A',
              rawValue: 'N/A'
            }
          });
        }
      });

      setCustomerScan(null);
      return;
    }

    // STEP 1 SUCCESS: Customer QR matched
    const { invoiceId, item } = matchedItems[0];
    setMatchedCustomerItem({ invoiceId, item });

    // Update counters immediately on customer scan (server source of truth)
    try {
      await auditApi.recordStageScan(invoiceId, {
        stage: 'customer',
        customerBarcode: customerScan.rawValue,
        scanContext: 'doc-audit'
      });
      await refreshData();
      await refreshInvoiceScans([invoiceId]);
    } catch (error: any) {
      console.error('Customer stage scan error:', error);
      const message = error?.message || "Scan failed.";
      const isDuplicate = /duplicate|already been scanned/i.test(message);
      if (isDuplicate) {
        openScanIssue({
          title: "Duplicate scan",
          description: message,
          severity: "warning",
        });
      } else {
        openScanIssue({
          title: "Customer scan rejected",
          description: message || "Scan failed. Invoice may be blocked; check Exception Alerts.",
          severity: "error",
        });
      }
      await refreshData();
      setCustomerScan(null);
      setMatchedCustomerItem(null);
      return;
    }
    
    toast.success("✅ Step 1: Customer QR validated!", {
      description: `Part code "${customerPartCode}" matched. Please scan Autoliv QR.`,
      duration: 3000,
    });
  };

  // Step 2: Validate Autoliv QR - Match with part (item_number)
  const handleAutolivQRValidation = async () => {
    if (!autolivScan || autolivScan.qrType !== 'autoliv') {
      return;
    }

    // Check if any selected invoice is blocked
    const hasBlockedInvoice = selectedInvoices.some(invoiceId => {
      const invoice = sharedInvoices.find(inv => inv.id === invoiceId);
      return invoice?.blocked;
    });
    
    if (hasBlockedInvoice) {
      openScanIssue({
        title: "Invoices blocked",
        description: "One or more selected invoices are blocked.\nPlease resolve mismatches before continuing.",
        severity: "error",
      });
      setAutolivScan(null);
      return;
    }

    if (selectedInvoices.length === 0) {
      openScanIssue({
        title: "No invoices selected",
        description: "Please select invoices before scanning.",
        severity: "warning",
      });
      setAutolivScan(null);
      return;
    }

    const autolivPartNumber = autolivScan.partCode?.trim();
    if (!autolivPartNumber) {
      openScanIssue({
        title: "Invalid Autoliv QR",
        description: "Could not extract part number from the Autoliv QR.\nPlease ensure the QR code is valid.",
        severity: "error",
      });
      setAutolivScan(null);
      return;
    }

    // Search through all selected invoices to find matching part (item_number)
    const matchedItems: Array<{ invoiceId: string; item: UploadedRow; invoice: InvoiceData }> = [];
    
    for (const invoiceId of selectedInvoices) {
      const invoiceInShared = sharedInvoices.find(inv => inv.id === invoiceId);
      const invoice = invoiceInShared || selectedInvoiceObjects.find(inv => inv.id === invoiceId);
      
      if (!invoice || !invoice.items) continue;
      
      // Find invoice_item where part matches Autoliv QR part number
      const matchedItem = invoice.items.find((item: UploadedRow) => {
        const itemPart = item.part?.toString().trim() || '';
        return itemPart === autolivPartNumber;
      });
      
      if (matchedItem) {
        matchedItems.push({ invoiceId, item: matchedItem, invoice });
      }
    }

    if (matchedItems.length === 0) {
      // STEP 2 MISMATCH: Autoliv QR part number not found
      openScanIssue({
        title: "Autoliv QR mismatch (Step 2)",
        description:
          `Part number "${autolivPartNumber}" not found in any selected invoice.\nInvoice(s) blocked.\n\nAn exception alert has been sent to admin.`,
        severity: "error",
        context: [
          { label: "Autoliv part number", value: autolivPartNumber },
          { label: "Selected invoices", value: selectedInvoices.length },
        ],
      });

      // Block all selected invoices
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
            validationStep: 'autoliv_qr_no_match',
            customerScan: {
              partCode: customerScan?.partCode || 'N/A',
              quantity: customerScan?.binQuantity || customerScan?.quantity || 'N/A',
              binNumber: customerScan?.binNumber || 'N/A',
              rawValue: customerScan?.rawValue || 'N/A'
            },
            autolivScan: {
              partCode: autolivScan.partCode || 'N/A',
              quantity: autolivScan.binQuantity || autolivScan.quantity || 'N/A',
              binNumber: autolivScan.binNumber || 'N/A',
              rawValue: autolivScan.rawValue || 'N/A'
            }
          });
        }
      });

      setAutolivScan(null);
      setMatchedCustomerItem(null); // Reset customer match
      return;
    }

    // If multiple matches (edge case), block all matching invoices
    if (matchedItems.length > 1) {
      openScanIssue({
        title: "Ambiguous match",
        description: `Part number "${autolivPartNumber}" was found in ${matchedItems.length} invoices.\nAll matching invoices will be blocked for admin review.`,
        severity: "warning",
        context: [
          { label: "Autoliv part number", value: autolivPartNumber },
          { label: "Matches", value: matchedItems.length },
        ],
      });

      matchedItems.forEach(({ invoiceId }) => {
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
            validationStep: 'autoliv_qr_no_match',
            customerScan: {
              partCode: customerScan?.partCode || 'N/A',
              quantity: customerScan?.binQuantity || customerScan?.quantity || 'N/A',
              binNumber: customerScan?.binNumber || 'N/A',
              rawValue: customerScan?.rawValue || 'N/A'
            },
            autolivScan: {
              partCode: autolivScan.partCode || 'N/A',
              quantity: autolivScan.binQuantity || autolivScan.quantity || 'N/A',
              binNumber: autolivScan.binNumber || 'N/A',
              rawValue: autolivScan.rawValue || 'N/A'
            }
          });
        }
      });

      setAutolivScan(null);
      setMatchedCustomerItem(null); // Reset customer match
      return;
    }

    // STEP 2 SUCCESS: Autoliv QR matched
    const { invoiceId, item } = matchedItems[0];
    // RESUME MODE: If the customer label was scanned earlier (already stored in DB) but the user is resuming
    // from the Autoliv step, customerScan state will be empty. In this case, call INBD stage with autolivBarcode only.
    if (!customerScan?.rawValue) {
      try {
        await auditApi.recordStageScan(invoiceId, {
          stage: 'inbd',
          autolivBarcode: autolivScan.rawValue,
          scanContext: 'doc-audit'
        });
        await refreshData();
        await refreshInvoiceScans([invoiceId]);
        toast.success("✅ INBD scan recorded!", {
          description: `Autoliv label matched and paired with existing customer scan.`,
          duration: 3000,
        });
      } catch (error: any) {
        console.error('INBD resume scan error:', error);
        const message = error?.message || 'You may need to scan the customer label again.';
        const isDuplicate = /duplicate|already been scanned/i.test(message);
        if (isDuplicate) {
          openScanIssue({
            title: "Duplicate scan",
            description: message,
            severity: "warning",
          });
        } else {
          openScanIssue({
            title: "INBD scan rejected",
            description: message,
            severity: "error",
          });
        }
        await refreshData();
      } finally {
        // Reset state for next scan
        setAutolivScan(null);
        setMatchedAutolivItem(null);
      }
      return;
    }

    // Normal flow: customerScan is present in UI state; proceed to steps 3 & 4
    setMatchedAutolivItem({ invoiceId, item });

    toast.success("✅ Step 2: Autoliv QR validated!", {
      description: `Part number "${autolivPartNumber}" matched. Validating invoice consistency...`,
      duration: 3000,
    });
  };

  // Step 3 & 4: Invoice consistency check and bin quantity match
  const handleFinalValidation = async () => {
    if (!matchedCustomerItem || !matchedAutolivItem || !customerScan || !autolivScan) {
      return;
    }

    // STEP 3: Check if both items belong to the same invoice
    if (matchedCustomerItem.invoiceId !== matchedAutolivItem.invoiceId) {
      // STEP 3 MISMATCH: Items belong to different invoices
      openScanIssue({
        title: "Invoice mismatch (Step 3)",
        description:
          "Customer item and Autoliv item belong to different invoices.\nInvoice(s) blocked.\n\nAn exception alert has been sent to admin.",
        severity: "error",
        context: [
          { label: "Customer invoice", value: matchedCustomerItem.invoiceId },
          { label: "Autoliv invoice", value: matchedAutolivItem.invoiceId },
        ],
      });

      // Block both invoices
      const invoicesToBlock = [
        matchedCustomerItem.invoiceId,
        matchedAutolivItem.invoiceId
      ].filter((id, index, self) => self.indexOf(id) === index); // Remove duplicates

      invoicesToBlock.forEach(invoiceId => {
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
            validationStep: 'invoice_mismatch',
            customerScan: {
              partCode: customerScan.partCode || 'N/A',
              quantity: customerScan.binQuantity || customerScan.quantity || 'N/A',
              binNumber: customerScan.binNumber || 'N/A',
              rawValue: customerScan.rawValue || 'N/A'
            },
            autolivScan: {
              partCode: autolivScan.partCode || 'N/A',
              quantity: autolivScan.binQuantity || autolivScan.quantity || 'N/A',
              binNumber: autolivScan.binNumber || 'N/A',
              rawValue: autolivScan.rawValue || 'N/A'
            }
          });
        }
      });

      // Reset state
      setCustomerScan(null);
      setAutolivScan(null);
      setMatchedCustomerItem(null);
      setMatchedAutolivItem(null);
      return;
    }

    // STEP 3 SUCCESS: Both items belong to same invoice
    const invoiceId = matchedCustomerItem.invoiceId;
    const invoice = sharedInvoices.find(inv => inv.id === invoiceId);
    
    if (!invoice) {
      openScanIssue({
        title: "Invoice not found",
        description: "Please try again.",
        severity: "error",
        context: [{ label: "Invoice", value: invoiceId }],
      });
      setCustomerScan(null);
      setAutolivScan(null);
      setMatchedCustomerItem(null);
      setMatchedAutolivItem(null);
      return;
    }

    // STEP 4: Match bin quantities (must be exactly equal)
    const customerBinQty = customerScan.binQuantity?.trim();
    const autolivBinQty = autolivScan.binQuantity?.trim();

    if (!customerBinQty || !autolivBinQty) {
      openScanIssue({
        title: "Invalid QR quantity",
        description: "Could not extract bin quantities from the QR codes.\nPlease ensure both QR codes contain valid bin quantities.",
        severity: "error",
      });
      setCustomerScan(null);
      setAutolivScan(null);
      setMatchedCustomerItem(null);
      setMatchedAutolivItem(null);
      return;
    }

    if (customerBinQty !== autolivBinQty) {
      // STEP 4 MISMATCH: Bin quantities don't match
      openScanIssue({
        title: "Bin quantity mismatch (Step 4)",
        description:
          `Customer QR bin quantity "${customerBinQty}" does not match Autoliv QR bin quantity "${autolivBinQty}".\nInvoice blocked.\n\nAn exception alert has been sent to admin.`,
        severity: "error",
        context: [
          { label: "Invoice", value: invoiceId },
          { label: "Customer bin qty", value: customerBinQty },
          { label: "Autoliv bin qty", value: autolivBinQty },
        ],
      });

      // Block the invoice
      updateInvoiceAudit(invoiceId, {
        blocked: true,
        blockedAt: new Date()
      }, currentUser);

      addMismatchAlert({
        user: currentUser,
        customer: invoice.customer,
        invoiceId: invoiceId,
        step: 'doc-audit',
        validationStep: 'bin_quantity_mismatch',
        customerScan: {
          partCode: customerScan.partCode || 'N/A',
          quantity: customerBinQty,
          binNumber: customerScan.binNumber || 'N/A',
          rawValue: customerScan.rawValue || 'N/A'
        },
        autolivScan: {
          partCode: autolivScan.partCode || 'N/A',
          quantity: autolivBinQty,
          binNumber: autolivScan.binNumber || 'N/A',
          rawValue: autolivScan.rawValue || 'N/A'
        }
      });

      // Reset state
      setCustomerScan(null);
      setAutolivScan(null);
      setMatchedCustomerItem(null);
      setMatchedAutolivItem(null);
      return;
    }

    // STEP 4 SUCCESS: All validations passed!
    try {
      await auditApi.recordStageScan(invoiceId, {
        stage: 'inbd',
        customerBarcode: customerScan.rawValue,
        autolivBarcode: autolivScan.rawValue,
        scanContext: 'doc-audit'
      });
      await refreshData();
      await refreshInvoiceScans([invoiceId]);
    } catch (error: any) {
      console.error('INBD stage scan error:', error);
      const message = error?.message || 'Invoice may be blocked; check Exception Alerts.';
      const isDuplicate = /duplicate|already been scanned/i.test(message);
      if (isDuplicate) {
        openScanIssue({
          title: "Duplicate scan",
          description: message,
          severity: "warning",
        });
      } else {
        openScanIssue({
          title: "Failed to record INBD scan",
          description: message,
          severity: "error",
        });
      }
      await refreshData();
      setCustomerScan(null);
      setAutolivScan(null);
      setMatchedCustomerItem(null);
      setMatchedAutolivItem(null);
      return;
    }

    // Reset state for next scan
    setCustomerScan(null);
    setAutolivScan(null);
    setMatchedCustomerItem(null);
    setMatchedAutolivItem(null);
  };

  return (
    <div className="min-h-screen bg-background">
      <ScanIssueDialog
        open={scanIssueOpen}
        issue={scanIssue}
        onOpenChange={(open) => {
          setScanIssueOpen(open);
          if (!open) setScanIssue(null);
        }}
      />
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
                <h1 className="text-lg sm:text-2xl font-bold text-foreground">Dock Audit</h1>
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
        {invoices.length === 0 && selectedDeliveryDate && (
          <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-sm font-medium">
              ⚠️ No invoices found for the selected delivery date. Try a different date.
            </p>
          </div>
        )}
        
        {invoicesWithSchedule.length > 0 && (
          <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
              <p className="text-sm font-medium">
                📊 Invoice-Based Doc Audit with Multi-Invoice Support
              </p>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>• Select delivery date (from invoice date) to filter invoices</p>
              <p>• Delivery time + unloading loc are taken from invoice data (or can be entered manually if missing)</p>
              <p>• Select multiple invoices to audit them sequentially</p>
              <p>• Current user: <strong>{currentUser}</strong></p>
              {scheduleData?.uploadedAt && (
                <p>• Schedule uploaded: {scheduleData.uploadedAt.toLocaleString()}</p>
              )}
              {sharedInvoices.filter(inv => inv.dispatchedBy).length > 0 && (
                <p>• ✅ <strong>{sharedInvoices.filter(inv => inv.dispatchedBy).length}</strong> invoice(s) already dispatched</p>
              )}
            </div>
          </div>
        )}
        
        {/* Selection Fields: Delivery Date, Delivery Time, Unloading Loc */}
        {invoicesWithSchedule.length > 0 && (
          <Card className="mb-6 border-2 border-primary">
            <CardHeader>
              <CardTitle>Configure Dispatch Details</CardTitle>
              <CardDescription>Select delivery date (invoice date). Delivery time + unloading loc are from invoice data.</CardDescription>
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
                      setSelectedDeliveryTimes([]);
                      setSelectedUnloadingLocs([]);
                      setSelectedInvoices([]);
                      setManualDeliveryTime('');
                      setManualUnloadingLoc('');
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

                {/* Date Mismatch Warning Banner */}
                {selectedDeliveryDate && mismatchDiagnostics.hasMismatch && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-1">
                      ⚠️ Date Mismatch Detected
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Selected Invoice Date ({formatDateAsLocalString(selectedDeliveryDate)}) doesn't match any Schedule SUPPLY DATE. 
                      Schedule has {scheduleData?.items.length || 0} items, but none match this date. 
                      You'll need to enter Delivery Time and Unloading Loc manually.
                    </p>
                  </div>
                )}

                {/* Step 2: Delivery Time Selection */}
                {selectedDeliveryDate && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Step 2: Delivery Time(s) <span className="text-destructive">*</span>
                      </Label>
                      {availableDeliveryTimes.length > 1 && (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedDeliveryTimes([...availableDeliveryTimes]);
                              setSelectedUnloadingLocs([]);
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
                              setSelectedUnloadingLocs([]);
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
                      <div className="space-y-2 p-4 bg-muted/50 rounded-lg border-2 border-muted">
                        <p className="text-sm text-muted-foreground">
                          No delivery times found for this date. This usually means Invoice Date doesn't match Schedule SUPPLY DATE. Enter manually:
                        </p>
                        <Input
                          value={manualDeliveryTime}
                          onChange={(e) => {
                            setManualDeliveryTime(e.target.value);
                            setSelectedDeliveryTimes([]);
                            setSelectedUnloadingLocs([]);
                            setSelectedInvoices([]);
                          }}
                          placeholder="e.g., 10:30 AM"
                        />
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
                                setSelectedUnloadingLocs([]);
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
                    
                    {selectedDeliveryTimes.length === 0 && manualDeliveryTime.trim().length === 0 && availableDeliveryTimes.length > 0 && (
                      <p className="text-xs text-destructive">⚠️ Please select at least one delivery time</p>
                    )}
                  </div>
                )}

                {/* Step 3: Unloading Loc Selection */}
                {selectedDeliveryDate && (selectedDeliveryTimes.length > 0 || manualDeliveryTime.trim().length > 0 || availableDeliveryTimes.length === 0) && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Step 3: Unloading Loc <span className="text-destructive">*</span>
                      </Label>
                      {availableUnloadingLocs.length > 1 && (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedUnloadingLocs([...availableUnloadingLocs]);
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
                      <div className="space-y-2 p-4 bg-muted/50 rounded-lg border-2 border-muted">
                        <p className="text-sm text-muted-foreground">
                          No unloading locs found for this date. This usually means Invoice Date doesn't match Schedule SUPPLY DATE. Enter manually:
                        </p>
                        <Input
                          value={manualUnloadingLoc}
                          onChange={(e) => {
                            setManualUnloadingLoc(e.target.value);
                            setSelectedUnloadingLocs([]);
                            setSelectedInvoices([]);
                          }}
                          placeholder="Enter unloading loc"
                        />
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
                    
                    {selectedUnloadingLocs.length === 0 && manualUnloadingLoc.trim().length === 0 && availableUnloadingLocs.length > 0 && (
                      <p className="text-xs text-destructive">⚠️ Please select at least one unloading loc</p>
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
                  <Badge
                    variant={selectedDeliveryTimes.length > 0 || manualDeliveryTime.trim().length > 0 ? "default" : "outline"}
                  >
                    Delivery Time(s):{" "}
                    {selectedDeliveryTimes.length > 0
                      ? `${selectedDeliveryTimes.length} selected`
                      : manualDeliveryTime.trim().length > 0
                        ? manualDeliveryTime.trim()
                        : "Not selected"}
                  </Badge>
                  <Badge
                    variant={selectedUnloadingLocs.length > 0 || manualUnloadingLoc.trim().length > 0 ? "default" : "outline"}
                  >
                    Unloading Loc:{" "}
                    {selectedUnloadingLocs.length > 0
                      ? `${selectedUnloadingLocs.length} selected`
                      : manualUnloadingLoc.trim().length > 0
                        ? manualUnloadingLoc.trim()
                        : "Not selected"}
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
              {selectedDeliveryDate &&
                (selectedDeliveryTimes.length > 0 || manualDeliveryTime.trim().length > 0 || availableDeliveryTimes.length === 0) &&
                (selectedUnloadingLocs.length > 0 || manualUnloadingLoc.trim().length > 0 || availableUnloadingLocs.length === 0) && (
                <span className="block mt-1 text-success text-sm font-medium">
                  ✅ All filters applied - Invoice selection is now enabled
                </span>
              )}
              {(!selectedDeliveryDate ||
                (selectedDeliveryTimes.length === 0 && manualDeliveryTime.trim().length === 0 && availableDeliveryTimes.length > 0) ||
                (selectedUnloadingLocs.length === 0 && manualUnloadingLoc.trim().length === 0 && availableUnloadingLocs.length > 0)) && (
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
                  {!selectedDeliveryDate ||
                  (selectedDeliveryTimes.length === 0 && manualDeliveryTime.trim().length === 0 && availableDeliveryTimes.length > 0) ||
                  (selectedUnloadingLocs.length === 0 && manualUnloadingLoc.trim().length === 0 && availableUnloadingLocs.length > 0)
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
                    disabled={
                      !selectedDeliveryDate ||
                      (selectedDeliveryTimes.length === 0 && manualDeliveryTime.trim().length === 0 && availableDeliveryTimes.length > 0) ||
                      (selectedUnloadingLocs.length === 0 && manualUnloadingLoc.trim().length === 0 && availableUnloadingLocs.length > 0)
                    }
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
                    {(selectedDeliveryTimes.length > 0 || manualDeliveryTime.trim().length > 0) &&
                      ` | ⏰ ${selectedDeliveryTimes.length > 0 ? `${selectedDeliveryTimes.length} time(s)` : manualDeliveryTime.trim()}`}
                    {(selectedUnloadingLocs.length > 0 || manualUnloadingLoc.trim().length > 0) &&
                      ` | 📍 ${selectedUnloadingLocs.length > 0 ? `${selectedUnloadingLocs.length} unloading loc(s)` : manualUnloadingLoc.trim()}`}
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
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full h-12 justify-between text-base"
                        disabled={
                          !selectedDeliveryDate ||
                          (selectedDeliveryTimes.length === 0 && manualDeliveryTime.trim().length === 0 && availableDeliveryTimes.length > 0) ||
                          (selectedUnloadingLocs.length === 0 && manualUnloadingLoc.trim().length === 0 && availableUnloadingLocs.length > 0)
                        }
                      >
                        <span className="text-muted-foreground">
                          {selectedInvoices.length > 0 
                            ? `${selectedInvoices.length} invoice(s) selected - Click to add more`
                            : "Select invoices from dropdown..."}
                        </span>
                        <ChevronDown className="h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0" align="start" style={{ width: 'var(--radix-popover-trigger-width)' }}>
                      <div className="max-h-80 overflow-y-auto">
                        <div className="p-2 border-b bg-muted/50 sticky top-0 z-10">
                          <p className="text-xs font-semibold text-muted-foreground">
                            Click invoices to add/remove • {invoices.length} available
                          </p>
                        </div>
                        <div className="p-2 space-y-1">
                          {invoices.map(invoice => {
                            const invoiceInShared = sharedInvoices.find(inv => inv.id === invoice.id);
                            const isBlocked = invoiceInShared?.blocked ?? invoice.blocked ?? false;
                            const isSelected = selectedInvoices.includes(invoice.id);
                            const isAudited = invoiceInShared?.auditComplete ?? invoice.auditComplete;
                            const scannedCount = invoiceInShared?.scannedBins ?? invoice.scannedBins;
                            
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
                              <button
                                key={invoice.id}
                                onClick={() => {
                                  if (isBlocked) {
                                    toast.error("Invoice is blocked and cannot be selected");
                                    return;
                                  }
                                  
                                  if (isSelected) {
                                    setSelectedInvoices(prev => prev.filter(id => id !== invoice.id));
                                    toast.info(`Invoice ${invoice.id} removed from selection`);
                                  } else {
                                    setSelectedInvoices(prev => [...prev, invoice.id]);
                                    toast.success(`Invoice ${invoice.id} added to selection`);
                                  }
                                }}
                                disabled={isBlocked}
                                className={`w-full text-left p-3 rounded-md transition-colors ${
                                  isSelected 
                                    ? 'bg-success/10 border-2 border-success hover:bg-success/20' 
                                    : 'hover:bg-muted border-2 border-transparent'
                                } ${isBlocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      {isSelected && <CheckCircle2 className="h-4 w-4 text-success" />}
                                      <p className="font-semibold text-sm">
                                        {invoice.id} - {invoice.customer}
                                      </p>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      Progress: {scannedCount}/{totalCustItems} items
                                    </p>
                                  </div>
                                  <div className="flex flex-col gap-1 items-end">
                                    {isAudited && <Badge variant="secondary" className="text-xs">✓ Audited</Badge>}
                                    {isBlocked && <Badge variant="destructive" className="text-xs">⛔</Badge>}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* TERTIARY METHOD: Selected Invoices List (Read-Only Display with Remove Option) */}
                {selectedInvoices.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Selected Invoices ({selectedInvoices.length}):</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedInvoices([])}
                        className="h-7 text-xs"
                      >
                        Clear All
                      </Button>
                    </div>
                    <div className="space-y-2">
                    {selectedInvoices.map(invoiceId => {
                      const invoice = invoices.find(inv => inv.id === invoiceId);
                      const invoiceInShared = sharedInvoices.find(inv => inv.id === invoiceId);
                      
                      // If invoice not found in current filter, still show it but mark it
                      const scannedCount = invoiceInShared?.scannedBins ?? invoice?.scannedBins ?? 0;
                      const isAudited = invoiceInShared?.auditComplete ?? invoice?.auditComplete ?? false;
                      const isBlocked = invoiceInShared?.blocked ?? invoice?.blocked ?? false;
                      
                      const invoiceItems = invoiceInShared?.items || invoice?.items || [];
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
                          key={invoiceId} 
                          className="p-3 border-2 border-success bg-success/5 rounded-lg transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            <Checkbox
                              id={`invoice-${invoiceId}`}
                              checked={true}
                              onCheckedChange={() => {
                                setSelectedInvoices(prev => prev.filter(id => id !== invoiceId));
                                toast.info(`Invoice ${invoiceId} removed from selection`);
                              }}
                              className="mt-1"
                            />
                            <label
                              htmlFor={`invoice-${invoiceId}`}
                              className="flex-1 cursor-pointer"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <p className="font-semibold text-sm">
                                    {invoiceId} - {invoice?.customer || invoiceInShared?.customer || 'Unknown'}
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Customer Code: {invoice?.billTo || invoiceInShared?.billTo || 'N/A'} | Progress: {scannedCount}/{totalCustItems} Customer Items
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
                )}
                
                {selectedInvoices.length === 0 && (
                  <div className="p-6 bg-muted/50 border-2 border-dashed border-muted-foreground/20 rounded-lg text-center">
                    <ScanBarcode className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
                    <p className="text-sm font-medium text-muted-foreground mb-1">
                      No invoices selected yet
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Use the QR scanner above or dropdown to add invoices
                    </p>
                  </div>
                )}
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
                  const invoiceState = sharedInvoices.find(inv => inv.id === invoice.id) || invoice;
                  const scannedCount = invoiceState.scannedBins || 0;
                  const totalCount = (invoiceState.expectedBins && invoiceState.expectedBins > 0)
                    ? invoiceState.expectedBins
                    : uniqueItems.length;
                  const isComplete = !!invoiceState.auditComplete || (totalCount > 0 && scannedCount >= totalCount);
                  
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
                                <th className="text-left p-2 font-semibold">Quantity</th>
                                <th className="text-left p-2 font-semibold">Customer Bin</th>
                                <th className="text-left p-2 font-semibold">Cust Scanned Qty</th>
                                <th className="text-left p-2 font-semibold">INBD Bin</th>
                                <th className="text-left p-2 font-semibold">INBD Scanned Qty</th>
                                <th className="text-left p-2 font-semibold">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {uniqueItems.map((item, index) => {
                                const invoiceItem: any = invoice.items?.find((invItem: UploadedRow) => 
                                  (invItem.customerItem || invItem.part) === item.customerItem &&
                                  invItem.part === item.itemNumber
                                );

                                const totalQty = Number(item.quantity || 0);
                                const custBins = Number(invoiceItem?.cust_scanned_bins_count || 0);
                                const custQty = Number(invoiceItem?.cust_scanned_quantity || 0);
                                const inbdBins = Number(invoiceItem?.inbd_scanned_bins_count || 0);
                                const inbdQty = Number(invoiceItem?.inbd_scanned_quantity || 0);
                                const isLineComplete = totalQty > 0 && custQty === totalQty && inbdQty === totalQty;
                                const isLineInProgress = !isLineComplete && (custQty > 0 || inbdQty > 0);
                                
                                return (
                                  <tr
                                    key={index}
                                    className={`border-t ${
                                      isLineComplete
                                        ? 'bg-green-100 dark:bg-green-950/40'
                                        : isLineInProgress
                                          ? 'bg-yellow-100 dark:bg-yellow-950/40'
                                          : ''
                                    }`}
                                  >
                                    <td className="p-2 font-medium">{item.customerItem}</td>
                                    <td className="p-2">{item.itemNumber}</td>
                                    <td className="p-2 text-muted-foreground">{item.partDescription || 'N/A'}</td>
                                    <td className="p-2 font-semibold">{item.quantity || 0}</td>
                                    <td className="p-2 font-semibold">{custBins}</td>
                                    <td className="p-2 font-semibold">
                                      <span className={custQty > 0 ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}>
                                        {custQty} / {item.quantity || 0}
                                      </span>
                                    </td>
                                    <td className="p-2 font-semibold">{inbdBins}</td>
                                    <td className="p-2 font-semibold">
                                      <span className={inbdQty > 0 ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}>
                                        {inbdQty} / {item.quantity || 0}
                                      </span>
                                    </td>
                                    <td className="p-2">
                                      {isLineComplete ? (
                                        <Badge variant="default" className="text-xs">✓ Complete</Badge>
                                      ) : (custQty > 0 || inbdQty > 0) ? (
                                        <Badge variant="secondary" className="text-xs">In Progress</Badge>
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
            {hasBlockedSelectedInvoice && (
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
            
            <Card className={`mb-6 ${hasBlockedSelectedInvoice ? "opacity-60" : ""}`}>
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <ScanBarcode className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Barcode Scanning & Validation</CardTitle>
                    <CardDescription>
                      {hasBlockedSelectedInvoice
                        ? "Admin approval needed - Scanning disabled" 
                        : "Scan customer and Autoliv labels - system will auto-detect which invoice the item belongs to"}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {scanOrderAlert && !hasBlockedSelectedInvoice && (
                    <div className="p-3 border-2 border-yellow-500/40 bg-yellow-50/60 dark:bg-yellow-950/20 rounded-lg text-sm">
                      <p className="font-semibold text-yellow-800 dark:text-yellow-200">Scan order required</p>
                      <p className="text-xs text-yellow-800/90 dark:text-yellow-200/90 mt-1">
                        {scanOrderAlert}
                      </p>
                    </div>
                  )}

                  {/* Resume hint: if backend has pending customer-stage scans, user should continue with Autoliv */}
                  {!hasBlockedSelectedInvoice &&
                    hasPendingCustomerStage &&
                    !customerScan &&
                    scanPhase === 'autoliv' &&
                    !showInvoiceQRScanner && (
                      <div className="p-3 border-2 border-green-500/30 bg-green-50/60 dark:bg-green-950/20 rounded-lg text-sm">
                        <p className="font-semibold text-green-800 dark:text-green-200">Resume available</p>
                        <p className="text-xs text-green-800/90 dark:text-green-200/90 mt-1">
                          Resume: scan Autoliv label now (customer label was already scanned earlier).
                        </p>
                      </div>
                    )}
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
                      <div
                        className={`w-full h-14 rounded-md border-2 flex items-center justify-center text-sm font-medium ${
                          hasBlockedSelectedInvoice
                            ? "border-red-300 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-200"
                            : "border-primary/30 bg-primary/5 text-primary"
                        }`}
                      >
                        {hasBlockedSelectedInvoice
                          ? "Scanning disabled (blocked invoice)"
                          : showInvoiceQRScanner
                            ? "Finish invoice selection to start scanning"
                            : customerScan && autolivScan
                              ? "Validating… please wait"
                              : scanPhase === 'customer'
                                ? "Scanner active — scan Customer label now"
                                : "Customer scanned — now scan Autoliv label"}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        No button needed — just scan using the hardware scanner.
                      </p>
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
                      <div
                        className={`w-full h-14 rounded-md border-2 flex items-center justify-center text-sm font-medium ${
                          hasBlockedSelectedInvoice
                            ? "border-red-300 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-200"
                            : "border-accent/30 bg-accent/5 text-accent"
                        }`}
                      >
                        {hasBlockedSelectedInvoice
                          ? "Scanning disabled (blocked invoice)"
                          : showInvoiceQRScanner
                            ? "Finish invoice selection to start scanning"
                            : customerScan && autolivScan
                              ? "Validating… please wait"
                              : scanPhase === 'autoliv'
                                ? "Scanner active — scan Autoliv label now"
                                : "Waiting for Customer label"}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Scan Autoliv only after scanning the Customer label.
                      </p>
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

            {/* Test Scan Button - Temporary for Testing */}
            <Card className="mb-6 border-dashed border-2 border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-yellow-700 dark:text-yellow-400">🧪 Test Scanning (Temporary)</CardTitle>
                <CardDescription className="text-xs">
                  Scan real QR codes with hardware scanner - data will be logged to backend console only
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    {/* Test Customer Label Scan */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2 text-xs">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 text-xs font-bold">1</span>
                        Test Customer Label
                      </Label>
                      {testCustomerScan && (
                        <div className="p-2 bg-muted rounded-lg text-xs space-y-1">
                          <p className="text-[10px] text-muted-foreground mb-1 font-semibold">Scanned Data:</p>
                          <div className="space-y-0.5">
                            <p className="font-mono text-[10px] break-all text-muted-foreground">{testCustomerScan.rawValue}</p>
                            {(testCustomerScan.binNumber || testCustomerScan.partCode || testCustomerScan.binQuantity || testCustomerScan.invoiceNumber || testCustomerScan.totalQty || testCustomerScan.totalBinNo) && (
                              <div className="mt-2 pt-2 border-t border-border/50">
                                <p className="text-[10px] text-muted-foreground mb-1 font-semibold">Extracted Fields:</p>
                                {testCustomerScan.binNumber && <p className="text-[10px]"><span className="font-semibold">Bin Number:</span> {testCustomerScan.binNumber}</p>}
                                {testCustomerScan.partCode && <p className="text-[10px]"><span className="font-semibold">Part Code:</span> {testCustomerScan.partCode}</p>}
                                {testCustomerScan.binQuantity && <p className="text-[10px]"><span className="font-semibold">Bin Qty:</span> {testCustomerScan.binQuantity}</p>}
                                {testCustomerScan.invoiceNumber && <p className="text-[10px]"><span className="font-semibold">Invoice:</span> {testCustomerScan.invoiceNumber}</p>}
                                {testCustomerScan.totalQty && <p className="text-[10px]"><span className="font-semibold">Total Qty:</span> {testCustomerScan.totalQty}</p>}
                                {testCustomerScan.totalBinNo && <p className="text-[10px]"><span className="font-semibold">Total Bins:</span> {testCustomerScan.totalBinNo}</p>}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      <BarcodeScanButton
                        onScan={(data) => {
                          setTestCustomerScan(data);
                          toast.success("Test customer barcode scanned!");
                        }}
                        label={testCustomerScan ? "Scan Again" : "Scan Customer QR"}
                        variant="outline"
                        className="border-yellow-500"
                      />
                    </div>

                    {/* Test Autoliv Label Scan */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2 text-xs">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 text-xs font-bold">2</span>
                        Test Autoliv Label
                      </Label>
                      {testAutolivScan && (
                        <div className="p-2 bg-muted rounded-lg text-xs">
                          <p className="text-[10px] text-muted-foreground mb-1">Scanned:</p>
                          <p className="font-mono text-[10px] break-all">{testAutolivScan.rawValue}</p>
                        </div>
                      )}
                      <BarcodeScanButton
                        onScan={(data) => {
                          setTestAutolivScan(data);
                          toast.success("Test Autoliv barcode scanned!");
                        }}
                        label={testAutolivScan ? "Scan Again" : "Scan Autoliv QR"}
                        variant="outline"
                        className="border-yellow-500"
                      />
                    </div>
                  </div>

                  {/* Send to Backend Button */}
                  <Button
                    variant="outline"
                    className="w-full border-yellow-500 text-yellow-700 hover:bg-yellow-100 dark:text-yellow-400 dark:hover:bg-yellow-900/30"
                    disabled={!testCustomerScan || !testAutolivScan}
                    onClick={async () => {
                      if (!testCustomerScan || !testAutolivScan) {
                        toast.error("Please scan both customer and Autoliv QR codes first");
                        return;
                      }

                      if (selectedInvoices.length === 0) {
                        toast.error("Please select at least one invoice first");
                        return;
                      }

                      const testInvoiceId = selectedInvoices[0];
                      
                      // Prepare test scan data with real scanned values
                      // Extract data similar to how the real validation does it
                      const testScanData = {
                        invoiceId: testInvoiceId,
                        customerBarcode: testCustomerScan.rawValue,
                        autolivBarcode: testAutolivScan.rawValue,
                        customerItem: testCustomerScan.partCode || null,
                        itemNumber: testAutolivScan.partCode || null,
                        partDescription: null,
                        quantity: parseInt(testCustomerScan.quantity) || parseInt(testAutolivScan.quantity) || 0,
                        binQuantity: parseInt(testCustomerScan.binQuantity || testCustomerScan.quantity) || parseInt(testAutolivScan.binQuantity || testAutolivScan.quantity) || null,
                        binNumber: testCustomerScan.binNumber || testAutolivScan.binNumber || null,
                        status: "matched",
                        scanContext: "doc-audit" as const,
                        // Include new fields from customer QR parsing
                        invoiceNumber: testCustomerScan.invoiceNumber || null,
                        totalQty: testCustomerScan.totalQty ? parseInt(testCustomerScan.totalQty) : null,
                        totalBinNo: testCustomerScan.totalBinNo ? parseInt(testCustomerScan.totalBinNo) : null
                      };

                      try {
                        toast.info("Sending scanned data to backend console...");
                        const result = await auditApi.testScan(testScanData);
                        toast.success("✅ Scanned data logged to backend console!", {
                          description: "Check your backend console for the logged data",
                          duration: 5000
                        });
                      } catch (error: any) {
                        console.error("Test scan error:", error);
                        toast.error("Failed to send test scan", {
                          description: error.message || "Please check console for details"
                        });
                      }
                    }}
                  >
                    🧪 Log Scanned Data to Backend Console
                  </Button>

                  {/* Clear Button */}
                  {(testCustomerScan || testAutolivScan) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs"
                      onClick={() => {
                        setTestCustomerScan(null);
                        setTestAutolivScan(null);
                      }}
                    >
                      Clear Test Scans
                    </Button>
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
                  <Accordion type="multiple" className="w-full">
                    {selectedInvoices.map((invoiceId) => {
                      const bins = validatedBins[invoiceId] || [];
                      if (bins.length === 0) return null;

                      const invoice = selectedInvoiceObjects.find((inv) => inv.id === invoiceId);
                      const invoiceInShared = sharedInvoices.find((inv) => inv.id === invoiceId);
                      const invoiceData = invoiceInShared || invoice;

                      const itemGroups = groupScansByItem(bins);
                      const invoiceQtyByItemKey = new Map<string, number>();
                      (invoiceData?.items ?? []).forEach((it: UploadedRow) => {
                        const customerItem = String(it.customerItem || it.part || "").trim();
                        if (!customerItem) return;
                        const itemNumber = String(it.part || "N/A").trim() || "N/A";
                        const key = `${customerItem}||${itemNumber}`;
                        const qty = Number((it as any).qty ?? 0) || 0;
                        invoiceQtyByItemKey.set(key, (invoiceQtyByItemKey.get(key) ?? 0) + qty);
                      });
                      const invoiceTotalQty =
                        Number((invoiceData as any)?.totalQty ?? 0) ||
                        (invoiceData?.items ?? []).reduce((sum: number, it: UploadedRow) => sum + (Number((it as any).qty ?? 0) || 0), 0);
                      const scannedTotalQty = bins.reduce((sum, r) => sum + (Number(r.quantity ?? 0) || 0), 0);

                      return (
                        <AccordionItem
                          key={invoiceId}
                          value={`invoice-${invoiceId}`}
                          className="border border-b-0 rounded-lg mb-3 overflow-hidden"
                        >
                          <AccordionTrigger className="px-3 py-3 hover:no-underline bg-muted/40">
                            <div className="flex flex-1 items-center justify-between gap-3 min-w-0">
                              <div className="min-w-0">
                                <p className="font-semibold text-sm truncate">{invoiceId}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {invoiceData?.customer || "Unknown"}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <Badge variant="secondary" className="text-xs">
                                  {bins.length} scans
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  {itemGroups.length} items
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  Scanned Qty {scannedTotalQty}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  Invoice Qty {invoiceTotalQty}
                                </Badge>
                              </div>
                            </div>
                          </AccordionTrigger>

                          <AccordionContent className="px-3 pt-3 pb-3">
                            <Accordion type="multiple" className="w-full">
                              {itemGroups.map((group) => (
                                <AccordionItem
                                  key={group.key}
                                  value={`item-${invoiceId}-${group.key}`}
                                  className="border border-b-0 rounded-md mb-2 overflow-hidden"
                                >
                                  <AccordionTrigger className="px-3 py-2 hover:no-underline bg-background">
                                    <div className="flex flex-1 items-start justify-between gap-3 min-w-0">
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="text-sm font-semibold truncate">
                                            {group.customerItem}
                                          </span>
                                          <span className="text-xs text-muted-foreground">•</span>
                                          <span className="text-xs font-mono text-muted-foreground truncate">
                                            {group.itemNumber}
                                          </span>
                                        </div>
                                        {group.partDescription && group.partDescription !== "N/A" && (
                                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                                            {group.partDescription}
                                          </p>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <Badge variant="secondary" className="text-xs">
                                          {group.scans.length} bins
                                        </Badge>
                                        <Badge variant="outline" className="text-xs">
                                          Scanned Qty {group.totalQty}
                                        </Badge>
                                        <Badge variant="outline" className="text-xs">
                                          Invoice Qty {invoiceQtyByItemKey.get(group.key) ?? "—"}
                                        </Badge>
                                      </div>
                                    </div>
                                  </AccordionTrigger>

                                  <AccordionContent className="px-3 pt-0 pb-3">
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-xs min-w-[680px]">
                                        <thead className="bg-muted/40">
                                          <tr>
                                            <th className="text-left p-2 font-semibold">Customer Bin</th>
                                            <th className="text-left p-2 font-semibold">INBD Bin</th>
                                            <th className="text-left p-2 font-semibold">Bin Qty</th>
                                            <th className="text-left p-2 font-semibold">Scanned By</th>
                                            <th className="text-left p-2 font-semibold">Time</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {group.scans.map((scan, idx) => (
                                            <tr
                                              key={scan.scanId || `${group.key}-${idx}`}
                                              className="border-t hover:bg-muted/30"
                                            >
                                              <td className="p-2 font-mono">
                                                {scan.customerBinNumber ?? scan.binNumber ?? "—"}
                                              </td>
                                              <td className="p-2 font-mono">
                                                {scan.autolivBinNumber ?? "—"}
                                              </td>
                                              <td className="p-2 font-semibold">
                                                {Number(scan.quantity ?? 0) || 0}
                                              </td>
                                              <td className="p-2">{scan.scannedBy || "—"}</td>
                                              <td className="p-2 text-muted-foreground">{scan.time || "—"}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </AccordionContent>
                                </AccordionItem>
                              ))}
                            </Accordion>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
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
                      const expected = (invoiceData.expectedBins && invoiceData.expectedBins > 0)
                        ? invoiceData.expectedBins
                        : uniqueItems.length;
                      const scanned = invoiceData.scannedBins || 0;
                      const isComplete = !!invoiceData.auditComplete || (expected > 0 && scanned >= expected);
                      // Robust: invoices can become auditComplete via backend recompute during scanning,
                      // but dock info (delivery time + unloading loc) is only known after user selection.
                      // Treat an invoice as "finalized" only when dock info is present.
                      const hasDockInfo =
                        !!(invoiceData as any)?.deliveryTime &&
                        !!(invoiceData as any)?.unloadingLoc;
                      
                      if (!isComplete || hasDockInfo) return null;
                      
                      return (
                        <div key={invoiceId} className="p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-green-700 dark:text-green-300 mb-1">
                                ✅ All items scanned for {invoiceId}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {scanned}/{expected} customer items complete. Select delivery time & unloading loc, then click to finalize audit.
                              </p>
                            </div>
                            <Button
                              onClick={() => {
                                const deliveryTimeValue =
                                  selectedDeliveryTimes.length > 0
                                    ? selectedDeliveryTimes.join(', ')
                                    : manualDeliveryTime.trim().length > 0
                                      ? manualDeliveryTime.trim()
                                      : undefined;

                                const unloadingLocValue =
                                  selectedUnloadingLocs.length > 0
                                    ? selectedUnloadingLocs[0]
                                    : manualUnloadingLoc.trim().length > 0
                                      ? manualUnloadingLoc.trim()
                                      : undefined;

                                if (!deliveryTimeValue) {
                                  toast.error("Please select or enter delivery time");
                                  return;
                                }
                                if (!unloadingLocValue) {
                                  toast.error("Please select or enter unloading loc");
                                  return;
                                }

                                updateInvoiceAudit(invoiceId, {
                                  auditComplete: true,
                                  auditDate: new Date(),
                                  deliveryDate: selectedDeliveryDate,
                                  deliveryTime: deliveryTimeValue,
                                  unloadingLoc: unloadingLocValue,
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
        isOpen={showAuditLogs}
        onClose={() => setShowAuditLogs(false)}
        title="Doc Audit Logs"
        logs={getAuditLogs()}
        type="audit"
      />
    </div>
  );
};

export default DocAudit;
