import { Router, Response } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { query, transaction } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { Server as SocketIOServer } from 'socket.io';
import { parseExcelDateValue } from '../utils/dateParsing';

const router = Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Helper: parse invoice date from Excel serial, Date, or common string formats (STRICT; no JS overflow)
const parseInvoiceDate = (value: any): Date | null => {
  // Prefer day-first because customer files typically use DD/MM/YYYY.
  return parseExcelDateValue(value, { preferDayFirst: true });
};

// Helper: case-insensitive column lookup
const getColumnValue = (row: any, variations: string[]): any => {
  for (const variation of variations) {
    if (row[variation] !== undefined && row[variation] !== '') return row[variation];
    const matchedKey = Object.keys(row).find(
      (k) => k.toLowerCase().trim() === variation.toLowerCase().trim()
    );
    if (matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== '') return row[matchedKey];
  }
  return '';
};

// Helper: parse integer quantity from various formats
const parseQuantityInt = (value: any): number | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return isNaN(value) ? null : Math.round(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = parseFloat(trimmed);
    return isNaN(parsed) ? null : Math.round(parsed);
  }
  return null;
};

/**
 * GET /api/invoices
 * Get all invoices with optional filters
 */
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { auditComplete, dispatched, billTo } = req.query;
    
    let queryText = 'SELECT * FROM invoices WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (auditComplete !== undefined) {
      queryText += ` AND audit_complete = $${paramIndex++}`;
      params.push(auditComplete === 'true');
    }

    if (dispatched !== undefined) {
      if (dispatched === 'true') {
        queryText += ` AND dispatched_by IS NOT NULL`;
      } else {
        queryText += ` AND dispatched_by IS NULL`;
      }
    }

    if (billTo) {
      queryText += ` AND bill_to = $${paramIndex++}`;
      params.push(billTo);
    }

    queryText += ' ORDER BY created_at DESC';

    const result = await query(queryText, params);

    // Get items for each invoice
    const invoices = await Promise.all(result.rows.map(async (invoice: any) => {
      const itemsResult = await query(
        'SELECT * FROM invoice_items WHERE invoice_id = $1',
        [invoice.id]
      );
      return {
        ...invoice,
        items: itemsResult.rows.map((item: any) => ({
          invoice: item.invoice_id,
          customer: invoice.customer,
          part: item.part,
          qty: item.qty,
          status: item.status,
          errorMessage: item.error_message,
          customerItem: item.customer_item,
          partDescription: item.part_description,
          number_of_bins: item.number_of_bins || 0,
          scanned_quantity: item.scanned_quantity || 0,
          scanned_bins_count: item.scanned_bins_count || 0,
          cust_scanned_quantity: item.cust_scanned_quantity || 0,
          cust_scanned_bins_count: item.cust_scanned_bins_count || 0,
          inbd_scanned_quantity: item.inbd_scanned_quantity || 0,
          inbd_scanned_bins_count: item.inbd_scanned_bins_count || 0,
        }))
      };
    }));

    res.json({
      success: true,
      invoices: invoices.map((inv: any) => ({
        id: inv.id,
        customer: inv.customer,
        billTo: inv.bill_to,
        invoiceDate: inv.invoice_date,
        totalQty: inv.total_qty,
        binCapacity: inv.bin_capacity,
        expectedBins: inv.expected_bins,
        scannedBins: inv.scanned_bins,
        binsLoaded: inv.bins_loaded,
        auditComplete: inv.audit_complete,
        auditDate: inv.audit_date,
        plant: inv.plant,
        deliveryDate: inv.delivery_date,
        deliveryTime: inv.delivery_time,
        unloadingLoc: inv.unloading_loc || null,
        blocked: inv.blocked,
        blockedAt: inv.blocked_at,
        uploadedBy: inv.uploaded_by,
        uploadedAt: inv.uploaded_at,
        auditedBy: inv.audited_by,
        auditedAt: inv.audited_at,
        dispatchedBy: inv.dispatched_by,
        dispatchedAt: inv.dispatched_at,
        vehicleNumber: inv.vehicle_number,
        gatepassNumber: inv.gatepass_number,
        items: inv.items
      }))
    });
  } catch (error: any) {
    console.error('Get invoices error:', error);
    console.error('Error details:', {
      code: error?.code,
      message: error?.message,
      stack: error?.stack
    });
    
    // Check if it's a database connection error
    if (error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND' || error?.message?.includes('connect')) {
      res.status(503).json({ 
        error: 'Database connection failed',
        message: 'Unable to connect to database. Please check database configuration.'
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to fetch invoices',
        message: error?.message || 'An unexpected error occurred'
      });
    }
  }
});

/**
 * GET /api/invoices/:id
 * Get single invoice by ID
 */
router.get('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await query('SELECT * FROM invoices WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = result.rows[0];

    // Get items
    const itemsResult = await query(
      'SELECT * FROM invoice_items WHERE invoice_id = $1',
      [id]
    );

    // Get validated barcodes
    const barcodesResult = await query(
      'SELECT * FROM validated_barcodes WHERE invoice_id = $1',
      [id]
    );

    res.json({
      success: true,
      invoice: {
        id: invoice.id,
        customer: invoice.customer,
        billTo: invoice.bill_to,
        invoiceDate: invoice.invoice_date,
        totalQty: invoice.total_qty,
        binCapacity: invoice.bin_capacity,
        expectedBins: invoice.expected_bins,
        scannedBins: invoice.scanned_bins,
        binsLoaded: invoice.bins_loaded,
        auditComplete: invoice.audit_complete,
        auditDate: invoice.audit_date,
        plant: invoice.plant,
        deliveryDate: invoice.delivery_date,
        deliveryTime: invoice.delivery_time,
        unloadingLoc: invoice.unloading_loc || null,
        blocked: invoice.blocked,
        uploadedBy: invoice.uploaded_by,
        uploadedAt: invoice.uploaded_at,
        auditedBy: invoice.audited_by,
        dispatchedBy: invoice.dispatched_by,
        items: itemsResult.rows.map((item: any) => ({
          invoice: item.invoice_id,
          customer: invoice.customer,
          part: item.part,
          qty: item.qty,
          status: item.status,
          customerItem: item.customer_item,
          partDescription: item.part_description,
          number_of_bins: item.number_of_bins || 0,
          scanned_quantity: item.scanned_quantity || 0,
          scanned_bins_count: item.scanned_bins_count || 0,
          cust_scanned_quantity: item.cust_scanned_quantity || 0,
          cust_scanned_bins_count: item.cust_scanned_bins_count || 0,
          inbd_scanned_quantity: item.inbd_scanned_quantity || 0,
          inbd_scanned_bins_count: item.inbd_scanned_bins_count || 0,
        })),
        validatedBarcodes: barcodesResult.rows.map((b: any) => ({
          customerBarcode: b.customer_barcode,
          autolivBarcode: b.autoliv_barcode
        }))
      }
    });
  } catch (error) {
    console.error('Get invoice error:', error);
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

/**
 * POST /api/invoices/upload
 * Upload invoices from Excel file
 */
router.post('/upload', authenticateToken, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Get customer code from request body (FormData)
    const expectedCustomerCode = req.body.customerCode as string | undefined;

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: false, raw: false });
    
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return res.status(400).json({ error: 'No sheets found in file' });
    }

    // Invoice files may contain multiple sheets. Line items might not be on the first sheet.
    // Merge rows from all sheets to avoid "invoices imported but 0 items" when items live elsewhere.
    const jsonData: any[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const sheetRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
      if (Array.isArray(sheetRows) && sheetRows.length > 0) {
        jsonData.push(...sheetRows);
      }
    }

    if (!jsonData || jsonData.length === 0) {
      return res.status(400).json({ error: 'No data found in file' });
    }

    console.log('\n📤 ===== INVOICE UPLOAD: Starting =====');
    console.log(`📊 Total rows in file: ${jsonData.length}`);

    const invoiceMap = new Map<string, any>();
    const allItems: any[] = [];
    const foundCustomerCodes = new Set<string>();
    const sampleCustomerItems: string[] = [];
    const rowErrors: Array<{ row: number; invoiceNumber?: string; message: string }> = [];

    jsonData.forEach((row: any, index: number) => {
      const invoiceNumRaw = getColumnValue(row, ['Invoice Number', 'Invoice', 'invoice', 'Invoice No', 'InvoiceNo']);
      const invoiceNum = String(invoiceNumRaw || '').trim();

      const customerRaw = getColumnValue(row, ['Customer Name', 'Cust Name', 'Customer', 'customer', 'CustomerName']);
      const customer = String(customerRaw || '').trim();

      const billToRaw = getColumnValue(row, ['Bill To', 'BillTo', 'bill to', 'Bill-To', 'BillTo Code', 'Customer Code']);
      const billTo = String(billToRaw || '').trim();

      const invoiceDateRaw = getColumnValue(row, ['Invoice Date', 'InvoiceDate', 'invoice date', 'Inv Date', 'Date']);
      const invoiceDate = parseInvoiceDate(invoiceDateRaw);

      // Optional (but used by Doc Audit now): delivery time + unloading location from invoice data
      const deliveryTimeRaw = getColumnValue(row, ['Delivery Time', 'DeliveryTime', 'delivery time', 'Supply Time', 'SUPPLY TIME', 'Time']);
      const deliveryTime = String(deliveryTimeRaw || '').trim() || null;

      const unloadingLocRaw = getColumnValue(row, [
        'UNLOADING LOC',
        'Unloading Loc',
        'UnloadingLoc',
        'Unloading Location',
        'UnloadingLocation',
        'Unload Location',
        'UnloadLocation',
        'Location',
        'location',
      ]);
      const unloadingLoc = String(unloadingLocRaw || '').trim() || null;

      const qtyRaw = getColumnValue(row, ['Quantity Invoiced', 'Qty', 'qty', 'Quantity', 'quantity']);
      const qty = parseQuantityInt(qtyRaw);

      const plantRaw = getColumnValue(row, ['Ship To', 'ShipTo', 'Ship-To', 'Plant', 'plant']);
      const plant = String(plantRaw || '').trim();

      const itemNumberRaw = getColumnValue(row, ['Item Number', 'ItemNumber', 'Part', 'part', 'Part Code', 'PartCode', 'Part Number']);
      const itemNumber = String(itemNumberRaw || '').trim();

      // Normalize customer item
      const customerItemRaw = getColumnValue(row, ['Customer Item', 'CustomerItem', 'customer item', 'Customer-Item', 'Cust Item', 'CustItem', 'Customer Part', 'CustomerPart']);
      const customerItem = String(customerItemRaw || '').trim().replace(/\s+/g, ' ');

      const partDescriptionRaw = getColumnValue(row, ['Part Description', 'PartDescription', 'part description', 'Part-Description', 'Description', 'description']);
      const partDescription = String(partDescriptionRaw || '').trim();
      
      // Collect sample customer items for diagnostics (first 10 unique)
      if (customerItem && sampleCustomerItems.length < 10 && !sampleCustomerItems.includes(customerItem)) {
        sampleCustomerItems.push(customerItem);
      }

      // Track customer codes found
      if (billTo && String(billTo).trim()) {
        foundCustomerCodes.add(String(billTo).trim());
      }

      // Invoice-first validation
      const missing: string[] = [];
      if (!invoiceNum) missing.push('Invoice Number');
      if (!billTo) missing.push('Bill To');
      if (!customer) missing.push('Customer Name');
      if (!invoiceDate) missing.push('Invoice Date');
      if (!customerItem) missing.push('Customer Item');
      if (!itemNumber) missing.push('Item Number');
      if (qty === null || qty === undefined || isNaN(qty)) missing.push('Quantity Invoiced');

      if (missing.length > 0) {
        rowErrors.push({
          row: index + 2, // +1 header row, +1 for 1-based
          invoiceNumber: invoiceNum || undefined,
          message: `Missing/invalid fields: ${missing.join(', ')}`,
        });
        return;
      }

      if (!invoiceMap.has(invoiceNum)) {
        invoiceMap.set(invoiceNum, {
          id: invoiceNum,
          customer,
          billTo,
          invoiceDate,
          deliveryTime,
          unloadingLoc,
          totalQty: 0,
          binCapacity: Math.random() < 0.5 ? 50 : 80,
          expectedBins: 0,
          plant: plant ? plant : null
        });
      } else {
        const existing = invoiceMap.get(invoiceNum);
        if (existing.billTo && String(existing.billTo).trim() !== billTo) {
          rowErrors.push({
            row: index + 2,
            invoiceNumber: invoiceNum,
            message: `Bill To mismatch for invoice ${invoiceNum}: "${existing.billTo}" vs "${billTo}"`,
          });
          return;
        }
        if (existing.customer && String(existing.customer).trim() !== customer) {
          rowErrors.push({
            row: index + 2,
            invoiceNumber: invoiceNum,
            message: `Customer Name mismatch for invoice ${invoiceNum}: "${existing.customer}" vs "${customer}"`,
          });
          return;
        }

        // Keep invoice-level delivery fields consistent if present across rows
        if (deliveryTime && existing.deliveryTime && String(existing.deliveryTime).trim() !== deliveryTime) {
          rowErrors.push({
            row: index + 2,
            invoiceNumber: invoiceNum,
            message: `Delivery Time mismatch for invoice ${invoiceNum}: "${existing.deliveryTime}" vs "${deliveryTime}"`,
          });
          return;
        }
        if (unloadingLoc && existing.unloadingLoc && String(existing.unloadingLoc).trim() !== unloadingLoc) {
          rowErrors.push({
            row: index + 2,
            invoiceNumber: invoiceNum,
            message: `Unloading Location mismatch for invoice ${invoiceNum}: "${existing.unloadingLoc}" vs "${unloadingLoc}"`,
          });
          return;
        }

        // If previously missing, fill from later rows
        if (!existing.deliveryTime && deliveryTime) existing.deliveryTime = deliveryTime;
        if (!existing.unloadingLoc && unloadingLoc) existing.unloadingLoc = unloadingLoc;
      }

      const invoice = invoiceMap.get(invoiceNum);
      const qtyValue = qty ?? 0;
      invoice.totalQty += Math.abs(qtyValue);

      allItems.push({
        invoiceId: invoiceNum,
        part: itemNumber,
        customerItem,
        partDescription: partDescription || null,
        qty: qtyValue,
        status: 'valid',
        errorMessage: null
      });
    });

    if (rowErrors.length > 0) {
      return res.status(400).json({
        error: 'Invoice file validation failed',
        message: `Found ${rowErrors.length} invalid row(s). Fix the file and re-upload.`,
        sampleErrors: rowErrors.slice(0, 10),
      });
    }

    // Validate customer code if provided
    if (expectedCustomerCode) {
      const mismatchedCodes = Array.from(foundCustomerCodes).filter(
        code => String(code).trim() !== String(expectedCustomerCode).trim()
      );
      
      if (mismatchedCodes.length > 0) {
        return res.status(400).json({ 
          error: `Invoice contains data for different customer codes. Only data for customer code ${expectedCustomerCode} is allowed. Found: ${mismatchedCodes.join(', ')}` 
        });
      }

      // Also validate all invoices have the expected customer code
      const mismatchedInvoices = Array.from(invoiceMap.values()).filter(
        invoice => invoice.billTo && String(invoice.billTo).trim() !== String(expectedCustomerCode).trim()
      );

      if (mismatchedInvoices.length > 0) {
        return res.status(400).json({ 
          error: `Invoice contains data for different customer codes. Only data for customer code ${expectedCustomerCode} is allowed. Found invoices with codes: ${mismatchedInvoices.map(inv => inv.billTo).join(', ')}` 
        });
      }
    }

    // Calculate expected bins based on unique customer items
    invoiceMap.forEach((invoice) => {
      const items = allItems.filter(item => item.invoiceId === invoice.id);
      const uniqueCustomerItems = new Set(items.map((item: any) => item.customerItem).filter(Boolean));
      invoice.expectedBins = uniqueCustomerItems.size;
    });
    
    // Log parsing summary
    console.log('\n📊 ===== PARSING SUMMARY =====');
    console.log(`  Invoices found: ${invoiceMap.size}`);
    console.log(`  Total items: ${allItems.length}`);
    console.log(`  Customer codes found: ${Array.from(foundCustomerCodes).join(', ') || 'None'}`);
    console.log(`\n📋 Sample customer items (first 10):`, sampleCustomerItems);
    
    const uniqueCustomerItems = new Set(allItems.map(item => item.customerItem).filter(Boolean));
    console.log(`📊 Unique customer items: ${uniqueCustomerItems.size}`);
    console.log('================================\n');

    // Insert into database using transaction (UPSERT-like behavior for unlocked invoices)
    await transaction(async (client) => {
      for (const [invoiceId, invoice] of invoiceMap) {
        // Check if invoice already exists
        const existingResult = await client.query(
          'SELECT id, audit_complete, dispatched_by FROM invoices WHERE id = $1',
          [invoiceId]
        );

        const exists = existingResult.rows.length > 0;

        // If invoice exists and has progressed, do not allow overwrites.
        if (exists) {
          const row = existingResult.rows[0];
          const isAudited = !!row.audit_complete;
          const isDispatched = !!row.dispatched_by;
          if (isAudited || isDispatched) {
            throw new Error(
              `Invoice ${invoiceId} cannot be re-uploaded because it is already ${isDispatched ? 'dispatched' : 'audited'}.`
            );
          }
        }

        if (!exists) {
          await client.query(
            `INSERT INTO invoices (id, customer, bill_to, invoice_date, delivery_date, delivery_time, unloading_loc, total_qty, bin_capacity, expected_bins, plant, uploaded_by, uploaded_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)`,
            [
              invoiceId,
              invoice.customer,
              invoice.billTo,
              invoice.invoiceDate,
              // Invoice Date is the Delivery Date (per new requirements)
              invoice.invoiceDate,
              invoice.deliveryTime,
              invoice.unloadingLoc,
              invoice.totalQty,
              invoice.binCapacity,
              invoice.expectedBins,
              invoice.plant,
              req.user?.username
            ]
          );
        } else {
          // Update existing invoice header fields. Keep it deterministic and refresh uploaded_at.
          await client.query(
            `UPDATE invoices
             SET customer = $2,
                 bill_to = $3,
                 invoice_date = $4,
                 delivery_date = $5,
                 delivery_time = $6,
                 unloading_loc = $7,
                 total_qty = $8,
                 expected_bins = $9,
                 plant = $10,
                 uploaded_by = $11,
                 uploaded_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [
              invoiceId,
              invoice.customer,
              invoice.billTo,
              invoice.invoiceDate,
              invoice.invoiceDate,
              invoice.deliveryTime,
              invoice.unloadingLoc,
              invoice.totalQty,
              invoice.expectedBins,
              invoice.plant,
              req.user?.username,
            ]
          );
        }

        // Always replace items on upload for unlocked invoices.
        await client.query('DELETE FROM invoice_items WHERE invoice_id = $1', [invoiceId]);
        const invoiceItems = allItems.filter(item => item.invoiceId === invoiceId);
        for (const item of invoiceItems) {
          await client.query(
            `INSERT INTO invoice_items (invoice_id, part, customer_item, part_description, qty, status, error_message)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [invoiceId, item.part, item.customerItem, item.partDescription, item.qty, item.status, item.errorMessage]
          );
        }
      }

      // Log the upload
      await client.query(
        `INSERT INTO logs (user_name, action, details, log_type)
         VALUES ($1, $2, $3, 'upload')`,
        [req.user?.username, `Uploaded ${invoiceMap.size} invoice(s)`, `Invoices: ${Array.from(invoiceMap.keys()).join(', ')}`]
      );
    });

    // Broadcast update via WebSocket
    const io: SocketIOServer = req.app.get('io');
    io.emit('invoices:updated', { 
      action: 'upload',
      count: invoiceMap.size,
      uploadedBy: req.user?.username 
    });

    // uniqueCustomerItems already calculated above (line 343)
    res.json({
      success: true,
      message: `Uploaded ${invoiceMap.size} invoices`,
      invoiceCount: invoiceMap.size,
      itemCount: allItems.length,
      diagnostics: {
        uniqueCustomerItems: uniqueCustomerItems.size,
        sampleCustomerItems: sampleCustomerItems.slice(0, 5)
      },
      // Schedule-matching validation removed (invoice is source-of-truth)
    });
  } catch (error: any) {
    console.error('Upload invoices error:', error);
    const message = error?.message ? String(error.message) : 'Failed to upload invoices';

    // Treat known validation/business-rule failures as 400s (user-actionable).
    if (
      message.includes('cannot be re-uploaded') ||
      message.includes('validation failed') ||
      message.includes('Missing/invalid') ||
      message.includes('mismatch')
    ) {
      return res.status(400).json({ error: message });
    }

    res.status(500).json({ error: 'Failed to upload invoices' });
  }
});

/**
 * DELETE /api/invoices/:id
 * Delete an invoice (admin only typically)
 */
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await query('DELETE FROM invoices WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Broadcast update
    const io: SocketIOServer = req.app.get('io');
    io.emit('invoices:updated', { action: 'delete', invoiceId: id });

    res.json({ success: true, message: 'Invoice deleted' });
  } catch (error) {
    console.error('Delete invoice error:', error);
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
});

export default router;


