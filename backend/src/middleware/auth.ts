import { Request, Response, NextFunction, Application } from 'express';
import { Express } from 'express-serve-static-core';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dispatch-hub-super-secret-jwt-key-2024-change-in-production';

export interface UserPayload {
  id: string;
  username: string;
  role: 'admin' | 'user';
}

export interface AuthRequest extends Request {
  user?: UserPayload;
  query: Request['query'];
  params: Request['params'];
  file?: Express.Multer.File;
  app: Application & { get: (key: string) => any };
}

/**
 * Middleware to verify JWT token and attach user to request
 */
export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
        return;
      }
      res.status(403).json({ error: 'Invalid token' });
      return;
    }
    
    req.user = decoded as UserPayload;
    next();
  });
};

/**
 * Optional authentication - attaches user if token exists but doesn't require it
 */
export const optionalAuth = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (!err) {
        req.user = decoded as UserPayload;
      }
    });
  }
  
  next();
};

