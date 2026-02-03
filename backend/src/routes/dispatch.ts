import { Router, Response } from 'express';
import { query, transaction } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { Server as SocketIOServer } from 'socket.io';
import { canonicalizeBarcode, encodeAsciiTriplets } from '../utils/barcodeNormalization';
import { cacheGetOrSet, CACHE_TTL, CACHE_KEY } from '../utils/cache';

const router = Router();

const normalizeOptionalString = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
};

type GatepassLoadedScanDetail = {
  id: string;
  invoiceId: string;
  customerBarcode: string | null;
  autolivBarcode: string | null;
  customerItem: string | null;
  itemNumber: string | null;
  partDescription: string | null;
  quantity: number;
  binQuantity: number | null;
  customerBinNumber: string | null;
  autolivBinNumber: string | null;
  status: string | null;
  scannedBy: string | null;
  scannedAt: string | null;
  customerName: string | null;
  customerCode: string | null;
};

const mapLoadedScanRow = (r: any): GatepassLoadedScanDetail => ({
  id: String(r.id),
  invoiceId: String(r.invoice_id),
  customerBarcode: normalizeOptionalString(r.customer_barcode),
  // Prefer enriched autoliv barcode if present; fallback to stored value.
  autolivBarcode: normalizeOptionalString(r.autoliv_barcode_enriched ?? r.autoliv_barcode),
  customerItem: normalizeOptionalString(r.customer_item),
  itemNumber: normalizeOptionalString(r.item_number),
  partDescription: normalizeOptionalString(r.part_description),
  quantity: typeof r.quantity === 'number' ? r.quantity : parseInt(String(r.quantity ?? '0'), 10) || 0,
  binQuantity: r.bin_quantity === null || r.bin_quantity === undefined ? null : parseInt(String(r.bin_quantity), 10) || 0,
  customerBinNumber: normalizeOptionalString(r.customer_bin_number),
  autolivBinNumber: normalizeOptionalString(r.autoliv_bin_number),
  status: normalizeOptionalString(r.status),
  scannedBy: normalizeOptionalString(r.scanned_by),
  scannedAt: r.scanned_at ? String(r.scanned_at) : null,
  customerName: normalizeOptionalString(r.customer_name),
  customerCode: normalizeOptionalString(r.customer_code),
});

/**
 * Server-truth: fetch all loading-dispatch scans for a set of invoices, enriched with
 * autoliv fields from doc-audit (when dispatch scan only has customer label).
 *
 * Matching strategy (best-effort):
 * - Prefer exact customer_barcode match (canonical payload)
 * - Fallback to customer_bin_number match (bin identity)
 */
const getLoadedScanDetailsForInvoices = async (invoiceIds: string[]): Promise<GatepassLoadedScanDetail[]> => {
  const ids = (invoiceIds || []).map((x) => String(x || '').trim()).filter(Boolean);
  if (ids.length === 0) return [];

  // Primary query: includes bin numbers + enrichment join.
  try {
    const result = await query(
      `
      SELECT
        l.id,
        l.invoice_id,
        l.customer_barcode,
        l.autoliv_barcode,
        l.customer_item,
        l.item_number,
        l.part_description,
        l.quantity,
        l.bin_quantity,
        l.customer_bin_number,
        COALESCE(l.autoliv_bin_number, d.autoliv_bin_number) AS autoliv_bin_number,
        COALESCE(l.autoliv_barcode, d.autoliv_barcode) AS autoliv_barcode_enriched,
        l.status,
        l.scanned_by,
        l.scanned_at,
        l.customer_name,
        l.customer_code
      FROM validated_barcodes l
      LEFT JOIN LATERAL (
        SELECT vb.autoliv_bin_number, vb.autoliv_barcode
        FROM validated_barcodes vb
        WHERE vb.invoice_id = l.invoice_id
          AND vb.scan_context = 'doc-audit'
          AND (
            (l.customer_barcode IS NOT NULL AND vb.customer_barcode = l.customer_barcode)
            OR (l.customer_bin_number IS NOT NULL AND vb.customer_bin_number = l.customer_bin_number)
          )
          AND (vb.autoliv_bin_number IS NOT NULL OR vb.autoliv_barcode IS NOT NULL)
        ORDER BY vb.scanned_at DESC
        LIMIT 1
      ) d ON TRUE
      WHERE l.scan_context = 'loading-dispatch'
        AND l.invoice_id = ANY($1)
      ORDER BY l.invoice_id, l.scanned_at DESC
      `,
      [ids]
    );

    return (result.rows || []).map(mapLoadedScanRow);
  } catch (e: any) {
    // Fallback for older schemas missing newer columns (bin numbers / scan_context).
    const msg = String(e?.message || '');
    console.warn('Loaded scan details query failed; falling back:', msg);

    try {
      const result = await query(
        `
        SELECT
          id,
          invoice_id,
          customer_barcode,
          autoliv_barcode,
          customer_item,
          item_number,
          part_description,
          quantity,
          NULL::int AS bin_quantity,
          NULL::text AS customer_bin_number,
          NULL::text AS autoliv_bin_number,
          autoliv_barcode AS autoliv_barcode_enriched,
          status,
          scanned_by,
          scanned_at,
          customer_name,
          customer_code
        FROM validated_barcodes
        WHERE invoice_id = ANY($1)
        ORDER BY invoice_id, scanned_at DESC
        `,
        [ids]
      );
      return (result.rows || []).map(mapLoadedScanRow);
    } catch (e2) {
      console.warn('Fallback loaded scan details query also failed:', e2);
      return [];
    }
  }
};

const toIsoDateOnly = (v: unknown): string | null => {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  // Preserve already-normalized DATE-only values from Postgres (stable, no timezone ambiguity).
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  // IMPORTANT: date-only business fields should never be derived via UTC `toISOString()`
  // because timezone offsets can shift the calendar date.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const getInvoicePartCandidates = async (invoiceId: string): Promise<string[]> => {
  const items = await query(
    `SELECT customer_item, part
     FROM invoice_items
     WHERE invoice_id = $1`,
    [invoiceId]
  );

  const s = new Set<string>();
  for (const r of items.rows || []) {
    const a = normalizeOptionalString(r.customer_item);
    const b = normalizeOptionalString(r.part);
    if (a) s.add(a);
    if (b) s.add(b);
  }
  return Array.from(s);
};

const getScheduleFallback = async (args: {
  invoiceId: string;
  invoiceDeliveryDate: unknown;
  missing: { deliveryDate: boolean; deliveryTime: boolean; unloadingLoc: boolean };
}): Promise<{ deliveryDate: string | null; deliveryTime: string | null; unloadingLoc: string | null }> => {
  const invoiceDateOnly = toIsoDateOnly(args.invoiceDeliveryDate);
  const parts = await getInvoicePartCandidates(args.invoiceId);

  // Helper: normalize results
  const pick = (row: any) => ({
    deliveryDate: row?.delivery_date ? toIsoDateOnly(row.delivery_date) : null,
    deliveryTime: normalizeOptionalString(row?.delivery_time),
    unloadingLoc: normalizeOptionalString(row?.unloading_loc),
  });

  // Use caching for schedule fallback to reduce database queries
  const cacheKey = `${CACHE_KEY.SCHEDULE_BY_DATE}${invoiceDateOnly}:${parts.join(',')}`;
  
  return await cacheGetOrSet(cacheKey, CACHE_TTL.SCHEDULE_ITEMS, async () => {
    // Optimized: Single query with UNION ALL and priority ordering (instead of 3 sequential queries)
    try {
      const hasDate = !!invoiceDateOnly;
      const hasParts = parts.length > 0;

      // Build query with all fallback strategies, ordered by priority
      let queryText = '';
      const params: any[] = [];
      
      if (hasDate && hasParts) {
        // Priority 1: Match by date + parts
        queryText = `
          SELECT 1 as priority, delivery_date, delivery_time, unloading_loc
          FROM schedule_items
          WHERE delivery_date = $1::date
            AND (part_number = ANY($2) OR customer_part = ANY($2))
            AND (delivery_time IS NOT NULL OR unloading_loc IS NOT NULL)
          ORDER BY delivery_time NULLS LAST
          LIMIT 1`;
        params.push(invoiceDateOnly, parts);
      }

      if (hasDate) {
        // Priority 2: Match by date only
        if (queryText) queryText += ' UNION ALL ';
        const p1 = params.length + 1;
        queryText += `
          SELECT 2 as priority, delivery_date, delivery_time, unloading_loc
          FROM schedule_items
          WHERE delivery_date = $${p1}::date
            AND (delivery_time IS NOT NULL OR unloading_loc IS NOT NULL)
          ORDER BY delivery_time NULLS LAST
          LIMIT 1`;
        params.push(invoiceDateOnly);
      }

      if (hasParts) {
        // Priority 3: Match by parts only
        if (queryText) queryText += ' UNION ALL ';
        const p1 = params.length + 1;
        queryText += `
          SELECT 3 as priority, delivery_date, delivery_time, unloading_loc
          FROM schedule_items
          WHERE (part_number = ANY($${p1}) OR customer_part = ANY($${p1}))
            AND (delivery_date IS NOT NULL OR delivery_time IS NOT NULL OR unloading_loc IS NOT NULL)
          ORDER BY delivery_date DESC NULLS LAST
          LIMIT 1`;
        params.push(parts);
      }

      if (queryText) {
        // Wrap with outer query to get the highest priority result
        const finalQuery = `SELECT delivery_date, delivery_time, unloading_loc FROM (${queryText}) AS fallback ORDER BY priority LIMIT 1`;
        const result = await query(finalQuery, params);
        if (result.rows?.length) return pick(result.rows[0]);
      }
    } catch (e) {
      console.warn('Schedule fallback query failed:', e);
    }
    
    return { deliveryDate: null, deliveryTime: null, unloadingLoc: null };
  });

  return { deliveryDate: null, deliveryTime: null, unloadingLoc: null };
};

/**
 * GET /api/dispatch/ready
 * Get invoices ready for dispatch (audited but not dispatched)
 */
router.get('/ready', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    // Get invoices that are audited, not dispatched (invoice-first; schedule no longer gates dispatch readiness)
    const result = await query(`
      SELECT i.* FROM invoices i
      WHERE i.audit_complete = true 
        AND i.dispatched_by IS NULL
        AND i.blocked = false
      ORDER BY i.created_at DESC
    `);

    // Batch fetch all items for all invoices (optimized: single query instead of N queries)
    const invoiceIds = result.rows.map((inv: any) => inv.id);
    let allItemsResult;
    
    if (invoiceIds.length > 0) {
      allItemsResult = await query(
        'SELECT * FROM invoice_items WHERE invoice_id = ANY($1) ORDER BY invoice_id',
        [invoiceIds]
      );
    } else {
      allItemsResult = { rows: [] };
    }

    // Group items by invoice_id for quick lookup
    const itemsByInvoiceId = new Map<string, any[]>();
    for (const item of allItemsResult.rows) {
      if (!itemsByInvoiceId.has(item.invoice_id)) {
        itemsByInvoiceId.set(item.invoice_id, []);
      }
      itemsByInvoiceId.get(item.invoice_id)!.push({
        invoice: item.invoice_id,
        customer: item.customer,
        part: item.part,
        qty: item.qty,
        customerItem: item.customer_item,
        partDescription: item.part_description
      });
    }

    // Map invoices to their items (no async needed, just in-memory lookup)
    const invoices = result.rows.map((invoice: any) => ({
      ...invoice,
      items: itemsByInvoiceId.get(invoice.id) || []
    }));

    res.json({
      success: true,
      invoices: invoices.map((inv) => ({
        id: inv.id,
        customer: inv.customer,
        billTo: inv.bill_to,
        totalQty: inv.total_qty,
        expectedBins: inv.expected_bins,
        scannedBins: inv.scanned_bins,
        auditComplete: inv.audit_complete,
        auditedBy: inv.audited_by,
        items: inv.items
      }))
    });
  } catch (error) {
    console.error('Get ready invoices error:', error);
    res.status(500).json({ error: 'Failed to fetch ready invoices' });
  }
});

/**
 * POST /api/dispatch
 * Dispatch invoices and generate gatepass
 */
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { 
    invoiceIds, 
    vehicleNumber, 
    loadedBarcodes = [] 
  } = req.body;

  try {

    if (!invoiceIds || invoiceIds.length === 0) {
      return res.status(400).json({ error: 'No invoices provided' });
    }

    if (!vehicleNumber) {
      return res.status(400).json({ error: 'Vehicle number required' });
    }

    const gatepassNumber = `GP-${Date.now().toString().slice(-8)}`;
    const dispatchDate = new Date();
    const totalQuantity = loadedBarcodes.reduce((sum: number, b: any) => sum + (parseInt(b.quantity || '0') || 0), 0);

    await transaction(async (client) => {
      // Batch fetch all invoices (optimized: single query instead of N queries)
      const invoicesResult = await client.query(
        'SELECT * FROM invoices WHERE id = ANY($1)',
        [invoiceIds]
      );

      if (invoicesResult.rows.length !== invoiceIds.length) {
        const foundIds = new Set(invoicesResult.rows.map((r: any) => r.id));
        const missingIds = invoiceIds.filter((id: string) => !foundIds.has(id));
        throw new Error(`Invoice(s) not found: ${missingIds.join(', ')}`);
      }

      const invoiceDetails: Map<string, any> = new Map();
      const customerCodes = new Set<string>();
      
      for (const invoice of invoicesResult.rows) {
        invoiceDetails.set(invoice.id, invoice);
        const customerCode = invoice.bill_to || invoice.billTo;
        if (customerCode) {
          customerCodes.add(customerCode);
        }
      }

      // Validate all invoices have the same customer code
      if (customerCodes.size > 1) {
        const codesArray = Array.from(customerCodes);
        const errorMessage = `Invoices have different customer codes: ${codesArray.join(', ')}. All invoices in a vehicle must have the same customer code.`;
        
        // Log alert for admin
        console.error('CUSTOMER CODE MISMATCH ALERT:', {
          gatepassNumber,
          vehicleNumber,
          customerCodes: codesArray,
          invoiceIds,
          user: req.user?.username,
          timestamp: new Date().toISOString()
        });
        
        // Create alert log entry (don't throw, just log it)
        try {
          await client.query(
            `INSERT INTO logs (user_name, action, details, log_type)
             VALUES ($1, $2, $3, 'dispatch')`,
            [
              req.user?.username,
              'Customer code mismatch detected',
              `Gatepass: ${gatepassNumber}, Vehicle: ${vehicleNumber}, Customer codes: ${codesArray.join(', ')}, Invoices: ${invoiceIds.join(', ')}`,
            ]
          );
        } catch (logError) {
          console.error('Failed to log customer code mismatch:', logError);
        }
        
        // Create a custom error that will be caught and returned as 400
        const customerCodeError: any = new Error(errorMessage);
        customerCodeError.isCustomerCodeMismatch = true;
        customerCodeError.customerCodes = codesArray;
        throw customerCodeError;
      }

      const customerCode = customerCodes.size === 1 ? Array.from(customerCodes)[0] : null;

      // Pre-fetch all invoice items for all invoices (optimized: single query instead of N*M queries)
      const allItemsResult = await client.query(
        'SELECT * FROM invoice_items WHERE invoice_id = ANY($1)',
        [invoiceIds]
      );

      // Build a map for quick item lookup by customerItem and itemNumber
      const itemsByCustomerItem = new Map<string, any>();
      const itemsByPart = new Map<string, any>();
      
      for (const item of allItemsResult.rows) {
        if (item.customer_item) {
          itemsByCustomerItem.set(`${item.invoice_id}:${item.customer_item}`, item);
        }
        if (item.part) {
          itemsByPart.set(`${item.invoice_id}:${item.part}`, item);
        }
      }

      // Process barcodes and collect data for bulk operations
      const barcodesToInsert: any[] = [];
      const itemIdsToUpdate = new Set<string>();
      
      for (const barcode of loadedBarcodes) {
        const canonicalCustomerBarcode = barcode?.customerBarcode ? canonicalizeBarcode(barcode.customerBarcode) : null;
        const canonicalAutolivBarcode = barcode?.autolivBarcode ? canonicalizeBarcode(barcode.autolivBarcode) : null;
        const canonicalCustomerBarcodeTriplets = canonicalCustomerBarcode ? encodeAsciiTriplets(canonicalCustomerBarcode) : null;

        let matchedInvoiceId: string | null = null;
        let matchedInvoiceItemId: string | null = null;
        
        // Try to find matching invoice by customerItem or itemNumber (in-memory lookup now)
        if (barcode.customerItem || barcode.itemNumber) {
          for (const invoiceId of invoiceIds) {
            const itemByCustomer = itemsByCustomerItem.get(`${invoiceId}:${barcode.customerItem}`);
            const itemByPart = itemsByPart.get(`${invoiceId}:${barcode.itemNumber}`);
            const matchedItem = itemByCustomer || itemByPart;
            
            if (matchedItem) {
              matchedInvoiceId = invoiceId;
              matchedInvoiceItemId = matchedItem.id;
              break;
            }
          }
        }
        
        // If no match found, use first invoice
        if (!matchedInvoiceId && invoiceIds.length > 0) {
          matchedInvoiceId = invoiceIds[0];
        }

        if (matchedInvoiceId) {
          const invoice = invoiceDetails.get(matchedInvoiceId);
          const customerName = invoice?.customer || 'Unknown';
          const customerCode = invoice?.bill_to || invoice?.billTo || null;

          // Check for duplicates (batch check will be done after loop)
          barcodesToInsert.push({
            invoiceId: matchedInvoiceId,
            customerBarcode: canonicalCustomerBarcode,
            autolivBarcode: canonicalAutolivBarcode,
            customerItem: barcode.customerItem || null,
            itemNumber: barcode.itemNumber || barcode.partCode || null,
            quantity: parseInt(barcode.quantity || '0') || 0,
            invoiceItemId: matchedInvoiceItemId,
            customerName,
            customerCode,
            binNumber: barcode.binNumber
          });

          if (matchedInvoiceItemId) {
            itemIdsToUpdate.add(matchedInvoiceItemId);
          }
        }
      }

      // Batch check for duplicate barcodes
      if (barcodesToInsert.length > 0) {
        const barcodeStrings = barcodesToInsert.map(b => b.customerBarcode).filter(Boolean);
        if (barcodeStrings.length > 0) {
          const existingBarcodes = await client.query(
            `SELECT customer_barcode FROM validated_barcodes 
             WHERE invoice_id = ANY($1) AND customer_barcode = ANY($2) AND scan_context = 'loading-dispatch'`,
            [invoiceIds, barcodeStrings]
          );
          const existingSet = new Set(existingBarcodes.rows.map((r: any) => r.customer_barcode));
          
          // Filter out duplicates
          const uniqueBarcodes = barcodesToInsert.filter(b => !existingSet.has(b.customerBarcode));

          // Bulk insert barcodes using UNNEST
          if (uniqueBarcodes.length > 0) {
            const invoiceIdsArr = uniqueBarcodes.map(b => b.invoiceId);
            const customerBarcodes = uniqueBarcodes.map(b => b.customerBarcode);
            const autolivBarcodes = uniqueBarcodes.map(b => b.autolivBarcode);
            const customerItems = uniqueBarcodes.map(b => b.customerItem);
            const itemNumbers = uniqueBarcodes.map(b => b.itemNumber);
            const quantities = uniqueBarcodes.map(b => b.quantity);
            const invoiceItemIds = uniqueBarcodes.map(b => b.invoiceItemId);
            const customerNames = uniqueBarcodes.map(b => b.customerName);
            const customerCodes = uniqueBarcodes.map(b => b.customerCode);
            const statuses = uniqueBarcodes.map(() => 'matched');
            const scannedBys = uniqueBarcodes.map(() => req.user?.username || null);
            const scanContexts = uniqueBarcodes.map(() => 'loading-dispatch');

            await client.query(
              `INSERT INTO validated_barcodes 
               (invoice_id, customer_barcode, autoliv_barcode, customer_item, item_number, part_description,
                quantity, bin_quantity, invoice_item_id, status, scanned_by, scan_context, customer_name, customer_code)
               SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[],
                                    $7::integer[], $8::integer[], $9::text[], $10::text[], $11::text[], $12::text[], $13::text[], $14::text[])`,
              [invoiceIdsArr, customerBarcodes, autolivBarcodes, customerItems, itemNumbers, 
               Array(uniqueBarcodes.length).fill(null), // part_description
               quantities, quantities, // quantity and bin_quantity
               invoiceItemIds, statuses, scannedBys, scanContexts, customerNames, customerCodes]
            );
          }
        }
      }

      // Batch update invoice items scanned_bins_count
      if (itemIdsToUpdate.size > 0) {
        const itemIdsArray = Array.from(itemIdsToUpdate);
        await client.query(
          `UPDATE invoice_items 
           SET scanned_bins_count = COALESCE(scanned_bins_count, 0) + 1
           WHERE id = ANY($1)`,
          [itemIdsArray]
        );
      }

      // Batch update all invoices (optimized: single query instead of N queries)
      await client.query(
        `UPDATE invoices 
         SET dispatched_by = $1, dispatched_at = CURRENT_TIMESTAMP, 
             vehicle_number = $2, gatepass_number = $3, updated_at = CURRENT_TIMESTAMP
         WHERE id = ANY($4)`,
        [req.user?.username, vehicleNumber, gatepassNumber, invoiceIds]
      );

      // Batch insert logs for all invoices
      if (invoiceIds.length > 0) {
        const logUsernames: string[] = [];
        const logActions: string[] = [];
        const logDetails: string[] = [];
        const logTypes: string[] = [];
        const logInvoiceIds: string[] = [];

        for (const invoiceId of invoiceIds) {
          const invoice = invoiceDetails.get(invoiceId);
          const binNumber = loadedBarcodes.length > 0 ? loadedBarcodes[0].binNumber : 'N/A';
          
          logUsernames.push(req.user?.username || 'unknown');
          logActions.push(`Dispatched invoice ${invoiceId}`);
          logDetails.push(`Customer: ${invoice?.customer || 'Unknown'}, Bin Number: ${binNumber}, Quantity: ${totalQuantity}, Vehicle: ${vehicleNumber}`);
          logTypes.push('dispatch');
          logInvoiceIds.push(invoiceId);
        }

        await client.query(
          `INSERT INTO logs (user_name, action, details, log_type, invoice_id)
           SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::text[])`,
          [logUsernames, logActions, logDetails, logTypes, logInvoiceIds]
        );
      }

      // Get invoice details with UNLOADING LOC and delivery dates
      const invoiceDetailsList: any[] = [];
      for (const invoiceId of invoiceIds) {
        const invoice = invoiceDetails.get(invoiceId);
        // Safely get unloading_loc - may not exist in older schema
        let unloadingLoc = invoice?.unloading_loc || null;
        
        // If UNLOADING LOC not found in invoice, try to match from schedule
        if (!unloadingLoc && customerCode) {
          // Get invoice items
          const itemsResult = await client.query(
            'SELECT * FROM invoice_items WHERE invoice_id = $1',
            [invoiceId]
          );
          
          // Try to find matching schedule item for UNLOADING LOC
          for (const item of itemsResult.rows) {
            const partNumber = item.customer_item || item.part;
            if (partNumber) {
              const scheduleResult = await client.query(
                `SELECT unloading_loc FROM schedule_items 
                 WHERE customer_code = $1 AND part_number = $2 AND unloading_loc IS NOT NULL
                 LIMIT 1`,
                [customerCode, partNumber]
              );
              
              if (scheduleResult.rows.length > 0) {
                unloadingLoc = scheduleResult.rows[0].unloading_loc;
                break; // Use first match found
              }
            }
          }
        }
        
        // Calculate status (on-time or late)
        const deliveryDate = invoice?.delivery_date ? new Date(invoice.delivery_date) : null;
        const isOnTime = deliveryDate ? dispatchDate <= deliveryDate : null;
        const status = isOnTime === null ? 'unknown' : (isOnTime ? 'on-time' : 'late');
        
        invoiceDetailsList.push({
          id: invoiceId,
          deliveryDate: invoice?.delivery_date || null,
          deliveryTime: invoice?.delivery_time || null,
          unloadingLoc: unloadingLoc || null,
          status
        });
      }

      // Create gatepass record
      const customers = await client.query(
        'SELECT DISTINCT customer FROM invoices WHERE id = ANY($1)',
        [invoiceIds]
      );

      // Insert gatepass - handle both old and new schema
      try {
        await client.query(
          `INSERT INTO gatepasses 
           (gatepass_number, vehicle_number, customer, customer_code, invoice_ids, total_items, total_quantity, authorized_by, dispatch_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            gatepassNumber,
            vehicleNumber,
            customers.rows.map((c: any) => c.customer).join(', '),
            customerCode,
            invoiceIds,
            loadedBarcodes.length,
            totalQuantity,
            req.user?.username,
            dispatchDate
          ]
        );
      } catch (insertError: any) {
        // Fallback if new columns don't exist yet
        if (insertError.message?.includes('column "customer_code"') || insertError.message?.includes('column "dispatch_date"')) {
          console.warn('New gatepass columns not found, using fallback schema');
          await client.query(
            `INSERT INTO gatepasses 
             (gatepass_number, vehicle_number, customer, invoice_ids, total_items, total_quantity, authorized_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              gatepassNumber,
              vehicleNumber,
              customers.rows.map((c: any) => c.customer).join(', '),
              invoiceIds,
              loadedBarcodes.length,
              totalQuantity,
              req.user?.username
            ]
          );
        } else {
          throw insertError;
        }
      }
    });

    // Broadcast dispatch event
    const io: SocketIOServer = req.app.get('io');
    io.emit('dispatch:completed', { 
      gatepassNumber,
      vehicleNumber,
      invoiceIds,
      dispatchedBy: req.user?.username
    });

    // Get invoice details for response (need to query again as transaction is closed)
    // Handle case where unloading_loc column might not exist yet
    let invoiceDetailsResult;
    try {
      invoiceDetailsResult = await query(
        'SELECT id, bill_to, delivery_date, delivery_time, unloading_loc FROM invoices WHERE id = ANY($1)',
        [invoiceIds]
      );
      
      // Log what we got from the database
      console.log('📊 Invoice details from database:', invoiceDetailsResult.rows.map((inv: any) => ({
        id: inv.id,
        delivery_date: inv.delivery_date,
        delivery_time: inv.delivery_time,
        unloading_loc: inv.unloading_loc
      })));
    } catch (queryError: any) {
      // Fallback if unloading_loc column doesn't exist
      if (queryError.message?.includes('column "unloading_loc"')) {
        console.warn('⚠️ unloading_loc column not found, using fallback query');
        invoiceDetailsResult = await query(
          'SELECT id, bill_to, delivery_date, delivery_time FROM invoices WHERE id = ANY($1)',
          [invoiceIds]
        );
        // Add null unloading_loc to each row
        invoiceDetailsResult.rows = invoiceDetailsResult.rows.map((row: any) => ({
          ...row,
          unloading_loc: null
        }));
      } else {
        throw queryError;
      }
    }
    
    const invoices = await Promise.all(
      invoiceDetailsResult.rows.map(async (inv: any) => {
        const invoiceId = String(inv.id);

        let deliveryDateRaw: string | null = inv.delivery_date || null;
        let deliveryTime: string | null = normalizeOptionalString(inv.delivery_time);
        let unloadingLoc: string | null = normalizeOptionalString(inv.unloading_loc);

        // Best-effort schedule fallback when invoice fields are missing/blank.
        if (!deliveryDateRaw || !deliveryTime || !unloadingLoc) {
          const fb = await getScheduleFallback({
            invoiceId,
            invoiceDeliveryDate: deliveryDateRaw,
            missing: {
              deliveryDate: !deliveryDateRaw,
              deliveryTime: !deliveryTime,
              unloadingLoc: !unloadingLoc,
            },
          });
          if (!deliveryDateRaw && fb.deliveryDate) deliveryDateRaw = fb.deliveryDate;
          if (!deliveryTime && fb.deliveryTime) deliveryTime = fb.deliveryTime;
          if (!unloadingLoc && fb.unloadingLoc) unloadingLoc = fb.unloadingLoc;
        }

        const deliveryDateObj = deliveryDateRaw ? new Date(deliveryDateRaw) : null;
        const isOnTime = deliveryDateObj && !Number.isNaN(deliveryDateObj.getTime()) ? dispatchDate <= deliveryDateObj : null;
        const status = isOnTime === null ? 'unknown' : isOnTime ? 'on-time' : 'late';

        const invoiceData = {
          id: invoiceId,
          deliveryDate: deliveryDateRaw || null,
          deliveryTime: deliveryTime || null,
          unloadingLoc: unloadingLoc || null,
          status,
        };

        console.log(`📦 Invoice ${invoiceId} data (post-fallback):`, invoiceData);
        return invoiceData;
      })
    );
    
    // Log all invoices being returned
    console.log('✅ All invoices being returned to frontend:', invoices);

    // Get customer code from first invoice
    const responseCustomerCode = invoiceDetailsResult.rows[0]?.bill_to || null;

    // Calculate total number of bins across all invoice items
    let totalNumberOfBins = 0;
    try {
      const binsResult = await query(
        `SELECT SUM(number_of_bins) as total_bins 
         FROM invoice_items 
         WHERE invoice_id = ANY($1) AND number_of_bins IS NOT NULL`,
        [invoiceIds]
      );
      totalNumberOfBins = parseInt(binsResult.rows[0]?.total_bins || '0') || 0;
    } catch (binsError) {
      console.warn('Failed to calculate total number of bins:', binsError);
    }

    // Get supply dates (delivery_date) from invoices (use post-fallback values)
    const supplyDates = invoices
      .map((inv: any) => inv.deliveryDate)
      .filter(Boolean)
      .map((date: any) => toIsoDateOnly(date))
      .filter(Boolean);

    // Optional robustness: compute loaded totals from DB (source of truth)
    // This reflects what was actually recorded as loading-dispatch scans.
    let loadedBinsCount: number | null = null;
    let loadedQty: number | null = null;
    try {
      const loadedTotals = await query(
        `SELECT
            COUNT(*)::int AS bins_loaded,
            COALESCE(SUM(COALESCE(bin_quantity, 0)), 0)::int AS qty_loaded
         FROM validated_barcodes
         WHERE scan_context = 'loading-dispatch'
           AND invoice_id = ANY($1)`,
        [invoiceIds]
      );
      loadedBinsCount = loadedTotals.rows[0]?.bins_loaded ?? 0;
      loadedQty = loadedTotals.rows[0]?.qty_loaded ?? 0;
    } catch (e) {
      console.warn('Failed to compute loaded totals from validated_barcodes:', e);
    }

    // Full per-bin scan details for QR/PDF/print/verification (server truth, enriched from doc-audit).
    const loadedScansDetailed = await getLoadedScanDetailsForInvoices(invoiceIds);

    res.json({
      success: true,
      gatepassNumber,
      vehicleNumber,
      customerCode: responseCustomerCode,
      dispatchDate: dispatchDate.toISOString(),
      invoiceCount: invoiceIds.length,
      totalItems: loadedBarcodes.length,
      totalQuantity,
      totalNumberOfBins, // Total number of bins across all items
      supplyDates, // Array of supply dates (delivery_date) from invoices
      invoices,
      loadedBinsCount,
      loadedQty,
      loadedScansDetailed
    });
  } catch (error: any) {
    console.error('Dispatch error:', error);
    console.error('Error stack:', error?.stack);
    console.error('Error details:', {
      invoiceIds,
      vehicleNumber,
      loadedBarcodesCount: loadedBarcodes?.length || 0,
      user: req.user?.username,
      timestamp: new Date().toISOString()
    });
    
    const errorMessage = error?.message || 'Unknown error occurred';
    
    // Determine status code based on error type
    let statusCode = 500;
    if (error?.isCustomerCodeMismatch || 
        errorMessage.includes('different customer codes') || 
        errorMessage.includes('Customer code') ||
        (errorMessage.includes('Invoice') && errorMessage.includes('not found')) ||
        errorMessage.includes('No invoices') ||
        errorMessage.includes('Vehicle number')) {
      statusCode = 400;
    }
    
    // Log the error for debugging
    console.error(`[${statusCode}] Dispatch error:`, errorMessage);
    if (error?.customerCodes) {
      console.error('Customer codes involved:', error.customerCodes);
    }
    
    res.status(statusCode).json({ 
      success: false,
      error: statusCode === 400 ? 'Validation error' : 'Failed to dispatch',
      message: errorMessage,
      ...(error?.customerCodes && { customerCodes: error.customerCodes })
    });
  }
});

/**
 * GET /api/dispatch/gatepasses
 * Get all gatepasses
 */
router.get('/gatepasses', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query('SELECT * FROM gatepasses ORDER BY created_at DESC LIMIT 100');

    res.json({
      success: true,
      gatepasses: result.rows.map((gp: any) => ({
        id: gp.id,
        gatepassNumber: gp.gatepass_number,
        vehicleNumber: gp.vehicle_number,
        customer: gp.customer,
        invoiceIds: gp.invoice_ids,
        totalItems: gp.total_items,
        totalQuantity: gp.total_quantity,
        authorizedBy: gp.authorized_by,
        createdAt: gp.created_at
      }))
    });
  } catch (error) {
    console.error('Get gatepasses error:', error);
    res.status(500).json({ error: 'Failed to fetch gatepasses' });
  }
});

/**
 * GET /api/dispatch/gatepass/:number
 * Get gatepass by number (for verification)
 */
router.get('/gatepass/:number', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { number } = req.params;

    const result = await query(
      'SELECT * FROM gatepasses WHERE gatepass_number = $1',
      [number]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Gatepass not found' });
    }

    const gatepass = result.rows[0];

    // Get invoice details - handle missing unloading_loc column
    let invoicesResult;
    try {
      invoicesResult = await query(
        'SELECT id, customer, total_qty, delivery_date, delivery_time, unloading_loc FROM invoices WHERE id = ANY($1)',
        [gatepass.invoice_ids]
      );
    } catch (queryError: any) {
      // Fallback if unloading_loc column doesn't exist
      if (queryError.message?.includes('column "unloading_loc"')) {
        invoicesResult = await query(
          'SELECT id, customer, total_qty, delivery_date, delivery_time FROM invoices WHERE id = ANY($1)',
          [gatepass.invoice_ids]
        );
        invoicesResult.rows = invoicesResult.rows.map((row: any) => ({
          ...row,
          unloading_loc: null
        }));
      } else {
        throw queryError;
      }
    }

    const dispatchDate = gatepass.dispatch_date ? new Date(gatepass.dispatch_date) : null;

    const loadedScansDetailed = await getLoadedScanDetailsForInvoices(gatepass.invoice_ids || []);

    res.json({
      success: true,
      gatepass: {
        id: gatepass.id,
        gatepassNumber: gatepass.gatepass_number,
        vehicleNumber: gatepass.vehicle_number,
        customer: gatepass.customer,
        customerCode: gatepass.customer_code || null,
        dispatchDate: gatepass.dispatch_date || gatepass.created_at || null,
        loadedScansDetailed,
        invoices: await Promise.all(
          invoicesResult.rows.map(async (inv: any) => {
            const invoiceId = String(inv.id);

            let deliveryDateRaw: string | null = inv.delivery_date || null;
            let deliveryTime: string | null = normalizeOptionalString(inv.delivery_time);
            let unloadingLoc: string | null = normalizeOptionalString(inv.unloading_loc);

            // Best-effort schedule fallback when invoice fields are missing/blank.
            if (!deliveryDateRaw || !deliveryTime || !unloadingLoc) {
              const fb = await getScheduleFallback({
                invoiceId,
                invoiceDeliveryDate: deliveryDateRaw,
                missing: {
                  deliveryDate: !deliveryDateRaw,
                  deliveryTime: !deliveryTime,
                  unloadingLoc: !unloadingLoc,
                },
              });
              if (!deliveryDateRaw && fb.deliveryDate) deliveryDateRaw = fb.deliveryDate;
              if (!deliveryTime && fb.deliveryTime) deliveryTime = fb.deliveryTime;
              if (!unloadingLoc && fb.unloadingLoc) unloadingLoc = fb.unloadingLoc;
            }

            const deliveryDateObj = deliveryDateRaw ? new Date(deliveryDateRaw) : null;
            const isOnTime =
              deliveryDateObj && dispatchDate && !Number.isNaN(deliveryDateObj.getTime())
                ? dispatchDate <= deliveryDateObj
                : null;
            const status = isOnTime === null ? 'unknown' : isOnTime ? 'on-time' : 'late';

            return {
              id: invoiceId,
              customer: inv.customer,
              totalQty: inv.total_qty,
              deliveryDate: deliveryDateRaw || null,
              deliveryTime: deliveryTime || null,
              unloadingLoc: unloadingLoc || null,
              status,
            };
          })
        ),
        totalItems: gatepass.total_items,
        totalQuantity: gatepass.total_quantity,
        authorizedBy: gatepass.authorized_by,
        createdAt: gatepass.created_at
      }
    });
  } catch (error) {
    console.error('Get gatepass error:', error);
    res.status(500).json({ error: 'Failed to fetch gatepass' });
  }
});

export default router;

