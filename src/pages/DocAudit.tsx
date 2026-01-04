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
    currentUser,
    addMismatchAlert
  } = useSession();
  
  // Selection states - cascading selection
  const [selectedCustomerCode, setSelectedCustomerCode] = useState<string>("");
  const [selectedDeliveryDate, setSelectedDeliveryDate] = useState<string>("");
  const [selectedDeliveryTime, setSelectedDeliveryTime] = useState<string>("");
  const [selectedInvoice, setSelectedInvoice] = useState<string>("");
  
  // Helper function to format date as YYYY-MM-DD in local timezone
  const formatDateAsLocalString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
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

  // Get schedule items for selected customer
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

  // Get unique delivery dates from schedule items for the selected customer
  // These are dates from schedule items that match invoice items for invoices in this customer code
  const availableDeliveryDates = useMemo(() => {
    if (!selectedCustomerCode || !scheduleData || !invoicesForCustomer.length) return [];
    
    const dates = new Set<string>();
    
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
    scheduleItemsForCustomer.forEach(item => {
      if (item.deliveryDate && item.partNumber && customerItemsSet.has(String(item.partNumber).trim())) {
        dates.add(formatDateAsLocalString(item.deliveryDate));
      }
    });
    
    return Array.from(dates).sort();
  }, [selectedCustomerCode, scheduleItemsForCustomer, invoicesForCustomer, scheduleData]);

  // Get unique delivery times from schedule items for the selected customer and delivery date
  const availableDeliveryTimes = useMemo(() => {
    if (!selectedCustomerCode || !selectedDeliveryDate || !scheduleData || !invoicesForCustomer.length) return [];
    
    const times = new Set<string>();
    
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
    scheduleItemsForCustomer.forEach(item => {
      if (item.deliveryDate && item.deliveryTime && item.partNumber) {
        const itemDate = formatDateAsLocalString(item.deliveryDate);
        if (itemDate === selectedDeliveryDate && customerItemsSet.has(String(item.partNumber).trim())) {
          times.add(item.deliveryTime);
        }
      }
    });
    
    return Array.from(times).sort();
  }, [selectedCustomerCode, selectedDeliveryDate, scheduleItemsForCustomer, invoicesForCustomer, scheduleData]);


  // Get filtered invoices based on customer code, delivery date, and delivery time
  const filteredInvoices = useMemo(() => {
    if (!selectedCustomerCode || !selectedDeliveryDate || !selectedDeliveryTime || !scheduleData) return [];
    
    // Get all customer items from invoices for this customer
    const customerItemsSet = new Set<string>();
    invoicesForCustomer.forEach(invoice => {
      invoice.items?.forEach((item: any) => {
        if (item.customerItem && item.status === 'valid-matched') {
          customerItemsSet.add(String(item.customerItem).trim());
        }
      });
    });
    
    // Find schedule items that match the criteria
    const matchingScheduleItems = scheduleItemsForCustomer.filter(item => {
      if (!item.deliveryDate || !item.deliveryTime || !item.partNumber) return false;
      const itemDate = formatDateAsLocalString(item.deliveryDate);
      return itemDate === selectedDeliveryDate 
        && item.deliveryTime === selectedDeliveryTime
        && customerItemsSet.has(String(item.partNumber).trim());
    });
    
    // Get part numbers from matching schedule items
    const matchingPartNumbers = new Set(matchingScheduleItems.map(item => String(item.partNumber).trim()));
    
    // Filter invoices that have items matching these part numbers
    const filtered = invoicesForCustomer.filter(invoice => {
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
  }, [selectedCustomerCode, selectedDeliveryDate, selectedDeliveryTime, invoicesForCustomer, scheduleItemsForCustomer, scheduleData]);

  // Get current invoice from sharedInvoices to ensure we have the latest state
  const currentInvoice = useMemo(() => {
    if (!selectedInvoice) return undefined;
    return sharedInvoices.find(inv => inv.id === selectedInvoice);
  }, [sharedInvoices, selectedInvoice]);
  const progress = currentInvoice ? (currentInvoice.scannedBins / currentInvoice.expectedBins) * 100 : 0;

  // Debug logging on mount and when data changes
  useEffect(() => {
    console.log('[DocAudit] Component rendered/updated:', {
      sharedInvoicesCount: sharedInvoices.length,
      scheduleDataExists: !!scheduleData,
      scheduleItemsCount: scheduleData?.items.length || 0,
      selectedCustomerCode,
      selectedDeliveryDate,
      selectedDeliveryTime,
      selectedInvoice,
      availableCustomerCodesCount: availableCustomerCodes.length,
      invoicesWithScheduleCount: invoicesWithSchedule.length,
      filteredInvoicesCount: filteredInvoices.length
    });
  }, [sharedInvoices.length, scheduleData, selectedCustomerCode, selectedDeliveryDate, selectedDeliveryTime, selectedInvoice, availableCustomerCodes.length, invoicesWithSchedule.length, filteredInvoices.length]);

  // Handle customer code selection
  const handleCustomerCodeSelect = (customerCode: string) => {
    setSelectedCustomerCode(customerCode);
    setSelectedDeliveryDate(""); // Reset delivery date
    setSelectedDeliveryTime(""); // Reset delivery time
    setSelectedInvoice(""); // Reset invoice selection
  };

  // Handle delivery date selection
  const handleDeliveryDateSelect = (deliveryDate: string) => {
    setSelectedDeliveryDate(deliveryDate);
    setSelectedDeliveryTime(""); // Reset delivery time when date changes
    setSelectedInvoice(""); // Reset invoice selection
  };

  // Handle delivery time selection
  const handleDeliveryTimeSelect = (deliveryTime: string) => {
    setSelectedDeliveryTime(deliveryTime);
    setSelectedInvoice(""); // Reset invoice selection when time changes
  };


  const handleScan = (type: 'customer' | 'autoliv') => {
    // Check if invoice is blocked
    if (currentInvoice?.blocked) {
      toast.error("⚠️ Invoice is Blocked", {
        description: "This invoice has a mismatch. Please wait for admin to mark it as corrected.",
        duration: 5000,
      });
      return;
    }

    const scanValue = type === 'customer' ? customerScan : autolivScan;
    if (!scanValue) {
      toast.error("Please enter a barcode value");
      return;
    }

    // Validate barcode scan - compare customer and autoliv scans
    // Only validate if both scans are present
    let isValid = true;
    if (customerScan && autolivScan) {
      // Compare part codes and quantities
      const partCodesMatch = customerScan.partCode?.trim() === autolivScan.partCode?.trim();
      const quantitiesMatch = customerScan.quantity?.trim() === autolivScan.quantity?.trim();
      const rawValuesMatch = customerScan.rawValue?.trim() === autolivScan.rawValue?.trim();
      
      isValid = partCodesMatch && quantitiesMatch && rawValuesMatch;
    } else {
      // If only one scan is present, we can't validate yet - just proceed
      toast.success(`${type === 'customer' ? 'Customer' : 'Autoliv'} label scanned successfully!`);
      return;
    }

    if (isValid) {
      toast.success(`Both labels scanned and validated successfully!`);
      
      // Add to scanned bins
      const newBin = {
        binNo: customerScan.binNumber || 'N/A',
        partCode: customerScan.partCode || 'N/A',
        qty: parseInt(customerScan.quantity || '0'),
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
      
      // Clear both scans after successful validation
      setCustomerScan(null);
      setAutolivScan(null);
    } else {
      // Mismatch detected - block the invoice
      toast.error("⚠️ Barcode Mismatch Detected!", {
        description: "Part code or quantity doesn't match. Invoice has been blocked.",
        duration: 5000,
      });
      
      // Block the invoice and create mismatch alert
      if (currentInvoice && customerScan && autolivScan) {
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
      
      // Automatically show approval message
      setTimeout(() => {
        toast.info("📨 Message sent to senior for approval", {
          description: "Approval request has been automatically sent to the supervisor.",
          duration: 5000,
        });
      }, 500);

      // Clear scans after mismatch
      setCustomerScan(null);
      setAutolivScan(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
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
                <p className="text-sm font-medium">{currentUser}</p>
                <p className="text-xs text-muted-foreground">Operator</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 py-4 sm:py-8 pb-24 sm:pb-8">
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

        {/* Step 2: Delivery Date Selection - Show when customer code is selected but delivery date is not */}
        {!selectedInvoice && selectedCustomerCode && !selectedDeliveryDate && availableCustomerCodes.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl text-blue-600">✅ Step 2: Select Delivery Date</CardTitle>
                  <CardDescription>
                    Customer Code: <span className="font-semibold">{selectedCustomerCode}</span> • {availableDeliveryDates.length} date{availableDeliveryDates.length !== 1 ? 's' : ''} available
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    handleCustomerCodeSelect("");
                  }}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Change Customer
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {availableDeliveryDates.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No delivery dates found for this customer code</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <Label className="text-sm font-medium">Delivery Date</Label>
                  <Select value={selectedDeliveryDate} onValueChange={handleDeliveryDateSelect}>
                    <SelectTrigger className="h-12 text-base">
                      <SelectValue placeholder="Select a delivery date" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableDeliveryDates.map(date => (
                        <SelectItem key={date} value={date}>
                          {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { 
                            year: 'numeric', 
                            month: 'short', 
                            day: 'numeric' 
                          })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 3: Delivery Time Selection - Show when delivery date is selected but delivery time is not */}
        {!selectedInvoice && selectedCustomerCode && selectedDeliveryDate && !selectedDeliveryTime && (
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl text-blue-600">✅ Step 3: Select Delivery Time</CardTitle>
                  <CardDescription>
                    Customer Code: <span className="font-semibold">{selectedCustomerCode}</span> • 
                    Delivery Date: <span className="font-semibold">{new Date(selectedDeliveryDate + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span> • 
                    {availableDeliveryTimes.length} time{availableDeliveryTimes.length !== 1 ? 's' : ''} available
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    handleDeliveryDateSelect("");
                  }}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Change Date
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {availableDeliveryTimes.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No delivery times found for this date</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Delivery Time
                  </Label>
                  <Select value={selectedDeliveryTime} onValueChange={handleDeliveryTimeSelect}>
                    <SelectTrigger className="h-12 text-base">
                      <SelectValue placeholder="Select a delivery time" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableDeliveryTimes.map(time => (
                        <SelectItem key={time} value={time}>
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 4: Invoice Selection - Show when delivery time is selected */}
        {!selectedInvoice && selectedCustomerCode && selectedDeliveryDate && selectedDeliveryTime && (
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl text-blue-600">✅ Step 4: Select Invoice</CardTitle>
                  <CardDescription>
                    Customer Code: <span className="font-semibold">{selectedCustomerCode}</span> • 
                    Delivery Date: <span className="font-semibold">{new Date(selectedDeliveryDate + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span> • 
                    Delivery Time: <span className="font-semibold">{selectedDeliveryTime}</span> • 
                    {filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? 's' : ''} available
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    handleDeliveryTimeSelect("");
                  }}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Change Time
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {filteredInvoices.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No invoices found for the selected criteria</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredInvoices.map((invoice) => {
                    return (
                      <Card key={invoice.id} className="border-2">
                        <CardContent className="pt-6">
                          <div className="space-y-4">
                            {/* Invoice Info */}
                            <div className="flex items-start justify-between mb-4">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1">
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
                              <div className="flex flex-col gap-2">
                                {invoice.auditComplete && (
                                  <Badge variant="default" className="w-fit">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    Audited
                                  </Badge>
                                )}
                                {invoice.blocked && (
                                  <Badge variant="destructive" className="w-fit">
                                    <XCircle className="h-3 w-3 mr-1" />
                                    Blocked
                                  </Badge>
                                )}
                              </div>
                            </div>

                            {/* Blocked Status Badge */}
                            {invoice.blocked && (
                              <div className="p-3 bg-red-50 dark:bg-red-950 border-2 border-red-200 dark:border-red-800 rounded-lg mb-4">
                                <div className="flex items-center gap-2">
                                  <XCircle className="h-5 w-5 text-red-600" />
                                  <div>
                                    <p className="font-semibold text-red-900 dark:text-red-100">Invoice Blocked</p>
                                    <p className="text-sm text-red-700 dark:text-red-300">
                                      This invoice has a mismatch. Please wait for admin to mark it as corrected.
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Start Audit Button */}
                            <div className="pt-2">
                              <Button
                                onClick={() => {
                                  if (invoice.blocked) {
                                    toast.error("⚠️ Invoice is Blocked", {
                                      description: "This invoice has a mismatch. Please wait for admin to mark it as corrected.",
                                      duration: 5000,
                                    });
                                    return;
                                  }
                                  // Parse delivery date string to Date object
                                  const [year, month, day] = selectedDeliveryDate.split('-').map(Number);
                                  const deliveryDateObj = new Date(year, month - 1, day);
                                  
                                  // Store selections in invoice data
                                  updateInvoiceAudit(invoice.id, {
                                    deliveryTime: selectedDeliveryTime,
                                    deliveryDate: deliveryDateObj
                                  }, currentUser);

                                  // Set selected invoice to start audit
                                  setSelectedInvoice(invoice.id);
                                  toast.success(`Audit started for invoice ${invoice.id}`);
                                }}
                                disabled={invoice.blocked}
                                className="w-full"
                                size="lg"
                                variant={invoice.blocked ? "destructive" : "default"}
                              >
                                <ScanBarcode className="h-4 w-4 mr-2" />
                                {invoice.blocked 
                                  ? "Invoice Blocked - Cannot Start Audit"
                                  : "Start Document Audit"}
                              </Button>
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

        {/* Step 5: Document Audit Process */}
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
                {currentInvoice.deliveryTime && (
                  <Badge variant="secondary" className="text-sm">
                    {currentInvoice.deliveryTime}
                  </Badge>
                )}
                {currentInvoice.blocked && (
                  <Badge variant="destructive" className="text-sm">
                    <XCircle className="h-3 w-3 mr-1" />
                    Blocked
                  </Badge>
                )}
              </div>
            </div>

            {/* Blocked Warning Card */}
            {currentInvoice.blocked && (
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
                {currentInvoice.deliveryTime && (
                  <div className="grid grid-cols-2 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Delivery Time</p>
                      <p className="font-semibold">{currentInvoice.deliveryTime}</p>
                    </div>
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
            <Card className={currentInvoice.blocked ? "opacity-60" : ""}>
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <ScanBarcode className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Scan Customer Label</CardTitle>
                    <CardDescription>
                      {currentInvoice.blocked 
                        ? "Admin approval needed - Scanning disabled" 
                        : "Scan the customer's barcode label"}
                    </CardDescription>
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
                      if (currentInvoice?.blocked) {
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
                    disabled={currentInvoice?.blocked}
                  />
                  {customerScan && (
                    <Button 
                      onClick={() => handleScan('customer')} 
                      className="w-full h-12"
                      variant="secondary"
                      disabled={currentInvoice?.blocked}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Validate Customer Label
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Autoliv Label Scan */}
            <Card className={currentInvoice.blocked ? "opacity-60" : ""}>
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-accent/10 rounded-lg">
                    <ScanBarcode className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Scan Autoliv Label</CardTitle>
                    <CardDescription>
                      {currentInvoice.blocked 
                        ? "Admin approval needed - Scanning disabled" 
                        : "Scan the internal Autoliv label"}
                    </CardDescription>
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
                      if (currentInvoice?.blocked) {
                        toast.error("⚠️ Invoice is Blocked", {
                          description: "This invoice has a mismatch. Please wait for admin to mark it as corrected.",
                          duration: 5000,
                        });
                        return;
                      }
                      setAutolivScan(data);
                      toast.success("Autoliv barcode scanned!");
                    }}
                    label={autolivScan ? "Scan Again" : "Scan Autoliv Barcode"}
                    variant="secondary"
                    matchValue={customerScan?.rawValue || undefined}
                    shouldMismatch={false}
                    disabled={currentInvoice?.blocked}
                  />
                  {autolivScan && (
                    <Button 
                      onClick={() => handleScan('autoliv')} 
                      className="w-full h-12"
                      variant="secondary"
                      disabled={currentInvoice?.blocked}
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
