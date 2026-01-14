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
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      error: 'Internal server error' 
    });
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

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        createdAt: user.created_at,
        selectedCustomers: selections.selected_customers || [],
        selectedSite: selections.selected_site
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

export default router;

