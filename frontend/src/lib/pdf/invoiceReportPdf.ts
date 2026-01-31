import jsPDF from "jspdf";

export type InvoiceReportHeader = {
  customer?: string | null;
  dispatchedAt?: string | null;
  deliveryDate?: string | null;
  deliveryTime?: string | null;
  unloadingLoc?: string | null;
};

export type InvoiceReportBinRow = {
  customerBinNumber?: string | null;
  autolivBinNumber?: string | null;
  binQty: number;
  scannedBy?: string | null;
  scannedAt?: string | null;
};

export type InvoiceReportItemGroup = {
  customerItem: string;
  itemNumber: string;
  partDescription?: string;
  binsCount: number;
  scannedQty: number;
  invoiceQty?: number | null;
  bins: InvoiceReportBinRow[];
};

const safeText = (v: unknown, fallback = "—") => {
  const s = String(v ?? "").trim();
  return s ? s : fallback;
};

const sanitizeFilenamePart = (value: string) => {
  return value
    .trim()
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
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

type PdfCtx = {
  pdf: jsPDF;
  pageWidth: number;
  pageHeight: number;
  margin: number;
  yPos: number;
};

const ensureSpace = (ctx: PdfCtx, neededHeight: number) => {
  const bottomLimit = ctx.pageHeight - ctx.margin;
  if (ctx.yPos + neededHeight <= bottomLimit) return;
  ctx.pdf.addPage();
  ctx.yPos = ctx.margin;
};

const drawSectionTitle = (ctx: PdfCtx, title: string) => {
  ensureSpace(ctx, 10);
  ctx.pdf.setFontSize(11);
  ctx.pdf.setFont(undefined, "bold");
  ctx.pdf.text(title, ctx.margin, ctx.yPos);
  ctx.yPos += 6;
  ctx.pdf.setFont(undefined, "normal");
};

const drawKeyValueRow = (ctx: PdfCtx, label: string, value: string) => {
  ensureSpace(ctx, 7);
  ctx.pdf.setFontSize(9);
  ctx.pdf.setFont(undefined, "bold");
  ctx.pdf.text(`${label}:`, ctx.margin, ctx.yPos);
  ctx.pdf.setFont(undefined, "normal");
  ctx.pdf.text(value, ctx.margin + 35, ctx.yPos);
  ctx.yPos += 5;
};

const drawTableHeader = (ctx: PdfCtx, columns: Array<{ label: string; x: number }>) => {
  ensureSpace(ctx, 10);
  ctx.pdf.setFontSize(8);
  ctx.pdf.setFont(undefined, "bold");
  columns.forEach((c) => ctx.pdf.text(c.label, c.x, ctx.yPos));
  ctx.yPos += 4;
  ctx.pdf.setDrawColor(200, 200, 200);
  ctx.pdf.line(ctx.margin, ctx.yPos, ctx.pageWidth - ctx.margin, ctx.yPos);
  ctx.yPos += 3;
  ctx.pdf.setFont(undefined, "normal");
};

const drawWrappedCell = (ctx: PdfCtx, text: string, x: number, maxWidth: number, lineHeight: number, maxLines: number) => {
  const lines = ctx.pdf.splitTextToSize(text, maxWidth) as string[];
  const clipped = lines.length > maxLines ? [...lines.slice(0, maxLines - 1), `${lines[maxLines - 1]}…`] : lines;
  clipped.forEach((ln, idx) => {
    ctx.pdf.text(ln, x, ctx.yPos + idx * lineHeight);
  });
  return clipped.length;
};

export function downloadInvoiceReportPdf(args: {
  invoiceId: string;
  header?: InvoiceReportHeader;
  totalBins: number;
  totalItems: number;
  totalScannedQty: number;
  groups: InvoiceReportItemGroup[];
}) {
  const { invoiceId, header, totalBins, totalItems, totalScannedQty, groups } = args;

  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const ctx: PdfCtx = { pdf, pageWidth, pageHeight, margin, yPos: margin };

  // Title block
  pdf.setFontSize(16);
  pdf.setFont(undefined, "bold");
  pdf.text("Invoice Report", pageWidth / 2, ctx.yPos, { align: "center" });
  ctx.yPos += 8;
  pdf.setFontSize(10);
  pdf.setFont(undefined, "normal");
  pdf.text(`Invoice: ${invoiceId}`, pageWidth / 2, ctx.yPos, { align: "center" });
  ctx.yPos += 10;

  // Header fields (from list row header props)
  drawSectionTitle(ctx, "Header");
  drawKeyValueRow(ctx, "Customer", safeText(header?.customer));
  drawKeyValueRow(ctx, "Dispatch date/time", formatDateTime(header?.dispatchedAt || null));
  drawKeyValueRow(ctx, "Delivery date", formatDateTime(header?.deliveryDate || null));
  drawKeyValueRow(ctx, "Delivery time", safeText(header?.deliveryTime));
  drawKeyValueRow(ctx, "Unloading loc", safeText(header?.unloadingLoc));

  ctx.yPos += 2;
  drawSectionTitle(ctx, "Summary");
  drawKeyValueRow(ctx, "Total bins", String(totalBins));
  drawKeyValueRow(ctx, "Total items", String(totalItems));
  drawKeyValueRow(ctx, "Total scanned qty", String(totalScannedQty));

  // Item summary table
  ctx.yPos += 2;
  drawSectionTitle(ctx, "Item Summary");
  const itemCols = [
    { label: "Customer Item", x: margin },
    { label: "Item No", x: margin + 45 },
    { label: "Description", x: margin + 75 },
    { label: "Bins", x: margin + 130 },
    { label: "Scanned Qty", x: margin + 143 },
    { label: "Invoice Qty", x: margin + 170 },
  ];
  drawTableHeader(ctx, itemCols);

  pdf.setFontSize(8);
  const itemLineHeight = 3.5;
  for (const g of groups) {
    const desc = safeText(g.partDescription, "");
    const invoiceQty = g.invoiceQty === null || g.invoiceQty === undefined ? "—" : String(g.invoiceQty);

    // Wrapped row height (we allow up to 2 lines for Customer Item + 2 lines for Description)
    const maxLines = Math.max(
      1,
      desc ? (pdf.splitTextToSize(desc, 52) as string[]).slice(0, 2).length : 1,
      (pdf.splitTextToSize(safeText(g.customerItem), 42) as string[]).slice(0, 2).length
    );
    const rowHeight = Math.max(1, maxLines) * itemLineHeight + 1;
    ensureSpace(ctx, rowHeight + 2);

    const linesA = drawWrappedCell(ctx, safeText(g.customerItem), itemCols[0].x, 42, itemLineHeight, 2);
    drawWrappedCell(ctx, safeText(g.itemNumber), itemCols[1].x, 28, itemLineHeight, 1);
    if (desc) drawWrappedCell(ctx, desc, itemCols[2].x, 52, itemLineHeight, 2);
    pdf.text(String(g.binsCount), itemCols[3].x, ctx.yPos);
    pdf.text(String(g.scannedQty), itemCols[4].x, ctx.yPos);
    pdf.text(invoiceQty, itemCols[5].x, ctx.yPos);

    ctx.yPos += Math.max(linesA, maxLines) * itemLineHeight + 2;
  }

  // Bin details section (mirrors the UI per group)
  ctx.yPos += 3;
  drawSectionTitle(ctx, "Bin Details (Paired Doc Audit)");

  const binCols = [
    { label: "Customer Bin", x: margin },
    { label: "Autoliv Bin", x: margin + 45 },
    { label: "Bin Qty", x: margin + 90 },
    { label: "Scanned By", x: margin + 108 },
    { label: "Time", x: margin + 145 },
  ];

  for (const g of groups) {
    // Group heading
    ensureSpace(ctx, 14);
    pdf.setFontSize(10);
    pdf.setFont(undefined, "bold");
    const heading = `${safeText(g.customerItem)} • ${safeText(g.itemNumber)}`;
    pdf.text(heading, margin, ctx.yPos);
    ctx.yPos += 5;

    pdf.setFontSize(8);
    pdf.setFont(undefined, "normal");
    const meta = `Bins: ${g.binsCount}   Scanned Qty: ${g.scannedQty}   Invoice Qty: ${
      g.invoiceQty === null || g.invoiceQty === undefined ? "—" : String(g.invoiceQty)
    }`;
    const metaLines = pdf.splitTextToSize(meta, pageWidth - 2 * margin) as string[];
    pdf.text(metaLines, margin, ctx.yPos);
    ctx.yPos += metaLines.length * 3.5 + 2;

    drawTableHeader(ctx, binCols);

    pdf.setFontSize(8);
    const rowLH = 3.5;
    for (const b of g.bins) {
      ensureSpace(ctx, 8);
      pdf.text(safeText(b.customerBinNumber), binCols[0].x, ctx.yPos);
      pdf.text(safeText(b.autolivBinNumber), binCols[1].x, ctx.yPos);
      pdf.text(String(Number(b.binQty ?? 0) || 0), binCols[2].x, ctx.yPos);
      pdf.text(safeText(b.scannedBy), binCols[3].x, ctx.yPos);
      pdf.text(formatDateTime(b.scannedAt || null), binCols[4].x, ctx.yPos);
      ctx.yPos += rowLH + 2;
    }

    ctx.yPos += 2;
  }

  const dateStr = new Date().toISOString().split("T")[0];
  const safeInvoice = sanitizeFilenamePart(invoiceId) || "invoice";
  const fileName = `Invoice_Report_${safeInvoice}_${dateStr}.pdf`;
  pdf.save(fileName);
  return fileName;
}

