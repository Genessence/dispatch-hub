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
import { AlertTriangle, Calendar as CalendarIcon, RefreshCcw, Search, Truck, CheckCircle2, Clock } from "lucide-react";

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
  uploadedAt?: string | null;
  vehicleNumber?: string | null;
  gatepassNumber?: string | null;
  blocked: boolean;
  // Present only for status=mismatched results
  mismatchTotalCount?: number | null;
  mismatchPendingCount?: number | null;
  latestMismatchAt?: string | null;
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
  const { sharedInvoices } = useSession();

  const [status, setStatus] = useState<"dispatched" | "audited" | "pending" | "mismatched" | "">(""); // Start with empty/no selection
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
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

  // Reset date filters when status changes (date meaning is status-dependent)
  useEffect(() => {
    setDateFrom(undefined);
    setDateTo(undefined);
    setOffset(0);
  }, [status]);

  const fetchRowsAtOffset = async (nextOffset: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await adminApi.getInvoiceReports({
        status: status || undefined,
        dateFrom: dateFrom ? formatDateOnly(dateFrom) : undefined,
        dateTo: dateTo ? formatDateOnly(dateTo) : undefined,
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

  // Refresh when filters change (only if status is selected)
  useEffect(() => {
    if (status) {
      fetchRowsAtOffset(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, dateFrom, dateTo, customer, limit]);

  const filteredRows = useMemo(() => {
    const q = invoiceSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => String(r.id || "").toLowerCase().includes(q));
  }, [rows, invoiceSearch]);

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + limit, total);
  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  const dateLabelPrefix =
    status === "dispatched"
      ? "Dispatch"
      : status === "audited"
        ? "Audited"
        : status === "pending"
          ? "Uploaded"
          : status === "mismatched"
            ? "Mismatch"
            : "Date";

  const rowDateValue = (r: InvoiceReportRow) => {
    if (status === "mismatched") return r.latestMismatchAt || null;
    if (status === "pending") return r.uploadedAt || null;
    if (status === "audited") return r.auditedAt || null;
    if (status === "dispatched") return r.dispatchedAt || null;
    return null;
  };

  const statusBadge = (r: InvoiceReportRow) => {
    if (status === "mismatched") {
      const pending = Number(r.mismatchPendingCount ?? 0) || 0;
      const totalCount = Number(r.mismatchTotalCount ?? 0) || 0;
      const isAllCorrected = pending === 0 && totalCount > 0;
      return (
        <div className="flex items-center gap-2 whitespace-nowrap">
          <Badge variant="destructive">MISMATCHED</Badge>
          {totalCount === 0 ? null : isAllCorrected ? (
            <Badge className="bg-green-600 text-white">All Corrected</Badge>
          ) : (
            <Badge variant="destructive">{pending} Pending</Badge>
          )}
          {totalCount > 0 ? (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              Total {totalCount}
            </Badge>
          ) : null}
        </div>
      );
    }
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
                  <SelectValue placeholder="Select status" />
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
                  <SelectItem value="mismatched">
                    <span className="inline-flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" /> Mismatched
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">{dateLabelPrefix} from</div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start" disabled={!status}>
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {dateFrom ? formatDateOnly(dateFrom) : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">{dateLabelPrefix} to</div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start" disabled={!status}>
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {dateTo ? formatDateOnly(dateTo) : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus />
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
          {!status ? (
            <div className="py-10 text-center text-muted-foreground">
              <p className="text-sm">Please select a status to view invoices</p>
            </div>
          ) : isLoading ? (
            <div className="py-10 text-center text-muted-foreground">Loading invoices…</div>
          ) : error ? (
            <div className="py-10 text-center text-red-600">{error}</div>
          ) : filteredRows.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">No invoices match the selected filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[920px] table-fixed">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left p-3 font-semibold w-[120px]">Invoice</th>
                    <th className="text-left p-3 font-semibold w-[220px]">Customer</th>
                    <th className="text-left p-3 font-semibold w-[170px]">Date</th>
                    <th className="text-left p-3 font-semibold w-[140px]">Vehicle Number</th>
                    <th className="text-left p-3 font-semibold w-[120px]">Status</th>
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
                      <td className="p-3 font-mono font-semibold truncate">{r.id}</td>
                      <td className="p-3 truncate" title={r.customer || "—"}>{r.customer || "—"}</td>
                      <td className="p-3 text-muted-foreground truncate" title={formatDateTime(rowDateValue(r))}>
                        {formatDateTime(rowDateValue(r))}
                      </td>
                      <td className="p-3 font-mono truncate" title={r.vehicleNumber || "—"}>{r.vehicleNumber || "—"}</td>
                      <td className="p-3 whitespace-nowrap">{statusBadge(r)}</td>
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
        mode={status === "mismatched" ? "mismatched" : "normal"}
        header={
          selectedRow
            ? {
                customer: selectedRow.customer,
                dispatchedAt: selectedRow.dispatchedAt || null,
                deliveryDate: selectedRow.deliveryDate || null,
                deliveryTime: selectedRow.deliveryTime || null,
                unloadingLoc: selectedRow.unloadingLoc || null,
                vehicleNumber: selectedRow.vehicleNumber || null,
              }
            : undefined
        }
      />
    </div>
  );
}

