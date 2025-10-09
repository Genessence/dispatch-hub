import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { QrCode, CheckCircle2, XCircle, Truck, Package } from "lucide-react";
import { toast } from "sonner";

const GatepassVerification = () => {
  const [qrCode, setQrCode] = useState("");
  const [verificationResult, setVerificationResult] = useState<'valid' | 'invalid' | null>(null);

  const handleScanQR = () => {
    if (!qrCode) {
      toast.error("Please enter or scan a QR code");
      return;
    }

    // Simulate verification
    const isValid = Math.random() > 0.2;
    setVerificationResult(isValid ? 'valid' : 'invalid');
    
    if (isValid) {
      toast.success("Gatepass verified successfully!");
    } else {
      toast.error("Invalid or forged gatepass!");
    }
  };

  const mockData = {
    gatepassId: "GP-2024-00142",
    vehicleNumber: "MH12AB1234",
    driverName: "Rajesh Kumar",
    timestamp: new Date().toLocaleString(),
    operator: "John Operator",
    invoices: [
      { id: "INV-2024-001", customer: "Acme Corp", bins: 10, qty: 500 },
      { id: "INV-2024-002", customer: "Tech Solutions", bins: 6, qty: 300 },
    ],
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border shadow-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary rounded-lg">
              <QrCode className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Gatepass Verification</h1>
              <p className="text-sm text-muted-foreground">Security checkpoint - scan to verify</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 max-w-3xl">
        {/* Scan Interface */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Scan QR Code</CardTitle>
            <CardDescription>Use camera or enter gatepass number manually</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-center p-8 bg-muted rounded-lg border-2 border-dashed border-border">
              <div className="text-center">
                <QrCode className="h-24 w-24 text-muted-foreground mx-auto mb-4" />
                <p className="text-sm text-muted-foreground mb-2">Position QR code within frame</p>
                <Button variant="outline" size="sm">
                  Open Camera
                </Button>
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or enter manually</span>
              </div>
            </div>

            <div className="space-y-2">
              <Input
                placeholder="Enter gatepass number or scan QR..."
                value={qrCode}
                onChange={(e) => setQrCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleScanQR();
                }}
                className="h-14 text-lg font-mono"
              />
              <Button onClick={handleScanQR} className="w-full h-12 text-base font-semibold">
                Verify Gatepass
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Verification Result */}
        {verificationResult && (
          <Card className={`border-2 ${
            verificationResult === 'valid' 
              ? 'border-success bg-success/5' 
              : 'border-destructive bg-destructive/5'
          }`}>
            <CardContent className="pt-6">
              <div className="text-center mb-6">
                <div className={`inline-flex p-4 rounded-full mb-4 ${
                  verificationResult === 'valid' ? 'bg-success/20' : 'bg-destructive/20'
                }`}>
                  {verificationResult === 'valid' ? (
                    <CheckCircle2 className="h-16 w-16 text-success" />
                  ) : (
                    <XCircle className="h-16 w-16 text-destructive" />
                  )}
                </div>
                <h3 className={`text-2xl font-bold mb-2 ${
                  verificationResult === 'valid' ? 'text-success' : 'text-destructive'
                }`}>
                  {verificationResult === 'valid' ? 'Gatepass Verified' : 'Invalid Gatepass'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {verificationResult === 'valid' 
                    ? 'Vehicle is authorized to exit' 
                    : 'This gatepass is invalid or has been forged'}
                </p>
              </div>

              {verificationResult === 'valid' && (
                <div className="space-y-4">
                  {/* Gatepass Details */}
                  <div className="bg-card rounded-lg p-4 border">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Gatepass ID</p>
                        <p className="font-semibold">{mockData.gatepassId}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Issue Time</p>
                        <p className="font-semibold text-sm">{mockData.timestamp}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 p-3 bg-muted rounded-lg mb-4">
                      <Truck className="h-8 w-8 text-primary" />
                      <div>
                        <p className="text-xs text-muted-foreground">Vehicle Number</p>
                        <p className="text-lg font-bold">{mockData.vehicleNumber}</p>
                      </div>
                    </div>

                    <div className="space-y-2 mb-4">
                      <p className="text-sm font-semibold flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        Loaded Invoices
                      </p>
                      {mockData.invoices.map((invoice, i) => (
                        <div key={i} className="flex justify-between items-center p-2 bg-muted/50 rounded">
                          <div>
                            <p className="font-medium text-sm">{invoice.id}</p>
                            <p className="text-xs text-muted-foreground">{invoice.customer}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">BINs: {invoice.bins}</p>
                            <p className="text-xs text-muted-foreground">Qty: {invoice.qty}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="pt-3 border-t">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Authorized by</span>
                        <span className="font-medium">{mockData.operator}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="grid grid-cols-2 gap-3">
                    <Button variant="outline">Print Confirmation</Button>
                    <Button variant="outline">Email Receipt</Button>
                  </div>

                  <Button 
                    onClick={() => {
                      setQrCode("");
                      setVerificationResult(null);
                    }}
                    className="w-full"
                  >
                    Scan Next Gatepass
                  </Button>
                </div>
              )}

              {verificationResult === 'invalid' && (
                <div className="space-y-3">
                  <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                    <p className="text-sm font-semibold text-destructive mb-2">Security Alert</p>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Gatepass not found in system</li>
                      <li>• May have been altered or forged</li>
                      <li>• Contact supervisor immediately</li>
                    </ul>
                  </div>
                  <Button 
                    variant="destructive"
                    className="w-full"
                    onClick={() => toast.error("Security alert raised!")}
                  >
                    Raise Security Alert
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => {
                      setQrCode("");
                      setVerificationResult(null);
                    }}
                    className="w-full"
                  >
                    Try Again
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default GatepassVerification;
