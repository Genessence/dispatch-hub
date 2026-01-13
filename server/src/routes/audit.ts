import { Router, Response } from 'express';
import { query, transaction } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { Server as SocketIOServer } from 'socket.io';

const router = Router();

/**
 * PUT /api/audit/:invoiceId
 * Update invoice audit status
 */
router.put('/:invoiceId', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { invoiceId } = req.params;
  const { 
    scannedBins, 
    expectedBins, 
    auditComplete, 
    blocked, 
    deliveryDate,
    deliveryTime,
    unloadingLoc
  } = req.body;

  try {

    // Check if invoice exists
    const existingResult = await query('SELECT * FROM invoices WHERE id = $1', [invoiceId]);
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Build update query dynamically
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (scannedBins !== undefined) {
      updates.push(`scanned_bins = $${paramIndex++}`);
      params.push(scannedBins);
    }
    if (expectedBins !== undefined) {
      updates.push(`expected_bins = $${paramIndex++}`);
      params.push(expectedBins);
    }
    if (auditComplete !== undefined) {
      updates.push(`audit_complete = $${paramIndex++}`);
      params.push(auditComplete);
      if (auditComplete) {
        updates.push(`audit_date = CURRENT_TIMESTAMP`);
        updates.push(`audited_by = $${paramIndex++}`);
        params.push(req.user?.username);
      }
    }
    if (blocked !== undefined) {
      updates.push(`blocked = $${paramIndex++}`);
      params.push(blocked);
      if (blocked) {
        updates.push(`blocked_at = CURRENT_TIMESTAMP`);
      } else {
        updates.push(`blocked_at = NULL`);
      }
    }
    if (deliveryDate !== undefined) {
      updates.push(`delivery_date = $${paramIndex++}`);
      params.push(deliveryDate);
    }
    if (deliveryTime !== undefined) {
      updates.push(`delivery_time = $${paramIndex++}`);
      params.push(deliveryTime);
    }
    if (unloadingLoc !== undefined) {
      // Check if column exists before trying to update
      // If it doesn't exist, this will fail gracefully and we'll catch it
      updates.push(`unloading_loc = $${paramIndex++}`);
      params.push(unloadingLoc);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    params.push(invoiceId);
    const updateQuery = `UPDATE invoices SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
    
    let result;
    try {
      result = await query(updateQuery, params);
    } catch (updateError: any) {
      // If unloading_loc column doesn't exist, rebuild query without it
      if (updateError.message?.includes('column "unloading_loc"') && unloadingLoc !== undefined) {
        console.warn('⚠️ unloading_loc column not found. Please run migration 003. Continuing without it...');
        
        // Rebuild without unloading_loc
        const newUpdates: string[] = [];
        const newParams: any[] = [];
        let newParamIndex = 1;
        
        if (scannedBins !== undefined) {
          newUpdates.push(`scanned_bins = $${newParamIndex++}`);
          newParams.push(scannedBins);
        }
        if (expectedBins !== undefined) {
          newUpdates.push(`expected_bins = $${newParamIndex++}`);
          newParams.push(expectedBins);
        }
        if (auditComplete !== undefined) {
          newUpdates.push(`audit_complete = $${newParamIndex++}`);
          newParams.push(auditComplete);
          if (auditComplete) {
            newUpdates.push(`audit_date = CURRENT_TIMESTAMP`);
            newUpdates.push(`audited_by = $${newParamIndex++}`);
            newParams.push(req.user?.username);
          }
        }
        if (blocked !== undefined) {
          newUpdates.push(`blocked = $${newParamIndex++}`);
          newParams.push(blocked);
          if (blocked) {
            newUpdates.push(`blocked_at = CURRENT_TIMESTAMP`);
          } else {
            newUpdates.push(`blocked_at = NULL`);
          }
        }
        if (deliveryDate !== undefined) {
          newUpdates.push(`delivery_date = $${newParamIndex++}`);
          newParams.push(deliveryDate);
        }
        if (deliveryTime !== undefined) {
          newUpdates.push(`delivery_time = $${newParamIndex++}`);
          newParams.push(deliveryTime);
        }
        newUpdates.push('updated_at = CURRENT_TIMESTAMP');
        newParams.push(invoiceId);
        
        const fallbackQuery = `UPDATE invoices SET ${newUpdates.join(', ')} WHERE id = $${newParamIndex} RETURNING *`;
        result = await query(fallbackQuery, newParams);
      } else {
        throw updateError;
      }
    }

    // Log if audit is complete
    if (auditComplete) {
      await query(
        `INSERT INTO logs (user_name, action, details, log_type, invoice_id)
         VALUES ($1, $2, $3, 'audit', $4)`,
        [
          req.user?.username,
          `Completed audit for invoice ${invoiceId}`,
          `Customer: ${result.rows[0].customer}, Items: ${scannedBins || 0}`,
          invoiceId
        ]
      );
    }

    // Broadcast update via WebSocket
    const io: SocketIOServer = req.app.get('io');
    io.emit('audit:progress', { 
      invoiceId,
      scannedBins,
      expectedBins,
      auditComplete,
      blocked,
      auditedBy: req.user?.username
    });

    res.json({
      success: true,
      invoice: {
        id: result.rows[0].id,
        scannedBins: result.rows[0].scanned_bins,
        expectedBins: result.rows[0].expected_bins,
        auditComplete: result.rows[0].audit_complete,
        blocked: result.rows[0].blocked,
        auditedBy: result.rows[0].audited_by
      }
    });
  } catch (error: any) {
    console.error('Update audit error:', error);
    console.error('Error stack:', error?.stack);
    console.error('Error details:', {
      invoiceId,
      scannedBins,
      expectedBins,
      auditComplete,
      blocked,
      deliveryDate,
      deliveryTime,
      unloadingLoc,
      user: req.user?.username
    });
    res.status(500).json({ 
      error: 'Failed to update audit status',
      message: error?.message || 'Unknown error occurred'
    });
  }
});

/**
 * POST /api/audit/:invoiceId/scan
 * Record a barcode scan for audit or dispatch
 */
router.post('/:invoiceId/scan', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { invoiceId } = req.params;
  const { 
    customerBarcode, 
    autolivBarcode, 
    customerItem,
    itemNumber,
    partDescription,
    quantity,
    status = 'matched',
    scanContext = 'doc-audit' // Default to doc-audit, can be 'loading-dispatch'
  } = req.body;

  try {

    // Check if invoice exists and get customer info
    const invoiceResult = await query('SELECT * FROM invoices WHERE id = $1', [invoiceId]);
    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoiceResult.rows[0];
    const customerName = invoice.customer || 'Unknown';
    const customerCode = invoice.bill_to || invoice.billTo || null;

    // Insert validated barcode with all fields including customer info and scan context
    await query(
      `INSERT INTO validated_barcodes 
       (invoice_id, customer_barcode, autoliv_barcode, customer_item, item_number, part_description, 
        quantity, status, scanned_by, scan_context, customer_name, customer_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        invoiceId, 
        customerBarcode || null, 
        autolivBarcode || null, 
        customerItem || null, 
        itemNumber || null, 
        partDescription || null, 
        quantity || 0, 
        status, 
        req.user?.username || null,
        scanContext, // 'doc-audit' or 'loading-dispatch'
        customerName,
        customerCode
      ]
    );

    // Update invoice scanned_bins count only for doc-audit scans
    if (scanContext === 'doc-audit') {
      await query(
        'UPDATE invoices SET scanned_bins = scanned_bins + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [invoiceId]
      );
    }

    // Broadcast update with scan context
    const io: SocketIOServer = req.app.get('io');
    io.emit('audit:scan', { 
      invoiceId,
      customerItem,
      scannedBy: req.user?.username,
      scanContext
    });

    res.json({ 
      success: true, 
      message: 'Scan recorded',
      scanContext,
      customerName,
      customerCode
    });
  } catch (error: any) {
    console.error('Record scan error:', error);
    console.error('Error stack:', error?.stack);
    console.error('Error details:', {
      invoiceId,
      customerBarcode: customerBarcode?.substring(0, 50),
      autolivBarcode: autolivBarcode?.substring(0, 50),
      scanContext,
      user: req.user?.username
    });
    res.status(500).json({ 
      error: 'Failed to record scan',
      message: error?.message || 'Unknown error occurred'
    });
  }
});

/**
 * GET /api/audit/:invoiceId/scans
 * Get all scans for an invoice, optionally filtered by scan_context
 */
router.get('/:invoiceId/scans', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { invoiceId } = req.params;
    const { scanContext } = req.query; // Optional filter: 'doc-audit' or 'loading-dispatch'

    let queryText = 'SELECT * FROM validated_barcodes WHERE invoice_id = $1';
    const params: any[] = [invoiceId];

    if (scanContext) {
      queryText += ' AND scan_context = $2';
      params.push(scanContext);
    }

    queryText += ' ORDER BY scanned_at DESC';

    const result = await query(queryText, params);

    res.json({
      success: true,
      scans: result.rows.map(scan => ({
        id: scan.id,
        customerBarcode: scan.customer_barcode,
        autolivBarcode: scan.autoliv_barcode,
        customerItem: scan.customer_item,
        itemNumber: scan.item_number,
        partDescription: scan.part_description,
        quantity: scan.quantity,
        status: scan.status,
        scannedBy: scan.scanned_by,
        scannedAt: scan.scanned_at,
        scanContext: scan.scan_context || 'doc-audit',
        customerName: scan.customer_name,
        customerCode: scan.customer_code
      }))
    });
  } catch (error) {
    console.error('Get scans error:', error);
    res.status(500).json({ error: 'Failed to fetch scans' });
  }
});

/**
 * POST /api/audit/mismatch
 * Report a barcode mismatch
 */
router.post('/mismatch', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { 
      invoiceId, 
      customer,
      step,
      customerScan, 
      autolivScan 
    } = req.body;

    // Insert mismatch alert
    await query(
      `INSERT INTO mismatch_alerts 
       (user_name, customer, invoice_id, step, 
        customer_scan_part_code, customer_scan_quantity, customer_scan_bin_number, customer_scan_raw_value,
        autoliv_scan_part_code, autoliv_scan_quantity, autoliv_scan_bin_number, autoliv_scan_raw_value)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        req.user?.username,
        customer,
        invoiceId,
        step || 'doc-audit',
        customerScan?.partCode || 'N/A',
        customerScan?.quantity || 'N/A',
        customerScan?.binNumber || 'N/A',
        customerScan?.rawValue || 'N/A',
        autolivScan?.partCode || 'N/A',
        autolivScan?.quantity || 'N/A',
        autolivScan?.binNumber || 'N/A',
        autolivScan?.rawValue || 'N/A'
      ]
    );

    // Block the invoice
    if (invoiceId) {
      await query(
        'UPDATE invoices SET blocked = true, blocked_at = CURRENT_TIMESTAMP WHERE id = $1',
        [invoiceId]
      );
    }

    // Broadcast alert to admins
    const io: SocketIOServer = req.app.get('io');
    io.emit('alert:new', { 
      type: 'mismatch',
      invoiceId,
      customer,
      reportedBy: req.user?.username
    });

    res.json({ success: true, message: 'Mismatch reported' });
  } catch (error) {
    console.error('Report mismatch error:', error);
    res.status(500).json({ error: 'Failed to report mismatch' });
  }
});

export default router;

