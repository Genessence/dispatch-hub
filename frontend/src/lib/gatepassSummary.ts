export type GatepassInvoiceDetails = {
  id: string;
  deliveryDate?: string | null;
  deliveryTime?: string | null;
  unloadingLoc?: string | null;
  status?: string | null;
};

export type GatepassLoadedScan = {
  invoiceId: string;
  customerItem?: string | null;
  itemNumber?: string | null;
  /** Quantity-per-bin from the scan (stored as string in UI state) */
  quantity?: string | number | null;
};

export type GatepassItemTotals = {
  customerItem: string;
  itemNumber: string;
  binsLoaded: number;
  qtyLoaded: number;
};

export type GatepassInvoiceSummary = {
  id: string;
  deliveryDate: string | null;
  deliveryTime: string | null;
  unloadingLoc: string | null;
  status: string;
  totals: {
    binsLoaded: number;
    qtyLoaded: number;
  };
  items: GatepassItemTotals[];
};

export type GatepassSummary = {
  gatepassNumber: string;
  vehicleNumber: string;
  authorizedBy: string;
  customerCode: string | null;
  dispatchDateIso: string | null;
  dispatchDateTimeText: string;
  invoiceIds: string[];
  invoices: GatepassInvoiceSummary[];
  grandTotals: {
    invoiceCount: number;
    itemLinesCount: number;
    binsLoaded: number;
    qtyLoaded: number;
  };
};

const normalize = (v: unknown): string => String(v ?? '').trim();

const safeInt = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : 0;
};

const formatDateTime = (isoOrDate: string | Date | null | undefined): string => {
  if (!isoOrDate) return 'N/A';
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return 'N/A';
  return d.toLocaleString();
};

const formatDateOnly = (isoOrDate: string | Date | null | undefined): string | null => {
  if (!isoOrDate) return null;
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

export function buildGatepassSummary(args: {
  gatepassNumber: string;
  vehicleNumber: string;
  authorizedBy: string;
  customerCode?: string | null;
  dispatchDateIso?: string | null;
  invoiceIds: string[];
  invoiceDetails?: GatepassInvoiceDetails[] | null;
  loadedScans: GatepassLoadedScan[];
}): GatepassSummary {
  const gatepassNumber = normalize(args.gatepassNumber) || 'N/A';
  const vehicleNumber = normalize(args.vehicleNumber) || 'N/A';
  const authorizedBy = normalize(args.authorizedBy) || 'N/A';
  const customerCode = args.customerCode ? normalize(args.customerCode) : null;

  const dispatchDateIso = args.dispatchDateIso ? String(args.dispatchDateIso) : null;
  const dispatchDateTimeText = dispatchDateIso ? formatDateTime(dispatchDateIso) : formatDateTime(new Date());

  const invoiceIds = (args.invoiceIds || []).map((id) => normalize(id)).filter(Boolean);

  // Index invoice delivery fields by id for fast lookup.
  const invDetailsById = new Map<string, GatepassInvoiceDetails>();
  for (const inv of args.invoiceDetails || []) {
    if (!inv?.id) continue;
    invDetailsById.set(normalize(inv.id), inv);
  }

  // Aggregate scans to invoice->item.
  const byInvoice = new Map<
    string,
    {
      byItem: Map<string, GatepassItemTotals>;
      binsLoaded: number;
      qtyLoaded: number;
    }
  >();

  for (const scan of args.loadedScans || []) {
    const invoiceId = normalize(scan.invoiceId);
    if (!invoiceId) continue;

    const customerItem = normalize(scan.customerItem) || 'N/A';
    const itemNumber = normalize(scan.itemNumber) || 'N/A';
    const qty = safeInt(scan.quantity);

    const inv = byInvoice.get(invoiceId) || { byItem: new Map(), binsLoaded: 0, qtyLoaded: 0 };
    inv.binsLoaded += 1;
    inv.qtyLoaded += qty;

    const itemKey = `${customerItem}||${itemNumber}`;
    const it = inv.byItem.get(itemKey) || { customerItem, itemNumber, binsLoaded: 0, qtyLoaded: 0 };
    it.binsLoaded += 1;
    it.qtyLoaded += qty;
    inv.byItem.set(itemKey, it);

    byInvoice.set(invoiceId, inv);
  }

  const invoices: GatepassInvoiceSummary[] = [];
  for (const invoiceId of invoiceIds) {
    const invAgg = byInvoice.get(invoiceId) || { byItem: new Map(), binsLoaded: 0, qtyLoaded: 0 };
    const details = invDetailsById.get(invoiceId);

    const deliveryDate = details?.deliveryDate ? formatDateOnly(details.deliveryDate) : null;
    const deliveryTime = details?.deliveryTime ? normalize(details.deliveryTime) : null;
    const unloadingLoc = details?.unloadingLoc ? normalize(details.unloadingLoc) : null;
    const status = normalize(details?.status) || 'unknown';

    const items = Array.from(invAgg.byItem.values()).sort((a, b) => {
      if (a.customerItem !== b.customerItem) return a.customerItem.localeCompare(b.customerItem);
      return a.itemNumber.localeCompare(b.itemNumber);
    });

    invoices.push({
      id: invoiceId,
      deliveryDate,
      deliveryTime,
      unloadingLoc,
      status,
      totals: { binsLoaded: invAgg.binsLoaded, qtyLoaded: invAgg.qtyLoaded },
      items,
    });
  }

  const grandBinsLoaded = (args.loadedScans || []).length;
  const grandQtyLoaded = (args.loadedScans || []).reduce((sum, s) => sum + safeInt(s.quantity), 0);
  const itemLinesCount = invoices.reduce((sum, inv) => sum + inv.items.length, 0);

  return {
    gatepassNumber,
    vehicleNumber,
    authorizedBy,
    customerCode,
    dispatchDateIso,
    dispatchDateTimeText,
    invoiceIds,
    invoices,
    grandTotals: {
      invoiceCount: invoiceIds.length,
      itemLinesCount,
      binsLoaded: grandBinsLoaded,
      qtyLoaded: grandQtyLoaded,
    },
  };
}

