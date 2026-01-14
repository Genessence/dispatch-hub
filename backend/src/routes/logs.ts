import { Router, Response } from 'express';
import { query } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

/**
 * GET /api/logs
 * Get logs with optional type filter
 */
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { type, limit = 100 } = req.query;
    
    let queryText = 'SELECT * FROM logs';
    const params: any[] = [];
    let paramIndex = 1;

    if (type) {
      queryText += ` WHERE log_type = $${paramIndex++}`;
      params.push(type);
    }

    queryText += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
    params.push(parseInt(limit as string) || 100);

    const result = await query(queryText, params);

    res.json({
      success: true,
      logs: result.rows.map((log: any) => ({
        id: log.id,
        user: log.user_name,
        action: log.action,
        details: log.details,
        type: log.log_type,
        invoiceId: log.invoice_id,
        timestamp: log.created_at
      }))
    });
  } catch (error) {
    console.error('Get logs error:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

/**
 * GET /api/logs/upload
 * Get upload logs
 */
router.get('/upload', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      "SELECT * FROM logs WHERE log_type = 'upload' ORDER BY created_at DESC LIMIT 100"
    );

    res.json({
      success: true,
      logs: result.rows.map((log: any) => ({
        id: log.id,
        user: log.user_name,
        action: log.action,
        details: log.details,
        type: log.log_type,
        timestamp: log.created_at
      }))
    });
  } catch (error) {
    console.error('Get upload logs error:', error);
    res.status(500).json({ error: 'Failed to fetch upload logs' });
  }
});

/**
 * GET /api/logs/audit
 * Get audit logs
 */
router.get('/audit', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      "SELECT * FROM logs WHERE log_type = 'audit' ORDER BY created_at DESC LIMIT 100"
    );

    res.json({
      success: true,
      logs: result.rows.map((log: any) => ({
        id: log.id,
        user: log.user_name,
        action: log.action,
        details: log.details,
        type: log.log_type,
        invoiceId: log.invoice_id,
        timestamp: log.created_at
      }))
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

/**
 * GET /api/logs/dispatch
 * Get dispatch logs
 */
router.get('/dispatch', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      "SELECT * FROM logs WHERE log_type = 'dispatch' ORDER BY created_at DESC LIMIT 100"
    );

    res.json({
      success: true,
      logs: result.rows.map((log: any) => ({
        id: log.id,
        user: log.user_name,
        action: log.action,
        details: log.details,
        type: log.log_type,
        invoiceId: log.invoice_id,
        timestamp: log.created_at
      }))
    });
  } catch (error) {
    console.error('Get dispatch logs error:', error);
    res.status(500).json({ error: 'Failed to fetch dispatch logs' });
  }
});

export default router;

