import { Router, Request, Response, NextFunction } from 'express';
import fs from 'node:fs';
import { pool, withTransaction } from '../config/db.js';
import { ApiError } from '../utils/errors.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { toPaisa, fromPaisa } from '../utils/money.js';
import { adToBs, bsToAd, getNowNpt } from '../utils/nepaliDate.js';
import { uploadPaymentSlip } from '../utils/upload.js';
import { logActivity } from '../utils/audit.js';

export const paymentsRouter = Router();

// All payment routes require authentication
paymentsRouter.use(requireAuth);

export function formatDateString(val: any): string | null {
  if (!val) return null;
  if (typeof val === 'string') return val.split('T')[0];
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return null;
}

export function formatPaymentSlip(row: any) {
  return {
    ...row,
    id: Number(row.id),
    payment_id: Number(row.payment_id),
    purchase_id: Number(row.purchase_id),
    file_size: Number(row.file_size),
    uploaded_by: row.uploaded_by ? Number(row.uploaded_by) : null,
  };
}

export function formatPayment(row: any, slips: any[] = []) {
  const formattedSlips = slips.map(formatPaymentSlip);
  return {
    ...row,
    id: Number(row.id),
    purchase_id: Number(row.purchase_id),
    vendor_id: Number(row.vendor_id),
    amount: Number(row.amount),
    payment_date_ad: formatDateString(row.payment_date_ad),
    recorded_by: row.recorded_by ? Number(row.recorded_by) : null,
    voided_by: row.voided_by ? Number(row.voided_by) : null,
    slip: formattedSlips[0] || null,
    slips: formattedSlips,
  };
}

export function formatPurchase(row: any) {
  return {
    ...row,
    id: Number(row.id),
    vendor_id: Number(row.vendor_id),
    purchase_date_ad: formatDateString(row.purchase_date_ad),
    entry_date_ad: formatDateString(row.entry_date_ad),
    vat_bill_date_ad: formatDateString(row.vat_bill_date_ad),
    entered_amount: Number(row.entered_amount),
    purchase_amount: Number(row.purchase_amount),
    vat_amount: Number(row.vat_amount),
    total_amount: Number(row.total_amount),
    paid_amount: Number(row.paid_amount),
    submitted_by: row.submitted_by ? Number(row.submitted_by) : null,
    approved_by: row.approved_by ? Number(row.approved_by) : null,
    vat_verified_by: row.vat_verified_by ? Number(row.vat_verified_by) : null,
  };
}

/**
 * Middleware handling optional payment slip file uploads.
 * Supports fields: 'slipFile', 'slip', 'file'.
 */
export const handlePaymentSlipUpload = (req: Request, res: Response, next: NextFunction) => {
  uploadPaymentSlip.fields([
    { name: 'slipFile', maxCount: 1 },
    { name: 'slip', maxCount: 1 },
    { name: 'file', maxCount: 1 },
  ])(req, res, (err) => {
    if (err) return next(err);
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    if (files?.slipFile?.[0]) {
      req.file = files.slipFile[0];
    } else if (files?.slip?.[0]) {
      req.file = files.slip[0];
    } else if (files?.file?.[0]) {
      req.file = files.file[0];
    }
    next();
  });
};

/**
 * Safely unlinks an uploaded file if transaction/validation fails
 */
function cleanupFile(file?: Express.Multer.File) {
  if (file?.path && fs.existsSync(file.path)) {
    try {
      fs.unlinkSync(file.path);
    } catch {
      // ignore
    }
  }
}

/**
 * Record payment for a purchase (Admin only)
 * Wrapped in withTransaction with FOR UPDATE row locks.
 */
export async function recordPaymentHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const purchaseId = Number(req.params.id);
    if (Number.isNaN(purchaseId) || purchaseId <= 0) {
      throw ApiError.badRequest('Invalid purchase ID');
    }

    const rawAmount = req.body.amount;
    if (rawAmount === undefined || rawAmount === null || rawAmount === '') {
      throw ApiError.badRequest('Payment amount is required');
    }

    let amountPaisa: number;
    try {
      amountPaisa = toPaisa(rawAmount);
    } catch (e: any) {
      throw ApiError.badRequest('Invalid payment amount');
    }

    if (amountPaisa <= 0) {
      throw ApiError.badRequest('Payment amount must be greater than 0');
    }

    const result = await withTransaction(async (client) => {
      // 1. Fetch purchase with FOR UPDATE lock
      const purRes = await client.query(
        'SELECT * FROM purchases WHERE id = $1 AND is_deleted = FALSE FOR UPDATE',
        [purchaseId]
      );

      if (purRes.rows.length === 0) {
        throw ApiError.notFound('Purchase record not found');
      }

      const purchase = purRes.rows[0];

      // 2. Validate review_status === 'APPROVED'
      if (purchase.review_status !== 'APPROVED') {
        throw ApiError.conflict('Cannot record payment for a purchase that is not APPROVED');
      }

      // 3. Monetary checks: overpayment and remaining balance
      const totalPaisa = toPaisa(purchase.total_amount);

      const paidRes = await client.query(
        'SELECT COALESCE(SUM(amount), 0) AS total_paid FROM payments WHERE purchase_id = $1 AND is_voided = FALSE',
        [purchaseId]
      );
      const currentPaidPaisa = toPaisa(paidRes.rows[0].total_paid);
      const remainingPaisa = totalPaisa - currentPaidPaisa;

      if (remainingPaisa <= 0) {
        throw ApiError.badRequest('Purchase is already fully paid');
      }

      if (amountPaisa > remainingPaisa) {
        throw ApiError.badRequest(
          `Payment amount of Rs. ${fromPaisa(amountPaisa)} exceeds remaining balance of Rs. ${fromPaisa(remainingPaisa)}`
        );
      }

      // 4. Date parsing (BS / AD)
      const paymentDateBs = req.body.paymentDateBs || req.body.payment_date_bs;
      const paymentDateAd = req.body.paymentDateAd || req.body.payment_date_ad;

      let dateAd: string;
      let dateBs: string;

      if (paymentDateAd) {
        dateAd = typeof paymentDateAd === 'string' ? paymentDateAd.split('T')[0] : paymentDateAd;
        dateBs = paymentDateBs || adToBs(dateAd);
      } else if (paymentDateBs) {
        dateBs = paymentDateBs;
        dateAd = bsToAd(paymentDateBs);
      } else {
        const nowNpt = getNowNpt();
        dateAd = nowNpt.dateAd;
        dateBs = nowNpt.dateBs;
      }

      const transactionRef = req.body.transactionRef || req.body.transaction_ref || null;
      const companyBankAccount = req.body.companyBankAccount || req.body.company_bank_account || null;
      const paymentMethod = req.body.paymentMethod || req.body.payment_method || 'BANK_TRANSFER';
      const remarks = req.body.remarks || null;
      const paymentAmountDecimal = fromPaisa(amountPaisa);

      // 5. Insert payment record
      const payInsertRes = await client.query(
        `INSERT INTO payments (
          purchase_id, vendor_id, amount, payment_date_ad, payment_date_bs,
          paid_at, transaction_ref, company_bank_account, payment_method,
          remarks, recorded_by, is_voided, created_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          NOW(), $6, $7, $8,
          $9, $10, FALSE, NOW()
        ) RETURNING *`,
        [
          purchase.id,
          purchase.vendor_id,
          paymentAmountDecimal,
          dateAd,
          dateBs,
          transactionRef,
          companyBankAccount,
          paymentMethod,
          remarks,
          req.user!.id,
        ]
      );
      const newPayment = payInsertRes.rows[0];

      // 6. Insert payment slip if uploaded
      let slipRecord = null;
      if (req.file) {
        const slipRes = await client.query(
          `INSERT INTO payment_slips (
            payment_id, purchase_id, file_name, original_name,
            mime_type, file_size, storage_path, uploaded_by, uploaded_at
          ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7, $8, NOW()
          ) RETURNING *`,
          [
            newPayment.id,
            purchase.id,
            req.file.filename,
            req.file.originalname,
            req.file.mimetype,
            req.file.size,
            req.file.path,
            req.user!.id,
          ]
        );
        slipRecord = slipRes.rows[0];
      }

      // 7. Recalculate purchase paid_amount and payment_status from active payments
      const newTotalPaidRes = await client.query(
        'SELECT COALESCE(SUM(amount), 0) AS total_paid FROM payments WHERE purchase_id = $1 AND is_voided = FALSE',
        [purchase.id]
      );
      const newPaidPaisa = toPaisa(newTotalPaidRes.rows[0].total_paid);
      const newPaidDecimal = fromPaisa(newPaidPaisa);

      let newPaymentStatus: 'APPROVED' | 'PARTIALLY PAID' | 'PAID';
      const isPaidInFull = newPaidPaisa >= totalPaisa && totalPaisa > 0;

      if (isPaidInFull) {
        newPaymentStatus = 'PAID';
      } else if (newPaidPaisa > 0) {
        newPaymentStatus = 'PARTIALLY PAID';
      } else {
        newPaymentStatus = 'APPROVED';
      }

      const updatePurRes = await client.query(
        `UPDATE purchases
         SET paid_amount = $1,
             payment_status = $2,
             paid_at = CASE WHEN $3::boolean THEN NOW() ELSE NULL END,
             updated_at = NOW()
         WHERE id = $4
         RETURNING *`,
        [newPaidDecimal, newPaymentStatus, isPaidInFull, purchase.id]
      );
      const updatedPurchase = updatePurRes.rows[0];

      // 8. Audit log
      await logActivity(client, {
        entityType: 'PAYMENT',
        entityId: Number(newPayment.id),
        action: 'RECORD_PAYMENT',
        summary: `Recorded payment of Rs. ${paymentAmountDecimal} (${newPaymentStatus}) for purchase ${purchase.purchase_code}`,
        newValues: {
          payment_id: Number(newPayment.id),
          purchase_id: Number(purchase.id),
          vendor_id: Number(purchase.vendor_id),
          amount: Number(paymentAmountDecimal),
          payment_method: paymentMethod,
          payment_status: newPaymentStatus,
          paid_amount: Number(newPaidDecimal),
          has_slip: !!slipRecord,
        },
        performedBy: req.user!.id,
        performedByName: req.user!.fullName,
      });

      return {
        payment: formatPayment(newPayment, slipRecord ? [slipRecord] : []),
        purchase: formatPurchase(updatedPurchase),
      };
    });

    res.status(201).json(result);
  } catch (err) {
    cleanupFile(req.file);
    next(err);
  }
}

/**
 * Void a payment (Admin only)
 * Reverts paid_amount and payment_status on the associated purchase.
 */
export async function voidPaymentHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const paymentId = Number(req.params.id);
    if (Number.isNaN(paymentId) || paymentId <= 0) {
      throw ApiError.badRequest('Invalid payment ID');
    }

    const voidReason = req.body.void_reason || req.body.voidReason || req.body.reason;
    if (!voidReason || typeof voidReason !== 'string' || voidReason.trim() === '') {
      throw ApiError.badRequest('Void reason is required');
    }

    const result = await withTransaction(async (client) => {
      // 1. Fetch payment with FOR UPDATE lock
      const payRes = await client.query(
        'SELECT * FROM payments WHERE id = $1 FOR UPDATE',
        [paymentId]
      );
      if (payRes.rows.length === 0) {
        throw ApiError.notFound('Payment record not found');
      }
      const payment = payRes.rows[0];

      if (payment.is_voided) {
        throw ApiError.conflict('Payment is already voided');
      }

      // 2. Fetch associated purchase with FOR UPDATE lock
      const purRes = await client.query(
        'SELECT * FROM purchases WHERE id = $1 AND is_deleted = FALSE FOR UPDATE',
        [payment.purchase_id]
      );
      if (purRes.rows.length === 0) {
        throw ApiError.notFound('Associated purchase record not found or deleted');
      }
      const purchase = purRes.rows[0];

      // 3. Update payment to voided
      const voidPayRes = await client.query(
        `UPDATE payments
         SET is_voided = TRUE,
             voided_at = NOW(),
             voided_by = $1,
             void_reason = $2
         WHERE id = $3
         RETURNING *`,
        [req.user!.id, voidReason.trim(), paymentId]
      );
      const voidedPayment = voidPayRes.rows[0];

      // 4. Recompute remaining active payments on purchase
      const recomputeRes = await client.query(
        'SELECT COALESCE(SUM(amount), 0) AS total_paid FROM payments WHERE purchase_id = $1 AND is_voided = FALSE',
        [purchase.id]
      );
      const recomputedPaidPaisa = toPaisa(recomputeRes.rows[0].total_paid);
      const recomputedPaidDecimal = fromPaisa(recomputedPaidPaisa);
      const totalPaisa = toPaisa(purchase.total_amount);

      let newPaymentStatus: 'APPROVED' | 'PARTIALLY PAID' | 'PAID';
      const isPaidInFull = recomputedPaidPaisa >= totalPaisa && totalPaisa > 0;

      if (isPaidInFull) {
        newPaymentStatus = 'PAID';
      } else if (recomputedPaidPaisa > 0) {
        newPaymentStatus = 'PARTIALLY PAID';
      } else {
        newPaymentStatus = 'APPROVED';
      }

      const updatePurRes = await client.query(
        `UPDATE purchases
         SET paid_amount = $1,
             payment_status = $2,
             paid_at = CASE WHEN $3::boolean THEN COALESCE(paid_at, NOW()) ELSE NULL END,
             updated_at = NOW()
         WHERE id = $4
         RETURNING *`,
        [recomputedPaidDecimal, newPaymentStatus, isPaidInFull, purchase.id]
      );
      const updatedPurchase = updatePurRes.rows[0];

      // 5. Fetch associated payment slips if any
      const slipsRes = await client.query(
        'SELECT * FROM payment_slips WHERE payment_id = $1 ORDER BY id ASC',
        [paymentId]
      );

      // 6. Audit log
      await logActivity(client, {
        entityType: 'PAYMENT',
        entityId: Number(payment.id),
        action: 'VOID_PAYMENT',
        summary: `Voided payment of Rs. ${payment.amount} for purchase ${purchase.purchase_code}. Reason: ${voidReason.trim()}`,
        oldValues: {
          is_voided: false,
          amount: Number(payment.amount),
          purchase_payment_status: purchase.payment_status,
          purchase_paid_amount: Number(purchase.paid_amount),
        },
        newValues: {
          is_voided: true,
          void_reason: voidReason.trim(),
          purchase_payment_status: newPaymentStatus,
          purchase_paid_amount: Number(recomputedPaidDecimal),
        },
        performedBy: req.user!.id,
        performedByName: req.user!.fullName,
      });

      return {
        payment: formatPayment(voidedPayment, slipsRes.rows),
        purchase: formatPurchase(updatedPurchase),
      };
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/payments/vendor-summary
 * Admin-only: KPI totals, vendor-wise table, and unpaid purchase drilldowns.
 */
export async function getVendorSummaryHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    let fromAd = typeof req.query.fromDate === 'string' ? req.query.fromDate.trim() : (typeof req.query.from_date === 'string' ? req.query.from_date.trim() : undefined);
    let toAd = typeof req.query.toDate === 'string' ? req.query.toDate.trim() : (typeof req.query.to_date === 'string' ? req.query.to_date.trim() : undefined);
    const fromBs = typeof req.query.fromBs === 'string' ? req.query.fromBs.trim() : (typeof req.query.from_bs === 'string' ? req.query.from_bs.trim() : undefined);
    const toBs = typeof req.query.toBs === 'string' ? req.query.toBs.trim() : (typeof req.query.to_bs === 'string' ? req.query.to_bs.trim() : undefined);
    const fiscalYear = typeof req.query.fiscalYear === 'string' ? req.query.fiscalYear.trim() : (typeof req.query.fiscal_year === 'string' ? req.query.fiscal_year.trim() : undefined);
    const vendorIdParam = req.query.vendorId || req.query.vendor_id;
    const vendorId = vendorIdParam ? Number(vendorIdParam) : undefined;

    if (fromBs && !fromAd) fromAd = bsToAd(fromBs);
    if (toBs && !toAd) toAd = bsToAd(toBs);

    const conditions: string[] = ['p.is_deleted = FALSE'];
    const values: any[] = [];
    let valIdx = 1;

    if (vendorId && !Number.isNaN(vendorId)) {
      conditions.push(`p.vendor_id = $${valIdx}`);
      values.push(vendorId);
      valIdx++;
    }

    if (fromAd) {
      conditions.push(`p.purchase_date_ad >= $${valIdx}`);
      values.push(fromAd);
      valIdx++;
    }

    if (toAd) {
      conditions.push(`p.purchase_date_ad <= $${valIdx}`);
      values.push(toAd);
      valIdx++;
    }

    if (fiscalYear) {
      conditions.push(`p.fiscal_year = $${valIdx}`);
      values.push(fiscalYear);
      valIdx++;
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // 1. KPI Totals
    const kpiSql = `
      SELECT
        COUNT(*)::int AS total_purchases,
        COALESCE(SUM(p.purchase_amount), 0)::numeric AS total_purchase_amount,
        COALESCE(SUM(p.vat_amount), 0)::numeric AS total_vat_amount,
        COALESCE(SUM(p.total_amount), 0)::numeric AS total_total_amount,
        COALESCE(SUM(p.paid_amount), 0)::numeric AS total_paid_amount,
        COUNT(*) FILTER (
          WHERE (p.payment_status IN ('PAYMENT PENDING', 'APPROVED', 'PARTIALLY PAID') OR p.paid_amount < p.total_amount)
            AND p.review_status != 'REJECTED'
        )::int AS pending_payments_count,
        COUNT(*) FILTER (
          WHERE p.vat_bill_status = 'VAT BILL PENDING'
        )::int AS pending_vat_bills_count
      FROM purchases p
      ${whereClause}
    `;
    const kpiRes = await pool.query(kpiSql, values);
    const kpi = kpiRes.rows[0];

    const totalTotalAmount = Number(kpi.total_total_amount);
    const totalPaidAmount = Number(kpi.total_paid_amount);
    const totalUnpaidAmount = Math.max(0, totalTotalAmount - totalPaidAmount);

    const summary = {
      total_purchases: Number(kpi.total_purchases),
      total_purchase_amount: Number(kpi.total_purchase_amount),
      total_vat_amount: Number(kpi.total_vat_amount),
      total_total_amount: totalTotalAmount,
      total_paid_amount: totalPaidAmount,
      total_unpaid_amount: totalUnpaidAmount,
      pending_payments_count: Number(kpi.pending_payments_count),
      pending_vat_bills_count: Number(kpi.pending_vat_bills_count),
    };

    // 2. Vendor-wise Table Breakdown
    const vendorSql = `
      SELECT
        v.id AS vendor_id,
        v.company_name,
        v.contact_number,
        v.pan_number,
        COUNT(p.id)::int AS purchases_count,
        COALESCE(SUM(p.purchase_amount), 0)::numeric AS purchase_amount,
        COALESCE(SUM(p.vat_amount), 0)::numeric AS vat_amount,
        COALESCE(SUM(p.total_amount), 0)::numeric AS total_amount,
        COALESCE(SUM(p.paid_amount), 0)::numeric AS paid_amount,
        COUNT(p.id) FILTER (WHERE p.vat_bill_status = 'VAT BILL PENDING')::int AS pending_vat_bills_count,
        COUNT(p.id) FILTER (WHERE p.vat_bill_status = 'VAT BILL RECEIVED')::int AS received_vat_bills_count,
        COUNT(p.id) FILTER (WHERE p.vat_bill_status = 'VAT BILL VERIFIED')::int AS verified_vat_bills_count
      FROM purchases p
      JOIN vendors v ON p.vendor_id = v.id
      ${whereClause}
      GROUP BY v.id, v.company_name, v.contact_number, v.pan_number
      ORDER BY (SUM(p.total_amount) - SUM(p.paid_amount)) DESC, v.company_name ASC
    `;
    const vendorRes = await pool.query(vendorSql, values);
    let vendors = vendorRes.rows.map((row) => {
      const tot = Number(row.total_amount);
      const paid = Number(row.paid_amount);
      return {
        vendor_id: Number(row.vendor_id),
        company_name: row.company_name,
        contact_number: row.contact_number || '',
        pan_number: row.pan_number || '',
        purchases_count: Number(row.purchases_count),
        purchase_amount: Number(row.purchase_amount),
        vat_amount: Number(row.vat_amount),
        total_amount: tot,
        paid_amount: paid,
        unpaid_amount: Math.max(0, tot - paid),
        pending_vat_bills_count: Number(row.pending_vat_bills_count),
        received_vat_bills_count: Number(row.received_vat_bills_count),
        verified_vat_bills_count: Number(row.verified_vat_bills_count),
      };
    });

    // If specific vendorId was filtered and had 0 purchases in scope, check if vendor exists
    if (vendorId && vendors.length === 0) {
      const checkVendor = await pool.query(
        'SELECT id, company_name, contact_number, pan_number FROM vendors WHERE id = $1',
        [vendorId]
      );
      if (checkVendor.rows.length > 0) {
        const v = checkVendor.rows[0];
        vendors = [
          {
            vendor_id: Number(v.id),
            company_name: v.company_name,
            contact_number: v.contact_number || '',
            pan_number: v.pan_number || '',
            purchases_count: 0,
            purchase_amount: 0,
            vat_amount: 0,
            total_amount: 0,
            paid_amount: 0,
            unpaid_amount: 0,
            pending_vat_bills_count: 0,
            received_vat_bills_count: 0,
            verified_vat_bills_count: 0,
          },
        ];
      }
    }

    // 3. Unpaid Purchases Drilldown
    const unpaidSql = `
      SELECT
        p.id,
        p.purchase_code,
        p.bill_number,
        p.vendor_id,
        v.company_name AS vendor_name,
        v.contact_number,
        p.purchase_date_ad,
        p.purchase_date_bs,
        p.fiscal_year,
        p.total_amount,
        p.paid_amount,
        (p.total_amount - p.paid_amount)::numeric AS remaining_balance,
        p.review_status,
        p.vat_bill_status,
        p.payment_status,
        p.product_summary,
        p.created_at
      FROM purchases p
      JOIN vendors v ON p.vendor_id = v.id
      ${whereClause} AND (p.total_amount - p.paid_amount) > 0 AND p.review_status != 'REJECTED'
      ORDER BY p.purchase_date_ad ASC, p.id ASC
    `;
    const unpaidRes = await pool.query(unpaidSql, values);
    const unpaid_purchases = unpaidRes.rows.map((row) => ({
      id: Number(row.id),
      purchase_code: row.purchase_code,
      bill_number: row.bill_number,
      vendor_id: Number(row.vendor_id),
      vendor_name: row.vendor_name,
      company_name: row.vendor_name,
      contact_number: row.contact_number || '',
      purchase_date_ad: formatDateString(row.purchase_date_ad),
      purchase_date_bs: row.purchase_date_bs,
      fiscal_year: row.fiscal_year,
      total_amount: Number(row.total_amount),
      paid_amount: Number(row.paid_amount),
      remaining_balance: Number(row.remaining_balance),
      unpaid_amount: Number(row.remaining_balance),
      review_status: row.review_status,
      vat_bill_status: row.vat_bill_status,
      payment_status: row.payment_status,
      product_summary: row.product_summary,
      created_at: row.created_at,
    }));

    res.json({
      summary,
      ...summary,
      vendors,
      unpaid_purchases,
    });
  } catch (err) {
    next(err);
  }
}

// Routes mounted directly on paymentsRouter:
// GET /api/payments/vendor-summary
paymentsRouter.get('/vendor-summary', requireAdmin, getVendorSummaryHandler);

// POST /api/payments/:id/void
paymentsRouter.post('/:id/void', requireAdmin, voidPaymentHandler);

// POST /api/payments/purchases/:id (alias if called on paymentsRouter)
paymentsRouter.post(
  '/purchases/:id',
  requireAdmin,
  handlePaymentSlipUpload,
  recordPaymentHandler
);
