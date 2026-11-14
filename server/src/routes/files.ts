import { Router, Request, Response, NextFunction } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { pool } from '../config/db.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/errors.js';
import { requireAuth } from '../middleware/auth.js';

export const filesRouter = Router();

// All file endpoints require authentication
filesRouter.use(requireAuth);

const UPLOAD_ROOT = path.resolve(process.cwd(), env.UPLOAD_DIR || './uploads');

/**
 * Safely verify that a file path exists and resides within the upload root.
 */
function resolveSafeFilePath(storagePath: string): string {
  const resolved = path.resolve(process.cwd(), storagePath);
  const safeRoot = UPLOAD_ROOT.endsWith(path.sep) ? UPLOAD_ROOT : UPLOAD_ROOT + path.sep;
  if (!resolved.startsWith(safeRoot)) {
    throw ApiError.badRequest('Invalid file storage path');
  }
  if (!fs.existsSync(resolved)) {
    throw ApiError.notFound('File not found on storage');
  }
  return resolved;
}

// GET /api/files/vat-bills/:id
filesRouter.get(
  '/vat-bills/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id) || id <= 0) {
        throw ApiError.badRequest('Invalid VAT bill ID');
      }

      const result = await pool.query(
        `SELECT vb.id, vb.file_name, vb.original_name, vb.mime_type, vb.storage_path, p.is_deleted
         FROM vat_bills vb
         JOIN purchases p ON vb.purchase_id = p.id
         WHERE vb.id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        throw ApiError.notFound('VAT bill file not found');
      }

      const row = result.rows[0];
      if (row.is_deleted) {
        throw ApiError.notFound('Associated purchase is deleted');
      }

      const filePath = resolveSafeFilePath(row.storage_path);

      res.setHeader('Content-Type', row.mime_type);
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(row.original_name)}"`
      );
      res.setHeader('X-Content-Type-Options', 'nosniff');

      const stream = fs.createReadStream(filePath);
      stream.on('error', (err) => next(err));
      res.on('close', () => {
        stream.destroy();
      });
      stream.pipe(res);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/files/payment-slips/:id
filesRouter.get(
  '/payment-slips/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id) || id <= 0) {
        throw ApiError.badRequest('Invalid payment slip ID');
      }

      const result = await pool.query(
        `SELECT ps.id, ps.file_name, ps.original_name, ps.mime_type, ps.storage_path, p.is_deleted
         FROM payment_slips ps
         JOIN purchases p ON ps.purchase_id = p.id
         WHERE ps.id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        throw ApiError.notFound('Payment slip file not found');
      }

      const row = result.rows[0];
      if (row.is_deleted) {
        throw ApiError.notFound('Associated purchase is deleted');
      }

      const filePath = resolveSafeFilePath(row.storage_path);

      res.setHeader('Content-Type', row.mime_type);
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(row.original_name)}"`
      );
      res.setHeader('X-Content-Type-Options', 'nosniff');

      const stream = fs.createReadStream(filePath);
      stream.on('error', (err) => next(err));
      res.on('close', () => {
        stream.destroy();
      });
      stream.pipe(res);
    } catch (err) {
      next(err);
    }
  }
);
