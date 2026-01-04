import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/contexts/SessionContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, CheckCircle2, ArrowLeft, User, Building2, Clock, ScanBarcode, Truck } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const ExceptionAlerts = () => {
  const navigate = useNavigate();
  const { currentUser, mismatchAlerts, updateMismatchStatus, updateInvoiceAudit } = useSession();
  const [selectedAlert, setSelectedAlert] = useState<string | null>(null);

  // Permission check
  if (currentUser !== "Admin") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center max-w-md mx-auto">
          <div className="mb-6">
            <div className="w-24 h-24 mx-auto bg-red-100 rounded-full flex items-center justify-center mb-4">
              <span className="text-4xl">🔒</span>
            </div>
            <h1 className="text-3xl font-bold text-red-600 mb-2">Permission Denied</h1>
            <p className="text-muted-foreground mb-6">
              Only Admin users can access the Exception Alerts module.
            </p>
          </div>
          <Button onClick={() => navigate("/dashboard")} className="w-full">
            Return to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const handleCorrected = (alertId: string) => {
    setSelectedAlert(alertId);
  };

  const confirmCorrected = () => {
    if (selectedAlert) {
      const alert = mismatchAlerts.find(a => a.id === selectedAlert);
      if (alert) {
        // Update mismatch status
        updateMismatchStatus(selectedAlert, 'approved', currentUser);
        
        // Unblock the invoice
        updateInvoiceAudit(alert.invoiceId, {
          blocked: false,
          blockedAt: undefined
        }, currentUser);
        
        toast.success('Barcode corrected successfully!', {
          description: `Invoice ${alert.invoiceId} has been unblocked and is now available for scanning.`
        });
      }
      setSelectedAlert(null);
    }
  };

  const pendingAlerts = mismatchAlerts.filter(alert => alert.status === 'pending');
  const reviewedAlerts = mismatchAlerts.filter(alert => alert.status !== 'pending');

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/dashboard")}
                className="h-8 w-8"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h1 className="text-3xl font-bold">Exception Alerts</h1>
            </div>
            <p className="text-muted-foreground ml-11">Review and manage barcode mismatches</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="destructive" className="text-lg px-4 py-2">
              <AlertTriangle className="h-4 w-4 mr-2" />
              {pendingAlerts.length} Pending
            </Badge>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Mismatches</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{mismatchAlerts.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending Review</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-orange-600">{pendingAlerts.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Corrected</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{reviewedAlerts.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Pending Alerts */}
        {pendingAlerts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
                Pending Mismatches
              </CardTitle>
              <CardDescription>These require your review and action</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                <div className="space-y-4 pr-4">
                  {pendingAlerts.map((alert) => (
                    <Card key={alert.id} className="border-2 border-orange-200 dark:border-orange-900">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="bg-orange-50 dark:bg-orange-950 border-orange-300">
                                {alert.status.toUpperCase()}
                              </Badge>
                              <Badge variant="secondary" className="flex items-center gap-1">
                                {alert.step === 'doc-audit' ? (
                                  <ScanBarcode className="h-3 w-3" />
                                ) : (
                                  <Truck className="h-3 w-3" />
                                )}
                                {alert.step === 'doc-audit' ? 'Doc Audit' : 'Loading & Dispatch'}
                              </Badge>
                              <span className="text-sm text-muted-foreground">Invoice: {alert.invoiceId}</span>
                            </div>
                            <CardTitle className="text-xl">{alert.customer}</CardTitle>
                          </div>
                          <div>
                            <Button
                              size="sm"
                              variant="default"
                              className="bg-green-600 hover:bg-green-700"
                              onClick={() => handleCorrected(alert.id)}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                              Mark as Corrected
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {/* Metadata */}
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-3 bg-muted rounded-lg text-sm">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="text-xs text-muted-foreground">Scanned By</p>
                                <p className="font-medium">{alert.user}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="text-xs text-muted-foreground">Customer</p>
                                <p className="font-medium">{alert.customer}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="text-xs text-muted-foreground">Timestamp</p>
                                <p className="font-medium">{formatDate(alert.timestamp)}</p>
                              </div>
                            </div>
                          </div>

                          {/* Mismatch Comparison */}
                          <div className="grid md:grid-cols-2 gap-4">
                            {/* Customer Scan */}
                            <div className="p-4 border-2 border-blue-200 dark:border-blue-900 rounded-lg bg-blue-50 dark:bg-blue-950">
                              <h4 className="font-semibold mb-3 flex items-center gap-2">
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs">1</span>
                                Customer Label
                              </h4>
                              <div className="space-y-2 text-sm">
                                <div>
                                  <p className="text-xs text-muted-foreground">Part Code</p>
                                  <p className="font-mono font-bold">{alert.customerScan.partCode}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Quantity</p>
                                  <p className="font-mono font-bold">{alert.customerScan.quantity}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Bin Number</p>
                                  <p className="font-mono font-bold">{alert.customerScan.binNumber}</p>
                                </div>
                              </div>
                            </div>

                            {/* Autoliv Scan */}
                            <div className="p-4 border-2 border-accent/50 rounded-lg bg-accent/10">
                              <h4 className="font-semibold mb-3 flex items-center gap-2">
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-accent text-accent-foreground text-xs">2</span>
                                Autoliv Label
                              </h4>
                              <div className="space-y-2 text-sm">
                                <div>
                                  <p className="text-xs text-muted-foreground">Part Code</p>
                                  <p className="font-mono font-bold">{alert.autolivScan.partCode}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Quantity</p>
                                  <p className="font-mono font-bold">{alert.autolivScan.quantity}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Bin Number</p>
                                  <p className="font-mono font-bold">{alert.autolivScan.binNumber}</p>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Mismatch Warning */}
                          <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg">
                            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
                            <div className="text-sm">
                              <p className="font-semibold text-red-900 dark:text-red-100">Barcode Mismatch Detected</p>
                              <p className="text-red-700 dark:text-red-300">The customer and Autoliv barcodes do not match. After correction, mark this alert as corrected.</p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {/* Corrected Alerts */}
        {reviewedAlerts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Corrected Mismatches
              </CardTitle>
              <CardDescription>Previously corrected barcodes</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-3 pr-4">
                  {reviewedAlerts.map((alert) => (
                    <Card key={alert.id} className="border">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2 flex-wrap">
                              <Badge
                                variant="default"
                                className="bg-green-600"
                              >
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                CORRECTED
                              </Badge>
                              <Badge variant="outline" className="flex items-center gap-1">
                                {alert.step === 'doc-audit' ? (
                                  <ScanBarcode className="h-3 w-3" />
                                ) : (
                                  <Truck className="h-3 w-3" />
                                )}
                                {alert.step === 'doc-audit' ? 'Doc Audit' : 'Loading & Dispatch'}
                              </Badge>
                              <span className="font-semibold">{alert.customer}</span>
                              <span className="text-sm text-muted-foreground">({alert.invoiceId})</span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                              <div>
                                <p className="text-xs text-muted-foreground">Scanned By</p>
                                <p className="font-medium">{alert.user}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Corrected By</p>
                                <p className="font-medium">{alert.reviewedBy}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Scanned At</p>
                                <p className="font-medium">{formatDate(alert.timestamp)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Corrected At</p>
                                <p className="font-medium">{alert.reviewedAt ? formatDate(alert.reviewedAt) : 'N/A'}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {mismatchAlerts.length === 0 && (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <CheckCircle2 className="h-16 w-16 mx-auto text-green-600 mb-4" />
                <h3 className="text-xl font-semibold mb-2">No Mismatches Found</h3>
                <p className="text-muted-foreground">All barcode scans are matching correctly!</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={selectedAlert !== null} onOpenChange={() => setSelectedAlert(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Barcode Correction</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the barcode mismatch as corrected and remove it from pending alerts.
              Make sure the physical barcode has been corrected before confirming.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCorrected}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Confirm Corrected
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ExceptionAlerts;

