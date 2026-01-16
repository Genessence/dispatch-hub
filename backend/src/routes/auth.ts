import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { query } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

const JWT_SECRET: string = process.env.JWT_SECRET || 'dispatch-hub-super-secret-jwt-key-2024-change-in-production';
const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '24h';

/**
 * POST /api/auth/login
 * Login with username and password
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { usernameOrEmail, password } = req.body;

    // Validate input
    if (!usernameOrEmail || !password) {
      return res.status(400).json({ 
        error: 'Username/email and password are required' 
      });
    }

    // Find user by username
    const result = await query(
      'SELECT id, username, password_hash, role FROM users WHERE username = $1',
      [usernameOrEmail]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ 
        error: 'Invalid username or password' 
      });
    }

    const user = result.rows[0];

    // Compare password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({ 
        error: 'Invalid username or password' 
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.username, 
        role: user.role 
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN } as SignOptions
    );

    // Return success response with token and user info
    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  } catch (error: any) {
    console.error('Login error:', error);
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
        error: 'Internal server error',
        message: error?.message || 'An unexpected error occurred'
      });
    }
  }
});

/**
 * GET /api/auth/verify
 * Verify if token is still valid
 */
router.get('/verify', authenticateToken, (req: AuthRequest, res: Response) => {
  res.json({ 
    success: true, 
    message: 'Token is valid',
    user: req.user
  });
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const result = await query(
      'SELECT id, username, role, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // Get user's saved selections
    const selectionsResult = await query(
      'SELECT selected_customers, selected_site FROM user_selections WHERE user_id = $1',
      [req.user.id]
    );

    const selections = selectionsResult.rows[0] || { selected_customers: [], selected_site: null };

    // Get user's scanner preferences
    const scannerPrefsResult = await query(
      `SELECT default_scan_mode, scanner_suffix, auto_timeout_ms, duplicate_scan_threshold_ms, show_realtime_display 
       FROM user_scanner_preferences WHERE user_id = $1`,
      [req.user.id]
    );

    const scannerPrefs = scannerPrefsResult.rows[0] || {
      default_scan_mode: 'scanner',
      scanner_suffix: 'Enter',
      auto_timeout_ms: 150,
      duplicate_scan_threshold_ms: 2000,
      show_realtime_display: true
    };

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        createdAt: user.created_at,
        selectedCustomers: selections.selected_customers || [],
        selectedSite: selections.selected_site,
        scannerPreferences: {
          defaultScanMode: scannerPrefs.default_scan_mode,
          scannerSuffix: scannerPrefs.scanner_suffix,
          autoTimeoutMs: scannerPrefs.auto_timeout_ms,
          duplicateScanThresholdMs: scannerPrefs.duplicate_scan_threshold_ms,
          showRealtimeDisplay: scannerPrefs.show_realtime_display
        }
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/auth/selections
 * Save user's customer/site selections
 */
router.put('/selections', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { selectedCustomers, selectedSite } = req.body;

    // Upsert user selections
    await query(
      `INSERT INTO user_selections (user_id, selected_customers, selected_site, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) 
       DO UPDATE SET selected_customers = $2, selected_site = $3, updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, selectedCustomers || [], selectedSite]
    );

    res.json({
      success: true,
      message: 'Selections saved'
    });
  } catch (error) {
    console.error('Save selections error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/auth/scanner-preferences
 * Get user's scanner preferences or defaults
 */
router.get('/scanner-preferences', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const result = await query(
        `SELECT default_scan_mode, scanner_suffix, auto_timeout_ms, duplicate_scan_threshold_ms, show_realtime_display 
         FROM user_scanner_preferences WHERE user_id = $1`,
        [req.user.id]
      );

      // Return user preferences or defaults
      if (result.rows.length > 0) {
        const prefs = result.rows[0];
        res.json({
          success: true,
          preferences: {
            defaultScanMode: prefs.default_scan_mode,
            scannerSuffix: prefs.scanner_suffix,
            autoTimeoutMs: prefs.auto_timeout_ms,
            duplicateScanThresholdMs: prefs.duplicate_scan_threshold_ms,
            showRealtimeDisplay: prefs.show_realtime_display
          }
        });
      } else {
        // Return defaults
        res.json({
          success: true,
          preferences: {
            defaultScanMode: 'scanner',
            scannerSuffix: 'Enter',
            autoTimeoutMs: 150,
            duplicateScanThresholdMs: 2000,
            showRealtimeDisplay: true
          }
        });
      }
    } catch (dbError: any) {
      // If table doesn't exist, return defaults
      if (dbError.message?.includes('does not exist') || dbError.code === '42P01') {
        console.warn('user_scanner_preferences table does not exist, returning defaults. Please run migrations.');
        res.json({
          success: true,
          preferences: {
            defaultScanMode: 'scanner',
            scannerSuffix: 'Enter',
            autoTimeoutMs: 150,
            duplicateScanThresholdMs: 2000,
            showRealtimeDisplay: true
          }
        });
      } else {
        throw dbError;
      }
    }
  } catch (error: any) {
    console.error('Get scanner preferences error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message || 'Failed to fetch scanner preferences'
    });
  }
});

/**
 * PUT /api/auth/scanner-preferences
 * Save user's scanner preferences
 */
router.put('/scanner-preferences', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { 
      defaultScanMode, 
      scannerSuffix, 
      autoTimeoutMs, 
      duplicateScanThresholdMs, 
      showRealtimeDisplay 
    } = req.body;

    // Validate input
    if (defaultScanMode && !['scanner', 'camera'].includes(defaultScanMode)) {
      return res.status(400).json({ error: 'Invalid defaultScanMode. Must be "scanner" or "camera"' });
    }

    if (scannerSuffix && !['Enter', 'Tab', 'None'].includes(scannerSuffix)) {
      return res.status(400).json({ error: 'Invalid scannerSuffix. Must be "Enter", "Tab", or "None"' });
    }

    if (autoTimeoutMs !== undefined && (typeof autoTimeoutMs !== 'number' || autoTimeoutMs < 50 || autoTimeoutMs > 5000)) {
      return res.status(400).json({ error: 'Invalid autoTimeoutMs. Must be between 50 and 5000' });
    }

    if (duplicateScanThresholdMs !== undefined && (typeof duplicateScanThresholdMs !== 'number' || duplicateScanThresholdMs < 500 || duplicateScanThresholdMs > 10000)) {
      return res.status(400).json({ error: 'Invalid duplicateScanThresholdMs. Must be between 500 and 10000' });
    }

    try {
      // Get existing preferences or use defaults
      const existingResult = await query(
        'SELECT * FROM user_scanner_preferences WHERE user_id = $1',
        [req.user.id]
      );

      const defaults = {
        default_scan_mode: 'scanner',
        scanner_suffix: 'Enter',
        auto_timeout_ms: 150,
        duplicate_scan_threshold_ms: 2000,
        show_realtime_display: true
      };

      const existing = existingResult.rows[0] || defaults;

      // Merge with existing or defaults
      const updatedPrefs = {
        default_scan_mode: defaultScanMode || existing.default_scan_mode || defaults.default_scan_mode,
        scanner_suffix: scannerSuffix || existing.scanner_suffix || defaults.scanner_suffix,
        auto_timeout_ms: autoTimeoutMs !== undefined ? autoTimeoutMs : (existing.auto_timeout_ms || defaults.auto_timeout_ms),
        duplicate_scan_threshold_ms: duplicateScanThresholdMs !== undefined ? duplicateScanThresholdMs : (existing.duplicate_scan_threshold_ms || defaults.duplicate_scan_threshold_ms),
        show_realtime_display: showRealtimeDisplay !== undefined ? showRealtimeDisplay : (existing.show_realtime_display !== undefined ? existing.show_realtime_display : defaults.show_realtime_display)
      };

      // Upsert user scanner preferences
      await query(
        `INSERT INTO user_scanner_preferences (
          user_id, 
          default_scan_mode, 
          scanner_suffix, 
          auto_timeout_ms, 
          duplicate_scan_threshold_ms, 
          show_realtime_display, 
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id) 
        DO UPDATE SET 
          default_scan_mode = $2, 
          scanner_suffix = $3, 
          auto_timeout_ms = $4, 
          duplicate_scan_threshold_ms = $5, 
          show_realtime_display = $6, 
          updated_at = CURRENT_TIMESTAMP`,
        [
          req.user.id,
          updatedPrefs.default_scan_mode,
          updatedPrefs.scanner_suffix,
          updatedPrefs.auto_timeout_ms,
          updatedPrefs.duplicate_scan_threshold_ms,
          updatedPrefs.show_realtime_display
        ]
      );

      res.json({
        success: true,
        message: 'Scanner preferences saved',
        preferences: {
          defaultScanMode: updatedPrefs.default_scan_mode,
          scannerSuffix: updatedPrefs.scanner_suffix,
          autoTimeoutMs: updatedPrefs.auto_timeout_ms,
          duplicateScanThresholdMs: updatedPrefs.duplicate_scan_threshold_ms,
          showRealtimeDisplay: updatedPrefs.show_realtime_display
        }
      });
    } catch (dbError: any) {
      // If table doesn't exist, return error with helpful message
      if (dbError.message?.includes('does not exist') || dbError.code === '42P01') {
        console.error('user_scanner_preferences table does not exist. Please run migrations.');
        return res.status(500).json({ 
          error: 'Database table not found',
          message: 'The scanner preferences table does not exist. Please run database migrations: npm run db:migrate'
        });
      } else {
        throw dbError;
      }
    }
  } catch (error: any) {
    console.error('Save scanner preferences error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message || 'Failed to save scanner preferences'
    });
  }
});

export default router;

