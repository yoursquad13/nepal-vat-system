import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { pool } from '../config/db.js';
import { ApiError } from '../utils/errors.js';

export const AUTH_COOKIE_NAME = 'token';

export interface RequestUser {
  id: number;
  username: string;
  fullName: string;
  role: 'ADMIN' | 'STAFF';
}

declare global {
  namespace Express {
    interface Request {
      user?: RequestUser;
    }
  }
}

export function getAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  };
}

export function generateToken(payload: RequestUser): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '7d' });
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const cookieToken = req.cookies?.[AUTH_COOKIE_NAME];
    const headerToken = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    const token = cookieToken || headerToken;

    if (!token) {
      throw ApiError.unauthorized('Authentication required');
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch {
      throw ApiError.unauthorized('Invalid or expired authentication token');
    }

    if (!decoded || !decoded.id) {
      throw ApiError.unauthorized('Invalid authentication token payload');
    }

    const res = await pool.query(
      'SELECT id, username, full_name, email, role, is_active FROM users WHERE id = $1',
      [decoded.id]
    );

    if (res.rows.length === 0) {
      throw ApiError.unauthorized('User not found');
    }

    const user = res.rows[0];
    if (!user.is_active) {
      throw ApiError.forbidden('User account is deactivated');
    }

    req.user = {
      id: Number(user.id),
      username: user.username,
      fullName: user.full_name,
      role: user.role as 'ADMIN' | 'STAFF',
    };

    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    return next(ApiError.unauthorized('Authentication required'));
  }
  if (req.user.role !== 'ADMIN') {
    return next(ApiError.forbidden('Admin access required'));
  }
  next();
}
