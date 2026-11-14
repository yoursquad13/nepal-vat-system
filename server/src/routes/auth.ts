import { Router, Request, Response, NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { pool } from '../config/db.js';
import { verifyPassword } from '../utils/password.js';
import { ApiError } from '../utils/errors.js';
import {
  requireAuth,
  generateToken,
  AUTH_COOKIE_NAME,
  getAuthCookieOptions,
} from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Too many login attempts, please try again later' },
});

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

// POST /api/auth/login
authRouter.post(
  '/login',
  loginLimiter,
  validateBody(loginSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { username, password } = req.body;

      const userRes = await pool.query(
        'SELECT id, full_name, username, email, password_hash, role, phone, is_active FROM users WHERE LOWER(username) = LOWER($1)',
        [username]
      );

      if (userRes.rows.length === 0) {
        throw ApiError.unauthorized('Invalid username or password');
      }

      const user = userRes.rows[0];
      const valid = await verifyPassword(password, user.password_hash);
      if (!valid) {
        throw ApiError.unauthorized('Invalid username or password');
      }

      if (!user.is_active) {
        throw ApiError.forbidden('User account is deactivated');
      }

      const tokenPayload = {
        id: Number(user.id),
        username: user.username,
        fullName: user.full_name,
        role: user.role as 'ADMIN' | 'STAFF',
      };

      const token = generateToken(tokenPayload);
      res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());

      res.status(200).json({
        success: true,
        user: {
          id: Number(user.id),
          username: user.username,
          fullName: user.full_name,
          email: user.email,
          role: user.role,
          phone: user.phone,
          isActive: user.is_active,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/auth/logout
authRouter.post('/logout', (_req: Request, res: Response): void => {
  const { maxAge: _maxAge, ...clearOpts } = getAuthCookieOptions();
  res.clearCookie(AUTH_COOKIE_NAME, clearOpts);
  res.status(200).json({ success: true, message: 'Logged out successfully' });
});

// GET /api/auth/me
authRouter.get(
  '/me',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userRes = await pool.query(
        'SELECT id, full_name, username, email, role, phone, is_active FROM users WHERE id = $1',
        [req.user!.id]
      );

      if (userRes.rows.length === 0) {
        throw ApiError.unauthorized('User not found');
      }

      const user = userRes.rows[0];
      res.status(200).json({
        user: {
          id: Number(user.id),
          username: user.username,
          fullName: user.full_name,
          email: user.email,
          role: user.role,
          phone: user.phone,
          isActive: user.is_active,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);
