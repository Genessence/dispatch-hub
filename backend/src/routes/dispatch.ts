import { Router, Response } from 'express';
import { query, transaction } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { Server as SocketIOServer } from 'socket.io';
import { canonicalizeBarcode, encodeAsciiTriplets } from '../utils/barcodeNormalization';

const router = Router();

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
          customerItem: item.customer_item,
          partDescription: item.part_description
        }))
      };
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
      // First, get invoice details for customer info
      const invoiceDetails: Map<string, any> = new Map();
      const customerCodes = new Set<string>();
      
      for (const invoiceId of invoiceIds) {
        const invoiceResult = await client.query('SELECT * FROM invoices WHERE id = $1', [invoiceId]);
        if (invoiceResult.rows.length === 0) {
          throw new Error(`Invoice ${invoiceId} not found`);
        }
        const invoice = invoiceResult.rows[0];
        invoiceDetails.set(invoiceId, invoice);
        
        // Collect customer codes (bill_to)
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

      // Save each loaded barcode to validated_barcodes table (if not already saved)
      // Try to match barcodes to invoices by customerItem or partCode
      // Track bins by bin_number and update scanned_bins_count per invoice_item
      for (const barcode of loadedBarcodes) {
        const canonicalCustomerBarcode = barcode?.customerBarcode ? canonicalizeBarcode(barcode.customerBarcode) : null;
        const canonicalAutolivBarcode = barcode?.autolivBarcode ? canonicalizeBarcode(barcode.autolivBarcode) : null;
        const canonicalCustomerBarcodeTriplets = canonicalCustomerBarcode ? encodeAsciiTriplets(canonicalCustomerBarcode) : null;

        let matchedInvoiceId: string | null = null;
        let matchedInvoiceItemId: string | null = null;
        
        // Try to find matching invoice by customerItem or itemNumber
        if (barcode.customerItem || barcode.itemNumber) {
          for (const invoiceId of invoiceIds) {
            const itemsResult = await client.query(
              'SELECT * FROM invoice_items WHERE invoice_id = $1 AND (customer_item = $2 OR part = $3)',
              [invoiceId, barcode.customerItem || '', barcode.itemNumber || '']
            );
            if (itemsResult.rows.length > 0) {
              matchedInvoiceId = invoiceId;
              matchedInvoiceItemId = itemsResult.rows[0].id;
              break;
            }
          }
        }
        
        // If no match found, use first invoice (or could skip, but let's save it anyway)
        if (!matchedInvoiceId && invoiceIds.length > 0) {
          matchedInvoiceId = invoiceIds[0];
        }

        if (matchedInvoiceId) {
          const invoice = invoiceDetails.get(matchedInvoiceId);
          const customerName = invoice?.customer || 'Unknown';
          const customerCode = invoice?.bill_to || invoice?.billTo || null;

          // Check if this bin_number already scanned for this invoice_item (prevent duplicates)
          let isDuplicate = false;
          if (matchedInvoiceItemId && barcode.binNumber) {
            const binTriplets = encodeAsciiTriplets(String(barcode.binNumber));
            const duplicateScan = await client.query(
              `SELECT id FROM validated_barcodes 
               WHERE invoice_item_id = $1 
                 AND (customer_barcode LIKE $2 OR customer_barcode LIKE $3)
                 AND scan_context = $4`,
              [matchedInvoiceItemId, `%${barcode.binNumber}%`, `%${binTriplets}%`, 'loading-dispatch']
            );
            isDuplicate = duplicateScan.rows.length > 0;
          }

          // Check if this scan already exists by customer_barcode (fallback check)
          if (!isDuplicate) {
            const existingScan = await client.query(
              `SELECT id FROM validated_barcodes
               WHERE invoice_id = $1
                 AND (customer_barcode = $2 OR customer_barcode = $3)
                 AND scan_context = $4`,
              [matchedInvoiceId, canonicalCustomerBarcode || '', canonicalCustomerBarcodeTriplets || '', 'loading-dispatch']
            );
            isDuplicate = existingScan.rows.length > 0;
          }

          // Only insert if it doesn't exist
          if (!isDuplicate) {
            await client.query(
              `INSERT INTO validated_barcodes 
               (invoice_id, customer_barcode, autoliv_barcode, customer_item, item_number, part_description,
                quantity, bin_quantity, invoice_item_id, status, scanned_by, scan_context, customer_name, customer_code)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
              [
                matchedInvoiceId,
                canonicalCustomerBarcode,
                canonicalAutolivBarcode,
                barcode.customerItem || null,
                barcode.itemNumber || barcode.partCode || null,
                null, // part_description not available in barcode
                parseInt(barcode.quantity || '0') || 0,
                parseInt(barcode.quantity || '0') || null, // bin_quantity from barcode
                matchedInvoiceItemId, // invoice_item_id if matched
                'matched',
                req.user?.username || null,
                'loading-dispatch',
                customerName,
                customerCode
              ]
            );

            // Update scanned_bins_count for the matched invoice_item
            if (matchedInvoiceItemId) {
              await client.query(
                `UPDATE invoice_items 
                 SET scanned_bins_count = COALESCE(scanned_bins_count, 0) + 1
                 WHERE id = $1`,
                [matchedInvoiceItemId]
              );
            }
          }
        }
      }

      // Update all invoices
      for (const invoiceId of invoiceIds) {
        await client.query(
          `UPDATE invoices 
           SET dispatched_by = $1, dispatched_at = CURRENT_TIMESTAMP, 
               vehicle_number = $2, gatepass_number = $3, updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [req.user?.username, vehicleNumber, gatepassNumber, invoiceId]
        );

        // Log the dispatch
        const invoice = invoiceDetails.get(invoiceId);
        const binNumber = loadedBarcodes.length > 0 ? loadedBarcodes[0].binNumber : 'N/A';
        
        await client.query(
          `INSERT INTO logs (user_name, action, details, log_type, invoice_id)
           VALUES ($1, $2, $3, 'dispatch', $4)`,
          [
            req.user?.username,
            `Dispatched invoice ${invoiceId}`,
            `Customer: ${invoice?.customer || 'Unknown'}, Bin Number: ${binNumber}, Quantity: ${totalQuantity}, Vehicle: ${vehicleNumber}`,
            invoiceId
          ]
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
    
    const invoices = invoiceDetailsResult.rows.map((inv: any) => {
      const deliveryDate = inv.delivery_date ? new Date(inv.delivery_date) : null;
      const isOnTime = deliveryDate ? dispatchDate <= deliveryDate : null;
      const status = isOnTime === null ? 'unknown' : (isOnTime ? 'on-time' : 'late');
      
      const invoiceData = {
        id: inv.id,
        deliveryDate: inv.delivery_date || null,
        deliveryTime: inv.delivery_time || null,
        unloadingLoc: inv.unloading_loc || null,
        status
      };
      
      // Log each invoice being returned
      console.log(`📦 Invoice ${inv.id} data:`, invoiceData);
      
      return invoiceData;
    });
    
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

    // Get supply dates (delivery_date) from invoices
    const supplyDates = invoiceDetailsResult.rows
      .map((inv: any) => inv.delivery_date)
      .filter(Boolean)
      .map((date: any) => date ? new Date(date).toISOString().slice(0, 10) : null);

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
      invoices
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

    res.json({
      success: true,
      gatepass: {
        id: gatepass.id,
        gatepassNumber: gatepass.gatepass_number,
        vehicleNumber: gatepass.vehicle_number,
        customer: gatepass.customer,
        customerCode: gatepass.customer_code || null,
        dispatchDate: gatepass.dispatch_date || gatepass.created_at || null,
        invoices: invoicesResult.rows.map((inv: any) => {
          const deliveryDate = inv.delivery_date ? new Date(inv.delivery_date) : null;
          const isOnTime = deliveryDate && dispatchDate ? dispatchDate <= deliveryDate : null;
          const status = isOnTime === null ? 'unknown' : (isOnTime ? 'on-time' : 'late');
          
          return {
            id: inv.id,
            customer: inv.customer,
            totalQty: inv.total_qty,
            deliveryDate: inv.delivery_date || null,
            deliveryTime: inv.delivery_time || null,
            unloadingLoc: inv.unloading_loc || null,
            status
          };
        }),
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

