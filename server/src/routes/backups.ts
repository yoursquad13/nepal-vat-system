import { Router, Request, Response, NextFunction } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pool } from '../config/db.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/errors.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { logActivity } from '../utils/audit.js';

const execFileAsync = promisify(execFile);

export const backupsRouter = Router();

// Backups strictly require authentication and Admin role
backupsRouter.use(requireAuth);
backupsRouter.use(requireAdmin);

const BACKUP_ROOT = path.resolve(env.UPLOAD_DIR, 'backups');
if (!fs.existsSync(BACKUP_ROOT)) {
  fs.mkdirSync(BACKUP_ROOT, { recursive: true });
}

// 1. List Backups
backupsRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    if (!fs.existsSync(BACKUP_ROOT)) {
      return res.json({ backups: [] });
    }

    const entries = await fs.promises.readdir(BACKUP_ROOT);
    const backups = await Promise.all(
      entries
        .filter((file) => file.endsWith('.sql') || file.endsWith('.json'))
        .map(async (filename) => {
          const filePath = path.resolve(BACKUP_ROOT, filename);
          const stats = await fs.promises.stat(filePath);
          const format = filename.endsWith('.sql') ? 'sql' : 'json';
          return {
            filename,
            format,
            size: stats.size,
            createdAt: stats.mtime.toISOString(),
          };
        })
    );

    // Sort newest first
    backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({ backups });
  } catch (err) {
    next(err);
  }
});

// 2. Create Backup (SQL via pg_dump or JSON snapshot)
backupsRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawFormat = String(req.body?.format || 'json').toLowerCase();
    if (rawFormat !== 'sql' && rawFormat !== 'json') {
      throw ApiError.badRequest('Invalid backup format. Supported formats: sql, json.');
    }
    const format = rawFormat as 'sql' | 'json';

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${timestamp}.${format}`;
    const targetPath = path.resolve(BACKUP_ROOT, filename);

    if (format === 'sql') {
      const dbUrl = process.env.DATABASE_URL || env.DATABASE_URL;
      const pgEnv: NodeJS.ProcessEnv = {
        ...process.env,
        PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`,
      };

      if (dbUrl) {
        try {
          const parsed = new URL(dbUrl);
          if (parsed.hostname) pgEnv.PGHOST = parsed.hostname;
          if (parsed.port) pgEnv.PGPORT = parsed.port;
          if (parsed.username) pgEnv.PGUSER = decodeURIComponent(parsed.username);
          if (parsed.password) pgEnv.PGPASSWORD = decodeURIComponent(parsed.password);
          const dbName = parsed.pathname.replace(/^\//, '');
          if (dbName) pgEnv.PGDATABASE = decodeURIComponent(dbName);
        } catch {
          // If not a parseable URL, fallback to existing PG environment variables
        }
      }

      try {
        // Safe execution without CLI credentials: connection passed via env, only file path and safety flags on CLI
        await execFileAsync('pg_dump', ['--no-owner', '--no-privileges', '-f', targetPath], {
          env: pgEnv,
          timeout: 60000,
        });
      } catch (dumpErr: any) {
        console.error('pg_dump backup failed:', dumpErr?.code || 'unknown');
        if (dumpErr?.code === 'ENOENT') {
          throw ApiError.internal(
            'pg_dump utility is not available on system PATH. Please ensure PostgreSQL client tools are installed or use JSON format.'
          );
        }
        throw ApiError.internal(
          'Database backup creation failed. Please check server logs or use JSON format.'
        );
      }
    } else {
      // JSON snapshot of all core relational tables
      const [
        usersRes,
        settingsRes,
        vendorsRes,
        productsRes,
        purchasesRes,
        itemsRes,
        vatBillsRes,
        paymentsRes,
        slipsRes,
        movementsRes,
        logsRes,
      ] = await Promise.all([
        pool.query(
          'SELECT id, full_name, username, email, role, phone, is_active, created_at, updated_at FROM users ORDER BY id ASC'
        ),
        pool.query('SELECT * FROM app_settings ORDER BY id ASC'),
        pool.query('SELECT * FROM vendors ORDER BY id ASC'),
        pool.query('SELECT * FROM products ORDER BY id ASC'),
        pool.query('SELECT * FROM purchases ORDER BY id ASC'),
        pool.query('SELECT * FROM purchase_items ORDER BY id ASC'),
        pool.query('SELECT * FROM vat_bills ORDER BY id ASC'),
        pool.query('SELECT * FROM payments ORDER BY id ASC'),
        pool.query('SELECT * FROM payment_slips ORDER BY id ASC'),
        pool.query('SELECT * FROM inventory_movements ORDER BY id ASC'),
        pool.query('SELECT * FROM activity_logs ORDER BY id ASC'),
      ]);

      const snapshot = {
        metadata: {
          exported_at: new Date().toISOString(),
          company_name: settingsRes.rows[0]?.company_name || 'Himalayan Trading Suppliers Pvt. Ltd.',
          version: '1.0.0',
        },
        users: usersRes.rows,
        app_settings: settingsRes.rows,
        vendors: vendorsRes.rows,
        products: productsRes.rows,
        purchases: purchasesRes.rows,
        purchase_items: itemsRes.rows,
        vat_bills: vatBillsRes.rows,
        payments: paymentsRes.rows,
        payment_slips: slipsRes.rows,
        inventory_movements: movementsRes.rows,
        activity_logs: logsRes.rows,
      };

      await fs.promises.writeFile(targetPath, JSON.stringify(snapshot, null, 2), 'utf-8');
    }

    const stats = await fs.promises.stat(targetPath);

    // Audit log
    await logActivity({
      entityType: 'BACKUP',
      entityId: null,
      action: 'CREATE_BACKUP',
      summary: `Created ${format.toUpperCase()} database backup: ${filename} (${stats.size} bytes)`,
      newValues: { filename, format, size: stats.size },
      performedBy: req.user?.id,
      performedByName: req.user?.fullName || req.user?.username,
    });

    res.status(201).json({
      message: 'Backup created successfully',
      backup: {
        filename,
        format,
        size: stats.size,
        createdAt: stats.mtime.toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// 3. Download Backup
backupsRouter.get('/:filename/download', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawFilename = req.params.filename;

    // Strict path traversal guards
    const basename = path.basename(rawFilename);
    if (!/^[a-zA-Z0-9._-]+$/.test(basename) || basename !== rawFilename) {
      throw ApiError.badRequest('Invalid backup filename');
    }

    const resolved = path.resolve(BACKUP_ROOT, basename);
    if (!resolved.startsWith(BACKUP_ROOT + path.sep)) {
      throw ApiError.badRequest('Invalid backup path');
    }

    if (!fs.existsSync(resolved)) {
      throw ApiError.notFound(`Backup file not found: ${basename}`);
    }

    const stats = await fs.promises.stat(resolved);
    if (!stats.isFile()) {
      throw ApiError.badRequest('Invalid backup file');
    }

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename="${basename}"`);
    res.setHeader('Content-Type', basename.endsWith('.sql') ? 'application/sql' : 'application/json');

    const stream = fs.createReadStream(resolved);
    res.on('close', () => {
      stream.destroy();
    });
    stream.on('error', (err) => next(err));
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
});
