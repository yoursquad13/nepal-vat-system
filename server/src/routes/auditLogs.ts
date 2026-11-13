import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { pool } from '../config/db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validateQuery } from '../middleware/validate.js';

export const auditLogsRouter = Router();

// Audit logs are strictly Admin only
auditLogsRouter.use(requireAuth, requireAdmin);

const auditQuerySchema = z.object({
  entity_type: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  offset: z.coerce.number().min(0).default(0),
});

// GET /api/audit-logs
auditLogsRouter.get(
  '/',
  validateQuery(auditQuerySchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { entity_type, limit, offset } = req.query as any;

      let sql = 'SELECT * FROM activity_logs';
      const values: any[] = [];

      if (entity_type) {
        sql += ' WHERE entity_type = $1';
        values.push(entity_type);
      }

      sql += ` ORDER BY performed_at DESC, id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
      values.push(limit, offset);

      const result = await pool.query(sql, values);

      res.status(200).json({ logs: result.rows });
    } catch (err) {
      next(err);
    }
  }
);
