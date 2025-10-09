import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Truck, QrCode, Printer, Download } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

const Dispatch = () => {
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [gatepassGenerated, setGatepassGenerated] = useState(false);

  const invoices = [
    { id: "INV-2024-001", customer: "Acme Corp", binsLoaded: 10, totalQty: 500, auditComplete: true },
    { id: "INV-2024-002", customer: "Tech Solutions", binsLoaded: 6, totalQty: 300, auditComplete: true },
    { id: "INV-2024-003", customer: "Global Industries", binsLoaded: 0, totalQty: 450, auditComplete: false },
  ];

  const handleGenerateGatepass = () => {
    if (!vehicleNumber) {
      toast.error("Please enter vehicle number");
      return;
    }
    if (selectedInvoices.length === 0) {
      toast.error("Please select at least one invoice");
      return;
    }

    setGatepassGenerated(true);
    toast.success("Gatepass generated successfully!");
  };

  const toggleInvoice = (invoiceId: string) => {
    setSelectedInvoices(prev => 
      prev.includes(invoiceId) 
        ? prev.filter(id => id !== invoiceId)
        : [...prev, invoiceId]
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Link to="/dashboard">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Loading & Dispatch</h1>
              <p className="text-sm text-muted-foreground">Manage vehicle loading and generate gatepass</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 max-w-5xl">
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
                <CardTitle>Select Invoices for Loading</CardTitle>
                <CardDescription>Choose invoices to load onto the vehicle</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {invoices.map(invoice => (
                    <div 
                      key={invoice.id}
                      className={`border rounded-lg p-4 transition-colors cursor-pointer ${
                        selectedInvoices.includes(invoice.id) 
                          ? 'border-primary bg-primary/5' 
                          : 'border-border hover:bg-muted/50'
                      }`}
                      onClick={() => toggleInvoice(invoice.id)}
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={selectedInvoices.includes(invoice.id)}
                          onCheckedChange={() => toggleInvoice(invoice.id)}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <p className="font-semibold text-foreground">{invoice.id}</p>
                              <p className="text-sm text-muted-foreground">{invoice.customer}</p>
                            </div>
                            <Badge variant={invoice.auditComplete ? "default" : "destructive"}>
                              {invoice.auditComplete ? "Audit Complete" : "Audit Pending"}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground">BINs Loaded</p>
                              <p className="font-medium">{invoice.binsLoaded}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Total Qty</p>
                              <p className="font-medium">{invoice.totalQty}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Summary */}
            {selectedInvoices.length > 0 && (
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
                      <span className="text-muted-foreground">Total BINs</span>
                      <span className="font-semibold">
                        {invoices
                          .filter(inv => selectedInvoices.includes(inv.id))
                          .reduce((sum, inv) => sum + inv.binsLoaded, 0)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Quantity</span>
                      <span className="font-semibold">
                        {invoices
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
                      const invoice = invoices.find(inv => inv.id === id);
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
                <Link to="/dashboard" className="flex-1">
                  <Button className="w-full h-12">Return to Dashboard</Button>
                </Link>
                <Button 
                  variant="outline" 
                  className="h-12"
                  onClick={() => {
                    setGatepassGenerated(false);
                    setVehicleNumber("");
                    setSelectedInvoices([]);
                  }}
                >
                  New Dispatch
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default Dispatch;
