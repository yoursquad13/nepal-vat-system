import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import {
  resolveDatePreset,
  bsToAd,
  adToBs,
  getNowNpt,
  BS_MONTH_NAMES,
  BS_MONTH_DAYS,
  DatePreset,
} from '../utils/nepaliDate.js';

export const dashboardRouter = Router();

// Dashboard requires authentication
dashboardRouter.use(requireAuth);

function formatDateString(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') return val.split('T')[0];
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(val);
}

dashboardRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const isAdmin = req.user?.role === 'ADMIN';
    const userId = req.user?.id ? Number(req.user.id) : null;
    const { preset, fromDate, toDate, fromBs, toBs, fiscalYear } = req.query;

    let fromAd: string | null = null;
    let toAd: string | null = null;

    if (preset && typeof preset === 'string') {
      try {
        const range = resolveDatePreset(preset as DatePreset);
        fromAd = range.fromAd;
        toAd = range.toAd;
      } catch {
        // Fallback or ignore invalid preset
      }
    } else if (fromBs && toBs && typeof fromBs === 'string' && typeof toBs === 'string') {
      try {
        fromAd = bsToAd(fromBs);
        toAd = bsToAd(toBs);
      } catch {
        // Invalid BS date format
      }
    } else if (fromDate && toDate && typeof fromDate === 'string' && typeof toDate === 'string') {
      fromAd = fromDate;
      toAd = toDate;
    } else if (fiscalYear && typeof fiscalYear === 'string') {
      try {
        const [startYStr] = fiscalYear.split('/');
        const startY = parseInt(startYStr, 10);
        const endY = startY + 1;
        const ashadhDays = BS_MONTH_DAYS[endY]?.[2] || 31;
        fromAd = bsToAd(`${startY}-04-01`);
        toAd = bsToAd(`${endY}-03-${String(ashadhDays).padStart(2, '0')}`);
      } catch {
        // Ignore malformed fiscal year
      }
    }

    // 1. Build date filter for purchases
    const dateConditions: string[] = ['is_deleted = FALSE'];
    const dateParams: any[] = [];

    if (fromAd && toAd) {
      dateParams.push(fromAd, toAd);
      dateConditions.push(
        `purchase_date_ad >= $${dateParams.length - 1} AND purchase_date_ad <= $${dateParams.length}`
      );
    }

    const dateWhere = dateConditions.length > 0 ? `WHERE ${dateConditions.join(' AND ')}` : '';

    // 2. Main Financial / Purchase KPIs
    const kpiQuery = `
      SELECT
        COUNT(*)::int AS total_purchases_count,
        COALESCE(SUM(purchase_amount), 0)::numeric(14,2) AS total_purchase_amount,
        COALESCE(SUM(vat_amount), 0)::numeric(14,2) AS total_vat_amount,
        COALESCE(SUM(total_amount), 0)::numeric(14,2) AS total_amount_inc_vat,
        COALESCE(SUM(paid_amount), 0)::numeric(14,2) AS total_paid_amount,
        COALESCE(SUM(total_amount - paid_amount), 0)::numeric(14,2) AS total_outstanding_amount,
        COUNT(*) FILTER (WHERE vat_bill_status IN ('VAT BILL PENDING', 'VAT BILL RECEIVED'))::int AS pending_vat_bills_count
      FROM purchases
      ${dateWhere}
    `;
    const kpiRes = await pool.query(kpiQuery, dateParams);
    const kpiRow = kpiRes.rows[0];

    // Current BS month purchases count / amount
    const nowNpt = getNowNpt();
    const currentBsMonthRange = resolveDatePreset('this_month_bs');
    const thisMonthRes = await pool.query(
      `
      SELECT
        COUNT(*)::int AS count,
        COALESCE(SUM(total_amount), 0)::numeric(14,2) AS amount
      FROM purchases
      WHERE is_deleted = FALSE
        AND purchase_date_ad >= $1 AND purchase_date_ad <= $2
    `,
      [currentBsMonthRange.fromAd, currentBsMonthRange.toAd]
    );
    const thisMonthRow = thisMonthRes.rows[0];

    // Total vendors count
    const vendorCountRes = await pool.query(`SELECT COUNT(*)::int AS count FROM vendors WHERE is_active = TRUE`);
    const totalVendors = vendorCountRes.rows[0].count;

    // Inventory KPIs
    const invKpiRes = await pool.query(`
      SELECT
        COUNT(*)::int AS total_products,
        COUNT(*) FILTER (WHERE current_stock <= min_stock_level AND current_stock > 0)::int AS low_stock_count,
        COUNT(*) FILTER (WHERE current_stock <= 0)::int AS out_of_stock_count,
        COALESCE(SUM(CASE WHEN current_stock > 0 THEN current_stock * avg_purchase_price ELSE 0 END), 0)::numeric(14,2) AS total_inventory_valuation
      FROM products
      WHERE is_active = TRUE
    `);
    const invRow = invKpiRes.rows[0];

    // Low stock alerts (accessible to both Admin and Staff)
    const lowStockRes = await pool.query(`
      SELECT
        id,
        name,
        sku,
        category,
        unit_of_measurement,
        current_stock,
        min_stock_level,
        (min_stock_level - current_stock) AS deficit
      FROM products
      WHERE is_active = TRUE AND current_stock <= min_stock_level
      ORDER BY (min_stock_level - current_stock) DESC, current_stock ASC
      LIMIT 10
    `);
    const low_stock_alerts = lowStockRes.rows.map((p) => ({
      id: Number(p.id),
      name: p.name,
      sku: p.sku,
      category: p.category,
      unit_of_measurement: p.unit_of_measurement,
      current_stock: Number(p.current_stock),
      min_stock_level: Number(p.min_stock_level),
      deficit: Number(p.deficit),
    }));

    if (isAdmin) {
      // ADMIN: Full company financial metrics, charts, all recent entries
      const [monthlyRes, vendorChartRes, paidUnpaidRes, vatStatusRes, recentRes] = await Promise.all([
        pool.query(`
          SELECT
            SUBSTRING(purchase_date_bs FROM 1 FOR 7) AS bs_year_month,
            COUNT(*)::int AS count,
            COALESCE(SUM(purchase_amount), 0)::numeric(14,2) AS purchase_amount,
            COALESCE(SUM(vat_amount), 0)::numeric(14,2) AS vat_amount,
            COALESCE(SUM(total_amount), 0)::numeric(14,2) AS total_amount,
            COALESCE(SUM(paid_amount), 0)::numeric(14,2) AS paid_amount
          FROM purchases
          WHERE is_deleted = FALSE
          GROUP BY SUBSTRING(purchase_date_bs FROM 1 FOR 7)
          ORDER BY bs_year_month ASC
          LIMIT 24
        `),
        pool.query(`
          SELECT
            v.id AS vendor_id,
            v.company_name AS vendor_name,
            COUNT(p.id)::int AS count,
            COALESCE(SUM(p.total_amount), 0)::numeric(14,2) AS total_amount,
            COALESCE(SUM(p.paid_amount), 0)::numeric(14,2) AS paid_amount,
            COALESCE(SUM(p.total_amount - p.paid_amount), 0)::numeric(14,2) AS outstanding_amount
          FROM purchases p
          JOIN vendors v ON p.vendor_id = v.id
          WHERE p.is_deleted = FALSE
          GROUP BY v.id, v.company_name
          ORDER BY total_amount DESC
          LIMIT 10
        `),
        pool.query(`
          SELECT
            COALESCE(SUM(paid_amount), 0)::numeric(14,2) AS paid_amount,
            COALESCE(SUM(total_amount - paid_amount), 0)::numeric(14,2) AS unpaid_amount,
            COUNT(*) FILTER (WHERE payment_status = 'PAID')::int AS paid_count,
            COUNT(*) FILTER (WHERE payment_status = 'PARTIALLY PAID')::int AS partial_count,
            COUNT(*) FILTER (WHERE payment_status IN ('PAYMENT PENDING', 'APPROVED'))::int AS unpaid_count
          FROM purchases
          WHERE is_deleted = FALSE
        `),
        pool.query(`
          SELECT
            vat_bill_status,
            COUNT(*)::int AS count,
            COALESCE(SUM(vat_amount), 0)::numeric(14,2) AS vat_amount,
            COALESCE(SUM(total_amount), 0)::numeric(14,2) AS total_amount
          FROM purchases
          WHERE is_deleted = FALSE
          GROUP BY vat_bill_status
        `),
        pool.query(`
          SELECT
            p.id,
            p.purchase_code,
            p.bill_number,
            p.vendor_id,
            v.company_name AS vendor_name,
            p.product_summary,
            p.total_amount,
            p.paid_amount,
            p.purchase_date_ad,
            p.purchase_date_bs,
            p.entry_date_ad,
            p.entry_date_bs,
            p.entry_time_npt,
            p.review_status,
            p.vat_bill_status,
            p.payment_status,
            p.submitted_by
          FROM purchases p
          JOIN vendors v ON p.vendor_id = v.id
          WHERE p.is_deleted = FALSE
          ORDER BY p.entry_at DESC, p.id DESC
          LIMIT 10
        `),
      ]);

      const monthly_series = monthlyRes.rows.map((row) => {
        const parts = (row.bs_year_month || '').split('-');
        let label = row.bs_year_month;
        if (parts.length === 2) {
          const y = parts[0];
          const m = parseInt(parts[1], 10);
          const mName = BS_MONTH_NAMES[m - 1] || `Month ${m}`;
          label = `${mName} ${y}`;
        }
        return {
          bs_year_month: row.bs_year_month,
          label,
          count: Number(row.count),
          purchase_amount: Number(row.purchase_amount),
          vat_amount: Number(row.vat_amount),
          total_amount: Number(row.total_amount),
          paid_amount: Number(row.paid_amount),
        };
      });

      const vendor_wise_purchases = vendorChartRes.rows.map((r) => ({
        vendor_id: Number(r.vendor_id),
        vendor_name: r.vendor_name,
        count: Number(r.count),
        total_amount: Number(r.total_amount),
        paid_amount: Number(r.paid_amount),
        outstanding_amount: Number(r.outstanding_amount),
      }));

      const pu = paidUnpaidRes.rows[0];
      const paid_vs_unpaid = {
        paid_amount: Number(pu.paid_amount),
        unpaid_amount: Number(pu.unpaid_amount),
        paid_count: Number(pu.paid_count),
        partial_count: Number(pu.partial_count),
        unpaid_count: Number(pu.unpaid_count),
      };

      const vat_status_breakdown = vatStatusRes.rows.map((r) => ({
        status: r.vat_bill_status,
        count: Number(r.count),
        vat_amount: Number(r.vat_amount),
        total_amount: Number(r.total_amount),
      }));

      const recent_entries = recentRes.rows.map((r) => ({
        id: Number(r.id),
        purchase_code: r.purchase_code,
        bill_number: r.bill_number,
        vendor_id: Number(r.vendor_id),
        vendor_name: r.vendor_name,
        product_summary: r.product_summary,
        total_amount: Number(r.total_amount),
        paid_amount: Number(r.paid_amount),
        purchase_date_ad: formatDateString(r.purchase_date_ad),
        purchase_date_bs: r.purchase_date_bs,
        entry_date_ad: formatDateString(r.entry_date_ad),
        entry_date_bs: r.entry_date_bs,
        entry_time_npt: r.entry_time_npt,
        review_status: r.review_status,
        vat_bill_status: r.vat_bill_status,
        payment_status: r.payment_status,
        is_my_entry: userId ? Number(r.submitted_by) === userId : false,
      }));

      return res.json({
        role: req.user?.role,
        is_admin: true,
        today_npt: nowNpt,
        filters_applied: {
          preset: preset || null,
          fromDate: fromAd,
          toDate: toAd,
          fiscalYear: fiscalYear || null,
        },
        kpis: {
          total_purchases_count: Number(kpiRow.total_purchases_count),
          total_purchase_amount: Number(kpiRow.total_purchase_amount),
          total_vat_amount: Number(kpiRow.total_vat_amount),
          total_amount_inc_vat: Number(kpiRow.total_amount_inc_vat),
          total_paid_amount: Number(kpiRow.total_paid_amount),
          total_outstanding_amount: Number(kpiRow.total_outstanding_amount),
          pending_vat_bills_count: Number(kpiRow.pending_vat_bills_count),
          total_vendors_count: Number(totalVendors),
          purchases_this_month_amount: Number(thisMonthRow.amount),
          purchases_this_month_count: Number(thisMonthRow.count),
          total_products: Number(invRow.total_products),
          low_stock_count: Number(invRow.low_stock_count),
          out_of_stock_count: Number(invRow.out_of_stock_count),
          total_inventory_valuation: Number(invRow.total_inventory_valuation),
        },
        charts: {
          monthly_series,
          vendor_wise_purchases,
          paid_vs_unpaid,
          vat_status_breakdown,
        },
        recent_entries,
        low_stock_alerts,
      });
    }

    // STAFF: Operational counts only, personal recent entries, pending VAT feed, charts: null, financial totals: null
    const [staffKpiRes, staffRecentRes, pendingVatRes] = await Promise.all([
      pool.query(
        `
        SELECT
          COUNT(*)::int AS my_purchases_count,
          COUNT(*) FILTER (WHERE vat_bill_status IN ('VAT BILL PENDING', 'VAT BILL REJECTED'))::int AS my_pending_vat_count
        FROM purchases
        WHERE is_deleted = FALSE AND submitted_by = $1
      `,
        [userId]
      ),
      pool.query(
        `
        SELECT
          p.id,
          p.purchase_code,
          p.bill_number,
          p.vendor_id,
          v.company_name AS vendor_name,
          p.product_summary,
          p.total_amount,
          p.paid_amount,
          p.purchase_date_ad,
          p.purchase_date_bs,
          p.entry_date_ad,
          p.entry_date_bs,
          p.entry_time_npt,
          p.review_status,
          p.vat_bill_status,
          p.payment_status,
          p.submitted_by
        FROM purchases p
        JOIN vendors v ON p.vendor_id = v.id
        WHERE p.is_deleted = FALSE AND p.submitted_by = $1
        ORDER BY p.entry_at DESC, p.id DESC
        LIMIT 10
      `,
        [userId]
      ),
      pool.query(
        `
        SELECT
          p.id,
          p.purchase_code,
          p.bill_number,
          p.vendor_id,
          v.company_name AS vendor_name,
          p.product_summary,
          p.total_amount,
          p.purchase_date_ad,
          p.purchase_date_bs,
          p.vat_bill_status,
          (CURRENT_DATE - p.purchase_date_ad)::int AS days_pending
        FROM purchases p
        JOIN vendors v ON p.vendor_id = v.id
        WHERE p.is_deleted = FALSE
          AND (p.submitted_by = $1 OR p.submitted_by IS NULL)
          AND p.vat_bill_status IN ('VAT BILL PENDING', 'VAT BILL REJECTED')
        ORDER BY p.purchase_date_ad ASC, p.id ASC
        LIMIT 10
      `,
        [userId]
      ),
    ]);

    const myPurchasesCount = staffKpiRes.rows[0]?.my_purchases_count || 0;
    const myPendingVatCount = staffKpiRes.rows[0]?.my_pending_vat_count || 0;

    const staffRecentEntries = staffRecentRes.rows.map((r) => ({
      id: Number(r.id),
      purchase_code: r.purchase_code,
      bill_number: r.bill_number,
      vendor_id: Number(r.vendor_id),
      vendor_name: r.vendor_name,
      product_summary: r.product_summary,
      total_amount: Number(r.total_amount),
      paid_amount: Number(r.paid_amount),
      purchase_date_ad: formatDateString(r.purchase_date_ad),
      purchase_date_bs: r.purchase_date_bs,
      entry_date_ad: formatDateString(r.entry_date_ad),
      entry_date_bs: r.entry_date_bs,
      entry_time_npt: r.entry_time_npt,
      review_status: r.review_status,
      vat_bill_status: r.vat_bill_status,
      payment_status: r.payment_status,
      is_my_entry: true,
    }));

    const pendingVatBills = pendingVatRes.rows.map((r) => ({
      id: Number(r.id),
      purchase_code: r.purchase_code,
      bill_number: r.bill_number,
      vendor_id: Number(r.vendor_id),
      vendor_name: r.vendor_name,
      product_summary: r.product_summary,
      total_amount: Number(r.total_amount),
      purchase_date_ad: formatDateString(r.purchase_date_ad),
      purchase_date_bs: r.purchase_date_bs,
      vat_bill_status: r.vat_bill_status,
      days_pending: Number(r.days_pending),
    }));

    return res.json({
      role: req.user?.role,
      is_admin: false,
      today_npt: nowNpt,
      filters_applied: {
        preset: preset || null,
        fromDate: fromAd,
        toDate: toAd,
        fiscalYear: fiscalYear || null,
      },
      kpis: {
        total_purchases_count: Number(kpiRow.total_purchases_count),
        pending_vat_bills_count: Number(kpiRow.pending_vat_bills_count),
        total_vendors_count: Number(totalVendors),
        purchases_this_month_count: Number(thisMonthRow.count),
        total_products: Number(invRow.total_products),
        low_stock_count: Number(invRow.low_stock_count),
        out_of_stock_count: Number(invRow.out_of_stock_count),
        my_purchases_count: Number(myPurchasesCount),
        my_pending_vat_count: Number(myPendingVatCount),
        // Executive financial metrics are redacted for Staff
        total_purchase_amount: null,
        total_vat_amount: null,
        total_amount_inc_vat: null,
        total_paid_amount: null,
        total_outstanding_amount: null,
        purchases_this_month_amount: null,
        total_inventory_valuation: null,
      },
      charts: null,
      recent_entries: staffRecentEntries,
      pending_vat_bills: pendingVatBills,
      low_stock_alerts,
    });
  } catch (err) {
    next(err);
  }
});
