import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { pool } from '../config/db.js';
import { hashPassword } from '../utils/password.js';
import { logActivity } from '../utils/audit.js';
import { ApiError } from '../utils/errors.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

export const usersRouter = Router();

// All user management routes require Admin privileges
usersRouter.use(requireAuth, requireAdmin);

const createUserSchema = z.object({
  full_name: z.string().min(1, 'Full name is required'),
  username: z.string().min(3, 'Username must be at least 3 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['ADMIN', 'STAFF']),
  phone: z.string().optional().nullable(),
});

const updateUserSchema = z.object({
  full_name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(['ADMIN', 'STAFF']).optional(),
  phone: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
});

// GET /api/users
usersRouter.get(
  '/',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await pool.query(
        `SELECT id, full_name, username, email, role, phone, is_active, created_at, updated_at
         FROM users
         ORDER BY id ASC`
      );

      const users = result.rows.map((row) => ({
        ...row,
        id: Number(row.id),
      }));

      res.status(200).json({ users });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/users
usersRouter.post(
  '/',
  validateBody(createUserSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { full_name, username, email, password, role, phone } = req.body;

      // Duplicate check
      const dupCheck = await pool.query(
        'SELECT id FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2)',
        [username, email]
      );
      if (dupCheck.rows.length > 0) {
        throw ApiError.conflict('Username or email already exists');
      }

      const passwordHash = await hashPassword(password);

      const insertRes = await pool.query(
        `INSERT INTO users (full_name, username, email, password_hash, role, phone, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE)
         RETURNING id, full_name, username, email, role, phone, is_active, created_at, updated_at`,
        [full_name, username, email, passwordHash, role, phone || null]
      );

      const newUser = insertRes.rows[0];

      await logActivity(pool, {
        entityType: 'USER',
        entityId: newUser.id,
        action: 'CREATE',
        summary: `User ${newUser.username} (${newUser.role}) created`,
        newValues: {
          id: Number(newUser.id),
          username: newUser.username,
          email: newUser.email,
          role: newUser.role,
        },
        performedBy: req.user!.id,
        performedByName: req.user!.fullName,
      });

      res.status(201).json({
        user: {
          ...newUser,
          id: Number(newUser.id),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/users/:id
usersRouter.patch(
  '/:id',
  validateBody(updateUserSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = Number(req.params.id);
      if (isNaN(userId)) {
        throw ApiError.badRequest('Invalid user ID');
      }

      const existRes = await pool.query(
        `SELECT id, full_name, username, email, role, phone, is_active, created_at, updated_at
         FROM users WHERE id = $1`,
        [userId]
      );
      if (existRes.rows.length === 0) {
        throw ApiError.notFound('User not found');
      }
      const oldUser = existRes.rows[0];

      const { full_name, email, password, role, phone, is_active } = req.body;

      if (email && email.toLowerCase() !== oldUser.email.toLowerCase()) {
        const dupEmail = await pool.query(
          'SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id != $2',
          [email, userId]
        );
        if (dupEmail.rows.length > 0) {
          throw ApiError.conflict('Email already in use by another user');
        }
      }

      const setClauses: string[] = [];
      const values: any[] = [];
      let valIdx = 1;

      if (full_name !== undefined) {
        setClauses.push(`full_name = $${valIdx++}`);
        values.push(full_name);
      }
      if (email !== undefined) {
        setClauses.push(`email = $${valIdx++}`);
        values.push(email);
      }
      if (password !== undefined) {
        const hashed = await hashPassword(password);
        setClauses.push(`password_hash = $${valIdx++}`);
        values.push(hashed);
      }
      if (role !== undefined) {
        setClauses.push(`role = $${valIdx++}`);
        values.push(role);
      }
      if (phone !== undefined) {
        setClauses.push(`phone = $${valIdx++}`);
        values.push(phone);
      }
      if (is_active !== undefined) {
        setClauses.push(`is_active = $${valIdx++}`);
        values.push(is_active);
      }

      if (setClauses.length === 0) {
        res.status(200).json({
          user: {
            ...oldUser,
            id: Number(oldUser.id),
          },
        });
        return;
      }

      setClauses.push(`updated_at = NOW()`);
      values.push(userId);

      const updateSql = `
        UPDATE users
        SET ${setClauses.join(', ')}
        WHERE id = $${valIdx}
        RETURNING id, full_name, username, email, role, phone, is_active, created_at, updated_at
      `;

      const updateRes = await pool.query(updateSql, values);
      const updatedUser = updateRes.rows[0];

      const action = is_active === false ? 'DEACTIVATE' : 'UPDATE';
      await logActivity(pool, {
        entityType: 'USER',
        entityId: updatedUser.id,
        action,
        summary: `User ${updatedUser.username} ${action.toLowerCase()}d`,
        oldValues: {
          full_name: oldUser.full_name,
          email: oldUser.email,
          role: oldUser.role,
          is_active: oldUser.is_active,
        },
        newValues: {
          full_name: updatedUser.full_name,
          email: updatedUser.email,
          role: updatedUser.role,
          is_active: updatedUser.is_active,
        },
        performedBy: req.user!.id,
        performedByName: req.user!.fullName,
      });

      res.status(200).json({
        user: {
          ...updatedUser,
          id: Number(updatedUser.id),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);
