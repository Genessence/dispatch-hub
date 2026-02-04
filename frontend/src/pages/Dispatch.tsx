import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import jsPDF from "jspdf";
import {
  Truck,
  ScanBarcode,
  CheckCircle2,
  ArrowLeft,
  X,
  QrCode,
  Printer,
  Download
} from "lucide-react";
import { BarcodeScanButton, type BarcodeData } from "@/components/BarcodeScanner";
import { useKeyboardBarcodeScanner } from "@/hooks/useKeyboardBarcodeScanner";
import { useSession } from "@/contexts/SessionContext";
import { LogsDialog } from "@/components/LogsDialog";
import type { InvoiceData } from "@/contexts/SessionContext";
import { ScanIssueDialog, type ScanIssue } from "@/components/ScanIssueDialog";
import { QRCodeSVG } from "qrcode.react";
import { auditApi, dispatchApi } from "@/lib/api";
import { buildGatepassSummary } from "@/lib/gatepassSummary";
import { encodeGatepassQrPayload } from "@/lib/qrPayload";
import { PageShell } from "@/components/layout/PageShell";
import { StatusBanner } from "@/components/layout/StatusBanner";

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

interface ValidatedBarcodePair {
  id?: string; // Scan ID from database (for deletion)
  invoiceId: string; // Source invoice for this bin scan (required for correct grouping/deletion)
  customerBarcode: string;
  autolivBarcode: string;
  customerBinNumber?: string;
  autolivBinNumber?: string;
  binNumber?: string;
  quantity?: string;
  partCode?: string;
  customerItem?: string;
  itemNumber?: string;
  actualQuantity?: number;
  scannedAt?: string;
}

type GatepassLoadedScanDetail = {
  id: string;
  invoiceId: string;
  customerBarcode: string | null;
  autolivBarcode: string | null;
  customerItem: string | null;
  itemNumber: string | null;
  partDescription: string | null;
  quantity: number;
  binQuantity: number | null;
  customerBinNumber: string | null;
  autolivBinNumber: string | null;
  status: string | null;
  scannedBy: string | null;
  scannedAt: string | null;
  customerName: string | null;
  customerCode: string | null;
};

const Dispatch = () => {
  const navigate = useNavigate();
  const {
    currentUser,
    sharedInvoices,
    scheduleData,
    getScheduledDispatchableInvoices,
    updateInvoiceDispatch,
    getDispatchLogs,
    refreshData,
    selectedCustomer,
    selectedSite
  } = useSession();

  // Route guard
  useEffect(() => {
    if (!selectedCustomer || !selectedSite) {
      toast.error("Please select a customer and site before accessing dispatch");
      navigate("/select-customer-site");
    }
  }, [selectedCustomer, selectedSite, navigate]);

  // State management
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [activeInvoiceId, setActiveInvoiceId] = useState<string | null>(null);
  const [selectedInvoicesExpandedId, setSelectedInvoicesExpandedId] = useState<string | null>(null);
  const [gatepassGenerated, setGatepassGenerated] = useState(false);
  const [dispatchCustomerScan, setDispatchCustomerScan] = useState<BarcodeData | null>(null);
  const [dispatchScanAlert, setDispatchScanAlert] = useState<string | null>(null);
  // Scan issue popup (shown ONLY when there's an issue)
  const [scanIssue, setScanIssue] = useState<ScanIssue | null>(null);
  const [scanIssueOpen, setScanIssueOpen] = useState(false);

  const openScanIssue = (issue: ScanIssue) => {
    // De-dupe guard: don't re-open while already visible.
    if (scanIssueOpen) return;
    setScanIssue(issue);
    setScanIssueOpen(true);
  };
  const [loadedBarcodes, setLoadedBarcodes] = useState<ValidatedBarcodePair[]>([]);
  const [selectInvoiceValue, setSelectInvoiceValue] = useState<string>("");
  const [gatepassNumber, setGatepassNumber] = useState<string>("");
  const [gatepassDetails, setGatepassDetails] = useState<{
    customerCode?: string | null;
    dispatchDate?: string;
    totalNumberOfBins?: number;
    supplyDates?: string[];
    /** Snapshot of invoice ids used for this gatepass (prevents post-dispatch auto-clears from affecting preview/qr/print/pdf). */
    invoiceIds?: string[];
    invoices?: Array<{
      id: string;
      deliveryDate?: string | null;
      deliveryTime?: string | null;
      unloadingLoc?: string | null;
      status: string;
    }>;
    /** Server-truth loading-dispatch scans (enriched with doc-audit autoliv fields where possible). */
    loadedScansDetailed?: GatepassLoadedScanDetail[];
  } | null>(null);
  const [customerCodeError, setCustomerCodeError] = useState<string | null>(null);
  const [showDispatchLogs, setShowDispatchLogs] = useState(false);
  const [showInvoiceQRScanner, setShowInvoiceQRScanner] = useState(false);
  const [isRestoringFromGatepass, setIsRestoringFromGatepass] = useState(false);

  // Keep active invoice in sync with selected invoices.
  useEffect(() => {
    if (selectedInvoices.length === 0) {
      setActiveInvoiceId(null);
      setSelectedInvoicesExpandedId(null);
      return;
    }
    if (!activeInvoiceId || !selectedInvoices.includes(activeInvoiceId)) {
      setActiveInvoiceId(selectedInvoices[0]);
    }
    if (selectedInvoicesExpandedId && !selectedInvoices.includes(selectedInvoicesExpandedId)) {
      setSelectedInvoicesExpandedId(null);
    }
  }, [selectedInvoices, activeInvoiceId, selectedInvoicesExpandedId]);

  // Clear selected invoices if they've been dispatched
  useEffect(() => {
    // After gatepass generation we intentionally keep the snapshot visible (preview/print/pdf/qr).
    // User explicitly resets via "New Dispatch".
    if (gatepassGenerated) return;
    
    // Skip clearing if we're restoring invoices from a gatepass (to allow regeneration)
    if (isRestoringFromGatepass) return;

    if (selectedInvoices.length > 0) {
      const stillAvailable = selectedInvoices.filter(id => {
        const invoice = sharedInvoices.find(inv => inv.id === id);
        return invoice && !invoice.dispatchedBy;
      });
      
      if (stillAvailable.length !== selectedInvoices.length) {
        setSelectedInvoices(stillAvailable);
        if (stillAvailable.length === 0) {
          setLoadedBarcodes([]);
          setSelectInvoiceValue("");
        }
      }
    }
  }, [sharedInvoices, selectedInvoices, gatepassGenerated, isRestoringFromGatepass]);
  
  // Clear the restoring flag after invoices are restored
  useEffect(() => {
    if (isRestoringFromGatepass && selectedInvoices.length > 0) {
      // Clear the flag after a short delay to allow the restoration to complete
      const timer = setTimeout(() => {
        setIsRestoringFromGatepass(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isRestoringFromGatepass, selectedInvoices]);

  // Reset select value when switching to dispatch
  useEffect(() => {
    setSelectInvoiceValue("");
  }, []);

  // Hydrate loadedBarcodes with existing loading-dispatch scans when invoices are selected
  // This ensures cross-device consistency and allows resuming a dispatch session
  useEffect(() => {
    const loadExistingScans = async () => {
      if (selectedInvoices.length === 0) {
        setLoadedBarcodes([]);
        return;
      }

      try {
        const allScans: ValidatedBarcodePair[] = [];
        
        // Fetch loading-dispatch scans for each selected invoice
        for (const invoiceId of selectedInvoices) {
          try {
            const scansResponse = await auditApi.getScans(invoiceId, 'loading-dispatch');
            if (scansResponse.success && scansResponse.scans) {
              const invoice = sharedInvoices.find(inv => inv.id === invoiceId);
              
              scansResponse.scans.forEach((scan) => {
                const scanRec = (scan && typeof scan === "object") ? (scan as Record<string, unknown>) : {};
                const scanCustomerItem = typeof scanRec.customerItem === "string" ? scanRec.customerItem : undefined;

                // Find matching invoice item for this scan
                const matchedItem = invoice?.items?.find((item: UploadedRow) =>
                  scanCustomerItem ? item.customerItem === scanCustomerItem : false
                );

                const customerBarcode = typeof scanRec.customerBarcode === "string" ? scanRec.customerBarcode : "";
                const autolivBarcode = typeof scanRec.autolivBarcode === "string" ? scanRec.autolivBarcode : "";
                const customerBinNumber =
                  (typeof scanRec.customerBinNumber === "string" ? scanRec.customerBinNumber : undefined) ??
                  (typeof scanRec.binNumber === "string" ? scanRec.binNumber : undefined);
                const autolivBinNumber = typeof scanRec.autolivBinNumber === "string" ? scanRec.autolivBinNumber : undefined;
                const binNumber =
                  (typeof scanRec.customerBinNumber === "string" ? scanRec.customerBinNumber : undefined) ??
                  (typeof scanRec.binNumber === "string" ? scanRec.binNumber : undefined);
                const binQuantity =
                  (typeof scanRec.binQuantity === "number" ? scanRec.binQuantity : undefined) ??
                  (typeof scanRec.quantity === "number" ? scanRec.quantity : undefined);
                const quantity = binQuantity !== undefined ? String(binQuantity) : undefined;

                allScans.push({
                  id: typeof scanRec.id === "string" ? scanRec.id : undefined, // Include scan ID for deletion
                  invoiceId,
                  customerBarcode,
                  autolivBarcode,
                  customerBinNumber,
                  autolivBinNumber,
                  // Back-compat alias (existing UI + de-dupe/delete logic relies on binNumber)
                  binNumber,
                  quantity, // Bin quantity from QR scan
                  partCode: scanCustomerItem,
                  customerItem: scanCustomerItem,
                  itemNumber: typeof scanRec.itemNumber === "string" ? scanRec.itemNumber : matchedItem?.part,
                  actualQuantity: matchedItem?.qty, // Total quantity from invoice item (for reference only)
                  scannedAt: typeof scanRec.scannedAt === "string" ? scanRec.scannedAt : undefined,
                });
              });
            }
          } catch (error) {
            console.error(`Error loading scans for invoice ${invoiceId}:`, error);
            // Continue with other invoices even if one fails
          }
        }
        
        // Update loadedBarcodes state with fetched scans
        setLoadedBarcodes(allScans);
        
        if (allScans.length > 0) {
          toast.info(`Loaded ${allScans.length} existing bin scan(s)`, {
            duration: 3000
          });
        }
      } catch (error) {
        console.error('Error loading existing scans:', error);
        // Don't show error toast - this is a background sync operation
      }
    };

    loadExistingScans();
  }, [selectedInvoices]); // Re-run when selected invoices change

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
      // Customer label partCode corresponds to customerItem, but fall back to part for robustness.
      const customerItem = (item.customerItem || item.part || '').trim();
      const itemNumber = (item.part || '').trim();
      const key = `${customerItem}||${itemNumber}`;

      if (customerItem) {
        if (customerItemMap.has(key)) {
          const existing = customerItemMap.get(key)!;
          existing.quantity += item.qty;
          // Prefer a non-empty description if we didn't already have one.
          if (!existing.partDescription && item.partDescription) {
            existing.partDescription = item.partDescription;
          }
        } else {
          customerItemMap.set(key, {
            customerItem,
            itemNumber,
            partDescription: item.partDescription || '',
            quantity: item.qty
          });
        }
      }
    });
    
    return Array.from(customerItemMap.values());
  };

  const makeItemKey = (invoiceId: string, customerItem: string, itemNumber: string) =>
    `${invoiceId}||${(customerItem || 'N/A').trim()}||${(itemNumber || 'N/A').trim()}`;

  // Global "active" customer item for UI focus: the most recently scanned item across ALL selected invoices.
  // This ensures only one row shows yellow (and avoids multiple "in progress" highlights).
  const activeFocusItemKey = useMemo(() => {
    let bestKey: string | null = null;
    let bestMs = 0;

    for (const scan of loadedBarcodes) {
      if (!scan?.invoiceId) continue;
      const customerItem = (scan.customerItem || scan.partCode || 'N/A').trim();
      const itemNumber = (scan.itemNumber || 'N/A').trim();
      const k = makeItemKey(scan.invoiceId, customerItem, itemNumber);

      const ms = scan.scannedAt ? new Date(scan.scannedAt).getTime() : 0;
      const scannedAtMs = Number.isFinite(ms) ? ms : 0;

      if (
        scannedAtMs > bestMs ||
        (scannedAtMs === bestMs && scannedAtMs > 0 && bestKey !== null && k > bestKey)
      ) {
        bestMs = scannedAtMs;
        bestKey = k;
      } else if (bestKey === null && scannedAtMs > 0) {
        // First valid timestamp wins when no key exists yet.
        bestMs = scannedAtMs;
        bestKey = k;
      }
    }

    return bestKey;
  }, [loadedBarcodes]);

  const scannedByItemKey = useMemo(() => {
    const m = new Map<string, { scannedBins: number; scannedQty: number }>();
    for (const scan of loadedBarcodes) {
      if (!scan?.invoiceId) continue;
      const customerItem = (scan.customerItem || scan.partCode || 'N/A').trim();
      const itemNumber = (scan.itemNumber || 'N/A').trim();
      const k = makeItemKey(scan.invoiceId, customerItem, itemNumber);
      const existing = m.get(k) || { scannedBins: 0, scannedQty: 0 };
      existing.scannedBins += 1;
      existing.scannedQty += Number(scan.quantity ?? 0) || 0;
      m.set(k, existing);
    }
    return m;
  }, [loadedBarcodes]);

  const expectedByItemKey = useMemo(() => {
    const m = new Map<string, { expectedBins: number; totalQty: number }>();
    for (const invoiceId of selectedInvoices) {
      const inv = sharedInvoices.find((i) => i.id === invoiceId);
      const items = inv?.items || [];
      for (const it of items as UploadedRow[]) {
        const customerItem = (it.customerItem || it.part || '').trim();
        if (!customerItem) continue;
        const itemNumber = (it.part || '').trim();
        const itRec = it as unknown as Record<string, unknown>;
        const expectedBins =
          Number((itRec.cust_scanned_bins_count as unknown) ?? (itRec.number_of_bins as unknown) ?? 0) || 0;
        const qty = Number(it.qty ?? 0) || 0;

        const k = makeItemKey(invoiceId, customerItem, itemNumber);
        const existing = m.get(k) || { expectedBins: 0, totalQty: 0 };
        existing.expectedBins += expectedBins;
        existing.totalQty += qty;
        m.set(k, existing);
      }
    }
    return m;
  }, [selectedInvoices, sharedInvoices]);

  // Get expected total bins across all selected invoices (based on customer-bin counts from Doc Audit)
  const getExpectedBins = () => {
    const selectedInvoiceData = sharedInvoices.filter(inv => 
      selectedInvoices.includes(inv.id) && inv.auditComplete
    );
    
    let totalExpectedBins = 0;
    
    selectedInvoiceData.forEach(invoice => {
      if (invoice.items && invoice.items.length > 0) {
        invoice.items.forEach((item) => {
          const rec = (item && typeof item === "object") ? (item as Record<string, unknown>) : {};
          // Priority: cust_scanned_bins_count > number_of_bins
          const expectedBinsForItem =
            Number((rec.cust_scanned_bins_count as unknown) ?? (rec.number_of_bins as unknown) ?? 0) || 0;
          totalExpectedBins += expectedBinsForItem;
        });
      }
    });
    
    return totalExpectedBins;
  };
  
  // Legacy function name for backward compatibility (now uses bin-based counting)
  const getExpectedBarcodes = getExpectedBins;

  const gatepassInvoiceIds = useMemo(() => {
    const fromDetails = gatepassDetails?.invoiceIds?.length
      ? gatepassDetails.invoiceIds
      : gatepassDetails?.invoices?.length
        ? gatepassDetails.invoices.map((i) => i.id)
        : null;
    return (fromDetails || selectedInvoices || []).filter(Boolean);
  }, [gatepassDetails, selectedInvoices]);

  const gatepassCustomerCode = useMemo(() => {
    if (gatepassDetails?.customerCode) return gatepassDetails.customerCode;
    const first = sharedInvoices.find((inv) => gatepassInvoiceIds.includes(inv.id));
    return first?.billTo || null;
  }, [gatepassDetails, sharedInvoices, gatepassInvoiceIds]);

  const gatepassSummary = useMemo(() => {
    const loadedScansForSummary =
      gatepassDetails?.loadedScansDetailed && gatepassDetails.loadedScansDetailed.length > 0
        ? gatepassDetails.loadedScansDetailed.map((s) => ({
            invoiceId: s.invoiceId,
            customerItem: s.customerItem,
            itemNumber: s.itemNumber,
            // For totals we treat each row as one loaded bin, and qty is binQuantity when available.
            quantity: s.binQuantity ?? s.quantity ?? 0,
          }))
        : loadedBarcodes;

    return buildGatepassSummary({
      gatepassNumber: gatepassNumber || `GP-${Date.now().toString().slice(-8)}`,
      vehicleNumber,
      authorizedBy: currentUser,
      customerCode: gatepassCustomerCode,
      dispatchDateIso: gatepassDetails?.dispatchDate || null,
      invoiceIds: gatepassInvoiceIds,
      invoiceDetails: gatepassDetails?.invoices || null,
      loadedScans: loadedScansForSummary,
    });
  }, [
    gatepassNumber,
    vehicleNumber,
    currentUser,
    gatepassCustomerCode,
    gatepassDetails,
    gatepassInvoiceIds,
    loadedBarcodes,
  ]);

  const getNextUnscannedBarcodePair = () => {
    const selectedInvoiceData = sharedInvoices.filter(inv => 
      selectedInvoices.includes(inv.id) && inv.auditComplete
    );
    
    const allValidatedBarcodes = selectedInvoiceData.flatMap(inv => inv.validatedBarcodes || []);
    
    return allValidatedBarcodes.find(pair => 
      !loadedBarcodes.find(loaded => 
        loaded.customerBarcode === pair.customerBarcode
      )
    );
  };

  // Handle invoice QR scan - Randomly picks unscanned invoice
  const handleInvoiceQRScan = (data: BarcodeData) => {
    // Get unscanned invoices (scheduled, audited, not dispatched, not already selected)
    const availableInvoices = getScheduledDispatchableInvoices().filter(inv => {
      const isAlreadySelected = selectedInvoices.includes(inv.id);
      return !isAlreadySelected && inv.id !== "No Data";
    });
    
    // Check if any unscanned invoices available
    if (availableInvoices.length === 0) {
      toast.warning("All invoices already selected", {
        description: "All available invoices have been added to selection",
        duration: 3000
      });
      return;
    }
    
    // Randomly pick one unscanned invoice
    const randomIndex = Math.floor(Math.random() * availableInvoices.length);
    const randomInvoice = availableInvoices[randomIndex];
    
    // Add to selection
    setSelectedInvoices(prev => [...prev, randomInvoice.id]);
    toast.success(`✅ Invoice ${randomInvoice.id} added!`, {
      description: `${randomInvoice.customer} - ${selectedInvoices.length + 1} invoice(s) selected`,
      duration: 3000
    });
    
    // Don't close scanner - allow multiple scans
  };

  // Background scanning (hardware/keyboard scanner): enabled after invoice selection.
  // IMPORTANT: Disable while invoice-selection scanner dialog is open to avoid keydown-listener conflicts.
  useKeyboardBarcodeScanner({
    enabled: selectedInvoices.length > 0 && !showInvoiceQRScanner,
    onScanAttempt: (data) => {
      // Dispatch uses Customer label only.
      if (!data.qrType || data.qrType !== 'customer') {
        const msg = "Dispatch uses Customer label only. Please scan the Customer barcode.";
        setDispatchScanAlert(msg);
        openScanIssue({
          title: "Invalid scan for Dispatch",
          description: msg,
          severity: "warning",
        });
        return { accepted: false, rejectReason: "customer_only" };
      }
      setDispatchScanAlert(null);
      return { accepted: true };
    },
    onScan: (data) => {
      setDispatchCustomerScan(data);
    },
  });

  // Auto-validate when customer barcode is scanned
  useEffect(() => {
    if (dispatchCustomerScan) {
      handleDispatchScan();
    }
  }, [dispatchCustomerScan]);

  const handleDispatchScan = async () => {
    if (!dispatchCustomerScan) {
      openScanIssue({
        title: "Scan required",
        description: "Please scan the customer barcode.",
        severity: "warning",
      });
      return;
    }

    // Check if this bin_number was already scanned (prevent duplicate bin scans)
    const binNumber = dispatchCustomerScan.binNumber;
    if (binNumber) {
      const duplicateBin = loadedBarcodes.find(pair => 
        pair.binNumber === binNumber
      );
      if (duplicateBin) {
        openScanIssue({
          title: "Duplicate bin scan",
          description: `Bin number ${binNumber} has already been scanned.`,
          severity: "warning",
          context: [{ label: "Bin", value: binNumber }],
        });
        setDispatchCustomerScan(null);
        return;
      }
    }

    // Also check by customer barcode (fallback)
    const alreadyLoaded = loadedBarcodes.find(pair => 
      pair.customerBarcode === dispatchCustomerScan.rawValue
    );

    if (alreadyLoaded) {
      openScanIssue({
        title: "Already loaded",
        description: "This barcode has already been loaded onto the vehicle.",
        severity: "warning",
        context: [
          { label: "Bin", value: dispatchCustomerScan.binNumber },
          { label: "Customer item", value: dispatchCustomerScan.partCode },
        ],
      });
      setDispatchCustomerScan(null);
      return;
    }

    let matchedInvoiceItem: UploadedRow | undefined;
    let matchedInvoiceId: string | undefined;
    const scannedPartCode = dispatchCustomerScan.partCode?.trim();
    
    if (!scannedPartCode) {
      openScanIssue({
        title: "Invalid customer label",
        description: "Customer label part code not found. Please rescan.",
        severity: "error",
      });
      setDispatchCustomerScan(null);
      return;
    }
    
    // Match customer label partCode to invoice_item.customerItem (not part/itemNumber)
    // Customer barcode part number corresponds to customer_item in the invoice
    const matchingInvoices: Array<{ invoiceId: string; item: UploadedRow }> = [];
    
        for (const invoiceId of selectedInvoices) {
          const invoice = sharedInvoices.find(inv => inv.id === invoiceId);
          if (invoice && invoice.items) {
        const matchedItem = invoice.items.find((item: UploadedRow) => 
          item.customerItem && item.customerItem.trim() === scannedPartCode
        );
        if (matchedItem) {
          matchingInvoices.push({ invoiceId, item: matchedItem });
        }
      }
    }
    
    // Handle ambiguous matches (same customerItem in multiple selected invoices)
    if (matchingInvoices.length === 0) {
      openScanIssue({
        title: "Item not found",
        description: `Customer item "${scannedPartCode}" not found in any selected invoice.`,
        severity: "error",
        context: [{ label: "Customer item", value: scannedPartCode }],
      });
      setDispatchCustomerScan(null);
      return;
    } else if (matchingInvoices.length > 1) {
      // Ambiguous match: same customerItem exists in multiple invoices
      // For now, use the first match but warn the user
      openScanIssue({
        title: "Ambiguous match",
        description: `Customer item "${scannedPartCode}" found in ${matchingInvoices.length} invoices. Using first match.`,
        severity: "warning",
        context: [
          { label: "Customer item", value: scannedPartCode },
          { label: "Matches", value: matchingInvoices.length },
        ],
      });
      matchedInvoiceItem = matchingInvoices[0].item;
      matchedInvoiceId = matchingInvoices[0].invoiceId;
    } else {
      // Single match (ideal case)
      matchedInvoiceItem = matchingInvoices[0].item;
      matchedInvoiceId = matchingInvoices[0].invoiceId;
    }

    // Use first selected invoice if no match found
    const invoiceIdToUse = matchedInvoiceId || selectedInvoices[0];

    const newPair: ValidatedBarcodePair = {
      invoiceId: invoiceIdToUse,
      customerBarcode: dispatchCustomerScan.rawValue,
      autolivBarcode: "",
      binNumber: dispatchCustomerScan.binNumber,
      quantity: dispatchCustomerScan.quantity,
      partCode: dispatchCustomerScan.partCode,
      customerItem: matchedInvoiceItem?.customerItem || undefined,
      itemNumber: matchedInvoiceItem?.part || undefined,
      actualQuantity: matchedInvoiceItem?.qty || undefined,
      scannedAt: new Date().toISOString()
    };
    
    // Save scan to database immediately with bin_number and bin_quantity
    if (invoiceIdToUse) {
      try {
        const response = await auditApi.recordScan(invoiceIdToUse, {
          customerBarcode: dispatchCustomerScan.rawValue,
          autolivBarcode: null,
          customerItem: matchedInvoiceItem?.customerItem || dispatchCustomerScan.partCode || 'N/A',
          itemNumber: matchedInvoiceItem?.part || dispatchCustomerScan.partCode || 'N/A',
          partDescription: matchedInvoiceItem?.partDescription || 'N/A',
          quantity: matchedInvoiceItem?.qty || parseInt(dispatchCustomerScan.quantity || '0') || 0,
          binQuantity: parseInt(dispatchCustomerScan.quantity || '0') || null, // bin_quantity from barcode
          binNumber: dispatchCustomerScan.binNumber || null, // bin_number from barcode
          status: 'matched',
          scanContext: 'loading-dispatch'
        });
        
        // Update newPair with scan ID from response
        newPair.id = response.scanId || undefined;
        
        // Update local state only after successful API call
        setLoadedBarcodes(prev => [...prev, newPair]);
        
        // Show progress info if available
        if (response.expectedBinsForItem !== null && response.loadedBinsForItem !== null) {
          const remaining = response.expectedBinsForItem - response.loadedBinsForItem;
          if (remaining > 0) {
            toast.success(`✅ Bin loaded! ${remaining} remaining for this item`, {
              duration: 3000
            });
          } else {
            toast.success(`✅ Bin loaded! All bins scanned for this item`, {
              duration: 3000
            });
          }
        }
      } catch (error: unknown) {
        console.error('Error saving loading scan to database:', error);
        
        // Handle specific error types from backend
        const errRec = (error && typeof error === "object") ? (error as Record<string, unknown>) : undefined;
        const responseRec =
          (errRec?.response && typeof errRec.response === "object")
            ? (errRec.response as Record<string, unknown>)
            : undefined;
        const errorMessage =
          (error instanceof Error ? error.message : undefined) ||
          (typeof errRec?.message === "string" ? (errRec.message as string) : undefined) ||
          (typeof responseRec?.message === "string" ? (responseRec.message as string) : undefined) ||
          'Unknown error';
        const isDuplicate = errorMessage.includes('Duplicate') || errorMessage.includes('already been scanned');
        const isOverScan = errorMessage.includes('Over-scan') || errorMessage.includes('Cannot scan more bins');
        const isBlocked = errorMessage.includes('blocked');
        
        if (isDuplicate || isOverScan) {
          openScanIssue({
            title: isDuplicate ? "Duplicate scan" : "Over-scan prevented",
            description: errorMessage,
            severity: "warning",
            context: [
              { label: "Invoice", value: invoiceIdToUse },
              { label: "Bin", value: dispatchCustomerScan.binNumber },
              { label: "Customer item", value: scannedPartCode },
            ],
          });
        } else if (isBlocked) {
          openScanIssue({
            title: "Invoice blocked",
            description: `${errorMessage} Please contact admin.`,
            severity: "error",
            context: [{ label: "Invoice", value: invoiceIdToUse }],
          });
          // Refresh data to get updated blocked status
          await refreshData();
        } else {
          openScanIssue({
            title: "Failed to save scan",
            description: errorMessage || "Please try again.",
            severity: "error",
          });
        }
        
        // Don't update local state on error
        setDispatchCustomerScan(null);
        return;
      }
    } else {
      // No invoice matched, don't proceed
      setDispatchCustomerScan(null);
      return;
    }
    
    // Update local invoice tracking (binsLoaded is legacy but kept for compatibility)
    selectedInvoices.forEach(invoiceId => {
      const invoice = sharedInvoices.find(inv => inv.id === invoiceId);
      if (invoice) {
        invoice.binsLoaded = (invoice.binsLoaded || 0) + 1;
      }
    });
    
    setDispatchCustomerScan(null);
  };

  const handleDeleteBin = async (binIndex: number, binId?: string, invoiceId?: string) => {
    const binToDelete = loadedBarcodes[binIndex];
    
    // Prefer explicit invoiceId on the scan (source of truth)
    invoiceId = invoiceId || binToDelete?.invoiceId;
    
    if (!invoiceId) {
      toast.error("Cannot delete bin", {
        description: "Invoice ID not found. Please refresh and try again.",
      });
      return;
    }
    
    // If no scan ID, try to find it from the backend
    if (!binId) {
      try {
        const scansResponse = await auditApi.getScans(invoiceId, 'loading-dispatch');
        if (scansResponse.success && scansResponse.scans) {
          const matchingScan = scansResponse.scans.find((scan) => {
            if (!scan || typeof scan !== "object") return false;
            const rec = scan as Record<string, unknown>;
            const customerBarcode = typeof rec.customerBarcode === "string" ? rec.customerBarcode : undefined;
            const customerBinNumber = typeof rec.customerBinNumber === "string" ? rec.customerBinNumber : undefined;
            const customerItem = typeof rec.customerItem === "string" ? rec.customerItem : undefined;

            return (
              customerBarcode === binToDelete.customerBarcode ||
              (customerBinNumber === binToDelete.binNumber && customerItem === binToDelete.customerItem)
            );
          });
          
          if (matchingScan?.id) {
            binId = matchingScan.id;
          } else {
            // If still not found, just remove from UI (optimistic)
            setLoadedBarcodes(prev => prev.filter((_, idx) => idx !== binIndex));
            toast.warning("Bin removed from UI", {
              description: "Could not find scan in database. Removed from local view only.",
            });
            return;
          }
        }
      } catch (error) {
        console.error('Error finding scan ID:', error);
        toast.error("Cannot delete bin", {
          description: "Failed to find scan in database.",
        });
        return;
      }
    }
    
    // Confirm deletion
    const binInfo = binToDelete.binNumber 
      ? `Bin ${binToDelete.binNumber} (${binToDelete.customerItem || binToDelete.partCode || 'item'})`
      : `${binToDelete.customerItem || binToDelete.partCode || 'item'}`;
    
    if (!confirm(`Delete bin scan for ${binInfo}?`)) {
      return;
    }
    
    try {
      await auditApi.deleteScan(invoiceId, binId);
      
      // Remove from local state
      setLoadedBarcodes(prev => prev.filter((_, idx) => idx !== binIndex));
      
      toast.success("✅ Bin deleted successfully", {
        description: `Removed bin scan for ${binInfo}`,
      });
    } catch (error: unknown) {
      console.error('Error deleting bin:', error);
      const errRec = (error && typeof error === "object") ? (error as Record<string, unknown>) : undefined;
      const responseRec =
        (errRec?.response && typeof errRec.response === "object")
          ? (errRec.response as Record<string, unknown>)
          : undefined;
      const errorMessage =
        (error instanceof Error ? error.message : undefined) ||
        (typeof errRec?.message === "string" ? (errRec.message as string) : undefined) ||
        (typeof responseRec?.message === "string" ? (responseRec.message as string) : undefined) ||
        'Failed to delete bin';
      toast.error("Failed to delete bin", {
        description: errorMessage,
        duration: 5000
      });
    }
  };

  const groupLoadedBins = (bins: ValidatedBarcodePair[]) => {
    type ScanEntry = { index: number; scan: ValidatedBarcodePair };
    type ItemGroup = {
      key: string;
      customerItem: string;
      itemNumber: string;
      scans: ScanEntry[];
      totalQty: number;
      lastScannedAtMs: number;
    };
    type InvoiceGroup = {
      invoiceId: string;
      scans: ScanEntry[];
      items: ItemGroup[];
      totalQty: number;
      lastScannedAtMs: number;
    };

    const byInvoice = new Map<
      string,
      {
        invoiceId: string;
        scans: ScanEntry[];
        byItem: Map<string, ItemGroup>;
        totalQty: number;
        lastScannedAtMs: number;
      }
    >();

    for (let index = 0; index < bins.length; index++) {
      const scan = bins[index];
      const invoiceId = scan.invoiceId;
      if (!invoiceId) continue;

      const scannedAtMs = scan.scannedAt ? new Date(scan.scannedAt).getTime() : 0;
      const qty = Number(scan.quantity ?? 0) || 0;
      const customerItem = (scan.customerItem || scan.partCode || "N/A").trim();
      const itemNumber = (scan.itemNumber || "N/A").trim();
      const itemKey = `${customerItem}||${itemNumber}`;

      const inv = byInvoice.get(invoiceId) || {
        invoiceId,
        scans: [] as ScanEntry[],
        byItem: new Map<string, ItemGroup>(),
        totalQty: 0,
        lastScannedAtMs: 0,
      };

      const entry: ScanEntry = { index, scan };
      inv.scans.push(entry);
      inv.totalQty += qty;
      inv.lastScannedAtMs = Math.max(inv.lastScannedAtMs, scannedAtMs);

      const existingItem = inv.byItem.get(itemKey);
      if (existingItem) {
        existingItem.scans.push(entry);
        existingItem.totalQty += qty;
        existingItem.lastScannedAtMs = Math.max(existingItem.lastScannedAtMs, scannedAtMs);
      } else {
        inv.byItem.set(itemKey, {
          key: itemKey,
          customerItem,
          itemNumber,
          scans: [entry],
          totalQty: qty,
          lastScannedAtMs: scannedAtMs,
        });
      }

      byInvoice.set(invoiceId, inv);
    }

    const invoiceGroups: InvoiceGroup[] = [];
    for (const inv of byInvoice.values()) {
      const items = Array.from(inv.byItem.values())
        .map((g) => ({
          ...g,
          scans: [...g.scans].sort((a, b) => {
            const ta = a.scan.scannedAt ? new Date(a.scan.scannedAt).getTime() : 0;
            const tb = b.scan.scannedAt ? new Date(b.scan.scannedAt).getTime() : 0;
            return tb - ta;
          }),
        }))
        .sort((a, b) => b.lastScannedAtMs - a.lastScannedAtMs);

      invoiceGroups.push({
        invoiceId: inv.invoiceId,
        scans: [...inv.scans].sort((a, b) => {
          const ta = a.scan.scannedAt ? new Date(a.scan.scannedAt).getTime() : 0;
          const tb = b.scan.scannedAt ? new Date(b.scan.scannedAt).getTime() : 0;
          return tb - ta;
        }),
        items,
        totalQty: inv.totalQty,
        lastScannedAtMs: inv.lastScannedAtMs,
      });
    }

    return invoiceGroups;
  };

  const handleGenerateGatepass = async () => {
    if (!vehicleNumber) {
      toast.error("Please enter vehicle number");
      return;
    }
    if (selectedInvoices.length === 0) {
      toast.error("Please select at least one invoice");
      return;
    }

    const expectedBins = getExpectedBins();
    if (loadedBarcodes.length < expectedBins) {
      openScanIssue({
        title: "Not all bins loaded",
        description: `Please scan all bins before generating gatepass.\nLoaded: ${loadedBarcodes.length}/${expectedBins}`,
        severity: "error",
        context: [
          { label: "Loaded bins", value: loadedBarcodes.length },
          { label: "Expected bins", value: expectedBins },
        ],
      });
      return;
    }

    const loadingToast = toast.loading("Generating gatepass and saving dispatch...", {
      duration: 0
    });

    try {
      // Call backend API to dispatch invoices and generate gatepass
      const result = await dispatchApi.dispatch({
        invoiceIds: selectedInvoices,
        vehicleNumber: vehicleNumber,
        loadedBarcodes: loadedBarcodes.map(b => ({
          customerBarcode: b.customerBarcode,
          autolivBarcode: b.autolivBarcode || '',
          customerItem: b.customerItem,
          itemNumber: b.itemNumber,
          partCode: b.partCode,
          quantity: b.quantity,
          binNumber: b.binNumber
        }))
      });

      if (result.success && result.gatepassNumber) {
        const invoiceIdsSnapshot = [...selectedInvoices];

        // Update local state optimistically
        selectedInvoices.forEach(invoiceId => {
          updateInvoiceDispatch(invoiceId, currentUser, vehicleNumber, undefined, undefined);
        });

        setGatepassNumber(result.gatepassNumber);
        setGatepassGenerated(true);
        
        // Store gatepass details from API response
        // This contains the most accurate data including delivery dates, times, and unloading locations
        const gatepassData = {
          customerCode: result.customerCode || null,
          dispatchDate: result.dispatchDate,
          totalNumberOfBins: result.totalNumberOfBins || 0,
          supplyDates: result.supplyDates || [],
          invoiceIds: invoiceIdsSnapshot,
          invoices: result.invoices || [],
          loadedScansDetailed: Array.isArray(result.loadedScansDetailed) ? result.loadedScansDetailed : []
        };

        // Extra robustness: if backend provides loaded totals, cross-check and warn if mismatch.
        if (typeof result.loadedBinsCount === 'number' || typeof result.loadedQty === 'number') {
          const localBins = loadedBarcodes.length;
          const localQty = loadedBarcodes.reduce((sum, b) => sum + (parseInt(b.quantity || '0') || 0), 0);
          const serverBins = typeof result.loadedBinsCount === 'number' ? result.loadedBinsCount : null;
          const serverQty = typeof result.loadedQty === 'number' ? result.loadedQty : null;

          if ((serverBins !== null && serverBins !== localBins) || (serverQty !== null && serverQty !== localQty)) {
            openScanIssue({
              title: "Loaded totals mismatch detected",
              description: `Local bins/qty=${localBins}/${localQty}, Server bins/qty=${serverBins ?? 'N/A'}/${serverQty ?? 'N/A'}.\nRefreshing data is recommended.`,
              severity: "warning",
            });
          }
        }
        
        // Log the raw API response
        console.log('📥 Raw API response:', result);
        console.log('📋 Invoice details from API response:', result.invoices);
        console.log('💾 Storing gatepass details:', gatepassData);
        
        // Verify each invoice has the required fields
        if (result.invoices && result.invoices.length > 0) {
          result.invoices.forEach((inv) => {
            const invRec = (inv && typeof inv === "object") ? (inv as Record<string, unknown>) : {};
            console.log(`📄 Invoice ${String(invRec.id ?? "unknown")}:`, {
              deliveryDate: invRec.deliveryDate,
              deliveryTime: invRec.deliveryTime,
              unloadingLoc: invRec.unloadingLoc,
              status: invRec.status
            });
          });
        } else {
          console.warn('⚠️ No invoices in API response!');
        }
        
        setGatepassDetails(gatepassData);
        
        // Check for customer code mismatch
        const customerCodes = new Set(
          selectedInvoices
            .map(id => sharedInvoices.find(inv => inv.id === id)?.billTo)
            .filter(Boolean)
        );
        if (customerCodes.size > 1) {
          const errorMsg = `⚠️ ERROR: Invoices have different customer codes: ${Array.from(customerCodes).join(', ')}`;
          setCustomerCodeError(errorMsg);
          openScanIssue({
            title: "Customer code mismatch",
            description:
              "All invoices in a vehicle must have the same customer code.\nThis has been logged.",
            severity: "error",
            context: [{ label: "Customer codes", value: Array.from(customerCodes).join(", ") }],
          });
        } else {
          setCustomerCodeError(null);
        }

        // Refresh data from backend to sync with other devices
        // Note: This updates sharedInvoices but doesn't affect gatepassDetails state
        // gatepassDetails is preserved separately and contains the accurate invoice data
        await refreshData();
        
        // Log to verify gatepassDetails is preserved after refresh
        // Note: gatepassDetails state won't update here, but it's already set above
        console.log('After refreshData - gatepassDetails should be preserved');

        toast.dismiss(loadingToast);
        toast.success(`✅ Gatepass generated successfully by ${currentUser}!`, {
          description: `Vehicle ${vehicleNumber} dispatched with ${selectedInvoices.length} invoice(s).`,
          duration: 6000
        });
      } else {
        throw new Error(result.message || 'Failed to generate gatepass');
      }
    } catch (error: unknown) {
      toast.dismiss(loadingToast);
      
      // Get error message from various possible locations
      const errRec = (error && typeof error === "object") ? (error as Record<string, unknown>) : undefined;
      const responseRec =
        (errRec?.response && typeof errRec.response === "object")
          ? (errRec.response as Record<string, unknown>)
          : undefined;
      const errorMessage =
                          (error instanceof Error ? error.message : undefined) ||
                          (typeof errRec?.message === "string" ? (errRec.message as string) : undefined) ||
                          (typeof responseRec?.message === "string" ? (responseRec.message as string) : undefined) ||
                          (typeof responseRec?.error === "string" ? (responseRec.error as string) : undefined) ||
                          'Unknown error occurred';
      
      console.error('Gatepass generation error:', error);
      console.error('Error response:', errRec?.response);
      console.error('Error status:', errRec?.status);
      
      // Check if it's a customer code mismatch error
      if (errorMessage.includes('different customer codes') || 
          errorMessage.includes('Customer code')) {
        setCustomerCodeError(errorMessage);
        openScanIssue({
          title: "Customer code mismatch",
          description: errorMessage,
          severity: "error",
        });
      } else if (errorMessage.includes('Invoice') && errorMessage.includes('not found')) {
        toast.error("❌ Invoice Not Found!", {
          description: errorMessage,
          duration: 6000
        });
      } else {
        toast.error(`Failed to generate gatepass: ${errorMessage}`, {
          description: errRec?.status === 400 ? 'Please check your input and try again' : 'Please try again',
          duration: 6000
        });
      }
      // Don't update local state on error - user can retry
    }
  };

  const generateGatepassQRData = () => {
    // Dispatch date (compact format YYYY-MM-DD HH:MM)
    const dispatchIso = gatepassSummary.dispatchDateIso || new Date().toISOString();
    const dispatchCompact = new Date(dispatchIso).toISOString().slice(0, 16).replace('T', ' ');

    // Supply date: first delivery date across invoices (if any)
    const supplyDate =
      gatepassSummary.invoices.find((i) => i.deliveryDate)?.deliveryDate ?? null;

    // Build expected per-invoice-item quantities/bins from invoice items (source of truth for "quantity of that customer item" and expected bin count).
    const expectedByKey = new Map<string, { expectedQty: number; expectedBins: number }>();
    for (const inv of sharedInvoices.filter((x) => gatepassSummary.invoiceIds.includes(x.id))) {
      const invItems: any[] = Array.isArray((inv as any).items) ? ((inv as any).items as any[]) : [];
      for (const it of invItems) {
        const rec = (it && typeof it === "object") ? (it as Record<string, unknown>) : {};
        const customerItem = String((rec.customerItem as unknown) ?? (rec.part as unknown) ?? "").trim();
        const itemNumber = String((rec.part as unknown) ?? "").trim();
        if (!customerItem || !itemNumber) continue;
        const expectedQty = Number((rec.qty as unknown) ?? 0) || 0;
        const expectedBins =
          Number((rec.cust_scanned_bins_count as unknown) ?? (rec.number_of_bins as unknown) ?? 0) || 0;
        expectedByKey.set(`${inv.id}||${customerItem}||${itemNumber}`, { expectedQty, expectedBins });
      }
    }

    // QR requirement: include invoice number + customer item + item number + quantity + number of bins (per item).
    // We include both expected (from invoice items) and loaded (from dispatch scans) so verification is clear.
    const items = gatepassSummary.invoices.flatMap((inv) =>
      inv.items.map((it) => {
        const key = `${inv.id}||${it.customerItem}||${it.itemNumber}`;
        const exp = expectedByKey.get(key);
        return {
          invoiceId: inv.id,
          customerItem: it.customerItem,
          itemNumber: it.itemNumber,
          expectedQty: exp?.expectedQty ?? null,
          expectedBins: exp?.expectedBins ?? null,
          loadedQty: it.qtyLoaded,
          loadedBins: it.binsLoaded,
        };
      })
    );

    const invoices = gatepassSummary.invoices.map((i) => ({
      id: i.id,
      unloadingLoc: i.unloadingLoc || null,
      deliveryDate: i.deliveryDate || null,
      deliveryTime: i.deliveryTime || null,
      status: i.status || "unknown",
    }));

    const payload = {
      // Keep readable keys so generic QR scanner output makes sense.
      gatepassNumber: gatepassSummary.gatepassNumber,
      vehicleNumber: gatepassSummary.vehicleNumber,
      customerCode: gatepassSummary.customerCode,
      dispatchTime: dispatchCompact,
      supplyDate,
      authorizedBy: gatepassSummary.authorizedBy,
      invoiceIds: gatepassSummary.invoiceIds,
      invoices,
      items,
      totals: {
        invoiceCount: gatepassSummary.grandTotals.invoiceCount,
        itemLinesCount: gatepassSummary.grandTotals.itemLinesCount,
        loadedBins: gatepassSummary.grandTotals.binsLoaded,
        loadedQty: gatepassSummary.grandTotals.qtyLoaded,
      },
      error: customerCodeError ? customerCodeError : null,
    };

    return encodeGatepassQrPayload(payload);
  };

  const handlePrintGatepass = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error("Please allow popups to print the gatepass");
      return;
    }

    const selectedInvoiceData = sharedInvoices.filter(inv => selectedInvoices.includes(inv.id));
    const customers = [...new Set(selectedInvoiceData.map(inv => inv.customer))];
    const customerName = customers.join(", ");
    const totalQuantity = gatepassSummary.grandTotals.qtyLoaded;

    const dispatchIso = gatepassSummary.dispatchDateIso || new Date().toISOString();
    const dispatchDateObj = new Date(dispatchIso);
    const dispatchDateText = dispatchDateObj.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const dispatchTimeText = dispatchDateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const invoiceDetailsRows = gatepassSummary.invoices
      .map((inv, idx) => {
        const statusText = inv.status === 'on-time' ? 'On Time' : inv.status === 'late' ? 'Late' : 'Unknown';
        return `
          <tr>
            <td>${idx + 1}</td>
            <td>${inv.id}</td>
            <td>${inv.unloadingLoc || 'N/A'}</td>
            <td>${inv.deliveryDate || 'N/A'}</td>
            <td>${inv.deliveryTime || 'N/A'}</td>
            <td>${statusText}</td>
          </tr>
        `;
      })
      .join('');

    const itemTotalsRows = gatepassSummary.invoices
      .flatMap((inv) =>
        inv.items.map(
          (it) => `
            <tr>
              <td>${inv.id}</td>
              <td>${it.customerItem}</td>
              <td>${it.itemNumber}</td>
              <td style="text-align:right;">${it.binsLoaded}</td>
              <td style="text-align:right;">${it.qtyLoaded}</td>
            </tr>
          `
        )
      )
      .join('');

    const loadedScansDetailed: GatepassLoadedScanDetail[] =
      (gatepassDetails?.loadedScansDetailed && gatepassDetails.loadedScansDetailed.length > 0)
        ? gatepassDetails.loadedScansDetailed
        : [];

    const formatScanTime = (iso: string | null) => {
      if (!iso) return 'N/A';
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? 'N/A' : d.toLocaleString();
    };

    const binDetailsRows = loadedScansDetailed
      .slice()
      .sort((a, b) => {
        const ta = a.scannedAt ? new Date(a.scannedAt).getTime() : 0;
        const tb = b.scannedAt ? new Date(b.scannedAt).getTime() : 0;
        if (a.invoiceId !== b.invoiceId) return a.invoiceId.localeCompare(b.invoiceId);
        return tb - ta;
      })
      .map((s) => `
        <tr>
          <td>${s.invoiceId}</td>
          <td>${s.customerItem || 'N/A'}</td>
          <td>${s.itemNumber || 'N/A'}</td>
          <td>${s.customerBinNumber || 'N/A'}</td>
          <td>${s.autolivBinNumber || 'N/A'}</td>
          <td style="text-align:right;">${s.binQuantity ?? 0}</td>
          <td>${formatScanTime(s.scannedAt)}</td>
        </tr>
      `)
      .join('');
    
    const qrData = generateGatepassQRData();
    const encodedQRData = encodeURIComponent(qrData);
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
              <div class="info-value">${dispatchDateText} at ${dispatchTimeText}</div>
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
              <div class="info-label">Total Bins</div>
              <div class="info-value">${gatepassSummary.grandTotals.binsLoaded}</div>
            </div>
          </div>

          <div class="invoices-section">
            <h3 style="margin-bottom: 10px; font-size: 16px;">Invoices (Delivery Details):</h3>
            <table class="items-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Invoice</th>
                  <th>UNLOADING LOC</th>
                  <th>Delivery Date</th>
                  <th>Time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${invoiceDetailsRows || `<tr><td colspan="6">No invoice details available</td></tr>`}
              </tbody>
            </table>
          </div>

          <div class="invoices-section">
            <h3 style="margin-bottom: 10px; font-size: 16px;">Item Summary (Totals Only):</h3>
            <table class="items-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer Item</th>
                  <th>Item Number</th>
                  <th>Bins Loaded</th>
                  <th>Qty Loaded</th>
                </tr>
              </thead>
              <tbody>
                ${itemTotalsRows || `<tr><td colspan="5">No loaded scans found</td></tr>`}
              </tbody>
            </table>
          </div>

          <div class="invoices-section">
            <h3 style="margin-bottom: 10px; font-size: 16px;">Bin Details (Loaded Scans):</h3>
            <table class="items-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer Item</th>
                  <th>Item Number</th>
                  <th>Cust Bin</th>
                  <th>Autoliv Bin</th>
                  <th>Bin Qty</th>
                  <th>Scanned At</th>
                </tr>
              </thead>
              <tbody>
                ${binDetailsRows || `<tr><td colspan="7">No loaded bin scan details available</td></tr>`}
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
            <p>Generated on ${dispatchDateText} at ${dispatchTimeText}</p>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
    
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
            setTimeout(() => {
              printWindow.print();
              printWindow.onafterprint = () => printWindow.close();
            }, 100);
          };
        }
      } else {
        setTimeout(() => {
          printWindow.print();
          printWindow.onafterprint = () => printWindow.close();
        }, 500);
      }
    };
    
    toast.success("Print dialog opened");
  };

  const handleDownloadPDF = () => {
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      let yPos = margin;

      const selectedInvoiceData = sharedInvoices.filter(inv => gatepassSummary.invoiceIds.includes(inv.id));
      const customers = [...new Set(selectedInvoiceData.map(inv => inv.customer))];
      const customerName = customers.join(", ");
      
      // Get customer code
      const customerCode = gatepassSummary.customerCode;
      const hasCustomerCodeError = !!customerCodeError;
      
      // Get dispatch date
      const dispatchDate = gatepassSummary.dispatchDateIso
        ? new Date(gatepassSummary.dispatchDateIso)
        : new Date();
      const dispatchDateStr = dispatchDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      const dispatchTimeStr = dispatchDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      
      // Get invoice details
      const invoiceDetails = gatepassSummary.invoices;
      
      const totalQuantity = gatepassSummary.grandTotals.qtyLoaded;

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

      // Vehicle Number (prominent)
      pdf.setFontSize(16);
      pdf.setFont(undefined, 'bold');
      pdf.text(`Vehicle Number: ${vehicleNumber}`, pageWidth / 2, yPos, { align: 'center' });
      yPos += 10;

      // Customer Code Error (if any)
      if (hasCustomerCodeError || customerCodeError) {
        pdf.setFillColor(255, 200, 200);
        pdf.rect(margin, yPos, pageWidth - 2 * margin, 10, 'F');
        pdf.setFontSize(10);
        pdf.setFont(undefined, 'bold');
        pdf.setTextColor(200, 0, 0);
        pdf.text('⚠️ ERROR: Multiple Customer Codes Detected!', margin + 2, yPos + 6);
        pdf.setTextColor(0, 0, 0);
        yPos += 12;
      }

      // Gatepass Information
      pdf.setFontSize(10);
      pdf.setFont(undefined, 'bold');
      pdf.text('Gatepass Information:', margin, yPos);
      yPos += 7;

      pdf.setFont(undefined, 'normal');
      pdf.setFontSize(9);
      pdf.text(`Customer Code: ${customerCode || 'N/A'}`, margin, yPos);
      yPos += 6;
      pdf.text(`Dispatch Date & Time: ${dispatchDateStr} at ${dispatchTimeStr}`, margin, yPos);
      yPos += 6;
      pdf.text(`Customer: ${customerName}`, margin, yPos);
      yPos += 6;
      pdf.text(`Authorized By: ${currentUser}`, margin, yPos);
      yPos += 6;
      pdf.text(`Total Quantity: ${totalQuantity}`, margin, yPos);
      yPos += 6;
      pdf.text(`Total Bins: ${gatepassSummary.grandTotals.binsLoaded}`, margin, yPos);
      yPos += 10;

      // Invoice Details Table
      pdf.setFont(undefined, 'bold');
      pdf.text('Invoice Details:', margin, yPos);
      yPos += 7;

      pdf.setFontSize(8);
      pdf.setFont(undefined, 'bold');
      pdf.text('Invoice', margin, yPos);
      pdf.text('UNLOADING LOC', margin + 35, yPos);
      pdf.text('Delivery Date', margin + 75, yPos);
      pdf.text('Time', margin + 110, yPos);
      pdf.text('Status', margin + 130, yPos);
      yPos += 5;

      pdf.setDrawColor(200, 200, 200);
      pdf.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 3;

      pdf.setFont(undefined, 'normal');
      invoiceDetails.forEach((inv) => {
        if (yPos > pageHeight - 20) {
          pdf.addPage();
          yPos = margin;
        }
        
        // Parse date-only values (YYYY-MM-DD) as local calendar dates to avoid timezone shifts.
        const parseDateOnlyAsLocal = (value: string): Date | null => {
          const s = String(value ?? '').trim();
          const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
          if (!m) return null;
          const year = Number(m[1]);
          const month = Number(m[2]);
          const day = Number(m[3]);
          if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
          return new Date(year, month - 1, day);
        };

        const deliveryDateStr = inv.deliveryDate
          ? (() => {
              const raw = String(inv.deliveryDate);
              const dLocal = parseDateOnlyAsLocal(raw) ?? new Date(raw);
              return Number.isNaN(dLocal.getTime())
                ? 'N/A'
                : dLocal.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            })()
          : 'N/A';
        
        pdf.text(inv.id.substring(0, 12), margin, yPos);
        pdf.text(inv.unloadingLoc || 'N/A', margin + 35, yPos);
        pdf.text(deliveryDateStr, margin + 75, yPos);
        pdf.text(inv.deliveryTime || 'N/A', margin + 110, yPos);
        
        // Status with color
        const statusText = inv.status === 'on-time' ? 'On Time' : inv.status === 'late' ? 'Late' : 'Unknown';
        if (inv.status === 'late') {
          pdf.setTextColor(200, 0, 0);
        } else if (inv.status === 'on-time') {
          pdf.setTextColor(0, 150, 0);
        }
        pdf.text(statusText, margin + 130, yPos);
        pdf.setTextColor(0, 0, 0);
        yPos += 6;
      });
      
      yPos += 5;

      // Invoice Numbers (legacy format)
      yPos += 5;
      if (yPos > pageHeight - 60) {
        pdf.addPage();
        yPos = margin;
      }

      pdf.setFont(undefined, 'bold');
      pdf.setFontSize(10);
      pdf.text('Invoice Numbers:', margin, yPos);
      yPos += 6;
      pdf.setFont(undefined, 'normal');
      pdf.setFontSize(9);
      const invoiceText = gatepassSummary.invoiceIds.join(", ");
      const splitInvoices = pdf.splitTextToSize(invoiceText, pageWidth - 2 * margin);
      pdf.text(splitInvoices, margin, yPos);
      yPos += splitInvoices.length * 5 + 10;

      // Item Summary (Totals Only)
      if (yPos > pageHeight - 60) {
        pdf.addPage();
        yPos = margin;
      }

      pdf.setFont(undefined, 'bold');
      pdf.setFontSize(10);
      pdf.text('Item Summary (Totals Only):', margin, yPos);
      yPos += 7;

      pdf.setFontSize(8);
      pdf.setFont(undefined, 'bold');
      pdf.text('Invoice', margin, yPos);
      pdf.text('Customer Item', margin + 28, yPos);
      pdf.text('Item Number', margin + 78, yPos);
      pdf.text('Bins', margin + 120, yPos);
      pdf.text('Qty', margin + 135, yPos);
      yPos += 5;

      pdf.setDrawColor(200, 200, 200);
      pdf.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 3;

      pdf.setFont(undefined, 'normal');
      const flatItems = invoiceDetails.flatMap((inv) =>
        inv.items.map((it) => ({ invoiceId: inv.id, ...it }))
      );
      if (flatItems.length === 0) {
        pdf.text('No loaded scans found', margin, yPos);
        yPos += 6;
      } else {
        flatItems.forEach((it) => {
          if (yPos > pageHeight - 20) {
            pdf.addPage();
            yPos = margin;
          }
          pdf.text(String(it.invoiceId).substring(0, 12), margin, yPos);
          pdf.text(String(it.customerItem).substring(0, 22), margin + 28, yPos);
          pdf.text(String(it.itemNumber).substring(0, 18), margin + 78, yPos);
          pdf.text(String(it.binsLoaded), margin + 120, yPos);
          pdf.text(String(it.qtyLoaded), margin + 135, yPos);
          yPos += 6;
        });
      }

      // Bin Details (Loaded Scans)
      const loadedScansDetailed: GatepassLoadedScanDetail[] =
        (gatepassDetails?.loadedScansDetailed && gatepassDetails.loadedScansDetailed.length > 0)
          ? gatepassDetails.loadedScansDetailed
          : [];

      yPos += 6;
      if (yPos > pageHeight - 70) {
        pdf.addPage();
        yPos = margin;
      }

      pdf.setFont(undefined, 'bold');
      pdf.setFontSize(10);
      pdf.text('Bin Details (Loaded Scans):', margin, yPos);
      yPos += 7;

      pdf.setFontSize(7);
      pdf.setFont(undefined, 'bold');
      pdf.text('Inv', margin, yPos);
      pdf.text('CustItem', margin + 16, yPos);
      pdf.text('ItemNo', margin + 54, yPos);
      pdf.text('CustBin', margin + 82, yPos);
      pdf.text('AutBin', margin + 102, yPos);
      pdf.text('Qty', margin + 122, yPos);
      pdf.text('Time', margin + 132, yPos);
      yPos += 5;

      pdf.setDrawColor(200, 200, 200);
      pdf.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 3;

      pdf.setFont(undefined, 'normal');
      const fmtTime = (iso: string | null) => {
        if (!iso) return 'N/A';
        const d = new Date(iso);
        return Number.isNaN(d.getTime()) ? 'N/A' : d.toLocaleString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      };

      if (loadedScansDetailed.length === 0) {
        pdf.text('No loaded bin scan details available', margin, yPos);
        yPos += 6;
      } else {
        const sorted = loadedScansDetailed.slice().sort((a, b) => {
          if (a.invoiceId !== b.invoiceId) return a.invoiceId.localeCompare(b.invoiceId);
          const ta = a.scannedAt ? new Date(a.scannedAt).getTime() : 0;
          const tb = b.scannedAt ? new Date(b.scannedAt).getTime() : 0;
          return tb - ta;
        });

        for (const s of sorted) {
          if (yPos > pageHeight - 15) {
            pdf.addPage();
            yPos = margin;
          }
          pdf.text(String(s.invoiceId).substring(0, 10), margin, yPos);
          pdf.text(String(s.customerItem || 'N/A').substring(0, 16), margin + 16, yPos);
          pdf.text(String(s.itemNumber || 'N/A').substring(0, 12), margin + 54, yPos);
          pdf.text(String(s.customerBinNumber || 'N/A').substring(0, 10), margin + 82, yPos);
          pdf.text(String(s.autolivBinNumber || 'N/A').substring(0, 10), margin + 102, yPos);
          pdf.text(String(s.binQuantity ?? 0), margin + 122, yPos);
          pdf.text(String(fmtTime(s.scannedAt)).substring(0, 18), margin + 132, yPos);
          yPos += 5;
        }
      }

      yPos = pageHeight - 20;
      pdf.setFontSize(8);
      pdf.setFont(undefined, 'italic');
      pdf.text('This gatepass is authorized for vehicle exit. Please verify all items before dispatch.', pageWidth / 2, yPos, { align: 'center' });
      yPos += 5;
      pdf.text(`Dispatch Date: ${dispatchDateStr} at ${dispatchTimeStr}`, pageWidth / 2, yPos, { align: 'center' });

      const fileName = `Gatepass_${gatepassNumber}_${vehicleNumber}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);
      
      toast.success("PDF downloaded successfully!");
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate PDF. Please try again.");
    }
  };

  const groupedLoadedBins = groupLoadedBins(loadedBarcodes);
  const groupedLoadedBinsByInvoiceId = new Map(groupedLoadedBins.map((g) => [g.invoiceId, g] as const));

  const renderInvoiceItemsTable = (invoiceId: string) => {
    const invoice = sharedInvoices.find((inv) => inv.id === invoiceId);
    const uniqueItems = getUniqueCustomerItems(invoice);

    if (!invoice || uniqueItems.length === 0) {
      return (
        <div className="text-center py-6 text-muted-foreground">
          <p className="text-sm font-medium">No items available</p>
          <p className="text-xs mt-1">This invoice has no item rows to display.</p>
        </div>
      );
    }

    return (
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[820px]">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2 font-semibold">Customer Item</th>
                <th className="text-left p-2 font-semibold">Item Number</th>
                <th className="text-left p-2 font-semibold">Part Description</th>
                <th className="text-left p-2 font-semibold">Quantity</th>
                <th className="text-left p-2 font-semibold">Customer Bin</th>
                <th className="text-left p-2 font-semibold">Cust Scanned Qty</th>
              </tr>
            </thead>
            <tbody>
              {uniqueItems.map((item, idx) => {
                const k = makeItemKey(invoiceId, item.customerItem, item.itemNumber);
                const expected = expectedByItemKey.get(k);
                const scanned = scannedByItemKey.get(k);

                const totalQty = Number(expected?.totalQty ?? item.quantity ?? 0) || 0;
                const expectedBins = Number(expected?.expectedBins ?? 0) || 0;
                const scannedBins = Number(scanned?.scannedBins ?? 0) || 0;
                const scannedQty = Number(scanned?.scannedQty ?? 0) || 0;

                const binProgressPct =
                  expectedBins > 0 ? Math.min(100, (scannedBins / expectedBins) * 100) : 0;

                const isComplete =
                  (expectedBins > 0 && scannedBins >= expectedBins) ||
                  (expectedBins === 0 && totalQty > 0 && scannedQty >= totalQty);

                const isInProgress = !isComplete && (scannedBins > 0 || scannedQty > 0);
                const isFocused = activeFocusItemKey !== null && activeFocusItemKey === k;
                const showFocusedInProgress = isInProgress && isFocused;

                return (
                  <tr
                    key={`${k}::${idx}`}
                    className={`border-t ${
                      isComplete
                        ? 'bg-green-100 dark:bg-green-950/40'
                        : showFocusedInProgress
                          ? 'bg-yellow-100 dark:bg-yellow-950/40'
                          : ''
                    }`}
                  >
                    <td className="p-2 font-medium">{item.customerItem}</td>
                    <td className="p-2">{item.itemNumber}</td>
                    <td className="p-2 text-muted-foreground">{item.partDescription || 'N/A'}</td>
                    <td className="p-2 font-semibold">{totalQty}</td>
                    <td className="p-2">
                      <div className="space-y-1">
                        <div className="font-semibold">
                          {expectedBins > 0 ? `${scannedBins}/${expectedBins}` : `${scannedBins}/—`}
                        </div>
                        {expectedBins > 0 && <Progress value={binProgressPct} className="h-1.5" />}
                      </div>
                    </td>
                    <td className="p-2 font-semibold">
                      <span
                        className={
                          scannedQty > 0
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-muted-foreground'
                        }
                      >
                        {scannedQty} / {totalQty}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <PageShell
      title="Loading & Dispatch"
      subtitle="Manage vehicle loading and generate gatepass"
      backHref="/home"
      backIcon={<ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />}
      actions={
        <Button
          variant="outline"
          onClick={() => setShowDispatchLogs(true)}
          className="flex items-center gap-2 w-full sm:w-auto justify-center bg-card/60"
        >
          <Truck className="h-4 w-4" />
          <span>Dispatch Logs</span>
          {getDispatchLogs().length > 0 && (
            <Badge variant="secondary" className="ml-1">
              {getDispatchLogs().length}
            </Badge>
          )}
        </Button>
      }
      mainClassName="relative"
      maxWidthClassName="max-w-7xl"
    >
      <ScanIssueDialog
        open={scanIssueOpen}
        issue={scanIssue}
        onOpenChange={(open) => {
          setScanIssueOpen(open);
          if (!open) setScanIssue(null);
        }}
      />
        {!scheduleData && (
          <StatusBanner variant="warning" className="mb-4">
            <p className="font-medium">
              ⚠️ Schedule not uploaded. Dispatch can still continue, but Doc Audit delivery time/unloading location options will be limited until schedule is uploaded.
            </p>
          </StatusBanner>
        )}

        {getScheduledDispatchableInvoices().length === 0 && (
          <StatusBanner variant="info" className="mb-4">
            <p className="text-sm font-semibold mb-2">📋 No invoices available for dispatch</p>
            <p className="text-xs text-muted-foreground">
              {sharedInvoices.filter(inv => inv.dispatchedBy).length > 0 
                ? `✅ All scheduled invoices have been dispatched. Upload new data or complete pending audits.`
                : `Please complete document audit for invoices before dispatch.`
              }
            </p>
          </StatusBanner>
        )}
        
        {getScheduledDispatchableInvoices().length > 0 && (
          <StatusBanner variant="success" className="mb-4">
            <p className="text-sm font-semibold mb-2">✅ Dispatch available</p>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>• Showing {getScheduledDispatchableInvoices().length} audited invoice(s) ready for dispatch</p>
              {scheduleData && <p>• Schedule uploaded: {scheduleData.uploadedAt.toLocaleString()}</p>}
              <p>• Current user: <strong>{currentUser}</strong></p>
            </div>
          </StatusBanner>
        )}
        
        {!gatepassGenerated ? (
          <div className="space-y-6">
            {/* Vehicle Information */}
            <Card className="bg-card/70 backdrop-blur border-border/60 shadow-md">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Truck className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-lg">Step 1: Vehicle details</CardTitle>
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
            <Card className="bg-card/70 backdrop-blur border-border/60 shadow-md">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <QrCode className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-lg">Step 2: Select invoices</CardTitle>
                    <CardDescription>Scan invoice QR codes or manually select invoices to load onto the vehicle</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* PRIMARY METHOD: QR Scanner Button - Large and Prominent */}
                  <div className="relative">
                    <Button
                      onClick={() => setShowInvoiceQRScanner(true)}
                      disabled={getScheduledDispatchableInvoices().length === 0}
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
                  {getScheduledDispatchableInvoices().length > 0 && (
                    <StatusBanner variant="info" className="text-xs">
                      <p>
                        📅 {getScheduledDispatchableInvoices().filter(inv => inv.id !== "No Data").length} scheduled & audited invoice(s) available for dispatch
                        {selectedInvoices.length > 0 && (
                          <span className="block mt-1 font-semibold">
                            ✅ {selectedInvoices.length} invoice(s) selected for loading
                          </span>
                        )}
                      </p>
                    </StatusBanner>
                  )}

                  {/* SECONDARY METHOD: Dropdown Selection */}
                  <div className="space-y-2">
                    <Label htmlFor="invoice-select">Manual Selection - Dropdown:</Label>
                    <div className="flex gap-2">
                      <Select 
                        value={selectInvoiceValue}
                        onValueChange={(value) => {
                          setSelectInvoiceValue("");
                          
                          if (value && value !== "no-invoices" && value.trim() !== "") {
                            const selectedInvoice = sharedInvoices.find(inv => inv.id === value);
                            if (selectedInvoice) {
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
                              
                              const currentCustomer = selectedInvoices.length > 0 
                                ? sharedInvoices.find(inv => inv.id === selectedInvoices[0])?.customer 
                                : null;
                              
                              if (!currentCustomer || currentCustomer === selectedInvoice.customer) {
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
                            <div className="p-4 text-center text-sm text-muted-foreground">
                              No audited invoices available for dispatch
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Selected Invoices List */}
                  {selectedInvoices.length > 0 && (
                    <StatusBanner variant="info">
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
                              setSelectedInvoicesExpandedId(null);
                            }}
                            className="h-8 text-xs"
                          >
                            Clear All
                          </Button>
                        )}
                      </div>
                      <Accordion
                        type="single"
                        collapsible
                        value={selectedInvoicesExpandedId || undefined}
                        onValueChange={(v) => {
                          const next = v || null;
                          setSelectedInvoicesExpandedId(next);
                          if (next) setActiveInvoiceId(next);
                        }}
                        className="w-full"
                      >
                        {selectedInvoices.map((invoiceId, index) => {
                          const invoice = sharedInvoices.find(inv => inv.id === invoiceId);
                          if (!invoice) return null;

                          return (
                            <AccordionItem
                              key={invoiceId}
                              value={invoiceId}
                              className={`border border-border rounded-lg mb-2 overflow-hidden ${
                                activeInvoiceId === invoiceId ? 'ring-2 ring-primary/30' : ''
                              }`}
                            >
                              <AccordionTrigger
                                className="px-3 py-3 hover:no-underline bg-white dark:bg-gray-900"
                                onClick={() => setActiveInvoiceId(invoiceId)}
                              >
                                <div className="flex flex-1 items-start justify-between gap-3 min-w-0">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                      <Badge variant="outline" className="text-xs">#{index + 1}</Badge>
                                      <p className="font-semibold text-sm truncate">{invoice.id}</p>
                                      <p className="text-xs text-muted-foreground truncate">{invoice.customer}</p>
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
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setSelectedInvoices(prev => prev.filter(id => id !== invoiceId));
                                      setLoadedBarcodes(prev => prev.filter(b => b.invoiceId !== invoiceId));
                                      setSelectInvoiceValue("");
                                      if (selectedInvoicesExpandedId === invoiceId) {
                                        setSelectedInvoicesExpandedId(null);
                                      }
                                    }}
                                    className="h-8 w-8 p-0 shrink-0"
                                    title="Remove invoice"
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              </AccordionTrigger>

                              <AccordionContent className="px-3 pb-3 pt-0 bg-white dark:bg-gray-900">
                                <div className="pt-2">
                                  {renderInvoiceItemsTable(invoiceId)}
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          );
                        })}
                      </Accordion>

                      {/* Active invoice details (also shown separately, per requirement) */}
                      {activeInvoiceId && (
                        <div className="mt-4 p-3 bg-white dark:bg-gray-900 border border-border rounded-lg">
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-sm font-semibold">Selected Invoice Details</p>
                            <Badge variant="secondary" className="text-xs">
                              {activeInvoiceId}
                            </Badge>
                          </div>
                          {renderInvoiceItemsTable(activeInvoiceId)}
                        </div>
                      )}
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
                    </StatusBanner>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Barcode Scanning for Loading */}
            {selectedInvoices.length > 0 && (
              <Card className="bg-card/70 backdrop-blur border-border/60 shadow-md">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <ScanBarcode className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-lg">Step 3: Scan items for loading</CardTitle>
                      <CardDescription>Scan customer barcode for each item to load onto the vehicle</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {dispatchScanAlert && (
                      <div className="p-3 border-2 border-yellow-500/40 bg-yellow-50/60 dark:bg-yellow-950/20 rounded-lg text-sm">
                        <p className="font-semibold text-yellow-800 dark:text-yellow-200">Scan required</p>
                        <p className="text-xs text-yellow-800/90 dark:text-yellow-200/90 mt-1">
                          {dispatchScanAlert}
                        </p>
                      </div>
                    )}
                    {/* Progress Indicator */}
                    <div className="p-4 bg-muted rounded-lg">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="font-medium">Loading Progress</span>
                        <span className="text-muted-foreground">
                          {loadedBarcodes.length} of {getExpectedBins()} bins loaded
                        </span>
                      </div>
                      <Progress 
                        value={getExpectedBins() > 0 ? (loadedBarcodes.length / getExpectedBins()) * 100 : 0} 
                        className="h-2"
                      />
                    </div>

                    {/* Scanning Input */}
                    <div className="flex justify-center">
                      <div className="w-full max-w-lg">
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

                          <div
                            className={`w-full h-14 rounded-md border-2 flex items-center justify-center text-sm font-medium ${
                              showInvoiceQRScanner
                                ? "border-gray-300 bg-muted text-muted-foreground"
                                : "border-primary/30 bg-primary/5 text-primary"
                            }`}
                          >
                            {showInvoiceQRScanner
                              ? "Finish invoice selection to start scanning"
                              : "Scanner active — scan Customer label now"}
                          </div>
                          <p className="text-[11px] text-muted-foreground text-center">
                            No button needed — just scan using the hardware scanner.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Status and Clear Button */}
                    {dispatchCustomerScan && (
                      <StatusBanner variant="success" className="flex flex-col sm:flex-row items-center justify-between gap-3">
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
                            setDispatchScanAlert(null);
                          }}
                          className="h-9 text-sm"
                        >
                          Clear Scan
                        </Button>
                      </StatusBanner>
                    )}

                    {/* Loaded Items List */}
                    {loadedBarcodes.length > 0 && (
                      <div className="border rounded-lg p-3 sm:p-4 max-h-96 overflow-y-auto">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs sm:text-sm font-medium">Loaded Bins</p>
                          <Badge variant="secondary" className="text-xs">
                            {loadedBarcodes.length}
                          </Badge>
                        </div>

                        <Accordion type="multiple" className="w-full">
                          {selectedInvoices.map((invoiceId) => {
                            const group = groupedLoadedBinsByInvoiceId.get(invoiceId);
                            if (!group) return null;

                            const invoice = sharedInvoices.find((inv) => inv.id === invoiceId);
                            const customer = invoice?.customer || "Unknown";

                            return (
                              <AccordionItem
                                key={invoiceId}
                                value={`dispatch-invoice-${invoiceId}`}
                                className="border border-b-0 rounded-lg mb-3 overflow-hidden"
                              >
                                <AccordionTrigger className="px-3 py-3 hover:no-underline bg-muted/40">
                                  <div className="flex flex-1 items-center justify-between gap-3 min-w-0">
                                    <div className="min-w-0">
                                      <p className="font-semibold text-sm truncate">{invoiceId}</p>
                                      <p className="text-xs text-muted-foreground truncate">{customer}</p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <Badge variant="secondary" className="text-xs">
                                        {group.scans.length} bins
                                      </Badge>
                                      <Badge variant="outline" className="text-xs">
                                        Qty {group.totalQty}
                                      </Badge>
                                    </div>
                                  </div>
                                </AccordionTrigger>

                                <AccordionContent className="px-3 pt-3 pb-3">
                                  <Accordion type="multiple" className="w-full">
                                    {group.items.map((item) => (
                                      <AccordionItem
                                        key={item.key}
                                        value={`dispatch-item-${invoiceId}-${item.key}`}
                                        className="border border-b-0 rounded-md mb-2 overflow-hidden"
                                      >
                                        <AccordionTrigger className="px-3 py-2 hover:no-underline bg-background">
                                          <div className="flex flex-1 items-start justify-between gap-3 min-w-0">
                                            <div className="min-w-0">
                                              <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-sm font-semibold truncate">
                                                  {item.customerItem}
                                                </span>
                                                <span className="text-xs text-muted-foreground">•</span>
                                                <span className="text-xs font-mono text-muted-foreground truncate">
                                                  {item.itemNumber}
                                                </span>
                                              </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                              <Badge variant="secondary" className="text-xs">
                                                {item.scans.length} bins
                                              </Badge>
                                              <Badge variant="outline" className="text-xs">
                                                Qty {item.totalQty}
                                              </Badge>
                                            </div>
                                          </div>
                                        </AccordionTrigger>

                                        <AccordionContent className="px-3 pt-0 pb-3">
                                          <div className="overflow-x-auto">
                                            <table className="w-full text-xs min-w-[620px]">
                                              <thead className="bg-muted/40">
                                                <tr>
                                                  <th className="text-left p-2 font-semibold">Bin Number</th>
                                                  <th className="text-left p-2 font-semibold">Bin Qty</th>
                                                  <th className="text-left p-2 font-semibold">Time</th>
                                                  <th className="text-right p-2 font-semibold">Actions</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {item.scans.map(({ index, scan }) => {
                                                  const time = scan.scannedAt
                                                    ? new Date(scan.scannedAt).toLocaleTimeString("en-US", {
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                      })
                                                    : "—";

                                                  return (
                                                    <tr
                                                      key={scan.id || `${scan.invoiceId}-${scan.customerBarcode}-${index}`}
                                                      className="border-t hover:bg-muted/30"
                                                    >
                                                      <td className="p-2 font-mono">
                                                        {scan.binNumber ? String(scan.binNumber) : "—"}
                                                      </td>
                                                      <td className="p-2 font-semibold">
                                                        {Number(scan.quantity ?? 0) || 0}
                                                      </td>
                                                      <td className="p-2 text-muted-foreground">{time}</td>
                                                      <td className="p-2 text-right">
                                                        <Button
                                                          variant="ghost"
                                                          size="sm"
                                                          onClick={() => handleDeleteBin(index, scan.id, scan.invoiceId)}
                                                          className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                          title="Delete this bin scan"
                                                        >
                                                          <X className="h-3 w-3" />
                                                        </Button>
                                                      </td>
                                                    </tr>
                                                  );
                                                })}
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
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Summary */}
            {selectedInvoices.length > 0 && loadedBarcodes.length === getExpectedBins() && (
              <Card className="bg-card/70 backdrop-blur border-border/60 shadow-md">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <QrCode className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-lg">Step 4: Gatepass</CardTitle>
                      <CardDescription>Review totals and generate the gatepass for vehicle exit</CardDescription>
                    </div>
                  </div>
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
                      <span className="text-muted-foreground">Total Bins</span>
                      <span className="font-semibold">
                        {getExpectedBins()}
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
                    className="w-full mt-4 h-12 text-base font-semibold shadow-sm"
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
            <Button
              variant="ghost"
              onClick={() => {
                // Restore the invoice IDs from gatepass details before clearing
                const invoiceIdsToRestore = gatepassDetails?.invoiceIds || selectedInvoices;
                if (invoiceIdsToRestore.length > 0) {
                  setIsRestoringFromGatepass(true);
                  setSelectedInvoices(invoiceIdsToRestore);
                  // Set the first invoice as active
                  setActiveInvoiceId(invoiceIdsToRestore[0]);
                }
                setGatepassGenerated(false);
                setGatepassNumber("");
                setGatepassDetails(null);
              }}
              className="flex items-center gap-2 mb-4 text-sm sm:text-base"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back to Loading</span>
              <span className="sm:hidden">Back</span>
            </Button>
            
            <Card className="bg-card/70 backdrop-blur border-border/60 shadow-md">
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
                <div className="border border-border/60 rounded-xl p-6 space-y-4 bg-card/40">
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
                      <p className="font-semibold">{gatepassSummary.dispatchDateTimeText}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Authorized By</p>
                      <p className="font-semibold">{currentUser}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Total Invoices</p>
                      <p className="font-semibold">{gatepassSummary.grandTotals.invoiceCount}</p>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <p className="text-sm font-semibold mb-2">Invoices:</p>
                    <div className="space-y-1">
                      {gatepassSummary.invoices.map((inv) => {
                        const invoice = sharedInvoices.find((i) => i.id === inv.id);
                        return (
                          <div key={inv.id} className="border rounded-md p-3 text-sm">
                            <div className="flex justify-between gap-2">
                              <span className="font-semibold">{inv.id}</span>
                              <span className="text-muted-foreground">{invoice?.customer || '—'}</span>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                              <div>
                                <span className="font-semibold text-foreground">Delivery Date:</span>{' '}
                                {inv.deliveryDate || 'N/A'}
                              </div>
                              <div>
                                <span className="font-semibold text-foreground">Delivery Time:</span>{' '}
                                {inv.deliveryTime || 'N/A'}
                              </div>
                              <div className="col-span-2">
                                <span className="font-semibold text-foreground">Unloading Loc:</span>{' '}
                                {inv.unloadingLoc || 'N/A'}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Item Totals (no bin list) */}
                  <div className="border-t pt-4">
                    <p className="text-sm font-semibold mb-2">Item Summary (Totals Only):</p>
                    <div className="space-y-3">
                      {gatepassSummary.invoices.map((inv) => (
                        <div key={`${inv.id}::items`} className="border rounded-lg overflow-hidden">
                          <div className="bg-muted/50 px-3 py-2 flex items-center justify-between text-xs">
                            <span className="font-semibold">Invoice {inv.id}</span>
                            <span className="text-muted-foreground">
                              Bins: <span className="font-semibold text-foreground">{inv.totals.binsLoaded}</span>{' '}
                              | Qty: <span className="font-semibold text-foreground">{inv.totals.qtyLoaded}</span>
                            </span>
                          </div>
                          {inv.items.length === 0 ? (
                            <div className="p-3 text-xs text-muted-foreground">No loaded item scans found for this invoice.</div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs min-w-[520px]">
                                <thead className="bg-background">
                                  <tr className="border-b">
                                    <th className="text-left p-2 font-semibold">Customer Item</th>
                                    <th className="text-left p-2 font-semibold">Item Number</th>
                                    <th className="text-right p-2 font-semibold">Bins Loaded</th>
                                    <th className="text-right p-2 font-semibold">Qty Loaded</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {inv.items.map((it) => (
                                    <tr key={`${inv.id}::${it.customerItem}::${it.itemNumber}`} className="border-b last:border-b-0">
                                      <td className="p-2 font-medium">{it.customerItem}</td>
                                      <td className="p-2">{it.itemNumber}</td>
                                      <td className="p-2 text-right font-semibold">{it.binsLoaded}</td>
                                      <td className="p-2 text-right font-semibold">{it.qtyLoaded}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* QR Code */}
                  <div className="flex flex-col items-center pt-4 border-t">
                    <p className="text-sm font-semibold mb-3 text-muted-foreground">Scan QR Code for Details</p>
                    <div className="p-4 bg-white rounded-lg border-2 border-border shadow-sm">
                      {(() => {
                        try {
                          // Generate QR data - this function will use gatepassDetails if available
                          const qrValue = generateGatepassQRData();
                          
                          // NOTE: QR may be compressed (DH1.*), so don't JSON.parse here.
                          console.log('🔐 Final QR value length:', qrValue.length);
                          
                          // Limit size to prevent errors - if too long, show minimal version
                          if (qrValue.length > 4000) {
                            console.warn('⚠️ QR data too long, using minimal version');
                            const minimal = JSON.stringify({
                              gp: gatepassNumber,
                              v: vehicleNumber,
                              inv: selectedInvoices
                            });
                            return (
                              <QRCodeSVG
                                value={minimal}
                                size={300}
                                level="H"
                                includeMargin={true}
                                marginSize={4}
                                bgColor="#FFFFFF"
                                fgColor="#000000"
                              />
                            );
                          }
                          return (
                            <QRCodeSVG
                              value={qrValue}
                              size={300}
                              level="H"
                              includeMargin={true}
                              marginSize={4}
                              bgColor="#FFFFFF"
                              fgColor="#000000"
                            />
                          );
                        } catch (error) {
                          console.error('❌ QR code generation error:', error);
                          // Fallback to minimal QR code
                          const minimal = JSON.stringify({
                            gp: gatepassNumber || 'N/A',
                            v: vehicleNumber || 'N/A'
                          });
                          return (
                            <QRCodeSVG
                              value={minimal}
                              size={300}
                              level="H"
                              includeMargin={true}
                              marginSize={4}
                              bgColor="#FFFFFF"
                              fgColor="#000000"
                            />
                          );
                        }
                      })()}
                    </div>
                    <div className="mt-4 p-3 bg-muted rounded-lg w-full max-w-md">
                      <p className="text-xs font-semibold text-muted-foreground mb-2">QR Code Contains:</p>
                      <div className="text-xs space-y-1 text-foreground">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total Invoices:</span>
                          <span className="font-medium">{gatepassSummary.grandTotals.invoiceCount}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total Bins:</span>
                          <span className="font-medium">{gatepassSummary.grandTotals.binsLoaded}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total Quantity:</span>
                          <span className="font-medium">{gatepassSummary.grandTotals.qtyLoaded}</span>
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
                    onClick={() => navigate("/home")}
                  >
                    Return to Home
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
                      setDispatchScanAlert(null);
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
      {/* end PageShell main */}

      {/* Invoice QR Scanner Dialog */}
      <Dialog open={showInvoiceQRScanner} onOpenChange={setShowInvoiceQRScanner}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanBarcode className="h-5 w-5" />
              Scan Invoice QR Codes
            </DialogTitle>
            <DialogDescription>
              Camera stays open for multiple scans - each scan adds a random audited invoice to your selection
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
                  {getScheduledDispatchableInvoices().filter(inv => inv.id !== "No Data").length - selectedInvoices.filter(id => getScheduledDispatchableInvoices().some(inv => inv.id === id)).length} Remaining
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
              <StatusBanner variant="info" className="max-h-48 overflow-y-auto">
                <p className="text-xs font-semibold mb-2">Scanned invoices</p>
                <div className="space-y-1">
                  {selectedInvoices.map((invId, index) => {
                    const invoice = sharedInvoices.find(inv => inv.id === invId);
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
              </StatusBanner>
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
                  <li>Only scheduled & audited invoices are eligible</li>
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
                    toast.success(`Ready to load ${selectedInvoices.length} invoice(s)`);
                  }}
                  className="flex-1 h-12"
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Done - Start Loading
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dispatch Logs Dialog */}
      <LogsDialog
        isOpen={showDispatchLogs}
        onClose={() => setShowDispatchLogs(false)}
        title="Dispatch Logs"
        logs={getDispatchLogs()}
        type="dispatch"
      />
    </PageShell>
  );
};

export default Dispatch;
