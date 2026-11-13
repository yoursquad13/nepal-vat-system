import { Router, Request, Response, NextFunction } from 'express';
import { pool, withTransaction } from '../config/db.js';
import { ApiError } from '../utils/errors.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { calculateVat, toPaisa, fromPaisa } from '../utils/money.js';
import {
  adToBs,
  bsToAd,
  getFiscalYearFromBs,
  getNowNpt,
  resolveDatePreset,
  DatePreset,
} from '../utils/nepaliDate.js';
import { logActivity } from '../utils/audit.js';
import { uploadVatBill } from '../utils/upload.js';
import { recordPaymentHandler, handlePaymentSlipUpload } from './payments.js';

export const purchasesRouter = Router();

// All purchase endpoints require authentication
purchasesRouter.use(requireAuth);

/**
 * Middleware supporting both JSON and multipart/form-data for VAT bill upload on purchase creation.
 */
function optionalVatBillUpload(req: Request, res: Response, next: NextFunction) {
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    uploadVatBill.fields([
      { name: 'vatBillFile', maxCount: 1 },
      { name: 'file', maxCount: 1 },
    ])(req, res, (err) => {
      if (err) return next(err);
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      if (files?.vatBillFile?.[0]) {
        req.file = files.vatBillFile[0];
      } else if (files?.file?.[0]) {
        req.file = files.file[0];
      }
      next();
    });
  } else {
    next();
  }
}

function formatDateString(val: any): string | null {
  if (!val) return null;
  if (typeof val === 'string') return val.split('T')[0];
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(val);
}

function formatPurchase(row: any) {
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
    days_pending: row.days_pending !== undefined ? Number(row.days_pending) : undefined,
  };
}

function formatPurchaseItem(item: any) {
  return {
    ...item,
    id: Number(item.id),
    purchase_id: Number(item.purchase_id),
    product_id: item.product_id ? Number(item.product_id) : null,
    quantity: Number(item.quantity),
    unit_price: Number(item.unit_price),
    line_subtotal: Number(item.line_subtotal),
    line_vat_amount: Number(item.line_vat_amount),
    line_total: Number(item.line_total),
    stock_received_by: item.stock_received_by ? Number(item.stock_received_by) : null,
  };
}

function formatVatBill(bill: any) {
  return {
    ...bill,
    id: Number(bill.id),
    purchase_id: Number(bill.purchase_id),
    file_size: Number(bill.file_size),
    uploaded_by: bill.uploaded_by ? Number(bill.uploaded_by) : null,
    reviewed_by: bill.reviewed_by ? Number(bill.reviewed_by) : null,
  };
}

// ==================== GET /api/purchases/vat-pending ====================
// Note: Must be declared BEFORE /:id route
purchasesRouter.get(
  '/vat-pending',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const vendorId = req.query.vendorId || req.query.vendor_id;
      const fiscalYear = req.query.fiscalYear || req.query.fiscal_year;

      const conditions: string[] = [
        "p.vat_bill_status = 'VAT BILL PENDING'",
        'p.is_deleted = FALSE',
      ];
      const values: any[] = [];
      let valIdx = 1;

      if (vendorId) {
        conditions.push(`p.vendor_id = $${valIdx}`);
        values.push(Number(vendorId));
        valIdx++;
      }

      if (fiscalYear && typeof fiscalYear === 'string') {
        conditions.push(`p.fiscal_year = $${valIdx}`);
        values.push(fiscalYear.trim());
        valIdx++;
      }

      if (q) {
        conditions.push(`(
          p.purchase_code ILIKE $${valIdx} OR
          p.bill_number ILIKE $${valIdx} OR
          p.product_summary ILIKE $${valIdx} OR
          p.description ILIKE $${valIdx} OR
          v.company_name ILIKE $${valIdx} OR
          v.pan_number ILIKE $${valIdx}
        )`);
        values.push(`%${q}%`);
        valIdx++;
      }

      const querySql = `
        SELECT
          p.*,
          v.company_name AS vendor_name,
          v.pan_number AS vendor_pan,
          v.vat_number AS vendor_vat,
          v.contact_number AS vendor_phone,
          u.full_name AS submitted_by_name,
          GREATEST(0, (DATE(NOW() AT TIME ZONE 'Asia/Kathmandu') - p.purchase_date_ad))::int AS days_pending
        FROM purchases p
        JOIN vendors v ON p.vendor_id = v.id
        LEFT JOIN users u ON p.submitted_by = u.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY days_pending DESC, p.purchase_date_ad ASC, p.id DESC
      `;

      const result = await pool.query(querySql, values);
      res.json({
        purchases: result.rows.map(formatPurchase),
        total: result.rows.length,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ==================== GET /api/purchases ====================
purchasesRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const preset = req.query.preset as DatePreset | undefined;
      let fromAd = typeof req.query.fromAd === 'string' ? req.query.fromAd : undefined;
      let toAd = typeof req.query.toAd === 'string' ? req.query.toAd : undefined;
      const fromBs = typeof req.query.fromBs === 'string' ? req.query.fromBs : undefined;
      const toBs = typeof req.query.toBs === 'string' ? req.query.toBs : undefined;

      const fiscalYear = req.query.fiscalYear || req.query.fiscal_year;
      const vendorId = req.query.vendorId || req.query.vendor_id;
      const staffId = req.query.staffId || req.query.staff_id;
      const vatStatus = req.query.vatStatus || req.query.vat_bill_status;
      const paymentStatus = req.query.paymentStatus || req.query.payment_status;
      const reviewStatus = req.query.reviewStatus || req.query.review_status;
      const taxType = req.query.taxType || req.query.tax_type;

      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const offset = (page - 1) * limit;

      // Date preset resolution
      if (preset) {
        try {
          const range = resolveDatePreset(preset);
          fromAd = range.fromAd;
          toAd = range.toAd;
        } catch {
          // ignore invalid preset
        }
      } else {
        if (fromBs) fromAd = bsToAd(fromBs);
        if (toBs) toAd = bsToAd(toBs);
      }

      const conditions: string[] = ['p.is_deleted = FALSE'];
      const values: any[] = [];
      let valIdx = 1;

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

      if (fiscalYear && typeof fiscalYear === 'string') {
        conditions.push(`p.fiscal_year = $${valIdx}`);
        values.push(fiscalYear.trim());
        valIdx++;
      }

      if (vendorId) {
        conditions.push(`p.vendor_id = $${valIdx}`);
        values.push(Number(vendorId));
        valIdx++;
      }

      if (staffId) {
        conditions.push(`p.submitted_by = $${valIdx}`);
        values.push(Number(staffId));
        valIdx++;
      }

      if (vatStatus && typeof vatStatus === 'string') {
        conditions.push(`p.vat_bill_status = $${valIdx}`);
        values.push(vatStatus);
        valIdx++;
      }

      if (paymentStatus && typeof paymentStatus === 'string') {
        conditions.push(`p.payment_status = $${valIdx}`);
        values.push(paymentStatus);
        valIdx++;
      }

      if (reviewStatus && typeof reviewStatus === 'string') {
        conditions.push(`p.review_status = $${valIdx}`);
        values.push(reviewStatus);
        valIdx++;
      }

      if (taxType && typeof taxType === 'string') {
        conditions.push(`p.tax_type = $${valIdx}`);
        values.push(taxType);
        valIdx++;
      }

      if (q) {
        conditions.push(`(
          p.purchase_code ILIKE $${valIdx} OR
          p.bill_number ILIKE $${valIdx} OR
          p.product_summary ILIKE $${valIdx} OR
          p.description ILIKE $${valIdx} OR
          v.company_name ILIKE $${valIdx} OR
          v.pan_number ILIKE $${valIdx}
        )`);
        values.push(`%${q}%`);
        valIdx++;
      }

      const whereClause = conditions.join(' AND ');

      // Total count
      const countRes = await pool.query(
        `SELECT COUNT(*)
         FROM purchases p
         JOIN vendors v ON p.vendor_id = v.id
         WHERE ${whereClause}`,
        values
      );
      const total = Number(countRes.rows[0].count);

      // Data query
      const querySql = `
        SELECT
          p.*,
          v.company_name AS vendor_name,
          v.pan_number AS vendor_pan,
          v.vat_number AS vendor_vat,
          v.contact_number AS vendor_phone,
          u.full_name AS submitted_by_name
        FROM purchases p
        JOIN vendors v ON p.vendor_id = v.id
        LEFT JOIN users u ON p.submitted_by = u.id
        WHERE ${whereClause}
        ORDER BY p.purchase_date_ad DESC, p.id DESC
        LIMIT $${valIdx} OFFSET $${valIdx + 1}
      `;
      values.push(limit, offset);

      const dataRes = await pool.query(querySql, values);

      res.json({
        purchases: dataRes.rows.map(formatPurchase),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ==================== GET /api/purchases/:id ====================
purchasesRouter.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id) || id <= 0) {
        throw ApiError.badRequest('Invalid purchase ID');
      }

      const purRes = await pool.query(
        `SELECT
           p.*,
           v.company_name AS vendor_name,
           v.pan_number AS vendor_pan,
           v.vat_number AS vendor_vat,
           v.contact_person AS vendor_contact_person,
           v.contact_number AS vendor_phone,
           v.address AS vendor_address,
           v.bank_name AS vendor_bank_name,
           v.bank_branch AS vendor_bank_branch,
           v.bank_account_holder AS vendor_bank_account_holder,
           v.bank_account_number AS vendor_bank_account_number,
           v.account_type AS vendor_account_type,
           u.full_name AS submitted_by_name,
           ap.full_name AS approved_by_name,
           vp.full_name AS vat_verified_by_name,
           GREATEST(0, (DATE(NOW() AT TIME ZONE 'Asia/Kathmandu') - p.purchase_date_ad))::int AS days_pending
         FROM purchases p
         JOIN vendors v ON p.vendor_id = v.id
         LEFT JOIN users u ON p.submitted_by = u.id
         LEFT JOIN users ap ON p.approved_by = ap.id
         LEFT JOIN users vp ON p.vat_verified_by = vp.id
         WHERE p.id = $1 AND p.is_deleted = FALSE`,
        [id]
      );

      if (purRes.rows.length === 0) {
        throw ApiError.notFound('Purchase record not found');
      }

      const purchase = formatPurchase(purRes.rows[0]);

      // Items
      const itemsRes = await pool.query(
        `SELECT pi.*, p.name AS linked_product_name, p.sku AS linked_product_sku
         FROM purchase_items pi
         LEFT JOIN products p ON pi.product_id = p.id
         WHERE pi.purchase_id = $1
         ORDER BY pi.id ASC`,
        [id]
      );
      const items = itemsRes.rows.map(formatPurchaseItem);

      // VAT Bills
      const billsRes = await pool.query(
        `SELECT vb.*, u.full_name AS uploaded_by_name, r.full_name AS reviewed_by_name
         FROM vat_bills vb
         LEFT JOIN users u ON vb.uploaded_by = u.id
         LEFT JOIN users r ON vb.reviewed_by = r.id
         WHERE vb.purchase_id = $1
         ORDER BY vb.is_current DESC, vb.uploaded_at DESC`,
        [id]
      );
      const vat_bills = billsRes.rows.map(formatVatBill);

      // Payments & slips
      const paymentsRes = await pool.query(
        `SELECT pay.*, u.full_name AS recorded_by_name
         FROM payments pay
         LEFT JOIN users u ON pay.recorded_by = u.id
         WHERE pay.purchase_id = $1
         ORDER BY pay.payment_date_ad DESC, pay.id DESC`,
        [id]
      );

      const payments = paymentsRes.rows;
      if (payments.length > 0) {
        const paymentIds = payments.map((p) => p.id);
        const slipsRes = await pool.query(
          `SELECT * FROM payment_slips WHERE payment_id = ANY($1) ORDER BY id ASC`,
          [paymentIds]
        );
        const slipsByPayment: Record<number, any[]> = {};
        for (const slip of slipsRes.rows) {
          slipsByPayment[slip.payment_id] = slipsByPayment[slip.payment_id] || [];
          slipsByPayment[slip.payment_id].push({
            ...slip,
            id: Number(slip.id),
            payment_id: Number(slip.payment_id),
            purchase_id: Number(slip.purchase_id),
            file_size: Number(slip.file_size),
          });
        }
        for (const p of payments) {
          p.id = Number(p.id);
          p.purchase_id = Number(p.purchase_id);
          p.vendor_id = Number(p.vendor_id);
          p.amount = Number(p.amount);
          p.slips = slipsByPayment[p.id] || [];
        }
      }

      // Activity logs
      const logsRes = await pool.query(
        `SELECT *
         FROM activity_logs
         WHERE (entity_type = 'PURCHASE' AND entity_id = $1)
            OR (entity_type = 'VAT_BILL' AND entity_id IN (SELECT id FROM vat_bills WHERE purchase_id = $1))
         ORDER BY performed_at DESC, id DESC`,
        [id]
      );

      res.json({
        purchase,
        items,
        vat_bills,
        payments,
        activity_logs: logsRes.rows,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ==================== POST /api/purchases ====================
purchasesRouter.post(
  '/',
  optionalVatBillUpload,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = req.body;

      // Normalize items if sent as JSON string in multipart form
      let rawItems: any[] = [];
      if (body.items) {
        if (typeof body.items === 'string') {
          try {
            rawItems = JSON.parse(body.items);
          } catch {
            throw ApiError.badRequest('Invalid JSON format for items array');
          }
        } else if (Array.isArray(body.items)) {
          rawItems = body.items;
        }
      }

      const vendorId = Number(body.vendor_id ?? body.vendorId);
      if (Number.isNaN(vendorId) || vendorId <= 0) {
        throw ApiError.badRequest('Valid vendor_id is required');
      }

      const productSummary = (body.product_summary ?? body.productSummary)?.trim();
      if (!productSummary) {
        throw ApiError.badRequest('product_summary is required');
      }

      const billNumber = (body.bill_number ?? body.billNumber)?.trim() || null;
      const description = (body.description)?.trim() || null;
      const remarks = (body.remarks)?.trim() || null;
      const idempotencyKey = (body.idempotency_key ?? body.idempotencyKey)?.trim() || null;

      // Tax & VAT mode
      const taxType: 'VAT_13' | 'NON_VAT' =
        (body.tax_type ?? body.taxType)?.trim() === 'NON_VAT' ? 'NON_VAT' : 'VAT_13';

      // Load app_settings for default VAT mode and staff override permission
      const settingsRes = await pool.query(
        'SELECT default_vat_mode, allow_staff_vat_mode_override FROM app_settings WHERE id = 1'
      );
      const defaultVatMode = settingsRes.rows[0]?.default_vat_mode || 'EXCLUSIVE';
      const allowStaffOverride = settingsRes.rows[0]?.allow_staff_vat_mode_override ?? true;

      let vatCalcMode: 'EXCLUSIVE' | 'INCLUSIVE' =
        body.vat_calc_mode ?? body.vatCalcMode ?? defaultVatMode;

      if (vatCalcMode !== 'EXCLUSIVE' && vatCalcMode !== 'INCLUSIVE') {
        vatCalcMode = defaultVatMode;
      }

      // Check staff VAT mode override permission
      if (
        req.user!.role === 'STAFF' &&
        !allowStaffOverride &&
        vatCalcMode !== defaultVatMode
      ) {
        throw ApiError.forbidden(
          'Staff is not allowed to override the default VAT calculation mode'
        );
      }

      // Date Resolution
      const purchaseDateAdInput = body.purchase_date_ad ?? body.purchaseDateAd;
      const purchaseDateBsInput = body.purchase_date_bs ?? body.purchaseDateBs;

      let purchaseDateAd: string;
      let purchaseDateBs: string;

      if (purchaseDateAdInput) {
        purchaseDateAd = String(purchaseDateAdInput).split('T')[0];
        purchaseDateBs = adToBs(purchaseDateAd);
      } else if (purchaseDateBsInput) {
        purchaseDateBs = String(purchaseDateBsInput).trim();
        purchaseDateAd = bsToAd(purchaseDateBs);
      } else {
        const now = getNowNpt();
        purchaseDateAd = now.dateAd;
        purchaseDateBs = now.dateBs;
      }

      const fiscalYear = getFiscalYearFromBs(purchaseDateBs);

      // Optional VAT Bill Dates
      const vatBillDateAdInput = body.vat_bill_date_ad ?? body.vatBillDateAd;
      const vatBillDateBsInput = body.vat_bill_date_bs ?? body.vatBillDateBs;
      let vatBillDateAd: string | null = null;
      let vatBillDateBs: string | null = null;

      if (vatBillDateAdInput) {
        vatBillDateAd = String(vatBillDateAdInput).split('T')[0];
        vatBillDateBs = adToBs(vatBillDateAd);
      } else if (vatBillDateBsInput) {
        vatBillDateBs = String(vatBillDateBsInput).trim();
        vatBillDateAd = bsToAd(vatBillDateBs);
      }

      // Duplicate Idempotency Key check
      if (idempotencyKey) {
        const idemCheck = await pool.query(
          'SELECT id FROM purchases WHERE idempotency_key = $1',
          [idempotencyKey]
        );
        if (idemCheck.rows.length > 0) {
          throw ApiError.conflict('A purchase with this idempotency key already exists');
        }
      }

      // Duplicate Vendor Bill Number check
      if (billNumber) {
        const dupCheck = await pool.query(
          `SELECT id FROM purchases
           WHERE vendor_id = $1 AND LOWER(bill_number) = LOWER($2) AND is_deleted = FALSE`,
          [vendorId, billNumber]
        );
        if (dupCheck.rows.length > 0) {
          throw ApiError.conflict('A purchase with this vendor and bill number already exists');
        }
      }

      // Verify vendor exists
      const vendorCheck = await pool.query(
        'SELECT id, company_name FROM vendors WHERE id = $1 AND is_active = TRUE',
        [vendorId]
      );
      if (vendorCheck.rows.length === 0) {
        throw ApiError.badRequest('Referenced vendor does not exist or is inactive');
      }
      const vendor = vendorCheck.rows[0];

      // Calculate Line Items
      const computedItems = rawItems.map((item: any) => {
        const productName = String(item.product_name ?? item.productName ?? '').trim();
        if (!productName) {
          throw ApiError.badRequest('product_name is required for each line item');
        }
        const quantity = Number(item.quantity) || 1;
        const unitPrice = Number(item.unit_price ?? item.unitPrice) || 0;
        const enteredLineAmount = quantity * unitPrice;

        const lineCalc = calculateVat({
          enteredAmount: enteredLineAmount,
          taxType,
          mode: vatCalcMode,
        });

        return {
          product_id: item.product_id ? Number(item.product_id) : null,
          product_name: productName,
          category: item.category?.trim() || null,
          sku: item.sku?.trim() || null,
          description: item.description?.trim() || null,
          quantity,
          unit_of_measurement: (item.unit_of_measurement ?? item.unitOfMeasurement)?.trim() || 'pcs',
          unit_price: unitPrice,
          line_subtotal: Number(lineCalc.baseAmount),
          line_vat_amount: Number(lineCalc.vatAmount),
          line_total: Number(lineCalc.totalAmount),
        };
      });

      // Calculate Header Amounts
      const enteredAmountRaw = body.entered_amount ?? body.enteredAmount;
      let enteredAmount: number;
      let purchaseAmount: number;
      let vatAmount: number;
      let totalAmount: number;

      if (enteredAmountRaw !== undefined && enteredAmountRaw !== null && enteredAmountRaw !== '') {
        const headerCalc = calculateVat({
          enteredAmount: enteredAmountRaw,
          taxType,
          mode: vatCalcMode,
        });
        enteredAmount = Number(fromPaisa(headerCalc.enteredPaisa));
        purchaseAmount = Number(headerCalc.baseAmount);
        vatAmount = Number(headerCalc.vatAmount);
        totalAmount = Number(headerCalc.totalAmount);
      } else if (computedItems.length > 0) {
        const totalSubtotalPaisa = computedItems.reduce((acc, it) => acc + toPaisa(it.line_subtotal), 0);
        const totalVatPaisa = computedItems.reduce((acc, it) => acc + toPaisa(it.line_vat_amount), 0);
        const totalTotalPaisa = computedItems.reduce((acc, it) => acc + toPaisa(it.line_total), 0);

        purchaseAmount = Number(fromPaisa(totalSubtotalPaisa));
        vatAmount = Number(fromPaisa(totalVatPaisa));
        totalAmount = Number(fromPaisa(totalTotalPaisa));
        enteredAmount = vatCalcMode === 'INCLUSIVE' ? totalAmount : purchaseAmount;
      } else {
        enteredAmount = 0;
        purchaseAmount = 0;
        vatAmount = 0;
        totalAmount = 0;
      }

      // Initial Statuses
      const reviewStatus = 'PENDING_REVIEW';
      const paymentStatus = 'PAYMENT PENDING';
      let vatBillStatus: string;
      let vatBillUploadedAt: Date | null = null;

      if (taxType === 'NON_VAT') {
        vatBillStatus = 'NOT APPLICABLE';
      } else if (req.file) {
        vatBillStatus = 'VAT BILL RECEIVED';
        vatBillUploadedAt = new Date();
      } else {
        vatBillStatus = 'VAT BILL PENDING';
      }

      // Server-stamped immutable entry timestamps (UTC+5:45)
      const nowNpt = getNowNpt();
      const entryAt = nowNpt.isoUtc;
      const entryDateAd = nowNpt.dateAd;
      const entryTimeNpt = nowNpt.timeNpt;
      const entryDateBs = nowNpt.dateBs;

      // Save inside transaction
      const result = await withTransaction(async (client) => {
        // Sequential purchase_code generation: PUR-YYYY-XXXX based on BS year
        const bsYear = purchaseDateBs.split('-')[0];
        // Concurrency-safe advisory transaction lock by BS year
        await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`purchase_code_${bsYear}`]);

        const prefix = `PUR-${bsYear}-%`;

        const seqRes = await client.query(
          `SELECT purchase_code
           FROM purchases
           WHERE purchase_code LIKE $1
           ORDER BY id DESC
           LIMIT 1
           FOR UPDATE`,
          [prefix]
        );

        let nextSeq = 1;
        if (seqRes.rows.length > 0) {
          const lastCode = seqRes.rows[0].purchase_code;
          const match = lastCode.match(/PUR-\d{4}-(\d+)/);
          if (match && match[1]) {
            nextSeq = parseInt(match[1], 10) + 1;
          }
        }
        const purchaseCode = `PUR-${bsYear}-${String(nextSeq).padStart(4, '0')}`;

        // Insert purchase
        const purRes = await client.query(
          `INSERT INTO purchases (
            purchase_code, vendor_id, bill_number, product_summary, description,
            entry_at, entry_date_ad, entry_time_npt, entry_date_bs,
            purchase_date_ad, purchase_date_bs, fiscal_year,
            vat_bill_date_ad, vat_bill_date_bs,
            tax_type, vat_calc_mode, entered_amount, purchase_amount, vat_amount, total_amount, paid_amount,
            review_status, vat_bill_status, payment_status,
            submitted_by, vat_bill_uploaded_at, remarks, idempotency_key
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9,
            $10, $11, $12,
            $13, $14,
            $15, $16, $17, $18, $19, $20, 0,
            $21, $22, $23,
            $24, $25, $26, $27
          ) RETURNING *`,
          [
            purchaseCode,
            vendorId,
            billNumber,
            productSummary,
            description,
            entryAt,
            entryDateAd,
            entryTimeNpt,
            entryDateBs,
            purchaseDateAd,
            purchaseDateBs,
            fiscalYear,
            vatBillDateAd,
            vatBillDateBs,
            taxType,
            vatCalcMode,
            enteredAmount,
            purchaseAmount,
            vatAmount,
            totalAmount,
            reviewStatus,
            vatBillStatus,
            paymentStatus,
            req.user!.id,
            vatBillUploadedAt,
            remarks,
            idempotencyKey,
          ]
        );
        const purchase = purRes.rows[0];

        // Insert purchase_items
        const insertedItems: any[] = [];
        for (const it of computedItems) {
          const itemRes = await client.query(
            `INSERT INTO purchase_items (
              purchase_id, product_id, product_name, category, sku, description,
              quantity, unit_of_measurement, unit_price, line_subtotal, line_vat_amount, line_total, stock_received
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, FALSE)
            RETURNING *`,
            [
              purchase.id,
              it.product_id,
              it.product_name,
              it.category,
              it.sku,
              it.description,
              it.quantity,
              it.unit_of_measurement,
              it.unit_price,
              it.line_subtotal,
              it.line_vat_amount,
              it.line_total,
            ]
          );
          insertedItems.push(itemRes.rows[0]);
        }

        // Insert vat_bill if file was attached
        const insertedBills: any[] = [];
        if (req.file) {
          const billRes = await client.query(
            `INSERT INTO vat_bills (
              purchase_id, file_name, original_name, mime_type, file_size, storage_path,
              bill_date_ad, bill_date_bs, vat_bill_number, status, uploaded_by, uploaded_at, is_current
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'RECEIVED', $10, NOW(), TRUE)
            RETURNING *`,
            [
              purchase.id,
              req.file.filename,
              req.file.originalname,
              req.file.mimetype,
              req.file.size,
              req.file.path,
              vatBillDateAd || purchaseDateAd,
              vatBillDateBs || purchaseDateBs,
              billNumber,
              req.user!.id,
            ]
          );
          insertedBills.push(billRes.rows[0]);
        }

        // Audit log
        await logActivity(client, {
          entityType: 'PURCHASE',
          entityId: purchase.id,
          action: 'PURCHASE_CREATED',
          summary: `Purchase ${purchase.purchase_code} created for vendor ${vendor.company_name} (Rs. ${totalAmount})`,
          newValues: {
            ...purchase,
            itemsCount: insertedItems.length,
            hasVatBill: !!req.file,
          },
          performedBy: req.user!.id,
          performedByName: req.user!.fullName,
        });

        return { purchase, items: insertedItems, vat_bills: insertedBills };
      });

      res.status(201).json({
        purchase: formatPurchase(result.purchase),
        items: result.items.map(formatPurchaseItem),
        vat_bills: result.vat_bills.map(formatVatBill),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ==================== PATCH /api/purchases/:id ====================
purchasesRouter.patch(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id) || id <= 0) {
        throw ApiError.badRequest('Invalid purchase ID');
      }

      const body = req.body;

      const result = await withTransaction(async (client) => {
        // Fetch current purchase with lock
        const curRes = await client.query(
          'SELECT * FROM purchases WHERE id = $1 AND is_deleted = FALSE FOR UPDATE',
          [id]
        );
        if (curRes.rows.length === 0) {
          throw ApiError.notFound('Purchase record not found');
        }
        const current = curRes.rows[0];

        // Check if any line items have already received physical stock
        const stockRes = await client.query(
          'SELECT COUNT(*) FROM purchase_items WHERE purchase_id = $1 AND stock_received = TRUE',
          [id]
        );
        const hasStockReceived = Number(stockRes.rows[0].count) > 0;
        const hasPayments = Number(current.paid_amount) > 0;
        const isApproved = current.review_status === 'APPROVED';

        // Role authorization check
        if (req.user!.role === 'STAFF') {
          if (Number(current.submitted_by) !== req.user!.id) {
            throw ApiError.forbidden('Staff can only edit purchases they submitted');
          }
          if (isApproved) {
            throw ApiError.forbidden('Cannot edit purchase once approved by Admin');
          }
        }

        // Financial locking check
        const isFinanciallyLocked = isApproved || hasPayments || hasStockReceived;

        // Check if caller is attempting to modify locked core financial header fields
        const financialFields = [
          'vendor_id',
          'vendorId',
          'tax_type',
          'taxType',
          'vat_calc_mode',
          'vatCalcMode',
          'entered_amount',
          'enteredAmount',
          'purchase_amount',
          'purchaseAmount',
          'vat_amount',
          'vatAmount',
          'total_amount',
          'totalAmount',
        ];

        if (isFinanciallyLocked) {
          for (const f of financialFields) {
            if (body[f] !== undefined) {
              const currentVal =
                f === 'vendor_id' || f === 'vendorId'
                  ? Number(current.vendor_id)
                  : f === 'entered_amount' || f === 'enteredAmount'
                  ? Number(current.entered_amount)
                  : f === 'purchase_amount' || f === 'purchaseAmount'
                  ? Number(current.purchase_amount)
                  : f === 'vat_amount' || f === 'vatAmount'
                  ? Number(current.vat_amount)
                  : f === 'total_amount' || f === 'totalAmount'
                  ? Number(current.total_amount)
                  : current[f];

              const incomingVal =
                f === 'vendor_id' || f === 'vendorId' || f.includes('amount') || f.includes('Amount')
                  ? Number(body[f])
                  : body[f];

              if (incomingVal !== currentVal) {
                throw ApiError.conflict(
                  'Core financial header fields are locked because this purchase is approved, paid, or stocked'
                );
              }
            }
          }
        }

        // Vendor update (if not financially locked)
        let vendorId = current.vendor_id;
        if (!isFinanciallyLocked && (body.vendor_id !== undefined || body.vendorId !== undefined)) {
          const newVendorId = Number(body.vendor_id ?? body.vendorId);
          if (Number.isNaN(newVendorId) || newVendorId <= 0) {
            throw ApiError.badRequest('Invalid vendor_id');
          }
          const vCheck = await client.query(
            'SELECT id FROM vendors WHERE id = $1 AND is_active = TRUE',
            [newVendorId]
          );
          if (vCheck.rows.length === 0) {
            throw ApiError.badRequest('Referenced vendor does not exist or is inactive');
          }
          vendorId = newVendorId;
        }

        // Bill number duplicate check if modified
        const newBillNumber = body.bill_number !== undefined || body.billNumber !== undefined
          ? (body.bill_number ?? body.billNumber)?.trim() || null
          : current.bill_number;

        if (
          newBillNumber &&
          (vendorId !== current.vendor_id || newBillNumber.toLowerCase() !== (current.bill_number || '').toLowerCase())
        ) {
          const dupCheck = await client.query(
            `SELECT id FROM purchases
             WHERE vendor_id = $1 AND LOWER(bill_number) = LOWER($2) AND id <> $3 AND is_deleted = FALSE`,
            [vendorId, newBillNumber, id]
          );
          if (dupCheck.rows.length > 0) {
            throw ApiError.conflict('A purchase with this vendor and bill number already exists');
          }
        }

        // Dates update (if not financially locked)
        let purchaseDateAd = current.purchase_date_ad;
        let purchaseDateBs = current.purchase_date_bs;
        let fiscalYear = current.fiscal_year;

        if (!isFinanciallyLocked) {
          const newDateAd = body.purchase_date_ad ?? body.purchaseDateAd;
          const newDateBs = body.purchase_date_bs ?? body.purchaseDateBs;

          if (newDateAd) {
            purchaseDateAd = String(newDateAd).split('T')[0];
            purchaseDateBs = adToBs(purchaseDateAd);
            fiscalYear = getFiscalYearFromBs(purchaseDateBs);
          } else if (newDateBs) {
            purchaseDateBs = String(newDateBs).trim();
            purchaseDateAd = bsToAd(purchaseDateBs);
            fiscalYear = getFiscalYearFromBs(purchaseDateBs);
          }
        }

        let vatBillDateAd = current.vat_bill_date_ad;
        let vatBillDateBs = current.vat_bill_date_bs;
        const newVatDateAd = body.vat_bill_date_ad ?? body.vatBillDateAd;
        const newVatDateBs = body.vat_bill_date_bs ?? body.vatBillDateBs;

        if (newVatDateAd) {
          vatBillDateAd = String(newVatDateAd).split('T')[0];
          vatBillDateBs = adToBs(vatBillDateAd);
        } else if (newVatDateBs) {
          vatBillDateBs = String(newVatDateBs).trim();
          vatBillDateAd = bsToAd(vatBillDateBs);
        }

        // Financial recalculations (only if NOT locked)
        let enteredAmount = Number(current.entered_amount);
        let purchaseAmount = Number(current.purchase_amount);
        let vatAmount = Number(current.vat_amount);
        let totalAmount = Number(current.total_amount);
        let taxType = current.tax_type;
        let vatCalcMode = current.vat_calc_mode;

        if (!isFinanciallyLocked) {
          if (body.tax_type ?? body.taxType) {
            taxType = (body.tax_type ?? body.taxType) === 'NON_VAT' ? 'NON_VAT' : 'VAT_13';
          }
          if (body.vat_calc_mode ?? body.vatCalcMode) {
            vatCalcMode = (body.vat_calc_mode ?? body.vatCalcMode) === 'INCLUSIVE' ? 'INCLUSIVE' : 'EXCLUSIVE';
          }
          const enteredRaw = body.entered_amount ?? body.enteredAmount;
          if (enteredRaw !== undefined) {
            const calc = calculateVat({
              enteredAmount: enteredRaw,
              taxType,
              mode: vatCalcMode,
            });
            enteredAmount = Number(fromPaisa(calc.enteredPaisa));
            purchaseAmount = Number(calc.baseAmount);
            vatAmount = Number(calc.vatAmount);
            totalAmount = Number(calc.totalAmount);
          }
        }

        // Handle items attachment / update
        if (body.items && Array.isArray(body.items)) {
          // If items already stocked in exist, ensure they are not dropped or corrupted
          const existingStocked = await client.query(
            'SELECT * FROM purchase_items WHERE purchase_id = $1 AND stock_received = TRUE',
            [id]
          );

          // Delete only unstocked items
          await client.query(
            'SELECT id FROM purchase_items WHERE purchase_id = $1 AND stock_received = FALSE',
            [id]
          );
          await client.query(
            'DELETE FROM purchase_items WHERE purchase_id = $1 AND stock_received = FALSE',
            [id]
          );

          // Re-insert unstocked items
          for (const item of body.items) {
            // If item matches an already stocked item id, skip re-insertion
            if (item.id && existingStocked.rows.some((s) => Number(s.id) === Number(item.id))) {
              continue;
            }

            const productName = String(item.product_name ?? item.productName ?? '').trim();
            if (!productName) continue;

            const qty = Number(item.quantity) || 1;
            const price = Number(item.unit_price ?? item.unitPrice) || 0;
            const lineAmt = qty * price;
            const lineCalc = calculateVat({
              enteredAmount: lineAmt,
              taxType,
              mode: vatCalcMode,
            });

            await client.query(
              `INSERT INTO purchase_items (
                purchase_id, product_id, product_name, category, sku, description,
                quantity, unit_of_measurement, unit_price, line_subtotal, line_vat_amount, line_total, stock_received
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, FALSE)`,
              [
                id,
                item.product_id ? Number(item.product_id) : null,
                productName,
                item.category?.trim() || null,
                item.sku?.trim() || null,
                item.description?.trim() || null,
                qty,
                (item.unit_of_measurement ?? item.unitOfMeasurement)?.trim() || 'pcs',
                price,
                Number(lineCalc.baseAmount),
                Number(lineCalc.vatAmount),
                Number(lineCalc.totalAmount),
              ]
            );
          }

          // Recalculate header totals when items are patched without explicit entered_amount
          if (
            !isFinanciallyLocked &&
            body.entered_amount === undefined &&
            body.enteredAmount === undefined &&
            body.items.length > 0
          ) {
            const allItemsRes = await client.query(
              'SELECT line_subtotal, line_vat_amount, line_total FROM purchase_items WHERE purchase_id = $1',
              [id]
            );
            const totalSubtotalPaisa = allItemsRes.rows.reduce(
              (acc, it) => acc + toPaisa(it.line_subtotal),
              0
            );
            const totalVatPaisa = allItemsRes.rows.reduce(
              (acc, it) => acc + toPaisa(it.line_vat_amount),
              0
            );
            const totalTotalPaisa = allItemsRes.rows.reduce(
              (acc, it) => acc + toPaisa(it.line_total),
              0
            );
            purchaseAmount = Number(fromPaisa(totalSubtotalPaisa));
            vatAmount = Number(fromPaisa(totalVatPaisa));
            totalAmount = Number(fromPaisa(totalTotalPaisa));
            enteredAmount = vatCalcMode === 'INCLUSIVE' ? totalAmount : purchaseAmount;
          }
        }

        const productSummary = (body.product_summary ?? body.productSummary)?.trim() || current.product_summary;
        const description = body.description !== undefined ? body.description?.trim() || null : current.description;
        const remarks = body.remarks !== undefined ? body.remarks?.trim() || null : current.remarks;

        // Reset review_status when a rejected purchase is edited
        let reviewStatus = current.review_status;
        let paymentStatus = current.payment_status;
        let rejectionReason = current.rejection_reason;

        if (current.review_status === 'REJECTED') {
          reviewStatus = 'PENDING_REVIEW';
          if (Number(current.paid_amount) === 0) {
            paymentStatus = 'PAYMENT PENDING';
          }
          rejectionReason = null;
        }

        // Execute update on purchases (NEVER update entry_at, entry_date_ad, entry_time_npt, entry_date_bs)
        const updatePurRes = await client.query(
          `UPDATE purchases
           SET vendor_id = $1,
               product_summary = $2,
               description = $3,
               remarks = $4,
               bill_number = $5,
               purchase_date_ad = $6,
               purchase_date_bs = $7,
               fiscal_year = $8,
               vat_bill_date_ad = $9,
               vat_bill_date_bs = $10,
               tax_type = $11,
               vat_calc_mode = $12,
               entered_amount = $13,
               purchase_amount = $14,
               vat_amount = $15,
               total_amount = $16,
               review_status = $17,
               payment_status = $18,
               rejection_reason = $19,
               updated_at = NOW()
           WHERE id = $20
           RETURNING *`,
          [
            vendorId,
            productSummary,
            description,
            remarks,
            newBillNumber,
            purchaseDateAd,
            purchaseDateBs,
            fiscalYear,
            vatBillDateAd,
            vatBillDateBs,
            taxType,
            vatCalcMode,
            enteredAmount,
            purchaseAmount,
            vatAmount,
            totalAmount,
            reviewStatus,
            paymentStatus,
            rejectionReason,
            id,
          ]
        );
        const updatedPur = updatePurRes.rows[0];

        // Fetch updated items
        const updatedItemsRes = await client.query(
          'SELECT * FROM purchase_items WHERE purchase_id = $1 ORDER BY id ASC',
          [id]
        );

        // Audit log
        await logActivity(client, {
          entityType: 'PURCHASE',
          entityId: id,
          action: 'PURCHASE_UPDATED',
          summary: `Purchase ${updatedPur.purchase_code} updated by ${req.user!.fullName}`,
          oldValues: current,
          newValues: updatedPur,
          performedBy: req.user!.id,
          performedByName: req.user!.fullName,
        });

        return { purchase: updatedPur, items: updatedItemsRes.rows };
      });

      res.json({
        message: 'Purchase updated successfully',
        purchase: formatPurchase(result.purchase),
        items: result.items.map(formatPurchaseItem),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ==================== DELETE /api/purchases/:id (Admin-only soft delete) ====================
purchasesRouter.delete(
  '/:id',
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id) || id <= 0) {
        throw ApiError.badRequest('Invalid purchase ID');
      }

      const result = await withTransaction(async (client) => {
        const purRes = await client.query(
          'SELECT * FROM purchases WHERE id = $1 AND is_deleted = FALSE FOR UPDATE',
          [id]
        );
        if (purRes.rows.length === 0) {
          throw ApiError.notFound('Purchase record not found or already deleted');
        }
        const current = purRes.rows[0];

        // Check for active (non-voided) payments
        const paymentsCheck = await client.query(
          'SELECT COUNT(*) FROM payments WHERE purchase_id = $1 AND is_voided = FALSE',
          [id]
        );
        if (Number(paymentsCheck.rows[0].count) > 0) {
          throw ApiError.conflict(
            'Cannot delete purchase with active payments. Payments must be voided first.'
          );
        }

        // Check for active stock-in movements
        const stockCheck = await client.query(
          "SELECT COUNT(*) FROM inventory_movements WHERE purchase_id = $1 AND movement_type = 'STOCK_IN'",
          [id]
        );
        if (Number(stockCheck.rows[0].count) > 0) {
          throw ApiError.conflict(
            'Cannot delete purchase with active stock receipts in inventory movements.'
          );
        }

        // Perform soft delete
        const delRes = await client.query(
          'UPDATE purchases SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1 RETURNING *',
          [id]
        );
        const deleted = delRes.rows[0];

        await logActivity(client, {
          entityType: 'PURCHASE',
          entityId: id,
          action: 'PURCHASE_DELETED',
          summary: `Purchase ${deleted.purchase_code} soft-deleted by admin ${req.user!.fullName}`,
          oldValues: current,
          performedBy: req.user!.id,
          performedByName: req.user!.fullName,
        });

        return deleted;
      });

      res.json({
        message: 'Purchase soft-deleted successfully',
        purchase: formatPurchase(result),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ==================== POST /api/purchases/:id/approve (Admin-only) ====================
purchasesRouter.post(
  '/:id/approve',
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id) || id <= 0) {
        throw ApiError.badRequest('Invalid purchase ID');
      }

      const adminRemarks = req.body.admin_remarks || req.body.remarks || null;

      const result = await withTransaction(async (client) => {
        const purRes = await client.query(
          'SELECT * FROM purchases WHERE id = $1 AND is_deleted = FALSE FOR UPDATE',
          [id]
        );
        if (purRes.rows.length === 0) {
          throw ApiError.notFound('Purchase record not found');
        }
        const current = purRes.rows[0];

        // Transition review_status to APPROVED. If payment_status is PAYMENT PENDING, transition to APPROVED.
        const newPaymentStatus =
          current.payment_status === 'PAYMENT PENDING' && Number(current.paid_amount) === 0
            ? 'APPROVED'
            : current.payment_status;

        const updatedRes = await client.query(
          `UPDATE purchases
           SET review_status = 'APPROVED',
               payment_status = $1,
               approved_by = $2,
               approved_at = NOW(),
               admin_remarks = COALESCE($3, admin_remarks),
               updated_at = NOW()
           WHERE id = $4
           RETURNING *`,
          [newPaymentStatus, req.user!.id, adminRemarks, id]
        );
        const updated = updatedRes.rows[0];

        await logActivity(client, {
          entityType: 'PURCHASE',
          entityId: id,
          action: 'PURCHASE_APPROVED',
          summary: `Purchase ${updated.purchase_code} approved by admin ${req.user!.fullName}`,
          oldValues: {
            review_status: current.review_status,
            payment_status: current.payment_status,
          },
          newValues: {
            review_status: updated.review_status,
            payment_status: updated.payment_status,
            adminRemarks,
          },
          performedBy: req.user!.id,
          performedByName: req.user!.fullName,
        });

        return updated;
      });

      res.json({
        message: 'Purchase approved successfully',
        purchase: formatPurchase(result),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ==================== POST /api/purchases/:id/reject (Admin-only) ====================
purchasesRouter.post(
  '/:id/reject',
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id) || id <= 0) {
        throw ApiError.badRequest('Invalid purchase ID');
      }

      const rejectionReason = req.body.rejection_reason || req.body.reason || null;

      const result = await withTransaction(async (client) => {
        const purRes = await client.query(
          'SELECT * FROM purchases WHERE id = $1 AND is_deleted = FALSE FOR UPDATE',
          [id]
        );
        if (purRes.rows.length === 0) {
          throw ApiError.notFound('Purchase record not found');
        }
        const current = purRes.rows[0];

        if (Number(current.paid_amount) > 0) {
          throw ApiError.conflict('Cannot reject purchase that already has payments recorded');
        }

        const stockReceivedCheck = await client.query(
          'SELECT COUNT(*) FROM purchase_items WHERE purchase_id = $1 AND stock_received = TRUE',
          [id]
        );
        const stockMovementCheck = await client.query(
          "SELECT COUNT(*) FROM inventory_movements WHERE purchase_id = $1 AND movement_type = 'STOCK_IN'",
          [id]
        );
        if (Number(stockReceivedCheck.rows[0].count) > 0 || Number(stockMovementCheck.rows[0].count) > 0) {
          throw ApiError.conflict('Cannot reject a purchase that already has received stock');
        }

        const updatedRes = await client.query(
          `UPDATE purchases
           SET review_status = 'REJECTED',
               rejection_reason = $1,
               updated_at = NOW()
           WHERE id = $2
           RETURNING *`,
          [rejectionReason, id]
        );
        const updated = updatedRes.rows[0];

        await logActivity(client, {
          entityType: 'PURCHASE',
          entityId: id,
          action: 'PURCHASE_REJECTED',
          summary: `Purchase ${updated.purchase_code} rejected by admin ${req.user!.fullName}`,
          oldValues: { review_status: current.review_status },
          newValues: { review_status: 'REJECTED', rejectionReason },
          performedBy: req.user!.id,
          performedByName: req.user!.fullName,
        });

        return updated;
      });

      res.json({
        message: 'Purchase rejected',
        purchase: formatPurchase(result),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ==================== POST /api/purchases/:id/vat-bill ====================
purchasesRouter.post(
  '/:id/vat-bill',
  (req, res, next) => {
    uploadVatBill.fields([
      { name: 'vatBillFile', maxCount: 1 },
      { name: 'file', maxCount: 1 },
    ])(req, res, (err) => {
      if (err) return next(err);
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      if (files?.vatBillFile?.[0]) {
        req.file = files.vatBillFile[0];
      } else if (files?.file?.[0]) {
        req.file = files.file[0];
      }
      next();
    });
  },
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id) || id <= 0) {
        throw ApiError.badRequest('Invalid purchase ID');
      }

      if (!req.file) {
        throw ApiError.badRequest('No VAT bill file uploaded. Expected field vatBillFile or file.');
      }

      const result = await withTransaction(async (client) => {
        const purRes = await client.query(
          'SELECT * FROM purchases WHERE id = $1 AND is_deleted = FALSE FOR UPDATE',
          [id]
        );
        if (purRes.rows.length === 0) {
          throw ApiError.notFound('Purchase record not found');
        }
        const current = purRes.rows[0];

        // Archive previous current VAT bills
        await client.query(
          'UPDATE vat_bills SET is_current = FALSE WHERE purchase_id = $1',
          [id]
        );

        // Bill dates
        const dateAd = req.body.bill_date_ad || req.body.billDateAd || current.vat_bill_date_ad || current.purchase_date_ad;
        const dateBs = req.body.bill_date_bs || req.body.billDateBs || current.vat_bill_date_bs || current.purchase_date_bs;
        const billNo = req.body.vat_bill_number || req.body.vatBillNumber || current.bill_number;

        // Insert new vat_bill
        const billRes = await client.query(
          `INSERT INTO vat_bills (
            purchase_id, file_name, original_name, mime_type, file_size, storage_path,
            bill_date_ad, bill_date_bs, vat_bill_number, status, uploaded_by, uploaded_at, is_current
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'RECEIVED', $10, NOW(), TRUE)
          RETURNING *`,
          [
            id,
            req.file!.filename,
            req.file!.originalname,
            req.file!.mimetype,
            req.file!.size,
            req.file!.path,
            dateAd,
            dateBs,
            billNo,
            req.user!.id,
          ]
        );
        const newBill = billRes.rows[0];

        // Update purchase vat_bill_status and vat_bill_uploaded_at
        const updatePurRes = await client.query(
          `UPDATE purchases
           SET vat_bill_status = 'VAT BILL RECEIVED',
               vat_bill_uploaded_at = NOW(),
               vat_bill_date_ad = COALESCE($2, vat_bill_date_ad),
               vat_bill_date_bs = COALESCE($3, vat_bill_date_bs),
               updated_at = NOW()
           WHERE id = $1
           RETURNING *`,
          [id, dateAd, dateBs]
        );
        const updatedPur = updatePurRes.rows[0];

        // Log activities
        await logActivity(client, {
          entityType: 'VAT_BILL',
          entityId: newBill.id,
          action: 'VAT_BILL_UPLOADED',
          summary: `VAT bill uploaded for purchase ${updatedPur.purchase_code} by ${req.user!.fullName}`,
          performedBy: req.user!.id,
          performedByName: req.user!.fullName,
        });

        await logActivity(client, {
          entityType: 'PURCHASE',
          entityId: id,
          action: 'PURCHASE_VAT_STATUS_UPDATED',
          summary: `Purchase ${updatedPur.purchase_code} VAT status changed to VAT BILL RECEIVED`,
          oldValues: { vat_bill_status: current.vat_bill_status },
          newValues: { vat_bill_status: 'VAT BILL RECEIVED', vatBillId: newBill.id },
          performedBy: req.user!.id,
          performedByName: req.user!.fullName,
        });

        return { vat_bill: newBill, purchase: updatedPur };
      });

      res.json({
        message: 'VAT bill uploaded successfully',
        vat_bill: formatVatBill(result.vat_bill),
        purchase: formatPurchase(result.purchase),
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/purchases/:id/payments (Admin-only)
purchasesRouter.post(
  '/:id/payments',
  requireAdmin,
  handlePaymentSlipUpload,
  recordPaymentHandler
);
