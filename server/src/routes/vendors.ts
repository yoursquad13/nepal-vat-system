import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { pool } from '../config/db.js';
import { logActivity } from '../utils/audit.js';
import { ApiError } from '../utils/errors.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

export const vendorsRouter = Router();

// All vendor endpoints require authentication
vendorsRouter.use(requireAuth);

const createVendorSchema = z.object({
  company_name: z.string().trim().min(1, 'Company name is required'),
  pan_number: z.string().trim().optional().nullable(),
  vat_number: z.string().trim().optional().nullable(),
  contact_person: z.string().trim().optional().nullable(),
  contact_number: z.string().trim().optional().nullable(),
  alt_contact_number: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
  bank_name: z.string().trim().optional().nullable(),
  bank_branch: z.string().trim().optional().nullable(),
  bank_account_holder: z.string().trim().optional().nullable(),
  bank_account_number: z.string().trim().optional().nullable(),
  account_type: z.string().trim().optional().nullable(),
  email: z.string().trim().email('Invalid email address').optional().nullable().or(z.literal('')),
  notes: z.string().trim().optional().nullable(),
  is_active: z.boolean().optional().default(true),
});

const updateVendorSchema = z.object({
  company_name: z.string().trim().min(1, 'Company name cannot be empty').optional(),
  pan_number: z.string().trim().optional().nullable(),
  vat_number: z.string().trim().optional().nullable(),
  contact_person: z.string().trim().optional().nullable(),
  contact_number: z.string().trim().optional().nullable(),
  alt_contact_number: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
  bank_name: z.string().trim().optional().nullable(),
  bank_branch: z.string().trim().optional().nullable(),
  bank_account_holder: z.string().trim().optional().nullable(),
  bank_account_number: z.string().trim().optional().nullable(),
  account_type: z.string().trim().optional().nullable(),
  email: z.string().trim().email('Invalid email address').optional().nullable().or(z.literal('')),
  notes: z.string().trim().optional().nullable(),
  is_active: z.boolean().optional(),
});

function formatVendor(row: any) {
  return {
    ...row,
    id: Number(row.id),
    created_by: row.created_by ? Number(row.created_by) : null,
    total_purchases_count: row.total_purchases_count !== undefined ? Number(row.total_purchases_count) : undefined,
    total_amount: row.total_amount !== undefined ? Number(row.total_amount) : undefined,
    total_paid_amount: row.total_paid_amount !== undefined ? Number(row.total_paid_amount) : undefined,
    total_unpaid_amount: row.total_unpaid_amount !== undefined ? Number(row.total_unpaid_amount) : undefined,
  };
}

// GET /api/vendors - List & search vendors
vendorsRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const isActiveParam = req.query.is_active;

      const conditions: string[] = [];
      const values: any[] = [];
      let valIdx = 1;

      if (q) {
        const escapedQ = q.replace(/[%_\\]/g, '\\$&');
        conditions.push(`(
          v.company_name ILIKE $${valIdx} ESCAPE '\\' OR
          v.pan_number ILIKE $${valIdx} ESCAPE '\\' OR
          v.vat_number ILIKE $${valIdx} ESCAPE '\\' OR
          v.contact_number ILIKE $${valIdx} ESCAPE '\\' OR
          v.alt_contact_number ILIKE $${valIdx} ESCAPE '\\' OR
          v.contact_person ILIKE $${valIdx} ESCAPE '\\'
        )`);
        values.push(`%${escapedQ}%`);
        valIdx++;
      }

      if (isActiveParam !== undefined) {
        conditions.push(`v.is_active = $${valIdx}`);
        values.push(isActiveParam === 'true');
        valIdx++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const querySql = `
        SELECT
          v.id,
          v.company_name,
          v.pan_number,
          v.vat_number,
          v.contact_person,
          v.contact_number,
          v.alt_contact_number,
          v.address,
          v.bank_name,
          v.bank_branch,
          v.bank_account_holder,
          v.bank_account_number,
          v.account_type,
          v.email,
          v.notes,
          v.is_active,
          v.created_by,
          v.created_at,
          v.updated_at,
          COALESCE((
            SELECT COUNT(*)
            FROM purchases p
            WHERE p.vendor_id = v.id AND p.is_deleted = FALSE
          ), 0)::int AS total_purchases_count,
          COALESCE((
            SELECT SUM(p.total_amount)
            FROM purchases p
            WHERE p.vendor_id = v.id AND p.is_deleted = FALSE
          ), 0)::numeric AS total_amount,
          COALESCE((
            SELECT SUM(pay.amount)
            FROM payments pay
            WHERE pay.vendor_id = v.id AND pay.is_voided = FALSE
          ), 0)::numeric AS total_paid_amount
        FROM vendors v
        ${whereClause}
        ORDER BY v.company_name ASC
      `;

      const result = await pool.query(querySql, values);
      const vendors = result.rows.map((row) => {
        const totalAmount = Number(row.total_amount);
        const totalPaid = Number(row.total_paid_amount);
        return formatVendor({
          ...row,
          total_unpaid_amount: Math.max(0, totalAmount - totalPaid),
        });
      });

      res.status(200).json({ vendors });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/vendors - Create vendor
vendorsRouter.post(
  '/',
  validateBody(createVendorSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {
        company_name,
        pan_number,
        vat_number,
        contact_person,
        contact_number,
        alt_contact_number,
        address,
        bank_name,
        bank_branch,
        bank_account_holder,
        bank_account_number,
        account_type,
        email,
        notes,
        is_active,
      } = req.body;

      const createdBy = req.user?.id || null;

      const insertSql = `
        INSERT INTO vendors (
          company_name, pan_number, vat_number, contact_person, contact_number,
          alt_contact_number, address, bank_name, bank_branch, bank_account_holder,
          bank_account_number, account_type, email, notes, is_active, created_by
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16
        )
        RETURNING *
      `;

      const values = [
        company_name,
        pan_number || null,
        vat_number || null,
        contact_person || null,
        contact_number || null,
        alt_contact_number || null,
        address || null,
        bank_name || null,
        bank_branch || null,
        bank_account_holder || null,
        bank_account_number || null,
        account_type || null,
        email || null,
        notes || null,
        is_active !== undefined ? is_active : true,
        createdBy,
      ];

      const result = await pool.query(insertSql, values);
      const newVendor = result.rows[0];

      await logActivity(pool, {
        entityType: 'VENDOR',
        entityId: Number(newVendor.id),
        action: 'CREATE',
        summary: `Vendor ${newVendor.company_name} created`,
        newValues: {
          id: Number(newVendor.id),
          company_name: newVendor.company_name,
          pan_number: newVendor.pan_number,
          vat_number: newVendor.vat_number,
          contact_number: newVendor.contact_number,
        },
        performedBy: req.user?.id,
        performedByName: req.user?.fullName,
      });

      res.status(201).json({
        vendor: formatVendor(newVendor),
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/vendors/:id - Full profile with summary KPIs, purchases, and payments
vendorsRouter.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const vendorId = Number(req.params.id);
      if (isNaN(vendorId)) {
        throw ApiError.badRequest('Invalid vendor ID');
      }

      // 1. Fetch vendor profile
      const vendorRes = await pool.query('SELECT * FROM vendors WHERE id = $1', [vendorId]);
      if (vendorRes.rows.length === 0) {
        throw ApiError.notFound('Vendor not found');
      }
      const vendorRow = vendorRes.rows[0];

      // 2. Fetch purchase KPI aggregates (excluding soft-deleted)
      const kpisRes = await pool.query(
        `SELECT
          COUNT(*)::int AS total_purchases_count,
          COALESCE(SUM(purchase_amount), 0)::numeric AS total_purchase_amount,
          COALESCE(SUM(vat_amount), 0)::numeric AS total_vat_amount,
          COALESCE(SUM(total_amount), 0)::numeric AS total_amount,
          COUNT(*) FILTER (WHERE vat_bill_status = 'VAT BILL PENDING' AND tax_type = 'VAT_13')::int AS pending_vat_bills_count
        FROM purchases
        WHERE vendor_id = $1 AND is_deleted = FALSE`,
        [vendorId]
      );
      const kpis = kpisRes.rows[0];

      // 3. Fetch payment KPI aggregate (excluding voided)
      const payKpisRes = await pool.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric AS total_paid_amount
        FROM payments
        WHERE vendor_id = $1 AND is_voided = FALSE`,
        [vendorId]
      );
      const payKpis = payKpisRes.rows[0];

      const totalAmount = Number(kpis.total_amount);
      const totalPaid = Number(payKpis.total_paid_amount);
      const summary = {
        total_purchases_count: Number(kpis.total_purchases_count),
        total_purchase_amount: Number(kpis.total_purchase_amount),
        total_vat_amount: Number(kpis.total_vat_amount),
        total_amount: totalAmount,
        total_paid_amount: totalPaid,
        total_unpaid_amount: Math.max(0, totalAmount - totalPaid),
        pending_vat_bills_count: Number(kpis.pending_vat_bills_count),
      };

      // 4. Fetch purchases history
      const purchasesRes = await pool.query(
        `SELECT
          p.id,
          p.purchase_code,
          p.bill_number,
          p.product_summary,
          p.description,
          p.entry_date_ad,
          p.entry_time_npt,
          p.entry_date_bs,
          p.purchase_date_ad,
          p.purchase_date_bs,
          p.fiscal_year,
          p.vat_bill_date_ad,
          p.vat_bill_date_bs,
          p.tax_type,
          p.vat_calc_mode,
          p.entered_amount,
          p.purchase_amount,
          p.vat_amount,
          p.total_amount,
          p.paid_amount,
          p.review_status,
          p.vat_bill_status,
          p.payment_status,
          p.created_at
        FROM purchases p
        WHERE p.vendor_id = $1 AND p.is_deleted = FALSE
        ORDER BY p.purchase_date_ad DESC, p.id DESC`,
        [vendorId]
      );

      const purchases = purchasesRes.rows.map((p) => ({
        ...p,
        id: Number(p.id),
        entered_amount: Number(p.entered_amount),
        purchase_amount: Number(p.purchase_amount),
        vat_amount: Number(p.vat_amount),
        total_amount: Number(p.total_amount),
        paid_amount: Number(p.paid_amount),
      }));

      // 5. Fetch payments history
      const paymentsRes = await pool.query(
        `SELECT
          pay.id,
          pay.purchase_id,
          pay.vendor_id,
          pay.amount,
          pay.payment_date_ad,
          pay.payment_date_bs,
          pay.paid_at,
          pay.transaction_ref,
          pay.company_bank_account,
          pay.payment_method,
          pay.remarks,
          pay.recorded_by,
          pay.is_voided,
          pay.voided_at,
          pay.void_reason,
          pay.created_at,
          p.purchase_code,
          p.bill_number,
          ps.id AS slip_id,
          ps.file_name AS slip_file_name,
          ps.original_name AS slip_original_name,
          ps.mime_type AS slip_mime_type,
          ps.file_size AS slip_file_size
        FROM payments pay
        JOIN purchases p ON p.id = pay.purchase_id
        LEFT JOIN LATERAL (
          SELECT id, file_name, original_name, mime_type, file_size
          FROM payment_slips
          WHERE payment_id = pay.id
          ORDER BY id DESC
          LIMIT 1
        ) ps ON TRUE
        WHERE pay.vendor_id = $1
        ORDER BY pay.payment_date_ad DESC, pay.id DESC`,
        [vendorId]
      );

      const payments = paymentsRes.rows.map((pay) => ({
        ...pay,
        id: Number(pay.id),
        purchase_id: Number(pay.purchase_id),
        vendor_id: Number(pay.vendor_id),
        amount: Number(pay.amount),
        recorded_by: pay.recorded_by ? Number(pay.recorded_by) : null,
        slip: pay.slip_id
          ? {
              id: Number(pay.slip_id),
              file_name: pay.slip_file_name,
              original_name: pay.slip_original_name,
              mime_type: pay.slip_mime_type,
              file_size: Number(pay.slip_file_size),
            }
          : null,
      }));

      const vendor = {
        ...formatVendor(vendorRow),
        summary,
        purchases,
        payments,
      };

      res.status(200).json({
        vendor,
        summary,
        purchases,
        payments,
      });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/vendors/:id - Update vendor
vendorsRouter.patch(
  '/:id',
  validateBody(updateVendorSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const vendorId = Number(req.params.id);
      if (isNaN(vendorId)) {
        throw ApiError.badRequest('Invalid vendor ID');
      }

      const existRes = await pool.query('SELECT * FROM vendors WHERE id = $1', [vendorId]);
      if (existRes.rows.length === 0) {
        throw ApiError.notFound('Vendor not found');
      }
      const oldVendor = existRes.rows[0];

      if (req.body.is_active !== undefined && req.user?.role !== 'ADMIN') {
        throw ApiError.forbidden('Only admins can activate or deactivate records');
      }

      const updatableFields = [
        'company_name',
        'pan_number',
        'vat_number',
        'contact_person',
        'contact_number',
        'alt_contact_number',
        'address',
        'bank_name',
        'bank_branch',
        'bank_account_holder',
        'bank_account_number',
        'account_type',
        'email',
        'notes',
        'is_active',
      ];

      const setClauses: string[] = [];
      const values: any[] = [];
      const oldValues: Record<string, any> = {};
      const newValues: Record<string, any> = {};
      let valIdx = 1;

      for (const field of updatableFields) {
        if (req.body[field] !== undefined) {
          setClauses.push(`${field} = $${valIdx++}`);
          values.push(req.body[field]);
          oldValues[field] = oldVendor[field];
          newValues[field] = req.body[field];
        }
      }

      if (setClauses.length === 0) {
        res.status(200).json({
          vendor: formatVendor(oldVendor),
        });
        return;
      }

      setClauses.push(`updated_at = NOW()`);
      values.push(vendorId);

      const updateSql = `
        UPDATE vendors
        SET ${setClauses.join(', ')}
        WHERE id = $${valIdx}
        RETURNING *
      `;

      const updateRes = await pool.query(updateSql, values);
      const updatedVendor = updateRes.rows[0];

      const action = req.body.is_active === false ? 'DEACTIVATE' : 'UPDATE';
      await logActivity(pool, {
        entityType: 'VENDOR',
        entityId: Number(updatedVendor.id),
        action,
        summary: `Vendor ${updatedVendor.company_name} ${action.toLowerCase()}d`,
        oldValues,
        newValues,
        performedBy: req.user?.id,
        performedByName: req.user?.fullName,
      });

      res.status(200).json({
        vendor: formatVendor(updatedVendor),
      });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/vendors/:id - Soft-deactivate vendor (Admin only)
vendorsRouter.delete(
  '/:id',
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const vendorId = Number(req.params.id);
      if (isNaN(vendorId)) {
        throw ApiError.badRequest('Invalid vendor ID');
      }

      const existRes = await pool.query('SELECT * FROM vendors WHERE id = $1', [vendorId]);
      if (existRes.rows.length === 0) {
        throw ApiError.notFound('Vendor not found');
      }
      const vendor = existRes.rows[0];

      await pool.query('UPDATE vendors SET is_active = FALSE, updated_at = NOW() WHERE id = $1', [vendorId]);

      await logActivity(pool, {
        entityType: 'VENDOR',
        entityId: vendorId,
        action: 'DEACTIVATE',
        summary: `Vendor ${vendor.company_name} deactivated`,
        oldValues: { is_active: vendor.is_active },
        newValues: { is_active: false },
        performedBy: req.user?.id,
        performedByName: req.user?.fullName,
      });

      res.status(200).json({
        success: true,
        message: 'Vendor deactivated successfully',
      });
    } catch (err) {
      next(err);
    }
  }
);
