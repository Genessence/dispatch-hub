import { Router, Response } from 'express';
import { query, transaction } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { Server as SocketIOServer } from 'socket.io';
import { canonicalizeBarcode } from '../utils/barcodeNormalization';
import { parseAutolivLabel, parseCustomerLabel, QrParseError } from '../utils/qrNomenclature';

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
    binQuantity, // Quantity in each bin from barcode scan
    binNumber, // Bin number from barcode scan
    status = 'matched',
    scanContext = 'doc-audit' // Default to doc-audit, can be 'loading-dispatch'
  } = req.body;

  try {
    // Canonicalize barcodes (decode ASCII-triplet scanner payloads, normalize control chars/line endings)
    const canonicalCustomerBarcode = customerBarcode ? canonicalizeBarcode(customerBarcode) : null;
    const canonicalAutolivBarcode = autolivBarcode ? canonicalizeBarcode(autolivBarcode) : null;

    // Server-side QR parsing (tamper-proof): derive fields from canonical payloads.
    // For doc-audit, both labels must be present and parsable.
    // For loading-dispatch, customer label must be parsable.
    let parsedCustomer: ReturnType<typeof parseCustomerLabel> | null = null;
    let parsedAutoliv: ReturnType<typeof parseAutolivLabel> | null = null;

    try {
      if (canonicalCustomerBarcode) {
        parsedCustomer = parseCustomerLabel(canonicalCustomerBarcode);
      }
      if (canonicalAutolivBarcode) {
        parsedAutoliv = parseAutolivLabel(canonicalAutolivBarcode);
      }
    } catch (e: any) {
      const message =
        e instanceof QrParseError
          ? `${e.labelType.toUpperCase()} parse error: ${e.message}`
          : `QR parse error: ${e?.message || 'Unknown error'}`;

      // Enforce parsing for contexts we rely on
      if (scanContext === 'doc-audit' || scanContext === 'loading-dispatch') {
        return res.status(400).json({
          success: false,
          error: 'Invalid QR code',
          message,
          details: e instanceof QrParseError ? { code: e.code, labelType: e.labelType } : undefined,
        });
      }
    }

    const derivedCustomerItem = parsedCustomer?.partNumber || (customerItem ? String(customerItem) : null);
    const derivedItemNumber = parsedAutoliv?.partNumber || (itemNumber ? String(itemNumber) : null);
    const derivedBinNumber =
      parsedCustomer?.binNumber || parsedAutoliv?.binNumber || (binNumber ? String(binNumber) : null);

    const derivedCustomerBinQty = parsedCustomer?.quantity;
    const derivedAutolivBinQty = parsedAutoliv?.quantity;
    const derivedBinQuantityStr =
      derivedCustomerBinQty || derivedAutolivBinQty || (binQuantity !== undefined && binQuantity !== null ? String(binQuantity) : null);
    const derivedBinQuantityInt =
      derivedBinQuantityStr && /^\d+$/.test(derivedBinQuantityStr) ? parseInt(derivedBinQuantityStr, 10) : null;

    // Check if invoice exists and get customer info
    const invoiceResult = await query('SELECT * FROM invoices WHERE id = $1', [invoiceId]);
    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoiceResult.rows[0];
    const customerName = invoice.customer || 'Unknown';
    const customerCode = invoice.bill_to || invoice.billTo || null;

    let invoiceItemId: string | null = null;
    let matchedInvoiceItem: any = null;

    // For doc-audit: Match customer barcode part number with customer_item and autoliv barcode part number with part
    if (scanContext === 'doc-audit' && canonicalCustomerBarcode && canonicalAutolivBarcode) {
      // Enforce quantity equality between labels
      if (derivedCustomerBinQty && derivedAutolivBinQty && derivedCustomerBinQty !== derivedAutolivBinQty) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          message: `Quantity mismatch between labels: customer="${derivedCustomerBinQty}" vs autoliv="${derivedAutolivBinQty}"`,
        });
      }

      // Extract part numbers from barcodes (assuming they're in the barcode data)
      // Customer barcode part number should match customer_item
      // Autoliv barcode part number should match part (item_number)
      const customerPartNumber = derivedCustomerItem; // Derived from canonical barcode (preferred)
      const autolivPartNumber = derivedItemNumber; // Derived from canonical barcode (preferred)

      if (!customerPartNumber || !autolivPartNumber) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          message: 'Missing part number(s) after server-side parsing. Please rescan both labels.',
        });
      }

      // Find invoice_item where customer_item matches customer barcode part number
      // AND part matches autoliv barcode part number
      const itemMatchResult = await query(
        `SELECT * FROM invoice_items 
         WHERE invoice_id = $1 
           AND customer_item = $2 
           AND part = $3
         LIMIT 1`,
        [invoiceId, customerPartNumber, autolivPartNumber]
      );

      if (itemMatchResult.rows.length > 0) {
        matchedInvoiceItem = itemMatchResult.rows[0];
        invoiceItemId = matchedInvoiceItem.id;
      } else {
        // Try to match by customer_item only (fallback)
        const fallbackResult = await query(
          `SELECT * FROM invoice_items 
           WHERE invoice_id = $1 
             AND customer_item = $2
           LIMIT 1`,
          [invoiceId, customerPartNumber]
        );
        if (fallbackResult.rows.length > 0) {
          matchedInvoiceItem = fallbackResult.rows[0];
          invoiceItemId = matchedInvoiceItem.id;
        }
      }
    } else if (scanContext === 'loading-dispatch' && canonicalCustomerBarcode) {
      // For loading-dispatch: Match by customer_item from customer barcode
      const customerPartNumber = derivedCustomerItem;
      if (!customerPartNumber) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          message: 'Customer item not found in scanned barcode. Please rescan the customer label.',
        });
      }
      
        const itemMatchResult = await query(
          `SELECT * FROM invoice_items 
           WHERE invoice_id = $1 
             AND customer_item = $2
           LIMIT 1`,
          [invoiceId, customerPartNumber]
        );
      
      if (itemMatchResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          message: `Customer item "${customerPartNumber}" not found in invoice ${invoiceId}`,
        });
      }
      
          matchedInvoiceItem = itemMatchResult.rows[0];
          invoiceItemId = matchedInvoiceItem.id;
      
      // Enforce bin-based validation for loading-dispatch
      if (!derivedBinNumber) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          message: 'Bin number not found in scanned barcode. Please rescan the customer label.',
        });
      }
      
      // Check for duplicate bin scan (same bin_number for same invoice_item in loading-dispatch context)
      const duplicateCheck = await query(
        `SELECT id FROM validated_barcodes 
         WHERE invoice_item_id = $1 
           AND scan_context = $2
           AND customer_bin_number = $3
         LIMIT 1`,
        [invoiceItemId, 'loading-dispatch', derivedBinNumber]
      );
      
      if (duplicateCheck.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'Duplicate scan',
          message: `Bin number "${derivedBinNumber}" has already been scanned for this item.`,
          validationStep: 'duplicate_bin_scan_loading',
        });
      }
      
      // Compute expected bins for this item (priority: cust_scanned_bins_count > number_of_bins > fallback count)
      let expectedBinsForItem = matchedInvoiceItem.cust_scanned_bins_count || 0;
      
      if (expectedBinsForItem === 0) {
        expectedBinsForItem = matchedInvoiceItem.number_of_bins || 0;
      }
      
      // Fallback: count distinct customer bins from doc-audit scans for this item
      if (expectedBinsForItem === 0) {
        const docAuditBinsResult = await query(
          `SELECT COUNT(DISTINCT customer_bin_number) as bin_count
           FROM validated_barcodes
           WHERE invoice_item_id = $1
             AND scan_context = 'doc-audit'
             AND customer_bin_number IS NOT NULL`,
          [invoiceItemId]
        );
        expectedBinsForItem = parseInt(docAuditBinsResult.rows[0]?.bin_count || '0') || 0;
      }
      
      // Count existing loading-dispatch scans for this item
      const loadedBinsResult = await query(
        `SELECT COUNT(*) as loaded_count
         FROM validated_barcodes
         WHERE invoice_item_id = $1
           AND scan_context = 'loading-dispatch'`,
        [invoiceItemId]
      );
      const loadedBinsForItem = parseInt(loadedBinsResult.rows[0]?.loaded_count || '0') || 0;
      
      // Enforce expected bins limit
      if (expectedBinsForItem > 0 && loadedBinsForItem >= expectedBinsForItem) {
        // Hard fail-safe: block invoice and create mismatch alert
        await query(
          `INSERT INTO mismatch_alerts 
           (user_name, customer, invoice_id, step, validation_step,
            customer_scan_part_code, customer_scan_quantity, customer_scan_bin_number, customer_scan_raw_value)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            req.user?.username,
            customerName,
            invoiceId,
            'loading-dispatch',
            'over_scan_loading',
            customerPartNumber,
            derivedBinQuantityStr || 'N/A',
            derivedBinNumber,
            canonicalCustomerBarcode || 'N/A',
          ]
        );
        
        await query(
          'UPDATE invoices SET blocked = true, blocked_at = CURRENT_TIMESTAMP WHERE id = $1',
          [invoiceId]
        );
        
        // Broadcast alert to admins
        const io: SocketIOServer = req.app.get('io');
        io.emit('alert:new', {
          type: 'mismatch',
          invoiceId,
          customer: customerName,
          reportedBy: req.user?.username,
        });
        
        return res.status(409).json({
          success: false,
          error: 'Over-scan prevented',
          message: `Cannot scan more bins. Expected ${expectedBinsForItem} bins for item "${customerPartNumber}", but ${loadedBinsForItem} already loaded. Invoice blocked for admin review.`,
          validationStep: 'over_scan_loading',
          expectedBins: expectedBinsForItem,
          loadedBins: loadedBinsForItem,
        });
      }
    }

    // For doc-audit, ensure both sides exist in the invoice (invoice consistency, tamper-proof)
    if (scanContext === 'doc-audit' && canonicalCustomerBarcode && canonicalAutolivBarcode) {
      const customerPartNumber = derivedCustomerItem;
      const autolivPartNumber = derivedItemNumber;

      const missing: string[] = [];
      if (!customerPartNumber) missing.push('customer part');
      if (!autolivPartNumber) missing.push('autoliv part');
      if (missing.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          message: `Missing required fields: ${missing.join(', ')}`,
        });
      }

      const customerMatch = await query(
        `SELECT id FROM invoice_items WHERE invoice_id = $1 AND customer_item = $2 LIMIT 1`,
        [invoiceId, customerPartNumber]
      );
      if (customerMatch.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          message: `Customer label part "${customerPartNumber}" not found as customer_item in invoice ${invoiceId}`,
        });
      }

      const autolivMatch = await query(
        `SELECT id FROM invoice_items WHERE invoice_id = $1 AND part = $2 LIMIT 1`,
        [invoiceId, autolivPartNumber]
      );
      if (autolivMatch.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          message: `Autoliv label part "${autolivPartNumber}" not found as item_number (part) in invoice ${invoiceId}`,
        });
      }
    }

    // Insert validated barcode with all fields including customer info and scan context
    // Include customer_bin_number for loading-dispatch scans (and doc-audit if available)
    const insertResult = await query(
      `INSERT INTO validated_barcodes 
       (invoice_id, customer_barcode, autoliv_barcode, customer_item, item_number, part_description, 
        quantity, bin_quantity, invoice_item_id, status, scanned_by, scan_context, customer_name, customer_code, customer_bin_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id`,
      [
        invoiceId, 
        canonicalCustomerBarcode, 
        canonicalAutolivBarcode, 
        derivedCustomerItem || null, 
        derivedItemNumber || null, 
        partDescription || null, 
        (matchedInvoiceItem?.qty ?? quantity ?? 0) || 0,
        derivedBinQuantityInt, // bin_quantity from barcode scan (label quantity)
        invoiceItemId, // invoice_item_id if matched
        status, 
        req.user?.username || null,
        scanContext, // 'doc-audit' or 'loading-dispatch'
        customerName,
        customerCode,
        derivedBinNumber || null // customer_bin_number for de-duplication
      ]
    );

    // Update invoice_item bin tracking fields for doc-audit scans
    if (scanContext === 'doc-audit' && matchedInvoiceItem && derivedBinQuantityInt) {
      const totalQty = matchedInvoiceItem.qty || 0;
      const currentScannedQuantity = matchedInvoiceItem.scanned_quantity || 0;
      const currentScannedBinsCount = matchedInvoiceItem.scanned_bins_count || 0;
      
      // Calculate number_of_bins: ceil(total_qty / bin_quantity) - if remainder exists, add one more bin
      const numberOfBins = Math.ceil(totalQty / derivedBinQuantityInt);
      
      // Update scanned_quantity: total_qty - remaining_qty
      // Remaining quantity decreases with each scan, so scanned_quantity increases
      const newScannedQuantity = Math.min(currentScannedQuantity + derivedBinQuantityInt, totalQty);
      const newScannedBinsCount = currentScannedBinsCount + 1;

      // Update invoice_item with bin tracking data
      await query(
        `UPDATE invoice_items 
         SET number_of_bins = COALESCE(number_of_bins, $1),
             scanned_quantity = $2,
             scanned_bins_count = $3
         WHERE id = $4`,
        [numberOfBins, newScannedQuantity, newScannedBinsCount, invoiceItemId]
      );
    }

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
      customerItem: derivedCustomerItem,
      invoiceItemId,
      binQuantity: derivedBinQuantityInt,
      scannedBy: req.user?.username,
      scanContext
    });

    // For loading-dispatch, include expected/loaded bin counts
    let expectedBinsForItem = null;
    let loadedBinsForItem = null;
    
    if (scanContext === 'loading-dispatch' && invoiceItemId) {
      // Recompute expected bins (same logic as validation above)
      if (matchedInvoiceItem) {
        expectedBinsForItem = matchedInvoiceItem.cust_scanned_bins_count || 0;
        if (expectedBinsForItem === 0) {
          expectedBinsForItem = matchedInvoiceItem.number_of_bins || 0;
        }
      }
      
      // Fallback count if still 0
      if (expectedBinsForItem === 0) {
        const docAuditBinsResult = await query(
          `SELECT COUNT(DISTINCT customer_bin_number) as bin_count
           FROM validated_barcodes
           WHERE invoice_item_id = $1
             AND scan_context = 'doc-audit'
             AND customer_bin_number IS NOT NULL`,
          [invoiceItemId]
        );
        expectedBinsForItem = parseInt(docAuditBinsResult.rows[0]?.bin_count || '0') || 0;
      }
      
      // Count loaded bins (including the one we just inserted)
      const loadedBinsResult = await query(
        `SELECT COUNT(*) as loaded_count
         FROM validated_barcodes
         WHERE invoice_item_id = $1
           AND scan_context = 'loading-dispatch'`,
        [invoiceItemId]
      );
      loadedBinsForItem = parseInt(loadedBinsResult.rows[0]?.loaded_count || '0') || 0;
    }

    res.json({ 
      success: true, 
      message: 'Scan recorded',
      scanId: insertResult.rows[0]?.id || null, // Include scan ID for deletion
      scanContext,
      customerName,
      customerCode,
      invoiceItemId,
      binQuantity: derivedBinQuantityInt,
      customerBinNumber: derivedBinNumber || null,
      expectedBinsForItem,
      loadedBinsForItem,
      matchedInvoiceItem: matchedInvoiceItem ? {
        id: matchedInvoiceItem.id,
        customerItem: matchedInvoiceItem.customer_item,
        part: matchedInvoiceItem.part,
        qty: matchedInvoiceItem.qty,
        number_of_bins: matchedInvoiceItem.number_of_bins,
        scanned_quantity: matchedInvoiceItem.scanned_quantity,
        scanned_bins_count: matchedInvoiceItem.scanned_bins_count,
        cust_scanned_bins_count: matchedInvoiceItem.cust_scanned_bins_count || 0
      } : null
    });
  } catch (error: any) {
    console.error('Record scan error:', error);
    console.error('Error stack:', error?.stack);
    console.error('Error details:', {
      invoiceId,
      customerBarcode: customerBarcode ? canonicalizeBarcode(customerBarcode).substring(0, 50) : null,
      autolivBarcode: autolivBarcode ? canonicalizeBarcode(autolivBarcode).substring(0, 50) : null,
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
 * POST /api/audit/:invoiceId/scan-stage
 * Record a staged scan for doc-audit:
 * - stage=customer: customer label scanned (increments customer counters + creates pending row)
 * - stage=inbd: autoliv label scanned (pairs with latest pending customer row + increments inbound counters)
 */
router.post('/:invoiceId/scan-stage', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { invoiceId } = req.params;
  const {
    stage,
    customerBarcode,
    autolivBarcode,
    scanContext = 'doc-audit',
  }: {
    stage: 'customer' | 'inbd';
    customerBarcode?: string;
    autolivBarcode?: string;
    scanContext?: 'doc-audit' | 'loading-dispatch';
  } = req.body || {};

  const username = req.user?.username || null;
  const io: SocketIOServer = req.app.get('io');

  try {
    if (scanContext !== 'doc-audit') {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        message: 'scan-stage endpoint currently supports scanContext="doc-audit" only',
      });
    }

    if (stage !== 'customer' && stage !== 'inbd') {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        message: 'Invalid stage. Expected "customer" or "inbd".',
      });
    }

    // Invoice must exist
    const invoiceResult = await query('SELECT * FROM invoices WHERE id = $1', [invoiceId]);
    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    const invoice = invoiceResult.rows[0];
    const customerName = invoice.customer || 'Unknown';
    const customerCode = invoice.bill_to || invoice.billTo || null;

    const reportMismatchAndBlock = async (args: {
      validationStep: string;
      message: string;
      customerScan: {
        partCode: string;
        quantity: string;
        binNumber: string;
        rawValue: string;
      };
      autolivScan?: {
        partCode: string;
        quantity: string;
        binNumber: string;
        rawValue: string;
      };
    }) => {
      // Insert mismatch alert
      await query(
        `INSERT INTO mismatch_alerts 
         (user_name, customer, invoice_id, step, validation_step,
          customer_scan_part_code, customer_scan_quantity, customer_scan_bin_number, customer_scan_raw_value,
          autoliv_scan_part_code, autoliv_scan_quantity, autoliv_scan_bin_number, autoliv_scan_raw_value)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          req.user?.username,
          customerName,
          invoiceId,
          'doc-audit',
          args.validationStep,
          args.customerScan.partCode || 'N/A',
          args.customerScan.quantity || 'N/A',
          args.customerScan.binNumber || 'N/A',
          args.customerScan.rawValue || 'N/A',
          args.autolivScan?.partCode || 'N/A',
          args.autolivScan?.quantity || 'N/A',
          args.autolivScan?.binNumber || 'N/A',
          args.autolivScan?.rawValue || 'N/A',
        ]
      );

      // Block invoice
      await query(
        'UPDATE invoices SET blocked = true, blocked_at = CURRENT_TIMESTAMP WHERE id = $1',
        [invoiceId]
      );

      // Broadcast alert to admins
      io.emit('alert:new', {
        type: 'mismatch',
        invoiceId,
        customer: customerName,
        reportedBy: req.user?.username,
      });

      return res.status(409).json({
        success: false,
        error: 'Duplicate scan / blocked',
        message: args.message,
      });
    };

    const recomputeAndUpdateInvoiceProgress = async () => {
      const totals = await query(
        `SELECT 
            COUNT(*)::int AS total_items,
            COUNT(*) FILTER (
              WHERE qty = COALESCE(cust_scanned_quantity, 0)
                AND qty = COALESCE(inbd_scanned_quantity, 0)
            )::int AS completed_items
         FROM invoice_items
         WHERE invoice_id = $1`,
        [invoiceId]
      );
      const totalItems = totals.rows[0]?.total_items || 0;
      const completedItems = totals.rows[0]?.completed_items || 0;
      const auditComplete = totalItems > 0 && completedItems >= totalItems;

      // Update invoice header progress (items completed out of items expected)
      await query(
        `UPDATE invoices
         SET expected_bins = $1,
             scanned_bins = $2,
             audit_complete = $3,
             audit_date = CASE WHEN $3 THEN COALESCE(audit_date, CURRENT_TIMESTAMP) ELSE audit_date END,
             audited_by = CASE WHEN $3 THEN COALESCE(audited_by, $4) ELSE audited_by END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [totalItems, completedItems, auditComplete, req.user?.username, invoiceId]
      );

      io.emit('audit:progress', {
        invoiceId,
        scannedBins: completedItems,
        expectedBins: totalItems,
        auditComplete,
        auditedBy: req.user?.username,
      });

      return { totalItems, completedItems, auditComplete };
    };

    // Canonicalize inputs
    const canonicalCustomerBarcode = customerBarcode ? canonicalizeBarcode(customerBarcode) : null;
    const canonicalAutolivBarcode = autolivBarcode ? canonicalizeBarcode(autolivBarcode) : null;

    // Stage 1: customer label scanned
    if (stage === 'customer') {
      if (!canonicalCustomerBarcode) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          message: 'customerBarcode is required for stage="customer".',
        });
      }

      let parsedCustomer: ReturnType<typeof parseCustomerLabel>;
      try {
        parsedCustomer = parseCustomerLabel(canonicalCustomerBarcode);
      } catch (e: any) {
        const message =
          e instanceof QrParseError
            ? `CUSTOMER parse error: ${e.message}`
            : `QR parse error: ${e?.message || 'Unknown error'}`;
        return res.status(400).json({ success: false, error: 'Invalid QR code', message });
      }

      const customerPart = parsedCustomer.partNumber;
      const binQtyStr = parsedCustomer.quantity;
      const binQty = /^\d+$/.test(binQtyStr) ? parseInt(binQtyStr, 10) : 0;
      const customerBinNumber = parsedCustomer.binNumber;
      if (!binQty || binQty <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          message: `Invalid bin quantity from customer label: "${binQtyStr}"`,
        });
      }

      // Match exactly one invoice_item by customer_item
      const itemRows = await query(
        `SELECT id, qty,
                COALESCE(cust_scanned_quantity, 0) AS cust_scanned_quantity,
                COALESCE(cust_scanned_bins_count, 0) AS cust_scanned_bins_count,
                COALESCE(inbd_scanned_quantity, 0) AS inbd_scanned_quantity,
                COALESCE(inbd_scanned_bins_count, 0) AS inbd_scanned_bins_count
         FROM invoice_items
         WHERE invoice_id = $1 AND customer_item = $2`,
        [invoiceId, customerPart]
      );

      if (itemRows.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          message: `Customer label part "${customerPart}" not found as customer_item in invoice ${invoiceId}`,
        });
      }
      if (itemRows.rows.length > 1) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          message: `Ambiguous match: customer_item "${customerPart}" maps to multiple rows in invoice ${invoiceId}.`,
        });
      }

      const item = itemRows.rows[0];
      const totalQty = Number(item.qty || 0);
      const invoiceItemId = item.id as string;

      // De-dupe: if this bin was ever scanned for this invoice_item in this context, block + alert
      const existingBin = await query(
        `SELECT id
         FROM validated_barcodes
         WHERE invoice_item_id = $1
           AND scan_context = $2
           AND customer_bin_number = $3
         LIMIT 1`,
        [invoiceItemId, scanContext, customerBinNumber]
      );
      if (existingBin.rows.length > 0) {
        // Duplicate scan should NOT block invoice or require admin approval.
        // We return a conflict so the client can show a warning and continue scanning.
        return res.status(409).json({
          success: false,
          error: 'Duplicate scan',
          message: `Duplicate scan ignored. Bin "${customerBinNumber}" was already scanned for this item.`,
          validationStep: 'duplicate_customer_bin_scan',
        });
      }

      const nextCustQty = Number(item.cust_scanned_quantity || 0) + binQty;
      if (nextCustQty > totalQty) {
        return reportMismatchAndBlock({
          validationStep: 'over_scan_customer',
          message: `Over-scan prevented: customer scanned qty would exceed item qty (${nextCustQty} > ${totalQty}). Invoice blocked for admin review.`,
          customerScan: {
            partCode: customerPart,
            quantity: binQtyStr,
            binNumber: customerBinNumber,
            rawValue: canonicalCustomerBarcode || '',
          },
        });
      }

      const updated = await transaction(async (client) => {
        const updatedItem = await client.query(
          `UPDATE invoice_items
           SET cust_scanned_quantity = COALESCE(cust_scanned_quantity, 0) + $1,
               cust_scanned_bins_count = COALESCE(cust_scanned_bins_count, 0) + 1
           WHERE id = $2
           RETURNING id, qty,
                     cust_scanned_quantity, cust_scanned_bins_count,
                     inbd_scanned_quantity, inbd_scanned_bins_count`,
          [binQty, invoiceItemId]
        );

        const insert = await client.query(
          `INSERT INTO validated_barcodes
           (invoice_id, customer_barcode, autoliv_barcode, customer_item, item_number, part_description,
            quantity, bin_quantity, invoice_item_id, status, scanned_by, scan_context, customer_name, customer_code, scan_stage, customer_bin_number)
           VALUES ($1, $2, NULL, $3, NULL, NULL,
                   $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           RETURNING id`,
          [
            invoiceId,
            canonicalCustomerBarcode,
            customerPart,
            totalQty,
            binQty,
            invoiceItemId,
            'pending',
            username,
            scanContext,
            customerName,
            customerCode,
            'customer',
            customerBinNumber,
          ]
        );

        return { updatedItem: updatedItem.rows[0], scanId: insert.rows[0]?.id };
      });

      await recomputeAndUpdateInvoiceProgress();

      // Broadcast a lightweight event; clients should refresh for full consistency.
      io.emit('audit:stage-scan', {
        invoiceId,
        invoiceItemId,
        stage,
        scannedBy: username,
        scanContext,
      });

      return res.json({
        success: true,
        stage,
        invoiceId,
        invoiceItemId,
        scanId: updated.scanId,
        counters: {
          custScannedQty: updated.updatedItem.cust_scanned_quantity,
          custBins: updated.updatedItem.cust_scanned_bins_count,
          inbdScannedQty: updated.updatedItem.inbd_scanned_quantity,
          inbdBins: updated.updatedItem.inbd_scanned_bins_count,
          totalQty: updated.updatedItem.qty,
        },
      });
    }

    // Stage 2: inbound/autoliv label scanned (pair with pending customer scan)
    // Supports "resume" mode: customerBarcode can be omitted, in which case we use the latest pending customer scan
    // already stored in validated_barcodes for the matched invoice_item.
    if (!canonicalAutolivBarcode) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        message: 'autolivBarcode is required for stage="inbd".',
      });
    }

    const isResumeMode = !canonicalCustomerBarcode;

    let parsedAutoliv: ReturnType<typeof parseAutolivLabel> | null = null;
    try {
      parsedAutoliv = parseAutolivLabel(canonicalAutolivBarcode);
    } catch (e: any) {
      const message =
        e instanceof QrParseError
          ? `${e.labelType.toUpperCase()} parse error: ${e.message}`
          : `QR parse error: ${e?.message || 'Unknown error'}`;
      return res.status(400).json({ success: false, error: 'Invalid QR code', message });
    }

    // If customer barcode isn't provided, we'll locate the correct invoice_item by Autoliv part,
    // then fetch the latest pending customer scan for that invoice_item to derive customer barcode.
    let derivedCustomerBarcode: string | null = canonicalCustomerBarcode;
    if (isResumeMode) {
      const autolivPartFromLabel = parsedAutoliv.partNumber;
      if (!autolivPartFromLabel) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          message: 'Missing part number after Autoliv QR parsing. Please rescan.',
        });
      }

      const itemByPart = await query(
        `SELECT id
         FROM invoice_items
         WHERE invoice_id = $1 AND part = $2`,
        [invoiceId, autolivPartFromLabel]
      );

      if (itemByPart.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          message: `No invoice_item match for part="${autolivPartFromLabel}" in invoice ${invoiceId}. Please scan the customer label.`,
        });
      }
      if (itemByPart.rows.length > 1) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          message: `Ambiguous match: multiple invoice_items for part="${autolivPartFromLabel}" in invoice ${invoiceId}. Please scan the customer label to disambiguate.`,
        });
      }

      const invoiceItemIdForPending = itemByPart.rows[0].id as string;
      const pendingCustomerScan = await query(
        `SELECT customer_barcode
         FROM validated_barcodes
         WHERE invoice_item_id = $1
           AND scan_context = $2
           AND scan_stage = 'customer'
           AND status = 'pending'
         ORDER BY scanned_at DESC
         LIMIT 1`,
        [invoiceItemIdForPending, scanContext]
      );

      if (pendingCustomerScan.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          message: 'No pending customer scan found for this item. Please scan the customer label first.',
        });
      }

      derivedCustomerBarcode = pendingCustomerScan.rows[0].customer_barcode || null;
      if (!derivedCustomerBarcode) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          message: 'Pending customer scan is missing customer barcode. Please rescan the customer label.',
        });
      }
    }

    let parsedCustomer: ReturnType<typeof parseCustomerLabel> | null = null;
    try {
      parsedCustomer = parseCustomerLabel(derivedCustomerBarcode as string);
    } catch (e: any) {
      const message =
        e instanceof QrParseError
          ? `${e.labelType.toUpperCase()} parse error: ${e.message}`
          : `QR parse error: ${e?.message || 'Unknown error'}`;
      return res.status(400).json({ success: false, error: 'Invalid QR code', message });
    }

    if (parsedCustomer.quantity !== parsedAutoliv.quantity) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        message: `Quantity mismatch between labels: customer="${parsedCustomer.quantity}" vs autoliv="${parsedAutoliv.quantity}"`,
      });
    }

    const binQty = /^\d+$/.test(parsedCustomer.quantity) ? parseInt(parsedCustomer.quantity, 10) : 0;
    if (!binQty || binQty <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        message: `Invalid bin quantity from labels: "${parsedCustomer.quantity}"`,
      });
    }

    const customerPart = parsedCustomer.partNumber;
    const autolivPart = parsedAutoliv.partNumber;
    const customerBinNumber = parsedCustomer.binNumber;
    const autolivBinNumber = parsedAutoliv.binNumber;

    // Match exactly one invoice_item by (customer_item, part)
    const itemRows = await query(
      `SELECT id, qty,
              COALESCE(cust_scanned_quantity, 0) AS cust_scanned_quantity,
              COALESCE(cust_scanned_bins_count, 0) AS cust_scanned_bins_count,
              COALESCE(inbd_scanned_quantity, 0) AS inbd_scanned_quantity,
              COALESCE(inbd_scanned_bins_count, 0) AS inbd_scanned_bins_count,
              COALESCE(scanned_quantity, 0) AS scanned_quantity,
              COALESCE(scanned_bins_count, 0) AS scanned_bins_count,
              COALESCE(number_of_bins, 0) AS number_of_bins
       FROM invoice_items
       WHERE invoice_id = $1 AND customer_item = $2 AND part = $3`,
      [invoiceId, customerPart, autolivPart]
    );

    if (itemRows.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        message: `No invoice_item match for customer_item="${customerPart}" and part="${autolivPart}" in invoice ${invoiceId}`,
      });
    }
    if (itemRows.rows.length > 1) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        message: `Ambiguous match: multiple invoice_items for customer_item="${customerPart}" and part="${autolivPart}" in invoice ${invoiceId}`,
      });
    }

    const item = itemRows.rows[0];
    const invoiceItemId = item.id as string;
    const totalQty = Number(item.qty || 0);

    // De-dupe: if this autoliv bin was ever scanned for this invoice_item in this context, block + alert
    const existingInbdBin = await query(
      `SELECT id
       FROM validated_barcodes
       WHERE invoice_item_id = $1
         AND scan_context = $2
         AND autoliv_bin_number = $3
       LIMIT 1`,
      [invoiceItemId, scanContext, autolivBinNumber]
    );
    if (existingInbdBin.rows.length > 0) {
      // Duplicate scan should NOT block invoice or require admin approval.
      // We return a conflict so the client can show a warning and continue scanning.
      return res.status(409).json({
        success: false,
        error: 'Duplicate scan',
        message: `Duplicate scan ignored. INBD bin "${autolivBinNumber}" was already scanned for this item.`,
        validationStep: 'duplicate_inbd_bin_scan',
      });
    }

    const nextInbdQty = Number(item.inbd_scanned_quantity || 0) + binQty;
    if (nextInbdQty > totalQty) {
      return reportMismatchAndBlock({
        validationStep: 'over_scan_inbd',
        message: `Over-scan prevented: INBD scanned qty would exceed item qty (${nextInbdQty} > ${totalQty}). Invoice blocked for admin review.`,
        customerScan: {
          partCode: customerPart,
          quantity: parsedCustomer.quantity,
          binNumber: customerBinNumber,
          rawValue: derivedCustomerBarcode || '',
        },
        autolivScan: {
          partCode: autolivPart,
          quantity: parsedAutoliv.quantity,
          binNumber: autolivBinNumber,
          rawValue: canonicalAutolivBarcode || '',
        },
      });
    }

    const numberOfBins = Math.ceil(totalQty / (binQty || 1));

    const updated = await transaction(async (client) => {
      // Lock the latest pending customer-stage scan for this item.
      // In resume mode, do NOT require scanned_by=current user (user may resume later / different user).
      const pending = await client.query(
        `SELECT id
         FROM validated_barcodes
         WHERE invoice_item_id = $1
           AND scan_context = $2
           AND scan_stage = 'customer'
           ${isResumeMode ? '' : 'AND scanned_by = $3'}
         ORDER BY scanned_at DESC
         LIMIT 1
         FOR UPDATE`,
        isResumeMode ? [invoiceItemId, scanContext] : [invoiceItemId, scanContext, username]
      );

      if (pending.rows.length === 0) {
        return { error: 'NO_PENDING_CUSTOMER_SCAN' as const };
      }

      const pendingId = pending.rows[0].id as string;

      // Pair the scan row (mark as paired + fill autoliv fields)
      await client.query(
        `UPDATE validated_barcodes
         SET autoliv_barcode = $1,
             item_number = $2,
             quantity = $3,
             bin_quantity = $4,
             status = $5,
             scan_stage = $6,
             autoliv_bin_number = $7,
             scanned_at = CURRENT_TIMESTAMP
         WHERE id = $8`,
        [canonicalAutolivBarcode, autolivPart, totalQty, binQty, 'matched', 'paired', autolivBinNumber, pendingId]
      );

      // Update invoice item inbound counters (+ keep legacy counters in sync)
      const updatedItem = await client.query(
        `UPDATE invoice_items
         SET inbd_scanned_quantity = COALESCE(inbd_scanned_quantity, 0) + $1,
             inbd_scanned_bins_count = COALESCE(inbd_scanned_bins_count, 0) + 1,
             scanned_quantity = LEAST(COALESCE(scanned_quantity, 0) + $1, qty),
             scanned_bins_count = COALESCE(scanned_bins_count, 0) + 1,
             number_of_bins = CASE
                               WHEN COALESCE(number_of_bins, 0) = 0 THEN $2
                               ELSE number_of_bins
                             END
         WHERE id = $3
         RETURNING id, qty,
                   cust_scanned_quantity, cust_scanned_bins_count,
                   inbd_scanned_quantity, inbd_scanned_bins_count,
                   scanned_quantity, scanned_bins_count, number_of_bins`,
        [binQty, numberOfBins, invoiceItemId]
      );

      return { updatedItem: updatedItem.rows[0], scanId: pendingId };
    });

    if ((updated as any).error === 'NO_PENDING_CUSTOMER_SCAN') {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        message: 'No pending customer scan found for this item. Please scan the customer label first.',
      });
    }

    await recomputeAndUpdateInvoiceProgress();

    // Broadcast a lightweight event; clients should refresh for full consistency.
    io.emit('audit:stage-scan', {
      invoiceId,
      invoiceItemId,
      stage,
      scannedBy: username,
      scanContext,
    });

    return res.json({
      success: true,
      stage,
      invoiceId,
      invoiceItemId,
      scanId: (updated as any).scanId,
      counters: {
        custScannedQty: (updated as any).updatedItem.cust_scanned_quantity,
        custBins: (updated as any).updatedItem.cust_scanned_bins_count,
        inbdScannedQty: (updated as any).updatedItem.inbd_scanned_quantity,
        inbdBins: (updated as any).updatedItem.inbd_scanned_bins_count,
        totalQty: (updated as any).updatedItem.qty,
        numberOfBins: (updated as any).updatedItem.number_of_bins,
      },
    });
  } catch (error: any) {
    console.error('Record scan-stage error:', error);
    console.error('Error stack:', error?.stack);
    res.status(500).json({
      error: 'Failed to record scan stage',
      message: error?.message || 'Unknown error occurred',
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
      scans: result.rows.map((scan: any) => ({
        id: scan.id,
        customerBarcode: scan.customer_barcode,
        autolivBarcode: scan.autoliv_barcode,
        customerItem: scan.customer_item,
        itemNumber: scan.item_number,
        partDescription: scan.part_description,
        quantity: scan.quantity,
        binQuantity: scan.bin_quantity,
        customerBinNumber: scan.customer_bin_number,
        autolivBinNumber: scan.autoliv_bin_number,
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
 * DELETE /api/audit/:invoiceId/scans/:scanId
 * Delete a loading-dispatch scan (for removing incorrectly scanned bins)
 */
router.delete('/:invoiceId/scans/:scanId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { invoiceId, scanId } = req.params;

    // Verify the scan exists, belongs to the invoice, and is a loading-dispatch scan
    const scanResult = await query(
      `SELECT id, scan_context, invoice_item_id, customer_bin_number, customer_item
       FROM validated_barcodes
       WHERE id = $1 AND invoice_id = $2`,
      [scanId, invoiceId]
    );

    if (scanResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Scan not found',
        message: `Scan ${scanId} not found for invoice ${invoiceId}`
      });
    }

    const scan = scanResult.rows[0];

    // Only allow deletion of loading-dispatch scans (safety measure)
    if (scan.scan_context !== 'loading-dispatch') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Only loading-dispatch scans can be deleted. Doc-audit scans cannot be deleted.'
      });
    }

    // Delete the scan
    await query(
      `DELETE FROM validated_barcodes WHERE id = $1`,
      [scanId]
    );

    // Log the deletion
    await query(
      `INSERT INTO logs (user_name, action, details, log_type, invoice_id)
       VALUES ($1, $2, $3, 'dispatch', $4)`,
      [
        req.user?.username,
        `Deleted loading-dispatch scan`,
        `Scan ID: ${scanId}, Customer Item: ${scan.customer_item || 'N/A'}, Bin Number: ${scan.customer_bin_number || 'N/A'}`,
        invoiceId
      ]
    );

    // Broadcast update
    const io: SocketIOServer = req.app.get('io');
    io.emit('audit:scan-deleted', {
      invoiceId,
      scanId,
      deletedBy: req.user?.username
    });

    res.json({
      success: true,
      message: 'Scan deleted successfully'
    });
  } catch (error: any) {
    console.error('Delete scan error:', error);
    res.status(500).json({
      error: 'Failed to delete scan',
      message: error?.message || 'Unknown error occurred'
    });
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
      validationStep,
      customerScan, 
      autolivScan 
    } = req.body;

    // Insert mismatch alert
    await query(
      `INSERT INTO mismatch_alerts 
       (user_name, customer, invoice_id, step, validation_step,
        customer_scan_part_code, customer_scan_quantity, customer_scan_bin_number, customer_scan_raw_value,
        autoliv_scan_part_code, autoliv_scan_quantity, autoliv_scan_bin_number, autoliv_scan_raw_value)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        req.user?.username,
        customer,
        invoiceId,
        step || 'doc-audit',
        validationStep || null,
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

/**
 * POST /api/audit/test-scan
 * Test endpoint to log scan data format (for testing purposes only)
 */
router.post('/test-scan', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const scanData = req.body;
    
    // Log the exact data structure and types
    console.log('\n========== TEST SCAN DATA RECEIVED ==========');
    console.log('Timestamp:', new Date().toISOString());
    console.log('User:', req.user?.username || 'Unknown');
    console.log('\n--- Request Body (Full Object) ---');
    console.log(JSON.stringify(scanData, null, 2));
    console.log('\n--- Data Types ---');
    console.log('Type of scanData:', typeof scanData);
    console.log('Is Array:', Array.isArray(scanData));
    console.log('\n--- Individual Fields ---');
    Object.keys(scanData).forEach(key => {
      const value = scanData[key];
      console.log(`${key}:`, {
        value: value,
        type: typeof value,
        isNull: value === null,
        isUndefined: value === undefined,
        constructor: value?.constructor?.name,
        stringified: JSON.stringify(value)
      });
    });
    console.log('\n--- Field-by-Field Breakdown ---');
    if (scanData.customerBarcode !== undefined) {
      console.log('customerBarcode:', {
        value: scanData.customerBarcode,
        type: typeof scanData.customerBarcode,
        length: scanData.customerBarcode?.length
      });
    }
    if (scanData.autolivBarcode !== undefined) {
      console.log('autolivBarcode:', {
        value: scanData.autolivBarcode,
        type: typeof scanData.autolivBarcode,
        length: scanData.autolivBarcode?.length
      });
    }
    if (scanData.customerItem !== undefined) {
      console.log('customerItem:', {
        value: scanData.customerItem,
        type: typeof scanData.customerItem
      });
    }
    if (scanData.itemNumber !== undefined) {
      console.log('itemNumber:', {
        value: scanData.itemNumber,
        type: typeof scanData.itemNumber
      });
    }
    if (scanData.partDescription !== undefined) {
      console.log('partDescription:', {
        value: scanData.partDescription,
        type: typeof scanData.partDescription
      });
    }
    if (scanData.quantity !== undefined) {
      console.log('quantity:', {
        value: scanData.quantity,
        type: typeof scanData.quantity,
        isNumber: typeof scanData.quantity === 'number',
        parsed: Number(scanData.quantity)
      });
    }
    if (scanData.binQuantity !== undefined) {
      console.log('binQuantity:', {
        value: scanData.binQuantity,
        type: typeof scanData.binQuantity,
        isNumber: typeof scanData.binQuantity === 'number',
        parsed: Number(scanData.binQuantity)
      });
    }
    if (scanData.binNumber !== undefined) {
      console.log('binNumber:', {
        value: scanData.binNumber,
        type: typeof scanData.binNumber
      });
    }
    if (scanData.status !== undefined) {
      console.log('status:', {
        value: scanData.status,
        type: typeof scanData.status
      });
    }
    if (scanData.scanContext !== undefined) {
      console.log('scanContext:', {
        value: scanData.scanContext,
        type: typeof scanData.scanContext
      });
    }
    if (scanData.invoiceId !== undefined) {
      console.log('invoiceId:', {
        value: scanData.invoiceId,
        type: typeof scanData.invoiceId
      });
    }
    console.log('\n========== END TEST SCAN DATA ==========\n');
    
    res.json({ 
      success: true, 
      message: 'Test scan data logged to console',
      receivedData: scanData
    });
  } catch (error: any) {
    console.error('Error in test-scan endpoint:', error);
    res.status(500).json({ 
      error: 'Failed to process test scan',
      message: error?.message || 'Unknown error occurred'
    });
  }
});

export default router;

