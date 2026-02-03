import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { QrCode, CheckCircle2, XCircle, Truck, Package, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { dispatchApi } from "@/lib/api";
import { decodeGatepassQrValue } from "@/lib/qrPayload";

type GatepassLoadedScanDetail = {
  id?: string;
  invoiceId: string;
  customerBarcode?: string | null;
  autolivBarcode?: string | null;
  customerItem?: string | null;
  itemNumber?: string | null;
  partDescription?: string | null;
  quantity?: number;
  binQuantity?: number | null;
  customerBinNumber?: string | null;
  autolivBinNumber?: string | null;
  status?: string | null;
  scannedBy?: string | null;
  scannedAt?: string | null;
  customerName?: string | null;
  customerCode?: string | null;
};

type VerifiedGatepassView = {
  gatepassNumber: string;
  vehicleNumber: string | null;
  customerCode: string | null;
  dispatchDateTimeText: string | null;
  authorizedBy: string | null;
  invoices: Array<{
    id: string;
    unloadingLoc?: string | null;
    deliveryDate?: string | null;
    deliveryTime?: string | null;
    status?: string | null;
  }>;
  itemSummary: Array<{
    invoiceId: string;
    customerItem: string;
    itemNumber: string;
    expectedQty: number | null;
    expectedBins: number | null;
    loadedQty: number | null;
    loadedBins: number | null;
  }>;
  loadedScansDetailed: GatepassLoadedScanDetail[];
};

const GatepassVerification = () => {
  const [qrCode, setQrCode] = useState("");
  const [verificationResult, setVerificationResult] = useState<"valid" | "invalid" | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [verified, setVerified] = useState<VerifiedGatepassView | null>(null);

  const totals = useMemo(() => {
    const binFromBins = verified?.loadedScansDetailed?.length ?? 0;
    const qtyFromBins = (verified?.loadedScansDetailed || []).reduce(
      (sum, s) => sum + (typeof s.binQuantity === "number" ? s.binQuantity : 0),
      0
    );

    const binFromItems = (verified?.itemSummary || []).reduce((sum, it) => sum + (it.loadedBins ?? 0), 0);
    const qtyFromItems = (verified?.itemSummary || []).reduce((sum, it) => sum + (it.loadedQty ?? 0), 0);

    const bins = binFromBins || binFromItems || 0;
    const qty = qtyFromBins || qtyFromItems || 0;
    return { bins, qty };
  }, [verified]);

  const formatDateTime = (iso: string | null | undefined) => {
    if (!iso) return "N/A";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "N/A" : d.toLocaleString();
  };

  const toVerifiedFromPayload = (payload: any): VerifiedGatepassView | null => {
    // Support both new readable payload keys and older short-key payloads.
    const gatepassNumber =
      typeof payload?.gatepassNumber === "string"
        ? payload.gatepassNumber
        : typeof payload?.gp === "string"
          ? payload.gp
          : null;
    if (!gatepassNumber) return null;

    const vehicleNumber =
      typeof payload?.vehicleNumber === "string" ? payload.vehicleNumber : typeof payload?.v === "string" ? payload.v : null;
    const customerCode =
      typeof payload?.customerCode === "string" ? payload.customerCode : typeof payload?.cc === "string" ? payload.cc : null;
    const dispatchDateTimeText =
      typeof payload?.dispatchTime === "string" ? payload.dispatchTime : typeof payload?.dt === "string" ? payload.dt : null;
    const authorizedBy =
      typeof payload?.authorizedBy === "string" ? payload.authorizedBy : typeof payload?.by === "string" ? payload.by : null;

    const invoices = Array.isArray(payload?.invoices)
      ? payload.invoices
          .map((i: any) => ({
            id: typeof i?.id === "string" ? i.id : "",
            unloadingLoc: typeof i?.unloadingLoc === "string" ? i.unloadingLoc : typeof i?.loc === "string" ? i.loc : null,
            deliveryDate: typeof i?.deliveryDate === "string" ? i.deliveryDate : typeof i?.dDate === "string" ? i.dDate : null,
            deliveryTime: typeof i?.deliveryTime === "string" ? i.deliveryTime : typeof i?.dTime === "string" ? i.dTime : null,
            status: typeof i?.status === "string" ? i.status : typeof i?.st === "string" ? i.st : null,
          }))
          .filter((x: any) => x.id)
      : Array.isArray(payload?.inv)
        ? payload.inv
            .map((i: any) => ({
              id: typeof i?.id === "string" ? i.id : "",
              unloadingLoc: typeof i?.loc === "string" ? i.loc : null,
              deliveryDate: typeof i?.dDate === "string" ? i.dDate : null,
              deliveryTime: typeof i?.dTime === "string" ? i.dTime : null,
              status: typeof i?.st === "string" ? i.st : null,
            }))
            .filter((x: any) => x.id)
        : [];

    const itemSummary = Array.isArray(payload?.items)
      ? payload.items
          .map((it: any) => ({
            invoiceId: typeof it?.invoiceId === "string" ? it.invoiceId : "",
            customerItem: typeof it?.customerItem === "string" ? it.customerItem : "",
            itemNumber: typeof it?.itemNumber === "string" ? it.itemNumber : "",
            expectedQty: typeof it?.expectedQty === "number" ? it.expectedQty : null,
            expectedBins: typeof it?.expectedBins === "number" ? it.expectedBins : null,
            loadedQty: typeof it?.loadedQty === "number" ? it.loadedQty : null,
            loadedBins: typeof it?.loadedBins === "number" ? it.loadedBins : null,
          }))
          .filter((x: any) => x.invoiceId && x.customerItem && x.itemNumber)
      : [];

    const loadedScansDetailed: GatepassLoadedScanDetail[] = Array.isArray(payload?.bins)
      ? payload.bins
          .map((b: any) => ({
            invoiceId: typeof b?.i === "string" ? b.i : "",
            customerItem: typeof b?.ci === "string" ? b.ci : null,
            itemNumber: typeof b?.in === "string" ? b.in : null,
            customerBinNumber: typeof b?.cb === "string" ? b.cb : null,
            autolivBinNumber: typeof b?.ab === "string" ? b.ab : null,
            binQuantity: typeof b?.q === "number" ? b.q : 0,
            scannedAt: typeof b?.t === "string" ? b.t : null,
          }))
          .filter((x: any) => x.invoiceId)
      : [];

    return {
      gatepassNumber,
      vehicleNumber,
      customerCode,
      dispatchDateTimeText,
      authorizedBy,
      invoices,
      itemSummary,
      loadedScansDetailed,
    };
  };

  const fetchFromServer = async (gatepassNumber: string) => {
    const res = await dispatchApi.getGatepass(gatepassNumber);
    if (!res?.success || !res?.gatepass) {
      throw new Error(res?.error || "Gatepass not found");
    }

    const gp = res.gatepass;
    const loaded: GatepassLoadedScanDetail[] = Array.isArray(gp.loadedScansDetailed) ? gp.loadedScansDetailed : [];

    const view: VerifiedGatepassView = {
      gatepassNumber: String(gp.gatepassNumber || gatepassNumber),
      vehicleNumber: gp.vehicleNumber ? String(gp.vehicleNumber) : null,
      customerCode: gp.customerCode ? String(gp.customerCode) : null,
      dispatchDateTimeText: gp.dispatchDate ? formatDateTime(gp.dispatchDate) : gp.createdAt ? formatDateTime(gp.createdAt) : null,
      authorizedBy: gp.authorizedBy ? String(gp.authorizedBy) : null,
      invoices: Array.isArray(gp.invoices) ? gp.invoices : [],
      itemSummary: [],
      loadedScansDetailed: loaded,
    };
    return view;
  };

  const handleVerify = async () => {
    const input = qrCode.trim();
    if (!input) {
      toast.error("Please enter or scan a QR code");
      return;
    }

    setLoading(true);
    setErrorText(null);
    setVerified(null);
    setVerificationResult(null);

    try {
      const decoded = decodeGatepassQrValue(input);

      if (decoded.kind === "invalid") {
        throw new Error(decoded.error);
      }

      if (decoded.kind === "gatepassNumber") {
        const view = await fetchFromServer(decoded.gatepassNumber);
        setVerified(view);
        setVerificationResult("valid");
        toast.success("Gatepass verified successfully!");
        return;
      }

      // decoded.kind === 'payload'
      const fromPayload = toVerifiedFromPayload(decoded.payload);
      const gpNum = fromPayload?.gatepassNumber;
      const hasBins = (fromPayload?.loadedScansDetailed?.length || 0) > 0;
      const hasItemSummary = (fromPayload?.itemSummary?.length || 0) > 0;

      // If QR includes bin details, we can show immediately (offline-friendly).
      // If it doesn't, fetch from server using gatepass number.
      if (fromPayload && (hasBins || hasItemSummary)) {
        setVerified(fromPayload);
        setVerificationResult("valid");
        toast.success("Gatepass verified successfully!");
        // If QR did not include bins, we still fetch from server to show full details.
        if (!hasBins && gpNum) {
          try {
            const view = await fetchFromServer(gpNum);
            setVerified((prev) => {
              if (!prev) return view;
              return { ...view, itemSummary: prev.itemSummary.length ? prev.itemSummary : view.itemSummary };
            });
          } catch {
            // keep offline summary view
          }
        }
        return;
      }

      if (!gpNum) {
        throw new Error("QR payload does not contain a gatepass number");
      }

      const view = await fetchFromServer(gpNum);
      setVerified(view);
      setVerificationResult("valid");
      toast.success("Gatepass verified successfully!");
    } catch (e: any) {
      const msg = String(e?.message || "Invalid gatepass");
      setErrorText(msg);
      setVerificationResult("invalid");
      toast.error("Invalid or forged gatepass!", { description: msg });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (!verified?.gatepassNumber) return;
    try {
      setLoading(true);
      const view = await fetchFromServer(verified.gatepassNumber);
      setVerified(view);
      toast.success("Refreshed from server");
    } catch (e: any) {
      toast.error("Failed to refresh", { description: String(e?.message || "Unknown error") });
    } finally {
      setLoading(false);
    }
  };

  const sortedBins = useMemo(() => {
    const bins = verified?.loadedScansDetailed || [];
    return bins.slice().sort((a, b) => {
      if (a.invoiceId !== b.invoiceId) return a.invoiceId.localeCompare(b.invoiceId);
      const ta = a.scannedAt ? new Date(a.scannedAt).getTime() : 0;
      const tb = b.scannedAt ? new Date(b.scannedAt).getTime() : 0;
      return tb - ta;
    });
  }, [verified]);

  return (
    <div className="min-h-screen bg-transparent">
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

      <main className="container mx-auto px-6 py-8 max-w-5xl">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Scan / Paste QR</CardTitle>
            <CardDescription>Paste the gatepass QR value or enter gatepass number (e.g. GP-12345678)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Scan QR / paste QR payload / enter gatepass number..."
              value={qrCode}
              onChange={(e) => setQrCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleVerify();
              }}
              className="h-14 text-sm font-mono"
            />
            <div className="flex gap-3">
              <Button onClick={handleVerify} className="h-12 flex-1" disabled={loading}>
                {loading ? "Verifying..." : "Verify Gatepass"}
              </Button>
              <Button
                onClick={() => {
                  setQrCode("");
                  setVerificationResult(null);
                  setVerified(null);
                  setErrorText(null);
                }}
                variant="outline"
                className="h-12"
                disabled={loading}
              >
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        {verificationResult && (
          <Card
            className={`border-2 ${
              verificationResult === "valid" ? "border-success bg-success/5" : "border-destructive bg-destructive/5"
            }`}
          >
            <CardContent className="pt-6">
              <div className="text-center mb-6">
                <div
                  className={`inline-flex p-4 rounded-full mb-4 ${
                    verificationResult === "valid" ? "bg-success/20" : "bg-destructive/20"
                  }`}
                >
                  {verificationResult === "valid" ? (
                    <CheckCircle2 className="h-16 w-16 text-success" />
                  ) : (
                    <XCircle className="h-16 w-16 text-destructive" />
                  )}
                </div>
                <h3 className={`text-2xl font-bold mb-2 ${verificationResult === "valid" ? "text-success" : "text-destructive"}`}>
                  {verificationResult === "valid" ? "Gatepass Verified" : "Invalid Gatepass"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {verificationResult === "valid"
                    ? "Vehicle is authorized to exit"
                    : errorText || "This gatepass is invalid or has been forged"}
                </p>
              </div>

              {verificationResult === "valid" && verified && (
                <div className="space-y-4">
                  <div className="bg-card rounded-lg p-4 border">
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <div className="text-left">
                        <p className="text-xs text-muted-foreground mb-1">Gatepass</p>
                        <p className="font-semibold">{verified.gatepassNumber}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">Bins: {totals.bins}</Badge>
                        <Badge variant="outline">Qty: {totals.qty}</Badge>
                        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Refresh
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                      <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                        <Truck className="h-8 w-8 text-primary" />
                        <div>
                          <p className="text-xs text-muted-foreground">Vehicle Number</p>
                          <p className="text-lg font-bold">{verified.vehicleNumber || "N/A"}</p>
                        </div>
                      </div>
                      <div className="p-3 bg-muted rounded-lg">
                        <p className="text-xs text-muted-foreground">Dispatch Time</p>
                        <p className="font-semibold">{verified.dispatchDateTimeText || "N/A"}</p>
                        <p className="text-xs text-muted-foreground mt-1">Customer Code: {verified.customerCode || "N/A"}</p>
                      </div>
                    </div>

                    <div className="space-y-2 mb-4">
                      <p className="text-sm font-semibold flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        Invoices
                      </p>
                      {verified.invoices.length === 0 ? (
                        <div className="text-sm text-muted-foreground">No invoice details available.</div>
                      ) : (
                        <div className="space-y-2">
                          {verified.invoices.map((inv) => (
                            <div key={inv.id} className="p-3 rounded border bg-muted/30">
                              <div className="flex items-center justify-between">
                                <div className="font-semibold">{inv.id}</div>
                                <Badge variant="outline">{inv.status || "unknown"}</Badge>
                              </div>
                              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                                <div>Unloading: <span className="text-foreground">{inv.unloadingLoc || "N/A"}</span></div>
                                <div>Delivery: <span className="text-foreground">{inv.deliveryDate || "N/A"} {inv.deliveryTime || ""}</span></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="border-t pt-4">
                      {verified.itemSummary.length > 0 ? (
                        <>
                          <p className="text-sm font-semibold mb-2">Item Summary (from QR)</p>
                          <div className="overflow-x-auto mb-4">
                            <table className="w-full text-xs min-w-[920px]">
                              <thead className="bg-background">
                                <tr className="border-b">
                                  <th className="text-left p-2 font-semibold">Invoice</th>
                                  <th className="text-left p-2 font-semibold">Customer Item</th>
                                  <th className="text-left p-2 font-semibold">Item Number</th>
                                  <th className="text-right p-2 font-semibold">Expected Bins</th>
                                  <th className="text-right p-2 font-semibold">Loaded Bins</th>
                                  <th className="text-right p-2 font-semibold">Expected Qty</th>
                                  <th className="text-right p-2 font-semibold">Loaded Qty</th>
                                </tr>
                              </thead>
                              <tbody>
                                {verified.itemSummary.map((it, idx) => (
                                  <tr key={`${it.invoiceId}::${it.customerItem}::${it.itemNumber}::${idx}`} className="border-b last:border-b-0">
                                    <td className="p-2 font-medium">{it.invoiceId}</td>
                                    <td className="p-2">{it.customerItem}</td>
                                    <td className="p-2">{it.itemNumber}</td>
                                    <td className="p-2 text-right font-semibold">{it.expectedBins ?? "N/A"}</td>
                                    <td className="p-2 text-right font-semibold">{it.loadedBins ?? 0}</td>
                                    <td className="p-2 text-right font-semibold">{it.expectedQty ?? "N/A"}</td>
                                    <td className="p-2 text-right font-semibold">{it.loadedQty ?? 0}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      ) : null}

                      <p className="text-sm font-semibold mb-2">Bin Details (Loaded Scans)</p>
                      {sortedBins.length === 0 ? (
                        <div className="text-sm text-muted-foreground">No loaded bin scan details available.</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs min-w-[920px]">
                            <thead className="bg-background">
                              <tr className="border-b">
                                <th className="text-left p-2 font-semibold">Invoice</th>
                                <th className="text-left p-2 font-semibold">Customer Item</th>
                                <th className="text-left p-2 font-semibold">Item Number</th>
                                <th className="text-left p-2 font-semibold">Cust Bin</th>
                                <th className="text-left p-2 font-semibold">Autoliv Bin</th>
                                <th className="text-right p-2 font-semibold">Bin Qty</th>
                                <th className="text-left p-2 font-semibold">Scanned At</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sortedBins.map((s, idx) => (
                                <tr key={`${s.invoiceId}::${s.customerBinNumber || "na"}::${idx}`} className="border-b last:border-b-0">
                                  <td className="p-2 font-medium">{s.invoiceId}</td>
                                  <td className="p-2">{s.customerItem || "N/A"}</td>
                                  <td className="p-2">{s.itemNumber || "N/A"}</td>
                                  <td className="p-2">{s.customerBinNumber || "N/A"}</td>
                                  <td className="p-2">{s.autolivBinNumber || "N/A"}</td>
                                  <td className="p-2 text-right font-semibold">{typeof s.binQuantity === "number" ? s.binQuantity : 0}</td>
                                  <td className="p-2">{formatDateTime(s.scannedAt)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    <div className="pt-3 border-t mt-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Authorized by</span>
                        <span className="font-medium">{verified.authorizedBy || "N/A"}</span>
                      </div>
                    </div>
                  </div>

                  <Button
                    onClick={() => {
                      setQrCode("");
                      setVerificationResult(null);
                      setVerified(null);
                      setErrorText(null);
                    }}
                    className="w-full"
                    disabled={loading}
                  >
                    Scan Next Gatepass
                  </Button>
                </div>
              )}

              {verificationResult === "invalid" && (
                <div className="space-y-3">
                  <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                    <p className="text-sm font-semibold text-destructive mb-2">Security Alert</p>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>Gatepass not verified</li>
                      <li>May be altered, truncated QR, or not found in system</li>
                      <li>Contact supervisor if needed</li>
                    </ul>
                    {errorText ? <p className="text-xs text-muted-foreground mt-2">Details: {errorText}</p> : null}
                  </div>
                  <Button variant="outline" className="w-full" disabled={loading} onClick={() => setVerificationResult(null)}>
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
