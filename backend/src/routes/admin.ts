import { Router, Response } from 'express';
import { query } from '../config/database';
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

/**
 * GET /api/admin/exceptions
 * Get all mismatch alerts
 */
router.get('/exceptions', async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.query;
    
    let queryText = 'SELECT * FROM mismatch_alerts';
    const params: any[] = [];

    if (status) {
      queryText += ' WHERE status = $1';
      params.push(status);
    }

    queryText += ' ORDER BY created_at DESC';

    const result = await query(queryText, params);

    res.json({
      success: true,
      alerts: result.rows.map(alert => ({
        id: alert.id,
        user: alert.user_name,
        customer: alert.customer,
        invoiceId: alert.invoice_id,
        step: alert.step,
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

    // If approved, unblock the invoice
    if (status === 'approved' && alert.invoice_id) {
      await query(
        'UPDATE invoices SET blocked = false, blocked_at = NULL WHERE id = $1',
        [alert.invoice_id]
      );
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
        users: users.rows.map(u => ({
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
      users: result.rows.map(u => ({
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

