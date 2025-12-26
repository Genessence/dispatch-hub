import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ArrowLeft, ScanBarcode, CheckCircle2, XCircle, AlertTriangle, Radio, Clock, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { BarcodeScanButton, type BarcodeData } from "@/components/BarcodeScanner";
import { useSession, type InvoiceData } from "@/contexts/SessionContext";

const DocAudit = () => {
  const { 
    sharedInvoices, 
    scheduleData, 
    getScheduleForCustomer,
    updateInvoiceAudit,
    currentUser 
  } = useSession();
  
  // Selection states
  const [selectedCustomerCode, setSelectedCustomerCode] = useState<string>("");
  const [selectedInvoice, setSelectedInvoice] = useState<string>("");
  const [invoiceSelections, setInvoiceSelections] = useState<Record<string, {
    shift?: 'A' | 'B';
    plant?: string;
  }>>({});
  
  // Audit states
  const [customerScan, setCustomerScan] = useState<BarcodeData | null>(null);
  const [autolivScan, setAutolivScan] = useState<BarcodeData | null>(null);
  const [scannerConnected, setScannerConnected] = useState(true);
  const [scannedBins, setScannedBins] = useState<Array<{
    binNo: string;
    partCode: string;
    qty: number;
    status: string;
    scannedBy: string;
    time: string;
  }>>([]);

  // Get invoices that have schedule data - inline logic to ensure proper reactivity
  const invoicesWithSchedule = useMemo(() => {
    if (!scheduleData || !sharedInvoices.length) return [];
    
    // Get scheduled customer codes from schedule data
    const scheduledCustomerCodes = new Set(
      scheduleData.items.map(item => String(item.customerCode))
    );
    
    // Filter invoices that match scheduled customer codes and are not audited
    const matchingInvoices = sharedInvoices.filter(
      inv => inv.billTo && scheduledCustomerCodes.has(String(inv.billTo)) && !inv.auditComplete
    );
    
    console.log('[DocAudit] invoicesWithSchedule calculated:', {
      scheduleDataExists: !!scheduleData,
      scheduleItemsCount: scheduleData?.items.length || 0,
      sharedInvoicesCount: sharedInvoices.length,
      scheduledCustomerCodes: Array.from(scheduledCustomerCodes),
      matchingInvoicesCount: matchingInvoices.length,
      matchingInvoiceIds: matchingInvoices.map(inv => inv.id)
    });
    
    return matchingInvoices;
  }, [sharedInvoices, scheduleData]);

  // Get unique customer codes from invoices with schedule
  const availableCustomerCodes = useMemo(() => {
    const codes = new Set<string>();
    invoicesWithSchedule.forEach(inv => {
      if (inv.billTo) codes.add(inv.billTo);
    });
    const sortedCodes = Array.from(codes).sort();
    
    console.log('[DocAudit] availableCustomerCodes calculated:', {
      invoicesWithScheduleCount: invoicesWithSchedule.length,
      customerCodes: sortedCodes
    });
    
    return sortedCodes;
  }, [invoicesWithSchedule]);

  // Get invoices for selected customer code
  const invoicesForCustomer = useMemo(() => {
    if (!selectedCustomerCode) return [];
    return invoicesWithSchedule.filter(inv => inv.billTo === selectedCustomerCode);
  }, [selectedCustomerCode, invoicesWithSchedule]);

  // Get schedule items for selected customer to extract default shift and delivery date
  const scheduleItemsForCustomer = useMemo(() => {
    if (!selectedCustomerCode || !scheduleData) return [];
    const items = scheduleData.items.filter(
      item => String(item.customerCode) === String(selectedCustomerCode)
    );
    
    console.log('[DocAudit] scheduleItemsForCustomer calculated:', {
      selectedCustomerCode,
      itemsCount: items.length,
      items: items.slice(0, 3) // Log first 3 items
    });
    
    return items;
  }, [selectedCustomerCode, scheduleData]);

  // Get unique plants from invoices for the selected customer
  const availablePlants = useMemo(() => {
    const plants = new Set<string>();
    invoicesForCustomer.forEach(inv => {
      if (inv.plant) plants.add(inv.plant);
    });
    // Also check schedule items for plant info
    scheduleItemsForCustomer.forEach(item => {
      if (item.plant) plants.add(item.plant);
    });
    return Array.from(plants).sort();
  }, [invoicesForCustomer, scheduleItemsForCustomer]);

  // Get default shift from schedule (most common shift in schedule items)
  const getDefaultShift = (invoice: InvoiceData): 'A' | 'B' | undefined => {
    if (scheduleItemsForCustomer.length === 0) return invoice.shift;
    
    const shifts = scheduleItemsForCustomer
      .map(item => item.deliveryTime ? timeToShift(item.deliveryTime) : undefined)
      .filter((s): s is 'A' | 'B' => s !== undefined);
    
    if (shifts.length === 0) return invoice.shift;
    
    // Count occurrences
    const shiftCounts = { A: 0, B: 0 };
    shifts.forEach(s => shiftCounts[s]++);
    
    return shiftCounts.A >= shiftCounts.B ? 'A' : 'B';
  };

  // Helper to convert time string to shift
  const timeToShift = (timeStr: string): 'A' | 'B' | undefined => {
    if (!timeStr) return undefined;
    const timeMatch = timeStr.toString().match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!timeMatch) return undefined;
    
    let hours = parseInt(timeMatch[1]);
    const ampm = timeMatch[3]?.toUpperCase();
    
    if (ampm === 'PM' && hours !== 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    
    if (hours >= 8 && hours < 20) return 'A';
    return 'B';
  };

  const currentInvoice = invoicesForCustomer.find(inv => inv.id === selectedInvoice);
  const currentSelections = invoiceSelections[selectedInvoice] || {};
  const progress = currentInvoice ? (currentInvoice.scannedBins / currentInvoice.expectedBins) * 100 : 0;

  // Debug logging on mount and when data changes
  useEffect(() => {
    console.log('[DocAudit] Component rendered/updated:', {
      sharedInvoicesCount: sharedInvoices.length,
      scheduleDataExists: !!scheduleData,
      scheduleItemsCount: scheduleData?.items.length || 0,
      selectedCustomerCode,
      selectedInvoice,
      availableCustomerCodesCount: availableCustomerCodes.length,
      invoicesWithScheduleCount: invoicesWithSchedule.length
    });
  }, [sharedInvoices.length, scheduleData, selectedCustomerCode, selectedInvoice, availableCustomerCodes.length, invoicesWithSchedule.length]);

  // Initialize default selections when customer code is selected
  useEffect(() => {
    if (selectedCustomerCode && invoicesForCustomer.length > 0 && availablePlants.length >= 0) {
      const newSelections: Record<string, { shift?: 'A' | 'B'; plant?: string }> = {};
      invoicesForCustomer.forEach(invoice => {
        const defaultShift = getDefaultShift(invoice);
        const defaultPlant = invoice.plant || availablePlants[0];
        if (defaultShift || defaultPlant) {
          newSelections[invoice.id] = {
            shift: defaultShift,
            plant: defaultPlant
          };
        }
      });
      if (Object.keys(newSelections).length > 0) {
        setInvoiceSelections(prev => ({ ...prev, ...newSelections }));
      }
    }
  }, [selectedCustomerCode, invoicesForCustomer, availablePlants, scheduleItemsForCustomer]);

  // Handle customer code selection
  const handleCustomerCodeSelect = (customerCode: string) => {
    setSelectedCustomerCode(customerCode);
    setSelectedInvoice(""); // Reset invoice selection
    setInvoiceSelections({}); // Reset all selections
  };

  // Handle shift selection for an invoice
  const handleShiftSelect = (invoiceId: string, shift: 'A' | 'B') => {
    setInvoiceSelections(prev => ({
      ...prev,
      [invoiceId]: {
        ...prev[invoiceId],
        shift
      }
    }));
  };

  // Handle plant selection for an invoice
  const handlePlantSelect = (invoiceId: string, plant: string) => {
    setInvoiceSelections(prev => ({
      ...prev,
      [invoiceId]: {
        ...prev[invoiceId],
        plant
      }
    }));
  };


  const handleScan = (type: 'customer' | 'autoliv') => {
    const scanValue = type === 'customer' ? customerScan : autolivScan;
    if (!scanValue) {
      toast.error("Please enter a barcode value");
      return;
    }

    // Simulate scan validation
    const isValid = Math.random() > 0.3;
    if (isValid) {
      toast.success(`${type === 'customer' ? 'Customer' : 'Autoliv'} label scanned successfully!`);
      
      // Add to scanned bins
      const newBin = {
        binNo: scanValue.binNumber || 'N/A',
        partCode: scanValue.partCode || 'N/A',
        qty: parseInt(scanValue.quantity || '0'),
        status: 'matched',
        scannedBy: currentUser,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      };
      setScannedBins(prev => [...prev, newBin]);
      
      // Update invoice scanned bins count
      if (currentInvoice) {
        updateInvoiceAudit(currentInvoice.id, {
          scannedBins: currentInvoice.scannedBins + 1
        }, currentUser);
      }
      
      if (type === 'customer') setCustomerScan(null);
      else setAutolivScan(null);
    } else {
      toast.error("⚠️ Barcode Mismatch Detected!", {
        description: "Part code or quantity doesn't match.",
        duration: 5000,
      });
      
      // Automatically show approval message
      setTimeout(() => {
        toast.info("📨 Message sent to senior for approval", {
          description: "Approval request has been automatically sent to the supervisor.",
          duration: 5000,
        });
      }, 500);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* HUGE VISIBLE TEST BANNER - If you see this, new code is loaded! */}
      <div className="bg-red-600 text-white p-4 text-center font-bold text-2xl border-b-4 border-yellow-400 z-50">
        🚨 NEW CODE VERSION LOADED - If you see this red banner, changes are working! 🚨
        <div className="text-sm mt-2">
          selectedInvoice: {selectedInvoice || 'none'} | selectedCustomerCode: {selectedCustomerCode || 'none'}
        </div>
      </div>
      
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 sm:gap-4">
              <Link to="/dashboard">
                <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-10 sm:w-10">
                  <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-foreground">Document Audit</h1>
                <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">Scan and validate BIN labels</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <Badge variant={scannerConnected ? "default" : "destructive"} className="text-xs">
                <Radio className={`h-3 w-3 mr-1 sm:mr-2 ${scannerConnected ? 'animate-pulse' : ''}`} />
                Scanner {scannerConnected ? 'Connected' : 'Disconnected'}
              </Badge>
              <div className="text-right hidden md:block">
                <p className="text-sm font-medium">John Operator</p>
                <p className="text-xs text-muted-foreground">Operator</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 py-4 sm:py-8 pb-24 sm:pb-8">
        {/* VISIBLE TEST: This should always show */}
        <div className="mb-4 p-4 bg-blue-500 text-white rounded-lg">
          <p className="font-bold text-lg">🔵 TEST: If you see this blue box, the new code is loaded!</p>
          <p className="text-sm">selectedInvoice: {selectedInvoice || 'none'}</p>
          <p className="text-sm">selectedCustomerCode: {selectedCustomerCode || 'none'}</p>
        </div>
        
        {/* Step 1: Customer Code Selection - ALWAYS show this first when no invoice is selected */}
        {!selectedInvoice && (
          <>
            {/* Customer Code Selection Card - ALWAYS show when no customer code is selected */}
            {!selectedCustomerCode && (
              <Card className="mb-6 border-4 border-green-500" key="customer-code-selection">
                <CardHeader>
                  <CardTitle className="text-2xl text-green-600">✅ Step 1: Select Customer Code</CardTitle>
                  <CardDescription>
                    Choose a customer code to view invoices for document audit
                    {!scheduleData && (
                      <span className="block mt-2 text-destructive text-sm font-medium">
                        ⚠️ No schedule data found. Please upload schedule file first.
                      </span>
                    )}
                    {scheduleData && availableCustomerCodes.length === 0 && (
                      <span className="block mt-2 text-destructive text-sm font-medium">
                        ⚠️ No invoices found with matching customer codes in schedule.
                      </span>
                    )}
                  </CardDescription>
          </CardHeader>
                <CardContent>
                  {/* Debug info - remove in production */}
                  <div className="mb-4 p-3 bg-muted rounded text-xs">
                    <p className="font-semibold mb-1">Debug Info:</p>
                    <p>Schedule Data: {scheduleData ? `Yes (${scheduleData.items.length} items)` : 'No'}</p>
                    <p>Total Invoices: {sharedInvoices.length}</p>
                    <p>Invoices with Schedule: {invoicesWithSchedule.length}</p>
                    <p>Available Customer Codes: {availableCustomerCodes.length}</p>
                    {sharedInvoices.length > 0 && (
                      <p className="mt-1">
                        Invoice BillTo Codes: {[...new Set(sharedInvoices.map(inv => inv.billTo).filter(Boolean))].join(', ') || 'None'}
                      </p>
                    )}
                    {scheduleData && scheduleData.items.length > 0 && (
                      <p className="mt-1">
                        Schedule Customer Codes: {[...new Set(scheduleData.items.map(item => item.customerCode))].join(', ')}
                      </p>
                    )}
                  </div>
                  
                  {availableCustomerCodes.length === 0 ? (
                    <div className="text-center py-8">
                      <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground mb-2 font-medium">
                        {!scheduleData 
                          ? "No schedule data available" 
                          : invoicesWithSchedule.length === 0
                          ? "No invoices with schedule data available"
                          : "No matching customer codes found"}
                      </p>
                      <p className="text-sm text-muted-foreground mb-4">
                        {!scheduleData
                          ? "Please upload schedule file first, then upload invoices with matching customer codes."
                          : sharedInvoices.length === 0
                          ? "Please upload invoice file first."
                          : "Please upload invoices with customer codes (Bill To field) that match the schedule data."}
                      </p>
                      {!scheduleData && (
                        <Link to="/upload">
                          <Button variant="outline">
                            Go to Upload Page
                          </Button>
                        </Link>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <Label className="text-sm font-medium">Customer Code</Label>
                      <Select value={selectedCustomerCode} onValueChange={handleCustomerCodeSelect}>
                        <SelectTrigger className="h-12 text-base">
                          <SelectValue placeholder="Select a customer code" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableCustomerCodes.map(code => {
                            const invoiceCount = invoicesWithSchedule.filter(inv => inv.billTo === code).length;
                            return (
                              <SelectItem key={code} value={code}>
                                {code} ({invoiceCount} invoice{invoiceCount !== 1 ? 's' : ''})
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Step 2: Invoice Selection with Shift & Plant - Show when customer code is selected but invoice is not */}
        {!selectedInvoice && selectedCustomerCode && availableCustomerCodes.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl text-blue-600">✅ Step 2: Select Invoice & Configure Dispatch</CardTitle>
                  <CardDescription>
                    Customer Code: <span className="font-semibold">{selectedCustomerCode}</span> • {invoicesForCustomer.length} invoice{invoicesForCustomer.length !== 1 ? 's' : ''} available
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedCustomerCode("");
                    setInvoiceSelections({});
                  }}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Change Customer
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {invoicesForCustomer.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No invoices found for this customer code</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {invoicesForCustomer.map((invoice) => {
                    const selections = invoiceSelections[invoice.id] || {};
                    const defaultShift = getDefaultShift(invoice);
                    const defaultPlant = invoice.plant || availablePlants[0];
                    
                    // Use defaults for display, but require explicit selection for audit
                    const displayShift = selections.shift || defaultShift || "";
                    const displayPlant = selections.plant || defaultPlant || "";

                    // Can only start audit if BOTH shift and plant are explicitly selected
                    const canStartAudit = !!(selections.shift && selections.plant);

                    return (
                      <Card key={invoice.id} className="border-2">
                        <CardContent className="pt-6">
                          <div className="space-y-4">
                            {/* Invoice Info */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">Invoice No</p>
                                <p className="font-semibold">{invoice.id}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">Customer</p>
                                <p className="font-semibold">{invoice.customer}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">Total Quantity</p>
                                <p className="font-semibold">{invoice.totalQty}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">Expected BINs</p>
                                <p className="font-semibold">{invoice.expectedBins}</p>
                              </div>
                            </div>

                            {/* Delivery Date from Schedule */}
                            {scheduleItemsForCustomer[0]?.deliveryDate && (
                              <div className="p-3 bg-muted rounded-lg">
                                <p className="text-xs text-muted-foreground mb-1">Scheduled Delivery Date</p>
                                <p className="font-semibold">
                                  {scheduleItemsForCustomer[0].deliveryDate.toLocaleDateString()}
                                </p>
                              </div>
                            )}

                            {/* Shift and Plant Selection */}
                            <div className="grid md:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label className="text-sm font-medium flex items-center gap-2">
                                  <Clock className="h-4 w-4" />
                                  Delivery Shift
                                </Label>
                                <Select
                                  value={displayShift}
                                  onValueChange={(value) => handleShiftSelect(invoice.id, value as 'A' | 'B')}
                                >
                                  <SelectTrigger className={!selections.shift ? "border-destructive" : ""}>
                                    <SelectValue placeholder={defaultShift ? `Default: Shift ${defaultShift}` : "Select shift (Required)"} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="A">Shift A (8 AM - 8 PM)</SelectItem>
                                    <SelectItem value="B">Shift B (8 PM - 8 AM)</SelectItem>
                                  </SelectContent>
                                </Select>
                                {!selections.shift && (
                                  <p className="text-xs text-destructive mt-1">⚠️ Please select a delivery shift</p>
                                )}
                              </div>

                              <div className="space-y-2">
                                <Label className="text-sm font-medium flex items-center gap-2">
                                  <MapPin className="h-4 w-4" />
                                  Plant (Delivery Location)
                                </Label>
                                <Select
                                  value={displayPlant}
                                  onValueChange={(value) => handlePlantSelect(invoice.id, value)}
                                >
                                  <SelectTrigger className={!selections.plant ? "border-destructive" : ""}>
                                    <SelectValue placeholder={defaultPlant ? `Default: ${defaultPlant}` : "Select plant (Required)"} />
              </SelectTrigger>
              <SelectContent>
                                    {availablePlants.length > 0 ? (
                                      availablePlants.map(plant => (
                                        <SelectItem key={plant} value={plant}>
                                          {plant}
                                        </SelectItem>
                                      ))
                                    ) : (
                                      <SelectItem value={invoice.plant || "N/A"}>
                                        {invoice.plant || "No plant data"}
                  </SelectItem>
                                    )}
              </SelectContent>
            </Select>
                                {!selections.plant && (
                                  <p className="text-xs text-destructive mt-1">⚠️ Please select a plant</p>
                                )}
                              </div>
                            </div>

                            {/* Start Audit Button - Only enabled when both shift and plant are selected */}
                            <div className="pt-2">
                              <Button
                                onClick={() => {
                                  if (selections.shift && selections.plant) {
                                    // Store selections in invoice data
                                    updateInvoiceAudit(invoice.id, {
                                      selectedDeliveryShift: selections.shift,
                                      selectedPlant: selections.plant,
                                      deliveryDate: scheduleItemsForCustomer[0]?.deliveryDate
                                    }, currentUser);

                                    // Set selected invoice to start audit
                                    setSelectedInvoice(invoice.id);
                                    toast.success(`Audit started for invoice ${invoice.id}`);
                                  } else {
                                    toast.error("Please select both delivery shift and plant before starting audit");
                                  }
                                }}
                                disabled={!canStartAudit}
                                className="w-full"
                                size="lg"
                              >
                                <ScanBarcode className="h-4 w-4 mr-2" />
                                {canStartAudit ? "Start Document Audit" : "Select Shift & Plant to Continue"}
                              </Button>
                              {!canStartAudit && (
                                <p className="text-xs text-muted-foreground mt-2 text-center">
                                  ⚠️ You must select both delivery shift and plant before starting the audit
                                </p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 3: Document Audit Process */}
        {selectedInvoice && currentInvoice && (
          <>
            {/* Back Button */}
            <div className="mb-4 flex items-center justify-between">
              <Button
                variant="ghost"
                onClick={() => {
                  setSelectedInvoice("");
                  setCustomerScan(null);
                  setAutolivScan(null);
                  setScannedBins([]);
                }}
                className="flex items-center gap-2 text-sm sm:text-base"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Back to Invoice Selection</span>
                <span className="sm:hidden">Back</span>
              </Button>
              
              {/* Invoice Info Badge */}
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-sm">
                  {currentInvoice.id}
                </Badge>
                {currentInvoice.selectedDeliveryShift && (
                  <Badge variant="secondary" className="text-sm">
                    Shift {currentInvoice.selectedDeliveryShift}
                  </Badge>
                )}
                {currentInvoice.selectedPlant && (
                  <Badge variant="secondary" className="text-sm">
                    {currentInvoice.selectedPlant}
                  </Badge>
                )}
              </div>
            </div>

            {/* Invoice Details Card */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Invoice Details</CardTitle>
                <CardDescription>Document audit for invoice {currentInvoice.id}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
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
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Expected BINs</p>
                    <p className="font-semibold">{currentInvoice.expectedBins}</p>
                  </div>
                </div>
                {currentInvoice.selectedDeliveryShift && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Delivery Shift</p>
                      <p className="font-semibold">Shift {currentInvoice.selectedDeliveryShift}</p>
                    </div>
                    {currentInvoice.selectedPlant && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Plant</p>
                        <p className="font-semibold">{currentInvoice.selectedPlant}</p>
                      </div>
                    )}
                    {currentInvoice.deliveryDate && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Delivery Date</p>
                        <p className="font-semibold">{currentInvoice.deliveryDate.toLocaleDateString()}</p>
                      </div>
                    )}
                  </div>
                )}
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-medium">Scan Progress</span>
                    <span className="text-muted-foreground">
                      {currentInvoice.scannedBins} of {currentInvoice.expectedBins} BINs
                    </span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
          </CardContent>
        </Card>
            
            <div className="grid md:grid-cols-2 gap-6 mb-6">
            {/* Customer Label Scan */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <ScanBarcode className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Scan Customer Label</CardTitle>
                    <CardDescription>Scan the customer's barcode label</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
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
                  />
                  {customerScan && (
                    <Button 
                      onClick={() => handleScan('customer')} 
                      className="w-full h-12"
                      variant="secondary"
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Validate Customer Label
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Autoliv Label Scan */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-accent/10 rounded-lg">
                    <ScanBarcode className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Scan Autoliv Label</CardTitle>
                    <CardDescription>Scan the internal Autoliv label</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
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
                  />
                  {autolivScan && (
                    <Button 
                      onClick={() => handleScan('autoliv')} 
                      className="w-full h-12"
                      variant="secondary"
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Validate Autoliv Label
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Scanned BINs Table */}
          <Card>
            <CardHeader>
              <CardTitle>Scanned BINs</CardTitle>
              <CardDescription>Real-time list of scanned and validated BINs</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-hidden overflow-x-auto">
                <table className="w-full text-xs sm:text-sm min-w-[600px]">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-3 font-semibold">BIN No</th>
                      <th className="text-left p-3 font-semibold">Part Code</th>
                      <th className="text-left p-3 font-semibold">Qty</th>
                      <th className="text-left p-3 font-semibold">Status</th>
                      <th className="text-left p-3 font-semibold">Scanned By</th>
                      <th className="text-left p-3 font-semibold">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scannedBins.map((bin, i) => (
                      <tr key={i} className="border-t hover:bg-muted/50">
                        <td className="p-3 font-mono">{bin.binNo}</td>
                        <td className="p-3 font-mono">{bin.partCode}</td>
                        <td className="p-3">{bin.qty}</td>
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
              
              {/* Complete Audit Button */}
              {currentInvoice && scannedBins.length > 0 && (
                <div className="mt-6 p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-green-700 dark:text-green-300 mb-1">
                        ✅ Audit Progress: {currentInvoice.scannedBins}/{currentInvoice.expectedBins} BINs
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {currentInvoice.scannedBins >= currentInvoice.expectedBins 
                          ? "All items scanned! Ready for dispatch."
                          : "Continue scanning to complete the audit."}
                      </p>
                    </div>
                    {currentInvoice.scannedBins >= currentInvoice.expectedBins && (
                    <Button
                      onClick={() => {
                          updateInvoiceAudit(currentInvoice.id, {
                            auditComplete: true
                          }, currentUser);
                          toast.success("Audit completed successfully!");
                        setSelectedInvoice("");
                          setCustomerScan(null);
                          setAutolivScan(null);
                          setScannedBins([]);
                      }}
                      className="flex items-center gap-2 h-10 w-full sm:w-auto"
                      variant="default"
                    >
                        <CheckCircle2 className="h-4 w-4" />
                        Complete Audit
                    </Button>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          </>
        )}
      </main>
    </div>
  );
};

export default DocAudit;
