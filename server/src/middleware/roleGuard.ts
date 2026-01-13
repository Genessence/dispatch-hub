import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

/**
 * Middleware to check if user has required role
 * @param allowedRoles - Array of roles that are allowed to access the route
 */
export const requireRole = (...allowedRoles: Array<'admin' | 'user'>) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ 
        error: 'Access denied',
        message: `This action requires one of the following roles: ${allowedRoles.join(', ')}`
      });
      return;
    }

    next();
  };
};

/**
 * Middleware to check if user is admin
 */
export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (req.user.role !== 'admin') {
    res.status(403).json({ 
      error: 'Access denied',
      message: 'This action requires admin privileges'
    });
    return;
  }

  next();
};

/**
 * Routes that user role CANNOT access (admin only)
 */
export const ADMIN_ONLY_ROUTES = [
  '/api/admin/analytics',
  '/api/admin/exceptions',
  '/api/admin/master-data'
];

/**
 * Check if a route is admin-only
 */
export const isAdminOnlyRoute = (path: string): boolean => {
  return ADMIN_ONLY_ROUTES.some(route => path.startsWith(route));
};

