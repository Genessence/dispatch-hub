import { useEffect, useMemo, useState } from "react";
import { adminApi } from "@/lib/api";
import { useSession } from "@/contexts/SessionContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { InvoiceReportInvoiceDialog } from "@/components/InvoiceReports/InvoiceReportInvoiceDialog";
import { Calendar as CalendarIcon, RefreshCcw, Search, Truck, CheckCircle2, Clock } from "lucide-react";

type InvoiceReportRow = {
  id: string;
  customer: string;
  billTo?: string | null;
  invoiceDate?: string | null;
  deliveryDate?: string | null;
  deliveryTime?: string | null;
  unloadingLoc?: string | null;
  totalQty?: number | null;
  expectedBins?: number | null;
  scannedBins?: number | null;
  auditComplete: boolean;
  auditedAt?: string | null;
  auditedBy?: string | null;
  dispatchedAt?: string | null;
  dispatchedBy?: string | null;
  vehicleNumber?: string | null;
  gatepassNumber?: string | null;
  blocked: boolean;
};

const formatDateOnly = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

export function InvoiceReportList() {
  const { sharedInvoices, scheduleData } = useSession();

  const [status, setStatus] = useState<"dispatched" | "audited" | "pending">("dispatched");
  const [dispatchFrom, setDispatchFrom] = useState<Date | undefined>(undefined);
  const [dispatchTo, setDispatchTo] = useState<Date | undefined>(undefined);
  const [deliveryFrom, setDeliveryFrom] = useState<Date | undefined>(undefined);
  const [deliveryTo, setDeliveryTo] = useState<Date | undefined>(undefined);
  const [deliveryTime, setDeliveryTime] = useState<string>("");
  const [unloadingLoc, setUnloadingLoc] = useState<string>("");
  const [customer, setCustomer] = useState<string>("");
  const [invoiceSearch, setInvoiceSearch] = useState<string>("");

  const [rows, setRows] = useState<InvoiceReportRow[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const selectedRow = useMemo(
    () => (selectedInvoiceId ? rows.find((r) => r.id === selectedInvoiceId) : undefined),
    [rows, selectedInvoiceId]
  );

  const customerOptions = useMemo(() => {
    const s = new Set<string>();
    for (const inv of sharedInvoices) {
      const c = String(inv?.customer || "").trim();
      if (c) s.add(c);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [sharedInvoices]);

  const unloadingOptions = useMemo(() => {
    const s = new Set<string>();
    const scheduleItems = scheduleData?.items ?? [];

    // Prefer schedule as source of truth for dropdown options.
    if (scheduleItems.length > 0) {
      for (const it of scheduleItems) {
        const u = String(it?.unloadingLoc || "").trim();
        if (u) s.add(u);
      }
      return Array.from(s).sort((a, b) => a.localeCompare(b));
    }

    // Fallback: derive from invoices so UI still works without schedule.
    for (const inv of sharedInvoices) {
      const u = String(inv?.unloadingLoc || "").trim();
      if (u) s.add(u);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [scheduleData, sharedInvoices]);

  const deliveryTimeOptions = useMemo(() => {
    const s = new Set<string>();
    const scheduleItems = scheduleData?.items ?? [];

    // Prefer schedule as source of truth for dropdown options.
    if (scheduleItems.length > 0) {
      for (const it of scheduleItems) {
        const t = String(it?.deliveryTime || "").trim();
        if (t) s.add(t);
      }
      return Array.from(s).sort((a, b) => a.localeCompare(b));
    }

    // Fallback: derive from invoices so UI still works without schedule.
    for (const inv of sharedInvoices) {
      const t = String(inv?.deliveryTime || "").trim();
      if (t) s.add(t);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [scheduleData, sharedInvoices]);

  const fetchRowsAtOffset = async (nextOffset: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await adminApi.getInvoiceReports({
        status,
        dispatchFrom: dispatchFrom ? formatDateOnly(dispatchFrom) : undefined,
        dispatchTo: dispatchTo ? formatDateOnly(dispatchTo) : undefined,
        deliveryFrom: deliveryFrom ? formatDateOnly(deliveryFrom) : undefined,
        deliveryTo: deliveryTo ? formatDateOnly(deliveryTo) : undefined,
        deliveryTime: deliveryTime || undefined,
        unloadingLoc: unloadingLoc || undefined,
        customer: customer || undefined,
        limit,
        offset: Math.max(0, nextOffset),
      });
      const items: InvoiceReportRow[] = Array.isArray(res?.invoices) ? res.invoices : [];
      setRows(items);
      setTotal(Number(res?.total ?? 0) || 0);
      setOffset(Number(res?.offset ?? nextOffset) || 0);
      setLimit(Number(res?.limit ?? limit) || limit);
    } catch (e: any) {
      setError(e?.message || "Failed to load invoices report");
      setRows([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  };

  // Refresh when filters change.
  useEffect(() => {
    fetchRowsAtOffset(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, dispatchFrom, dispatchTo, deliveryFrom, deliveryTo, deliveryTime, unloadingLoc, customer, limit]);

  const filteredRows = useMemo(() => {
    const q = invoiceSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => String(r.id || "").toLowerCase().includes(q));
  }, [rows, invoiceSearch]);

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + limit, total);
  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  const statusBadge = (r: InvoiceReportRow) => {
    if (r.dispatchedAt || r.dispatchedBy) return <Badge className="bg-purple-600">DISPATCHED</Badge>;
    if (r.auditComplete) return <Badge className="bg-green-600">AUDITED</Badge>;
    return <Badge variant="secondary">PENDING</Badge>;
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-[190px]">
              <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dispatched">
                    <span className="inline-flex items-center gap-2">
                      <Truck className="h-4 w-4" /> Dispatched
                    </span>
                  </SelectItem>
                  <SelectItem value="audited">
                    <span className="inline-flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" /> Audited
                    </span>
                  </SelectItem>
                  <SelectItem value="pending">
                    <span className="inline-flex items-center gap-2">
                      <Clock className="h-4 w-4" /> Pending
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[220px]">
              <Select value={customer || "__all__"} onValueChange={(v) => setCustomer(v === "__all__" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Customer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All customers</SelectItem>
                  {customerOptions.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[220px]">
              <Select
                value={unloadingLoc || "__all__"}
                onValueChange={(v) => setUnloadingLoc(v === "__all__" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Unloading loc" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All unloading loc</SelectItem>
                  {unloadingOptions.length === 0 ? (
                    <div className="px-2 py-2 text-xs text-muted-foreground">
                      No unloading locations found in schedule.
                    </div>
                  ) : null}
                  {unloadingOptions.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[180px]">
              <Select
                value={deliveryTime || "__all__"}
                onValueChange={(v) => setDeliveryTime(v === "__all__" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Delivery time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All times</SelectItem>
                  {deliveryTimeOptions.length === 0 ? (
                    <div className="px-2 py-2 text-xs text-muted-foreground">
                      No delivery times found in schedule.
                    </div>
                  ) : null}
                  {deliveryTimeOptions.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="outline"
              onClick={() => fetchRowsAtOffset(0)}
              disabled={isLoading}
              className="ml-auto"
            >
              <RefreshCcw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Dispatch from</div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {dispatchFrom ? formatDateOnly(dispatchFrom) : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0" align="start">
                  <Calendar mode="single" selected={dispatchFrom} onSelect={setDispatchFrom} initialFocus />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Dispatch to</div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {dispatchTo ? formatDateOnly(dispatchTo) : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0" align="start">
                  <Calendar mode="single" selected={dispatchTo} onSelect={setDispatchTo} initialFocus />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Delivery from</div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {deliveryFrom ? formatDateOnly(deliveryFrom) : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0" align="start">
                  <Calendar mode="single" selected={deliveryFrom} onSelect={setDeliveryFrom} initialFocus />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Delivery to</div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {deliveryTo ? formatDateOnly(deliveryTo) : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0" align="start">
                  <Calendar mode="single" selected={deliveryTo} onSelect={setDeliveryTo} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
                placeholder="Search invoice number…"
                className="pl-9"
              />
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{total}</span> total
              <span>•</span>
              <span className="font-medium text-foreground">
                {pageStart}-{pageEnd}
              </span>
              shown
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!canPrev || isLoading}
                onClick={() => {
                  void fetchRowsAtOffset(Math.max(0, offset - limit));
                }}
              >
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!canNext || isLoading}
                onClick={() => {
                  void fetchRowsAtOffset(offset + limit);
                }}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-10 text-center text-muted-foreground">Loading invoices…</div>
          ) : error ? (
            <div className="py-10 text-center text-red-600">{error}</div>
          ) : filteredRows.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">No invoices match the selected filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[980px]">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left p-3 font-semibold">Invoice</th>
                    <th className="text-left p-3 font-semibold">Customer</th>
                    <th className="text-left p-3 font-semibold">Dispatch date/time</th>
                    <th className="text-left p-3 font-semibold">Delivery date</th>
                    <th className="text-left p-3 font-semibold">Delivery time</th>
                    <th className="text-left p-3 font-semibold">Unloading loc</th>
                    <th className="text-left p-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t hover:bg-muted/30 cursor-pointer"
                      onClick={() => {
                        setSelectedInvoiceId(r.id);
                        setDetailOpen(true);
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <td className="p-3 font-mono font-semibold">{r.id}</td>
                      <td className="p-3">{r.customer || "—"}</td>
                      <td className="p-3 text-muted-foreground">{formatDateTime(r.dispatchedAt || null)}</td>
                      <td className="p-3 text-muted-foreground">{formatDateTime(r.deliveryDate || null)}</td>
                      <td className="p-3">{r.deliveryTime || "—"}</td>
                      <td className="p-3">{r.unloadingLoc || "—"}</td>
                      <td className="p-3">{statusBadge(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <InvoiceReportInvoiceDialog
        open={detailOpen}
        onOpenChange={(o) => {
          setDetailOpen(o);
          if (!o) setSelectedInvoiceId(null);
        }}
        invoiceId={selectedInvoiceId}
        header={
          selectedRow
            ? {
                customer: selectedRow.customer,
                dispatchedAt: selectedRow.dispatchedAt || null,
                deliveryDate: selectedRow.deliveryDate || null,
                deliveryTime: selectedRow.deliveryTime || null,
                unloadingLoc: selectedRow.unloadingLoc || null,
              }
            : undefined
        }
      />
    </div>
  );
}

