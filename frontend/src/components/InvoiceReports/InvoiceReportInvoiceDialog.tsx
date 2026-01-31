import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AlertTriangle, Package, ScanBarcode } from "lucide-react";
import { auditApi, invoicesApi } from "@/lib/api";

type ScanRow = {
  id: string;
  customerItem?: string | null;
  itemNumber?: string | null;
  partDescription?: string | null;
  quantity?: number | null;
  binQuantity?: number | null;
  customerBinNumber?: string | null;
  autolivBinNumber?: string | null;
  customerBarcode?: string | null;
  autolivBarcode?: string | null;
  scannedBy?: string | null;
  scannedAt?: string | null;
  status?: string | null;
};

type InvoiceItemRow = {
  customerItem?: string | null;
  part?: string | null;
  qty?: number | null;
  partDescription?: string | null;
};

const formatDateTime = (value: string | Date | null | undefined) => {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export function InvoiceReportInvoiceDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string | null;
  header?: {
    customer?: string | null;
    dispatchedAt?: string | null;
    deliveryDate?: string | null;
    deliveryTime?: string | null;
    unloadingLoc?: string | null;
  };
}) {
  const { open, onOpenChange, invoiceId, header } = props;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scans, setScans] = useState<ScanRow[]>([]);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItemRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!open || !invoiceId) return;

    setIsLoading(true);
    setError(null);
    setScans([]);
    setInvoiceItems([]);

    (async () => {
      try {
        const [scansRes, invoiceRes] = await Promise.all([
          auditApi.getScans(invoiceId, "doc-audit"),
          invoicesApi.getById(invoiceId),
        ]);

        if (cancelled) return;

        const rawScans: ScanRow[] = Array.isArray(scansRes?.scans) ? scansRes.scans : [];
        // Only show paired doc-audit scans (autoliv side present) to avoid “pending customer scan” rows.
        const paired = rawScans.filter((s) => (s?.autolivBarcode ?? "").toString().trim().length > 0);
        setScans(paired);

        const items: InvoiceItemRow[] = Array.isArray(invoiceRes?.invoice?.items) ? invoiceRes.invoice.items : [];
        setInvoiceItems(items);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || "Failed to load invoice details");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, invoiceId]);

  const invoiceQtyByItemKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of invoiceItems) {
      const customerItem = String(it?.customerItem || "").trim();
      if (!customerItem) continue;
      const itemNumber = String(it?.part || "N/A").trim() || "N/A";
      const key = `${customerItem}||${itemNumber}`;
      const qty = Number(it?.qty ?? 0) || 0;
      m.set(key, (m.get(key) ?? 0) + qty);
    }
    return m;
  }, [invoiceItems]);

  const groups = useMemo(() => {
    const byKey = new Map<
      string,
      {
        key: string;
        customerItem: string;
        itemNumber: string;
        partDescription: string;
        scans: Array<
          ScanRow & {
            binQty: number;
          }
        >;
        totalScannedQty: number;
      }
    >();

    for (const s of scans) {
      const customerItem = String(s?.customerItem ?? "N/A").trim() || "N/A";
      const itemNumber = String(s?.itemNumber ?? "N/A").trim() || "N/A";
      const key = `${customerItem}||${itemNumber}`;
      const partDescription = String(s?.partDescription ?? "").trim();
      const binQty = Number(s?.binQuantity ?? s?.quantity ?? 0) || 0;

      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, {
          key,
          customerItem,
          itemNumber,
          partDescription,
          scans: [{ ...s, binQty }],
          totalScannedQty: binQty,
        });
      } else {
        existing.scans.push({ ...s, binQty });
        existing.totalScannedQty += binQty;
        // Prefer non-empty description if present later
        if (!existing.partDescription && partDescription) existing.partDescription = partDescription;
      }
    }

    return Array.from(byKey.values()).sort((a, b) => a.customerItem.localeCompare(b.customerItem));
  }, [scans]);

  const totalBins = scans.length;
  const totalScannedQty = groups.reduce((sum, g) => sum + (Number(g.totalScannedQty) || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Invoice Details{invoiceId ? `: ${invoiceId}` : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="outline">{header?.customer || "Unknown customer"}</Badge>
          <Badge variant="secondary">{totalBins} bins</Badge>
          <Badge variant="secondary">{groups.length} items</Badge>
          <Badge variant="outline">Scanned Qty {totalScannedQty}</Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <Card>
            <CardContent className="p-3 text-xs space-y-1">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Dispatch date/time</span>
                <span className="font-medium">{formatDateTime(header?.dispatchedAt || null)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Delivery date</span>
                <span className="font-medium">{formatDateTime(header?.deliveryDate || null)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Delivery time</span>
                <span className="font-medium">{header?.deliveryTime || "—"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Unloading loc</span>
                <span className="font-medium">{header?.unloadingLoc || "—"}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 text-xs space-y-1">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Scan source</span>
                <span className="font-medium">Doc Audit (paired)</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Shows bin numbers</span>
                <span className="font-medium">Customer + Autoliv</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <ScrollArea className="h-[55vh] pr-4">
          {isLoading ? (
            <div className="py-10 text-center text-muted-foreground">Loading invoice data…</div>
          ) : error ? (
            <div className="py-10 text-center">
              <div className="inline-flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-medium">Failed to load invoice</span>
              </div>
              <div className="text-sm text-muted-foreground mt-1">{error}</div>
            </div>
          ) : groups.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <ScanBarcode className="h-10 w-10 mx-auto mb-2 opacity-50" />
              No paired doc-audit scans found for this invoice.
            </div>
          ) : (
            <Accordion type="multiple" className="w-full">
              {groups.map((g) => {
                const invoiceQty = invoiceQtyByItemKey.get(g.key);
                return (
                  <AccordionItem key={g.key} value={g.key} className="border rounded-md mb-2 overflow-hidden">
                    <AccordionTrigger className="px-3 py-2 hover:no-underline bg-muted/30">
                      <div className="flex flex-1 items-start justify-between gap-3 min-w-0">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold truncate">{g.customerItem}</span>
                            <span className="text-xs text-muted-foreground">•</span>
                            <span className="text-xs font-mono text-muted-foreground truncate">{g.itemNumber}</span>
                          </div>
                          {g.partDescription ? (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">{g.partDescription}</p>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="secondary" className="text-xs">
                            {g.scans.length} bins
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            Scanned Qty {g.totalScannedQty}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            Invoice Qty {invoiceQty ?? "—"}
                          </Badge>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-3">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs min-w-[760px]">
                          <thead className="bg-muted/40">
                            <tr>
                              <th className="text-left p-2 font-semibold">Customer Bin</th>
                              <th className="text-left p-2 font-semibold">Autoliv Bin</th>
                              <th className="text-left p-2 font-semibold">Bin Qty</th>
                              <th className="text-left p-2 font-semibold">Scanned By</th>
                              <th className="text-left p-2 font-semibold">Time</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.scans.map((s, idx) => (
                              <tr key={s.id || `${g.key}-${idx}`} className="border-t hover:bg-muted/30">
                                <td className="p-2 font-mono">{s.customerBinNumber ? String(s.customerBinNumber) : "—"}</td>
                                <td className="p-2 font-mono">{s.autolivBinNumber ? String(s.autolivBinNumber) : "—"}</td>
                                <td className="p-2 font-semibold">{Number(s.binQty ?? 0) || 0}</td>
                                <td className="p-2">{s.scannedBy || "—"}</td>
                                <td className="p-2 text-muted-foreground">{formatDateTime(s.scannedAt || null)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

