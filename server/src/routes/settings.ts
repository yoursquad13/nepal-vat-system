import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { pool } from '../config/db.js';
import { logActivity } from '../utils/audit.js';
import { ApiError } from '../utils/errors.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

export const settingsRouter = Router();

const updateSettingsSchema = z.object({
  company_name: z.string().min(1).optional(),
  company_pan: z.string().optional().nullable(),
  company_vat: z.string().optional().nullable(),
  company_address: z.string().optional().nullable(),
  default_vat_mode: z.enum(['EXCLUSIVE', 'INCLUSIVE']).optional(),
  allow_staff_vat_mode_override: z.boolean().optional(),
  allow_negative_stock_admin_only: z.boolean().optional(),
});

// GET /api/settings - Authenticated users (Staff and Admin) can view settings
settingsRouter.get(
  '/',
  requireAuth,
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await pool.query('SELECT * FROM app_settings WHERE id = 1');
      if (result.rows.length === 0) {
        throw ApiError.notFound('App settings not found');
      }

      res.status(200).json({ settings: result.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/settings - Admin only
settingsRouter.patch(
  '/',
  requireAuth,
  requireAdmin,
  validateBody(updateSettingsSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const existRes = await pool.query('SELECT * FROM app_settings WHERE id = 1');
      if (existRes.rows.length === 0) {
        throw ApiError.notFound('App settings not found');
      }
      const oldSettings = existRes.rows[0];

      const {
        company_name,
        company_pan,
        company_vat,
        company_address,
        default_vat_mode,
        allow_staff_vat_mode_override,
        allow_negative_stock_admin_only,
      } = req.body;

      const setClauses: string[] = [];
      const values: any[] = [];
      let valIdx = 1;

      if (company_name !== undefined) {
        setClauses.push(`company_name = $${valIdx++}`);
        values.push(company_name);
      }
      if (company_pan !== undefined) {
        setClauses.push(`company_pan = $${valIdx++}`);
        values.push(company_pan);
      }
      if (company_vat !== undefined) {
        setClauses.push(`company_vat = $${valIdx++}`);
        values.push(company_vat);
      }
      if (company_address !== undefined) {
        setClauses.push(`company_address = $${valIdx++}`);
        values.push(company_address);
      }
      if (default_vat_mode !== undefined) {
        setClauses.push(`default_vat_mode = $${valIdx++}`);
        values.push(default_vat_mode);
      }
      if (allow_staff_vat_mode_override !== undefined) {
        setClauses.push(`allow_staff_vat_mode_override = $${valIdx++}`);
        values.push(allow_staff_vat_mode_override);
      }
      if (allow_negative_stock_admin_only !== undefined) {
        setClauses.push(`allow_negative_stock_admin_only = $${valIdx++}`);
        values.push(allow_negative_stock_admin_only);
      }

      setClauses.push(`updated_by = $${valIdx++}`);
      values.push(req.user!.id);

      setClauses.push(`updated_at = NOW()`);

      const updateSql = `
        UPDATE app_settings
        SET ${setClauses.join(', ')}
        WHERE id = 1
        RETURNING *
      `;

      const updateRes = await pool.query(updateSql, values);
      const updatedSettings = updateRes.rows[0];

      await logActivity(pool, {
        entityType: 'SETTINGS',
        entityId: 1,
        action: 'UPDATE',
        summary: `App settings updated${default_vat_mode ? ` (default VAT mode: ${default_vat_mode})` : ''}`,
        oldValues: oldSettings,
        newValues: updatedSettings,
        performedBy: req.user!.id,
        performedByName: req.user!.fullName,
      });

      res.status(200).json({ settings: updatedSettings });
    } catch (err) {
      next(err);
    }
  }
);
