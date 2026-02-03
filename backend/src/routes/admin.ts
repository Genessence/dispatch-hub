import { Router, Response } from 'express';
import { query, transaction } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/roleGuard';
import { Server as SocketIOServer } from 'socket.io';

const router = Router();

// All routes in this file require admin role
router.use(authenticateToken);
router.use(requireAdmin);

/**
 * GET /api/admin/analytics
 * Get analytics data
 */
router.get('/analytics', async (req: AuthRequest, res: Response) => {
  try {
    // Get invoice statistics
    const invoiceStats = await query(`
      SELECT 
        COUNT(*) as total_invoices,
        COUNT(*) FILTER (WHERE audit_complete = true) as audited_invoices,
        COUNT(*) FILTER (WHERE dispatched_by IS NOT NULL) as dispatched_invoices,
        COUNT(*) FILTER (WHERE blocked = true) as blocked_invoices,
        SUM(total_qty) as total_quantity
      FROM invoices
    `);

    // Get today's stats
    const todayStats = await query(`
      SELECT 
        COUNT(*) FILTER (WHERE DATE(uploaded_at) = CURRENT_DATE) as uploaded_today,
        COUNT(*) FILTER (WHERE DATE(audited_at) = CURRENT_DATE) as audited_today,
        COUNT(*) FILTER (WHERE DATE(dispatched_at) = CURRENT_DATE) as dispatched_today
      FROM invoices
    `);

    // Get top customers
    const topCustomers = await query(`
      SELECT customer, COUNT(*) as invoice_count, SUM(total_qty) as total_qty
      FROM invoices
      GROUP BY customer
      ORDER BY invoice_count DESC
      LIMIT 10
    `);

    // Get dispatch by day (last 7 days)
    const dispatchByDay = await query(`
      SELECT DATE(dispatched_at) as date, COUNT(*) as count
      FROM invoices
      WHERE dispatched_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY DATE(dispatched_at)
      ORDER BY date
    `);

    res.json({
      success: true,
      analytics: {
        overview: invoiceStats.rows[0],
        today: todayStats.rows[0],
        topCustomers: topCustomers.rows,
        dispatchByDay: dispatchByDay.rows
      }
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Parse query value as either YYYY-MM-DD (date-only) or ISO datetime.
// Returns null for invalid/empty values.
const parseDateOrDateTime = (value: unknown): { kind: 'date'; value: string } | { kind: 'datetime'; value: string } | null => {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { kind: 'date', value: raw };
  }
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  return { kind: 'datetime', value: new Date(ms).toISOString() };
};

const clampInt = (value: unknown, { min, max, fallback }: { min: number; max: number; fallback: number }) => {
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : typeof value === 'number' ? Math.trunc(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

/**
 * GET /api/admin/reports/invoices
 * Filterable + paginated invoice list for reports.
 */
router.get('/reports/invoices', async (req: AuthRequest, res: Response) => {
  try {
    const {
      status,
      dateFrom,
      dateTo,
      dispatchFrom,
      dispatchTo,
      deliveryFrom,
      deliveryTo,
      deliveryTime,
      unloadingLoc,
      customer,
      billTo,
      limit,
      offset,
    } = req.query as Record<string, unknown>;

    const statusRaw = typeof status === 'string' ? status.trim().toLowerCase() : '';
    if (statusRaw) {
      if (!['dispatched', 'audited', 'pending', 'mismatched'].includes(statusRaw)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid status',
          message: 'status must be one of: dispatched, audited, pending, mismatched',
        });
      }
    }

    // -----------------------------
    // Shared filters (customer, billTo)
    // -----------------------------
    const billToValue = typeof billTo === 'string' ? billTo.trim() : '';
    const customerValue = typeof customer === 'string' ? customer.trim() : '';

    // New unified date range (preferred)
    const dateFromParsed = parseDateOrDateTime(dateFrom);
    const dateToParsed = parseDateOrDateTime(dateTo);

    // Backwards-compat date range (kept for older clients)
    const dispatchFromParsed = parseDateOrDateTime(dispatchFrom);
    const dispatchToParsed = parseDateOrDateTime(dispatchTo);
    const deliveryFromParsed = parseDateOrDateTime(deliveryFrom);
    const deliveryToParsed = parseDateOrDateTime(deliveryTo);

    // Note: unloadingLoc/deliveryTime and delivery date filters are deprecated in the new reports UI.
    // Kept for backward compatibility with older clients for now.
    const unloadingLocValue = typeof unloadingLoc === 'string' ? unloadingLoc.trim() : '';
    const deliveryTimeValue = typeof deliveryTime === 'string' ? deliveryTime.trim() : '';

    const limitValue = clampInt(limit, { min: 1, max: 500, fallback: 200 });
    const offsetValue = clampInt(offset, { min: 0, max: 1_000_000, fallback: 0 });

    // -------------------------------------------------------
    // STATUS = mismatched (invoices with mismatch_alerts)
    // -------------------------------------------------------
    if (statusRaw === 'mismatched') {
      const where: string[] = ['1=1'];
      const params: any[] = [];
      const addParam = (v: any) => {
        params.push(v);
        return `$${params.length}`;
      };

      if (billToValue) where.push(`i.bill_to = ${addParam(billToValue)}`);
      if (customerValue) where.push(`LOWER(i.customer) LIKE '%' || LOWER(${addParam(customerValue)}) || '%'`);

      // Optional legacy filters (still supported)
      if (unloadingLocValue) where.push(`LOWER(i.unloading_loc) = LOWER(${addParam(unloadingLocValue)})`);
      if (deliveryTimeValue) where.push(`LOWER(i.delivery_time) = LOWER(${addParam(deliveryTimeValue)})`);

      // Date range for mismatched is based on mismatch_alerts.created_at (confirmed requirement)
      const from = dateFromParsed ?? dispatchFromParsed ?? deliveryFromParsed ?? null;
      const to = dateToParsed ?? dispatchToParsed ?? deliveryToParsed ?? null;

      if (from) {
        if (from.kind === 'date') {
          where.push(`ma.created_at >= ${addParam(from.value)}::date`);
        } else {
          where.push(`ma.created_at >= ${addParam(from.value)}::timestamptz`);
        }
      }
      if (to) {
        if (to.kind === 'date') {
          where.push(`ma.created_at < (${addParam(to.value)}::date + INTERVAL '1 day')`);
        } else {
          where.push(`ma.created_at <= ${addParam(to.value)}::timestamptz`);
        }
      }

      const whereSql = `WHERE ${where.join(' AND ')}`;

      const totalResult = await query(
        `SELECT COUNT(*)::int AS total
         FROM (
           SELECT i.id
           FROM invoices i
           JOIN mismatch_alerts ma ON ma.invoice_id = i.id
           ${whereSql}
           GROUP BY i.id
         ) x`,
        params
      );
      const total = Number(totalResult.rows?.[0]?.total ?? 0) || 0;

      const listParams = [...params, limitValue, offsetValue];
      const limitParam = `$${listParams.length - 1}`;
      const offsetParam = `$${listParams.length}`;

      const rowsResult = await query(
        `SELECT
           i.id,
           i.customer,
           i.bill_to,
           i.invoice_date,
           i.delivery_date,
           i.delivery_time,
           i.unloading_loc,
           i.total_qty,
           i.expected_bins,
           i.scanned_bins,
           i.audit_complete,
           i.audited_at,
           i.audited_by,
           i.dispatched_at,
           i.dispatched_by,
           i.vehicle_number,
           i.gatepass_number,
           i.blocked,
           i.blocked_at,
           i.uploaded_at,
           i.uploaded_by,
           i.created_at,
           i.updated_at,
           COUNT(ma.*)::int AS mismatch_total_count,
           COUNT(*) FILTER (WHERE ma.status = 'pending')::int AS mismatch_pending_count,
           MAX(ma.created_at) AS latest_mismatch_at
         FROM invoices i
         JOIN mismatch_alerts ma ON ma.invoice_id = i.id
         ${whereSql}
         GROUP BY
           i.id,
           i.customer,
           i.bill_to,
           i.invoice_date,
           i.delivery_date,
           i.delivery_time,
           i.unloading_loc,
           i.total_qty,
           i.expected_bins,
           i.scanned_bins,
           i.audit_complete,
           i.audited_at,
           i.audited_by,
           i.dispatched_at,
           i.dispatched_by,
           i.vehicle_number,
           i.gatepass_number,
           i.blocked,
           i.blocked_at,
           i.uploaded_at,
           i.uploaded_by,
           i.created_at,
           i.updated_at
         ORDER BY latest_mismatch_at DESC NULLS LAST, i.created_at DESC
         LIMIT ${limitParam}
         OFFSET ${offsetParam}`,
        listParams
      );

      return res.json({
        success: true,
        total,
        limit: limitValue,
        offset: offsetValue,
        invoices: rowsResult.rows.map((inv: any) => ({
          id: inv.id,
          customer: inv.customer,
          billTo: inv.bill_to,
          invoiceDate: inv.invoice_date,
          deliveryDate: inv.delivery_date,
          deliveryTime: inv.delivery_time,
          unloadingLoc: inv.unloading_loc ?? null,
          totalQty: inv.total_qty ?? null,
          expectedBins: inv.expected_bins ?? null,
          scannedBins: inv.scanned_bins ?? null,
          auditComplete: !!inv.audit_complete,
          auditedAt: inv.audited_at ?? null,
          auditedBy: inv.audited_by ?? null,
          dispatchedAt: inv.dispatched_at ?? null,
          dispatchedBy: inv.dispatched_by ?? null,
          vehicleNumber: inv.vehicle_number ?? null,
          gatepassNumber: inv.gatepass_number ?? null,
          blocked: !!inv.blocked,
          blockedAt: inv.blocked_at ?? null,
          uploadedAt: inv.uploaded_at ?? null,
          uploadedBy: inv.uploaded_by ?? null,
          createdAt: inv.created_at ?? null,
          updatedAt: inv.updated_at ?? null,
          mismatchTotalCount: Number(inv.mismatch_total_count ?? 0) || 0,
          mismatchPendingCount: Number(inv.mismatch_pending_count ?? 0) || 0,
          latestMismatchAt: inv.latest_mismatch_at ?? null,
        })),
      });
    }

    // -------------------------------------------------------
    // All other statuses (dispatched/audited/pending + legacy)
    // -------------------------------------------------------
    const where: string[] = ['1=1'];
    const params: any[] = [];
    const addParam = (v: any) => {
      params.push(v);
      return `$${params.length}`;
    };

    if (statusRaw === 'dispatched') {
      where.push('dispatched_by IS NOT NULL');
    } else if (statusRaw === 'audited') {
      where.push('audit_complete = true');
      where.push('dispatched_by IS NULL');
    } else if (statusRaw === 'pending') {
      where.push('COALESCE(audit_complete, false) = false');
      where.push('dispatched_by IS NULL');
    }

    if (billToValue) where.push(`bill_to = ${addParam(billToValue)}`);
    if (customerValue) where.push(`LOWER(customer) LIKE '%' || LOWER(${addParam(customerValue)}) || '%'`);

    // Optional legacy filters (still supported)
    if (unloadingLocValue) where.push(`LOWER(unloading_loc) = LOWER(${addParam(unloadingLocValue)})`);
    if (deliveryTimeValue) where.push(`LOWER(delivery_time) = LOWER(${addParam(deliveryTimeValue)})`);

    // Unified date range: choose column based on status
    const dateCol =
      statusRaw === 'dispatched'
        ? 'dispatched_at'
        : statusRaw === 'audited'
          ? 'audited_at'
          : statusRaw === 'pending'
            ? 'uploaded_at'
            : null;

    const from = dateFromParsed ?? (statusRaw === 'dispatched' ? dispatchFromParsed : statusRaw === 'pending' ? deliveryFromParsed : null);
    const to = dateToParsed ?? (statusRaw === 'dispatched' ? dispatchToParsed : statusRaw === 'pending' ? deliveryToParsed : null);

    if (dateCol && from) {
      if (from.kind === 'date') where.push(`${dateCol} >= ${addParam(from.value)}::date`);
      else where.push(`${dateCol} >= ${addParam(from.value)}::timestamptz`);
    }
    if (dateCol && to) {
      if (to.kind === 'date') where.push(`${dateCol} < (${addParam(to.value)}::date + INTERVAL '1 day')`);
      else where.push(`${dateCol} <= ${addParam(to.value)}::timestamptz`);
    }

    // Legacy delivery_date filtering (kept)
    if (deliveryFromParsed) {
      if (deliveryFromParsed.kind === 'date') where.push(`delivery_date >= ${addParam(deliveryFromParsed.value)}::date`);
      else where.push(`delivery_date >= ${addParam(deliveryFromParsed.value)}::timestamptz`);
    }
    if (deliveryToParsed) {
      if (deliveryToParsed.kind === 'date') where.push(`delivery_date < (${addParam(deliveryToParsed.value)}::date + INTERVAL '1 day')`);
      else where.push(`delivery_date <= ${addParam(deliveryToParsed.value)}::timestamptz`);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;

    const totalResult = await query(
      `SELECT COUNT(*)::int AS total
       FROM invoices
       ${whereSql}`,
      params
    );
    const total = Number(totalResult.rows?.[0]?.total ?? 0) || 0;

    const orderBy =
      statusRaw === 'dispatched'
        ? 'dispatched_at DESC NULLS LAST, created_at DESC'
        : statusRaw === 'audited'
          ? 'audited_at DESC NULLS LAST, created_at DESC'
          : statusRaw === 'pending'
            ? 'uploaded_at DESC NULLS LAST, created_at DESC'
            : 'created_at DESC';

    const listParams = [...params, limitValue, offsetValue];
    const limitParam = `$${listParams.length - 1}`;
    const offsetParam = `$${listParams.length}`;

    const rowsResult = await query(
      `SELECT
         id,
         customer,
         bill_to,
         invoice_date,
         delivery_date,
         delivery_time,
         unloading_loc,
         total_qty,
         expected_bins,
         scanned_bins,
         audit_complete,
         audited_at,
         audited_by,
         dispatched_at,
         dispatched_by,
         vehicle_number,
         gatepass_number,
         blocked,
         blocked_at,
         uploaded_at,
         uploaded_by,
         created_at,
         updated_at
       FROM invoices
       ${whereSql}
       ORDER BY ${orderBy}
       LIMIT ${limitParam}
       OFFSET ${offsetParam}`,
      listParams
    );

    res.json({
      success: true,
      total,
      limit: limitValue,
      offset: offsetValue,
      invoices: rowsResult.rows.map((inv: any) => ({
        id: inv.id,
        customer: inv.customer,
        billTo: inv.bill_to,
        invoiceDate: inv.invoice_date,
        deliveryDate: inv.delivery_date,
        deliveryTime: inv.delivery_time,
        unloadingLoc: inv.unloading_loc ?? null,
        totalQty: inv.total_qty ?? null,
        expectedBins: inv.expected_bins ?? null,
        scannedBins: inv.scanned_bins ?? null,
        auditComplete: !!inv.audit_complete,
        auditedAt: inv.audited_at ?? null,
        auditedBy: inv.audited_by ?? null,
        dispatchedAt: inv.dispatched_at ?? null,
        dispatchedBy: inv.dispatched_by ?? null,
        vehicleNumber: inv.vehicle_number ?? null,
        gatepassNumber: inv.gatepass_number ?? null,
        blocked: !!inv.blocked,
        blockedAt: inv.blocked_at ?? null,
        uploadedAt: inv.uploaded_at ?? null,
        uploadedBy: inv.uploaded_by ?? null,
        createdAt: inv.created_at ?? null,
        updatedAt: inv.updated_at ?? null,
        mismatchTotalCount: null,
        mismatchPendingCount: null,
        latestMismatchAt: null,
      })),
    });
  } catch (error: any) {
    console.error('Get invoice reports error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch invoice reports',
      message: error?.message || 'Unknown error occurred',
    });
  }
});

/**
 * GET /api/admin/exceptions
 * Get all mismatch alerts
 */
router.get('/exceptions', async (req: AuthRequest, res: Response) => {
  try {
    const { status, invoiceId } = req.query;
    
    const where: string[] = [];
    const params: any[] = [];
    const addParam = (v: any) => {
      params.push(v);
      return `$${params.length}`;
    };

    const invoiceIdValue = typeof invoiceId === 'string' ? invoiceId.trim() : '';
    if (invoiceIdValue) {
      where.push(`invoice_id = ${addParam(invoiceIdValue)}`);
    }

    const statusValue = typeof status === 'string' ? status.trim().toLowerCase() : '';
    if (statusValue) {
      where.push(`status = ${addParam(statusValue)}`);
    }

    const whereSql = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
    const queryText = `SELECT * FROM mismatch_alerts${whereSql} ORDER BY created_at DESC`;

    const result = await query(queryText, params);

    res.json({
      success: true,
      alerts: result.rows.map((alert: any) => ({
        id: alert.id,
        user: alert.user_name,
        customer: alert.customer,
        invoiceId: alert.invoice_id,
        step: alert.step,
        validationStep: alert.validation_step,
        customerScan: {
          partCode: alert.customer_scan_part_code,
          quantity: alert.customer_scan_quantity,
          binNumber: alert.customer_scan_bin_number,
          rawValue: alert.customer_scan_raw_value
        },
        autolivScan: {
          partCode: alert.autoliv_scan_part_code,
          quantity: alert.autoliv_scan_quantity,
          binNumber: alert.autoliv_scan_bin_number,
          rawValue: alert.autoliv_scan_raw_value
        },
        status: alert.status,
        reviewedBy: alert.reviewed_by,
        reviewedAt: alert.reviewed_at,
        timestamp: alert.created_at
      }))
    });
  } catch (error) {
    console.error('Get exceptions error:', error);
    res.status(500).json({ error: 'Failed to fetch exceptions' });
  }
});

/**
 * PUT /api/admin/exceptions/:id
 * Approve or reject a mismatch alert
 */
router.put('/exceptions/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'approved' or 'rejected'

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be approved or rejected.' });
    }

    // Update alert status
    const result = await query(
      `UPDATE mismatch_alerts 
       SET status = $1, reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [status, req.user?.username, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    const alert = result.rows[0];

    // If approved, unblock the invoice.
    // Only clear/rollback pending customer scans for CUSTOMER-stage issues.
    // For AUTOLIV/INBD-stage issues we must preserve the customer scan so users can resume from Autoliv step.
    if (status === 'approved' && alert.invoice_id) {
      await transaction(async (client) => {
        // Unblock the invoice
        await client.query(
          'UPDATE invoices SET blocked = false, blocked_at = NULL WHERE id = $1',
          [alert.invoice_id]
        );

        const validationStep = String(alert.validation_step || '');
        const shouldCleanupCustomerStage =
          validationStep === 'customer_qr_no_match' ||
          validationStep === 'duplicate_customer_bin_scan' ||
          validationStep === 'over_scan_customer';

        if (!shouldCleanupCustomerStage) {
          return;
        }

        // Get the mismatch alert's created_at timestamp to find scans created before the mismatch
        const alertCreatedAt = alert.created_at;

        // Find all pending customer scans for this invoice that were created before the mismatch alert
        // These are scans that were recorded before the mismatch occurred
        const pendingScans = await client.query(
          `SELECT id, invoice_item_id, bin_quantity
           FROM validated_barcodes
           WHERE invoice_id = $1
             AND scan_context = 'doc-audit'
             AND scan_stage = 'customer'
             AND status = 'pending'
             AND scanned_at < $2`,
          [alert.invoice_id, alertCreatedAt]
        );

        // Rollback counters for each pending scan
        for (const scan of pendingScans.rows) {
          const binQty = scan.bin_quantity || 0;
          if (binQty > 0 && scan.invoice_item_id) {
            // Decrement counters for this invoice item
            await client.query(
              `UPDATE invoice_items
               SET cust_scanned_quantity = GREATEST(COALESCE(cust_scanned_quantity, 0) - $1, 0),
                   cust_scanned_bins_count = GREATEST(COALESCE(cust_scanned_bins_count, 0) - 1, 0)
               WHERE id = $2`,
              [binQty, scan.invoice_item_id]
            );
          }
        }

        // Delete the pending scans
        if (pendingScans.rows.length > 0) {
          await client.query(
            `DELETE FROM validated_barcodes
             WHERE invoice_id = $1
               AND scan_context = 'doc-audit'
               AND scan_stage = 'customer'
               AND status = 'pending'
               AND scanned_at < $2`,
            [alert.invoice_id, alertCreatedAt]
          );
        }
      });
    }

    // Broadcast update
    const io: SocketIOServer = req.app.get('io');
    io.emit('alert:resolved', { 
      alertId: id,
      status,
      invoiceId: alert.invoice_id,
      reviewedBy: req.user?.username
    });

    res.json({
      success: true,
      alert: {
        id: alert.id,
        status: alert.status,
        reviewedBy: alert.reviewed_by
      }
    });
  } catch (error) {
    console.error('Update exception error:', error);
    res.status(500).json({ error: 'Failed to update exception' });
  }
});

/**
 * GET /api/admin/master-data
 * Get master data overview
 */
router.get('/master-data', async (req: AuthRequest, res: Response) => {
  try {
    // Get unique customers
    const customers = await query(`
      SELECT DISTINCT customer, bill_to, COUNT(*) as invoice_count
      FROM invoices
      GROUP BY customer, bill_to
      ORDER BY customer
    `);

    // Get schedule summary
    const scheduleSummary = await query(`
      SELECT customer_code, COUNT(*) as item_count, 
             COUNT(DISTINCT part_number) as unique_parts,
             MIN(delivery_date) as earliest_date,
             MAX(delivery_date) as latest_date
      FROM schedule_items
      GROUP BY customer_code
      ORDER BY customer_code
    `);

    // Get users
    const users = await query(`
      SELECT id, username, role, created_at
      FROM users
      ORDER BY created_at
    `);

    res.json({
      success: true,
      masterData: {
        customers: customers.rows,
        scheduleSummary: scheduleSummary.rows,
        users: users.rows.map((u: any) => ({
          id: u.id,
          username: u.username,
          role: u.role,
          createdAt: u.created_at
        }))
      }
    });
  } catch (error) {
    console.error('Get master data error:', error);
    res.status(500).json({ error: 'Failed to fetch master data' });
  }
});

/**
 * GET /api/admin/users
 * Get all users
 */
router.get('/users', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query('SELECT id, username, role, created_at FROM users ORDER BY created_at');

    res.json({
      success: true,
      users: result.rows.map((u: any) => ({
        id: u.id,
        username: u.username,
        role: u.role,
        createdAt: u.created_at
      }))
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

export default router;

