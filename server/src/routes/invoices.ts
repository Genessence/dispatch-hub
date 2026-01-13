import { Router, Response } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { query, transaction } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { Server as SocketIOServer } from 'socket.io';

const router = Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

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
    const invoices = await Promise.all(result.rows.map(async (invoice) => {
      const itemsResult = await query(
        'SELECT * FROM invoice_items WHERE invoice_id = $1',
        [invoice.id]
      );
      return {
        ...invoice,
        items: itemsResult.rows.map(item => ({
          invoice: item.invoice_id,
          customer: invoice.customer,
          part: item.part,
          qty: item.qty,
          status: item.status,
          errorMessage: item.error_message,
          customerItem: item.customer_item,
          partDescription: item.part_description
        }))
      };
    }));

    res.json({
      success: true,
      invoices: invoices.map(inv => ({
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
  } catch (error) {
    console.error('Get invoices error:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
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
        items: itemsResult.rows.map(item => ({
          invoice: item.invoice_id,
          customer: invoice.customer,
          part: item.part,
          qty: item.qty,
          status: item.status,
          customerItem: item.customer_item,
          partDescription: item.part_description
        })),
        validatedBarcodes: barcodesResult.rows.map(b => ({
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

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: false, raw: false });
    
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return res.status(400).json({ error: 'No sheets found in file' });
    }

    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: '', raw: false });

    if (!jsonData || jsonData.length === 0) {
      return res.status(400).json({ error: 'No data found in file' });
    }

    const invoiceMap = new Map<string, any>();
    const allItems: any[] = [];

    jsonData.forEach((row: any, index: number) => {
      const invoiceNum = row['Invoice Number'] || row['Invoice'] || row['invoice'] || `INV-${index + 1}`;
      const customer = row['Cust Name'] || row['Customer'] || row['customer'] || 'Unknown Customer';
      const qty = parseInt(row['Quantity Invoiced'] || row['Qty'] || row['qty'] || row['Quantity'] || '0');
      const billTo = row['Bill To'] || row['BillTo'] || row['bill to'] || '';
      const plant = row['Ship To'] || row['ShipTo'] || row['Plant'] || row['plant'] || '';
      const part = row['Item Number'] || row['Part'] || row['part'] || row['Part Code'] || 'Unknown Part';
      const customerItem = row['Customer Item'] || row['CustomerItem'] || row['customer item'] || '';
      const partDescription = row['Part Description'] || row['Description'] || '';

      let status = 'valid-unmatched';
      let errorMessage = '';

      if (!invoiceNum || invoiceNum.toString().trim() === '') {
        status = 'error';
        errorMessage = 'Missing invoice number';
      } else if (!customer || customer.toString().trim() === '') {
        status = 'error';
        errorMessage = 'Missing customer name';
      } else if (isNaN(qty)) {
        status = 'error';
        errorMessage = 'Invalid quantity';
      }

      if (!invoiceMap.has(invoiceNum.toString())) {
        invoiceMap.set(invoiceNum.toString(), {
          id: invoiceNum.toString(),
          customer: customer.toString(),
          billTo: billTo.toString(),
          totalQty: 0,
          binCapacity: Math.random() < 0.5 ? 50 : 80,
          expectedBins: 0,
          plant: plant ? plant.toString() : null
        });
      }

      const invoice = invoiceMap.get(invoiceNum.toString());
      invoice.totalQty += Math.abs(qty);

      allItems.push({
        invoiceId: invoiceNum.toString(),
        part: part.toString(),
        customerItem: customerItem ? customerItem.toString() : null,
        partDescription: partDescription ? partDescription.toString() : null,
        qty: qty,
        status: status,
        errorMessage: errorMessage || null
      });
    });

    // Calculate expected bins based on unique customer items
    invoiceMap.forEach((invoice) => {
      const items = allItems.filter(item => item.invoiceId === invoice.id);
      const uniqueCustomerItems = new Set(items.map(item => item.customerItem).filter(Boolean));
      invoice.expectedBins = uniqueCustomerItems.size;
    });

    // Insert into database using transaction
    await transaction(async (client) => {
      for (const [invoiceId, invoice] of invoiceMap) {
        // Check if invoice already exists
        const existingResult = await client.query(
          'SELECT id FROM invoices WHERE id = $1',
          [invoiceId]
        );

        if (existingResult.rows.length === 0) {
          await client.query(
            `INSERT INTO invoices (id, customer, bill_to, total_qty, bin_capacity, expected_bins, plant, uploaded_by, uploaded_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
            [invoiceId, invoice.customer, invoice.billTo, invoice.totalQty, invoice.binCapacity, invoice.expectedBins, invoice.plant, req.user?.username]
          );

          // Insert items
          const invoiceItems = allItems.filter(item => item.invoiceId === invoiceId);
          for (const item of invoiceItems) {
            await client.query(
              `INSERT INTO invoice_items (invoice_id, part, customer_item, part_description, qty, status, error_message)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [invoiceId, item.part, item.customerItem, item.partDescription, item.qty, item.status, item.errorMessage]
            );
          }
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

    res.json({
      success: true,
      message: `Uploaded ${invoiceMap.size} invoices`,
      invoiceCount: invoiceMap.size,
      itemCount: allItems.length
    });
  } catch (error) {
    console.error('Upload invoices error:', error);
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

