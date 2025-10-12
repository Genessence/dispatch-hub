import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ScanBarcode, CheckCircle2, XCircle, AlertTriangle, Radio } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { BarcodeScanButton, type BarcodeData } from "@/components/BarcodeScanner";

const DocAudit = () => {
  const [selectedInvoice, setSelectedInvoice] = useState("");
  const [customerScan, setCustomerScan] = useState<BarcodeData | null>(null);
  const [autolivScan, setAutolivScan] = useState<BarcodeData | null>(null);
  const [scannerConnected, setScannerConnected] = useState(true);

  const invoices = [
    { id: "INV-2024-001", customer: "Acme Corp", totalQty: 500, expectedBins: 10, scannedBins: 8 },
    { id: "INV-2024-002", customer: "Tech Solutions", totalQty: 300, expectedBins: 6, scannedBins: 3 },
    { id: "INV-2024-003", customer: "Global Industries", totalQty: 450, expectedBins: 9, scannedBins: 0 },
  ];

  const scannedBins = [
    { binNo: "BIN-001", partCode: "PT-12345", qty: 50, status: "matched", scannedBy: "John", time: "10:30 AM" },
    { binNo: "BIN-002", partCode: "PT-12346", qty: 50, status: "matched", scannedBy: "John", time: "10:32 AM" },
    { binNo: "BIN-003", partCode: "PT-12347", qty: 50, status: "mismatch", scannedBy: "John", time: "10:35 AM" },
    { binNo: "BIN-004", partCode: "PT-12348", qty: 50, status: "matched", scannedBy: "John", time: "10:38 AM" },
  ];

  const currentInvoice = invoices.find(inv => inv.id === selectedInvoice);
  const progress = currentInvoice ? (currentInvoice.scannedBins / currentInvoice.expectedBins) * 100 : 0;

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
      if (type === 'customer') setCustomerScan("");
      else setAutolivScan("");
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
        {/* Invoice Selection */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Select Invoice</CardTitle>
            <CardDescription>Choose an invoice to begin document audit</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={selectedInvoice} onValueChange={setSelectedInvoice}>
              <SelectTrigger className="h-12 text-base">
                <SelectValue placeholder="Select an invoice" />
              </SelectTrigger>
              <SelectContent>
                {invoices.map(invoice => (
                  <SelectItem key={invoice.id} value={invoice.id}>
                    {invoice.id} - {invoice.customer} ({invoice.scannedBins}/{invoice.expectedBins} BINs)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {currentInvoice && (
              <div className="mt-6 p-4 bg-muted rounded-lg">
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
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-medium">Scan Progress</span>
                    <span className="text-muted-foreground">
                      {currentInvoice.scannedBins} of {currentInvoice.expectedBins} BINs
                    </span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Scanning Interface */}
        {selectedInvoice && (
          <>
            {/* Back Button */}
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
              
              {/* New Audit Button - appears after scanning */}
              {currentInvoice && scannedBins.length >= 3 && (
                <div className="mt-6 p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-green-700 dark:text-green-300 mb-1">
                        ✅ Audit Progress: {currentInvoice.scannedBins}/{currentInvoice.expectedBins} BINs
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {currentInvoice.scannedBins >= currentInvoice.expectedBins 
                          ? "All items scanned! Ready for dispatch."
                          : "Continue scanning or start a new audit."}
                      </p>
                    </div>
                    <Button
                      onClick={() => {
                        setSelectedInvoice("");
                        setCustomerScan("");
                        setAutolivScan("");
                      }}
                      className="flex items-center gap-2 h-10 w-full sm:w-auto"
                      variant="default"
                    >
                      <ScanBarcode className="h-4 w-4" />
                      New Audit
                    </Button>
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
