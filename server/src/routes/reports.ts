import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../config/db.js';
import { ApiError } from '../utils/errors.js';
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
import {
  generateCsv,
  generateXlsx,
  generatePdf,
  ReportColumn,
  ReportExportData,
} from '../utils/exporters.js';

export const reportsRouter = Router();

reportsRouter.use(requireAuth);

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

interface ResolvedFilters {
  fromAd?: string;
  toAd?: string;
  fromBs?: string;
  toBs?: string;
  fiscalYear?: string;
  vendorId?: number;
  category?: string;
  status?: string;
  q?: string;
}

function resolveReportFilters(query: any): ResolvedFilters {
  const { preset, fromDate, toDate, fromBs, toBs, fiscalYear, vendorId, category, status, q } = query;
  let fromAd: string | undefined;
  let toAd: string | undefined;
  let resFromBs: string | undefined;
  let resToBs: string | undefined;

  if (preset && typeof preset === 'string') {
    try {
      const range = resolveDatePreset(preset as DatePreset);
      fromAd = range.fromAd;
      toAd = range.toAd;
      resFromBs = adToBs(fromAd);
      resToBs = adToBs(toAd);
    } catch {
      // ignore invalid preset
    }
  } else if (fromBs && toBs && typeof fromBs === 'string' && typeof toBs === 'string') {
    try {
      fromAd = bsToAd(fromBs);
      toAd = bsToAd(toBs);
      resFromBs = fromBs;
      resToBs = toBs;
    } catch {
      // ignore
    }
  } else if (fromDate && toDate && typeof fromDate === 'string' && typeof toDate === 'string') {
    fromAd = fromDate;
    toAd = toDate;
    try {
      resFromBs = adToBs(fromDate);
      resToBs = adToBs(toDate);
    } catch {
      // ignore
    }
  } else if (fiscalYear && typeof fiscalYear === 'string') {
    try {
      const [startYStr] = fiscalYear.split('/');
      const startY = parseInt(startYStr, 10);
      const endY = startY + 1;
      const ashadhDays = BS_MONTH_DAYS[endY]?.[2] || 31;
      const startBs = `${startY}-04-01`;
      const endBs = `${endY}-03-${String(ashadhDays).padStart(2, '0')}`;
      fromAd = bsToAd(startBs);
      toAd = bsToAd(endBs);
      resFromBs = startBs;
      resToBs = endBs;
    } catch {
      // ignore
    }
  }

  return {
    fromAd,
    toAd,
    fromBs: resFromBs,
    toBs: resToBs,
    fiscalYear: typeof fiscalYear === 'string' ? fiscalYear : undefined,
    vendorId: vendorId ? Number(vendorId) : undefined,
    category: typeof category === 'string' ? category : undefined,
    status: typeof status === 'string' ? status : undefined,
    q: typeof q === 'string' ? q.trim() : undefined,
  };
}

async function fetchCompanySettings() {
  const res = await pool.query(
    `SELECT company_name, company_pan, company_vat, company_address FROM app_settings WHERE id = 1`
  );
  return (
    res.rows[0] || {
      company_name: 'Himalayan Trading Suppliers Pvt. Ltd.',
      company_pan: '601234567',
      company_vat: '601234567',
      company_address: 'Kathmandu, Nepal',
    }
  );
}

export const VALID_REPORT_SLUGS = [
  'daily-purchases',
  'monthly-purchases',
  'vendor-purchases',
  'vat-pending',
  'payment-pending',
  'paid-bills',
  'vat-summary',
  'product-stock',
  'stock-in',
  'stock-out',
  'vendor-products',
  'monthly-inventory',
  'stock-valuation',
  'low-stock',
  'stock-adjustments',
] as const;

export type ReportSlug = (typeof VALID_REPORT_SLUGS)[number];

async function generateReportData(
  reportType: ReportSlug,
  filters: ResolvedFilters
): Promise<{
  title: string;
  columns: ReportColumn[];
  rows: Record<string, any>[];
  summary: Record<string, any>;
}> {
  const now = getNowNpt();

  switch (reportType) {
    case 'daily-purchases': {
      const conditions: string[] = ['p.is_deleted = FALSE'];
      const params: any[] = [];

      if (filters.fromAd && filters.toAd) {
        params.push(filters.fromAd, filters.toAd);
        conditions.push(`p.purchase_date_ad >= $${params.length - 1} AND p.purchase_date_ad <= $${params.length}`);
      }
      if (filters.vendorId) {
        params.push(filters.vendorId);
        conditions.push(`p.vendor_id = $${params.length}`);
      }

      const where = `WHERE ${conditions.join(' AND ')}`;
      const query = `
        SELECT
          p.id,
          p.purchase_date_bs,
          p.purchase_date_ad,
          p.purchase_code,
          p.bill_number,
          v.company_name AS vendor_name,
          p.product_summary,
          p.purchase_amount::numeric(14,2) AS purchase_amount,
          p.vat_amount::numeric(14,2) AS vat_amount,
          p.total_amount::numeric(14,2) AS total_amount,
          p.paid_amount::numeric(14,2) AS paid_amount,
          (p.total_amount - p.paid_amount)::numeric(14,2) AS balance_due,
          p.payment_status,
          p.vat_bill_status
        FROM purchases p
        JOIN vendors v ON p.vendor_id = v.id
        ${where}
        ORDER BY p.purchase_date_ad DESC, p.id DESC
      `;
      const res = await pool.query(query, params);

      let totalPurchase = 0;
      let totalVat = 0;
      let totalAmount = 0;
      let totalPaid = 0;
      let totalDue = 0;

      const rows = res.rows.map((r) => {
        const pa = Number(r.purchase_amount);
        const va = Number(r.vat_amount);
        const ta = Number(r.total_amount);
        const pd = Number(r.paid_amount);
        const bd = Number(r.balance_due);

        totalPurchase += pa;
        totalVat += va;
        totalAmount += ta;
        totalPaid += pd;
        totalDue += bd;

        return {
          purchase_date_bs: r.purchase_date_bs,
          purchase_date_ad: formatDateString(r.purchase_date_ad),
          purchase_code: r.purchase_code,
          bill_number: r.bill_number || '-',
          vendor_name: r.vendor_name,
          product_summary: r.product_summary,
          purchase_amount: pa,
          vat_amount: va,
          total_amount: ta,
          paid_amount: pd,
          balance_due: bd,
          payment_status: r.payment_status,
          vat_bill_status: r.vat_bill_status,
        };
      });

      return {
        title: 'Daily Purchases Report',
        columns: [
          { key: 'purchase_date_bs', label: 'Date (BS)', align: 'center', width: 12 },
          { key: 'purchase_date_ad', label: 'Date (AD)', align: 'center', width: 12 },
          { key: 'purchase_code', label: 'Voucher No', align: 'left', width: 14 },
          { key: 'bill_number', label: 'Bill No', align: 'left', width: 14 },
          { key: 'vendor_name', label: 'Vendor Name', align: 'left', width: 22 },
          { key: 'purchase_amount', label: 'Taxable Amt (NPR)', align: 'right', format: 'currency', width: 16 },
          { key: 'vat_amount', label: '13% VAT (NPR)', align: 'right', format: 'currency', width: 14 },
          { key: 'total_amount', label: 'Total (NPR)', align: 'right', format: 'currency', width: 16 },
          { key: 'paid_amount', label: 'Paid (NPR)', align: 'right', format: 'currency', width: 16 },
          { key: 'balance_due', label: 'Due (NPR)', align: 'right', format: 'currency', width: 16 },
          { key: 'payment_status', label: 'Payment Status', align: 'center', width: 14 },
          { key: 'vat_bill_status', label: 'VAT Status', align: 'center', width: 14 },
        ],
        rows,
        summary: {
          purchase_amount: totalPurchase,
          vat_amount: totalVat,
          total_amount: totalAmount,
          paid_amount: totalPaid,
          balance_due: totalDue,
        },
      };
    }

    case 'monthly-purchases': {
      const conditions: string[] = ['p.is_deleted = FALSE'];
      const params: any[] = [];

      if (filters.fiscalYear) {
        params.push(filters.fiscalYear);
        conditions.push(`p.fiscal_year = $${params.length}`);
      }

      const where = `WHERE ${conditions.join(' AND ')}`;
      const query = `
        SELECT
          SUBSTRING(p.purchase_date_bs FROM 1 FOR 7) AS bs_year_month,
          COUNT(*)::int AS bills_count,
          COALESCE(SUM(p.purchase_amount), 0)::numeric(14,2) AS purchase_amount,
          COALESCE(SUM(p.vat_amount), 0)::numeric(14,2) AS vat_amount,
          COALESCE(SUM(p.total_amount), 0)::numeric(14,2) AS total_amount,
          COALESCE(SUM(p.paid_amount), 0)::numeric(14,2) AS paid_amount,
          COALESCE(SUM(p.total_amount - p.paid_amount), 0)::numeric(14,2) AS outstanding_amount
        FROM purchases p
        ${where}
        GROUP BY SUBSTRING(p.purchase_date_bs FROM 1 FOR 7)
        ORDER BY bs_year_month DESC
      `;
      const res = await pool.query(query, params);

      let totalBills = 0;
      let totalPurchase = 0;
      let totalVat = 0;
      let totalAmount = 0;
      let totalPaid = 0;
      let totalDue = 0;

      const rows = res.rows.map((r) => {
        const parts = (r.bs_year_month || '').split('-');
        let monthLabel = r.bs_year_month;
        if (parts.length === 2) {
          const y = parts[0];
          const m = parseInt(parts[1], 10);
          const mName = BS_MONTH_NAMES[m - 1] || `Month ${m}`;
          monthLabel = `${mName} ${y}`;
        }

        const bc = Number(r.bills_count);
        const pa = Number(r.purchase_amount);
        const va = Number(r.vat_amount);
        const ta = Number(r.total_amount);
        const pd = Number(r.paid_amount);
        const od = Number(r.outstanding_amount);

        totalBills += bc;
        totalPurchase += pa;
        totalVat += va;
        totalAmount += ta;
        totalPaid += pd;
        totalDue += od;

        return {
          bs_year_month: r.bs_year_month,
          month_label: monthLabel,
          bills_count: bc,
          purchase_amount: pa,
          vat_amount: va,
          total_amount: ta,
          paid_amount: pd,
          outstanding_amount: od,
        };
      });

      return {
        title: 'Monthly Purchases Summary Report',
        columns: [
          { key: 'month_label', label: 'Nepali Month', align: 'left', width: 18 },
          { key: 'bs_year_month', label: 'Year-Month (BS)', align: 'center', width: 14 },
          { key: 'bills_count', label: 'Bills Count', align: 'right', format: 'number', width: 12 },
          { key: 'purchase_amount', label: 'Taxable Amt (NPR)', align: 'right', format: 'currency', width: 18 },
          { key: 'vat_amount', label: '13% VAT (NPR)', align: 'right', format: 'currency', width: 16 },
          { key: 'total_amount', label: 'Total Value (NPR)', align: 'right', format: 'currency', width: 18 },
          { key: 'paid_amount', label: 'Settled Amt (NPR)', align: 'right', format: 'currency', width: 18 },
          { key: 'outstanding_amount', label: 'Outstanding (NPR)', align: 'right', format: 'currency', width: 18 },
        ],
        rows,
        summary: {
          bills_count: totalBills,
          purchase_amount: totalPurchase,
          vat_amount: totalVat,
          total_amount: totalAmount,
          paid_amount: totalPaid,
          outstanding_amount: totalDue,
        },
      };
    }

    case 'vendor-purchases': {
      const joinConditions: string[] = ['p.is_deleted = FALSE'];
      const params: any[] = [];

      if (filters.fromAd && filters.toAd) {
        params.push(filters.fromAd, filters.toAd);
        joinConditions.push(`p.purchase_date_ad >= $${params.length - 1} AND p.purchase_date_ad <= $${params.length}`);
      }

      const joinOn = joinConditions.length > 0 ? ` AND ${joinConditions.join(' AND ')}` : '';
      const query = `
        SELECT
          v.id AS vendor_id,
          v.company_name,
          COALESCE(v.pan_number, v.vat_number, '-') AS pan_vat_no,
          v.contact_number,
          COUNT(p.id)::int AS bills_count,
          COALESCE(SUM(p.purchase_amount), 0)::numeric(14,2) AS purchase_amount,
          COALESCE(SUM(p.vat_amount), 0)::numeric(14,2) AS vat_amount,
          COALESCE(SUM(p.total_amount), 0)::numeric(14,2) AS total_amount,
          COALESCE(SUM(p.paid_amount), 0)::numeric(14,2) AS paid_amount,
          COALESCE(SUM(p.total_amount - p.paid_amount), 0)::numeric(14,2) AS outstanding_amount
        FROM vendors v
        LEFT JOIN purchases p ON v.id = p.vendor_id${joinOn}
        WHERE v.is_active = TRUE
        GROUP BY v.id, v.company_name, v.pan_number, v.vat_number, v.contact_number
        ORDER BY total_amount DESC, v.company_name ASC
      `;
      const res = await pool.query(query, params);

      let totalBills = 0;
      let totalPurchase = 0;
      let totalVat = 0;
      let totalAmount = 0;
      let totalPaid = 0;
      let totalDue = 0;

      const rows = res.rows.map((r) => {
        const bc = Number(r.bills_count);
        const pa = Number(r.purchase_amount);
        const va = Number(r.vat_amount);
        const ta = Number(r.total_amount);
        const pd = Number(r.paid_amount);
        const od = Number(r.outstanding_amount);

        totalBills += bc;
        totalPurchase += pa;
        totalVat += va;
        totalAmount += ta;
        totalPaid += pd;
        totalDue += od;

        return {
          vendor_name: r.company_name,
          pan_vat_no: r.pan_vat_no,
          contact_number: r.contact_number || '-',
          bills_count: bc,
          purchase_amount: pa,
          vat_amount: va,
          total_amount: ta,
          paid_amount: pd,
          outstanding_amount: od,
        };
      });

      return {
        title: 'Vendor-wise Purchases & Payable Report',
        columns: [
          { key: 'vendor_name', label: 'Vendor Name', align: 'left', width: 24 },
          { key: 'pan_vat_no', label: 'PAN/VAT No', align: 'center', width: 14 },
          { key: 'contact_number', label: 'Phone', align: 'center', width: 14 },
          { key: 'bills_count', label: 'Bills', align: 'right', format: 'number', width: 10 },
          { key: 'purchase_amount', label: 'Taxable Amt (NPR)', align: 'right', format: 'currency', width: 18 },
          { key: 'vat_amount', label: '13% VAT (NPR)', align: 'right', format: 'currency', width: 16 },
          { key: 'total_amount', label: 'Total Value (NPR)', align: 'right', format: 'currency', width: 18 },
          { key: 'paid_amount', label: 'Paid (NPR)', align: 'right', format: 'currency', width: 18 },
          { key: 'outstanding_amount', label: 'Balance Due (NPR)', align: 'right', format: 'currency', width: 18 },
        ],
        rows,
        summary: {
          bills_count: totalBills,
          purchase_amount: totalPurchase,
          vat_amount: totalVat,
          total_amount: totalAmount,
          paid_amount: totalPaid,
          outstanding_amount: totalDue,
        },
      };
    }

    case 'vat-pending': {
      const conditions: string[] = [
        'p.is_deleted = FALSE',
        "p.vat_bill_status IN ('VAT BILL PENDING', 'VAT BILL RECEIVED')",
      ];
      const params: any[] = [];

      const query = `
        SELECT
          p.id,
          p.purchase_code,
          p.bill_number,
          v.company_name AS vendor_name,
          v.contact_number,
          p.purchase_date_bs,
          p.purchase_date_ad,
          (CURRENT_DATE - p.purchase_date_ad)::int AS days_pending,
          p.purchase_amount::numeric(14,2) AS purchase_amount,
          p.vat_amount::numeric(14,2) AS vat_amount,
          p.total_amount::numeric(14,2) AS total_amount,
          p.vat_bill_status
        FROM purchases p
        JOIN vendors v ON p.vendor_id = v.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY days_pending DESC, p.id DESC
      `;
      const res = await pool.query(query, params);

      let totalVat = 0;
      let totalAmount = 0;

      const rows = res.rows.map((r) => {
        const va = Number(r.vat_amount);
        const ta = Number(r.total_amount);
        totalVat += va;
        totalAmount += ta;

        return {
          purchase_code: r.purchase_code,
          bill_number: r.bill_number || '-',
          vendor_name: r.vendor_name,
          contact_number: r.contact_number || '-',
          purchase_date_bs: r.purchase_date_bs,
          purchase_date_ad: formatDateString(r.purchase_date_ad),
          days_pending: Number(r.days_pending),
          vat_amount: va,
          total_amount: ta,
          vat_bill_status: r.vat_bill_status,
        };
      });

      return {
        title: 'Pending VAT Bills Aging Report',
        columns: [
          { key: 'purchase_code', label: 'Voucher No', align: 'left', width: 14 },
          { key: 'bill_number', label: 'Bill No', align: 'left', width: 14 },
          { key: 'vendor_name', label: 'Vendor Name', align: 'left', width: 22 },
          { key: 'contact_number', label: 'Contact Phone', align: 'center', width: 14 },
          { key: 'purchase_date_bs', label: 'Date (BS)', align: 'center', width: 12 },
          { key: 'days_pending', label: 'Days Pending', align: 'right', format: 'number', width: 12 },
          { key: 'vat_amount', label: 'Pending VAT (NPR)', align: 'right', format: 'currency', width: 16 },
          { key: 'total_amount', label: 'Total Bill (NPR)', align: 'right', format: 'currency', width: 16 },
          { key: 'vat_bill_status', label: 'Status', align: 'center', width: 16 },
        ],
        rows,
        summary: {
          days_pending: rows.length,
          vat_amount: totalVat,
          total_amount: totalAmount,
        },
      };
    }

    case 'payment-pending': {
      const conditions: string[] = [
        'p.is_deleted = FALSE',
        "p.payment_status IN ('PAYMENT PENDING', 'PARTIALLY PAID')",
      ];
      const params: any[] = [];

      const query = `
        SELECT
          p.id,
          p.purchase_code,
          p.bill_number,
          v.company_name AS vendor_name,
          v.contact_number,
          p.purchase_date_bs,
          p.purchase_date_ad,
          (CURRENT_DATE - p.purchase_date_ad)::int AS days_outstanding,
          p.total_amount::numeric(14,2) AS total_amount,
          p.paid_amount::numeric(14,2) AS paid_amount,
          (p.total_amount - p.paid_amount)::numeric(14,2) AS outstanding_amount,
          p.payment_status
        FROM purchases p
        JOIN vendors v ON p.vendor_id = v.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY outstanding_amount DESC
      `;
      const res = await pool.query(query, params);

      let totalAmount = 0;
      let totalPaid = 0;
      let totalDue = 0;

      const rows = res.rows.map((r) => {
        const ta = Number(r.total_amount);
        const pa = Number(r.paid_amount);
        const oa = Number(r.outstanding_amount);
        totalAmount += ta;
        totalPaid += pa;
        totalDue += oa;

        return {
          purchase_code: r.purchase_code,
          bill_number: r.bill_number || '-',
          vendor_name: r.vendor_name,
          contact_number: r.contact_number || '-',
          purchase_date_bs: r.purchase_date_bs,
          days_outstanding: Number(r.days_outstanding),
          total_amount: ta,
          paid_amount: pa,
          outstanding_amount: oa,
          payment_status: r.payment_status,
        };
      });

      return {
        title: 'Unpaid & Partially Paid Bills Report',
        columns: [
          { key: 'purchase_code', label: 'Voucher No', align: 'left', width: 14 },
          { key: 'bill_number', label: 'Bill No', align: 'left', width: 14 },
          { key: 'vendor_name', label: 'Vendor Name', align: 'left', width: 22 },
          { key: 'purchase_date_bs', label: 'Purchase Date (BS)', align: 'center', width: 14 },
          { key: 'days_outstanding', label: 'Days Due', align: 'right', format: 'number', width: 12 },
          { key: 'total_amount', label: 'Total Value (NPR)', align: 'right', format: 'currency', width: 16 },
          { key: 'paid_amount', label: 'Paid So Far (NPR)', align: 'right', format: 'currency', width: 16 },
          { key: 'outstanding_amount', label: 'Balance Due (NPR)', align: 'right', format: 'currency', width: 16 },
          { key: 'payment_status', label: 'Status', align: 'center', width: 16 },
        ],
        rows,
        summary: {
          total_amount: totalAmount,
          paid_amount: totalPaid,
          outstanding_amount: totalDue,
        },
      };
    }

    case 'paid-bills': {
      const conditions: string[] = ['p.is_deleted = FALSE', "p.payment_status = 'PAID'"];
      const params: any[] = [];

      const query = `
        SELECT
          p.id,
          p.purchase_code,
          p.bill_number,
          v.company_name AS vendor_name,
          p.purchase_date_bs,
          p.purchase_date_ad,
          p.paid_at,
          p.total_amount::numeric(14,2) AS total_amount,
          p.paid_amount::numeric(14,2) AS paid_amount
        FROM purchases p
        JOIN vendors v ON p.vendor_id = v.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY p.paid_at DESC NULLS LAST, p.id DESC
      `;
      const res = await pool.query(query, params);

      let totalAmount = 0;
      let totalPaid = 0;

      const rows = res.rows.map((r) => {
        const ta = Number(r.total_amount);
        const pa = Number(r.paid_amount);
        totalAmount += ta;
        totalPaid += pa;

        return {
          purchase_code: r.purchase_code,
          bill_number: r.bill_number || '-',
          vendor_name: r.vendor_name,
          purchase_date_bs: r.purchase_date_bs,
          purchase_date_ad: formatDateString(r.purchase_date_ad),
          paid_at: r.paid_at ? formatDateString(r.paid_at) : '-',
          total_amount: ta,
          paid_amount: pa,
        };
      });

      return {
        title: 'Settled & Fully Paid Purchases Report',
        columns: [
          { key: 'purchase_code', label: 'Voucher No', align: 'left', width: 14 },
          { key: 'bill_number', label: 'Bill No', align: 'left', width: 14 },
          { key: 'vendor_name', label: 'Vendor Name', align: 'left', width: 22 },
          { key: 'purchase_date_bs', label: 'Date (BS)', align: 'center', width: 14 },
          { key: 'paid_at', label: 'Settlement Date', align: 'center', width: 14 },
          { key: 'total_amount', label: 'Invoice Amt (NPR)', align: 'right', format: 'currency', width: 18 },
          { key: 'paid_amount', label: 'Settled Amt (NPR)', align: 'right', format: 'currency', width: 18 },
        ],
        rows,
        summary: {
          total_amount: totalAmount,
          paid_amount: totalPaid,
        },
      };
    }

    case 'vat-summary': {
      const conditions: string[] = ['p.is_deleted = FALSE'];
      const params: any[] = [];

      if (filters.fromAd && filters.toAd) {
        params.push(filters.fromAd, filters.toAd);
        conditions.push(`p.purchase_date_ad >= $${params.length - 1} AND p.purchase_date_ad <= $${params.length}`);
      }

      const query = `
        SELECT
          p.id,
          p.purchase_code,
          p.bill_number,
          v.company_name AS vendor_name,
          COALESCE(v.pan_number, v.vat_number, '-') AS pan_vat_no,
          p.purchase_date_bs,
          p.purchase_date_ad,
          p.tax_type,
          p.purchase_amount::numeric(14,2) AS purchase_amount,
          p.vat_amount::numeric(14,2) AS vat_amount,
          p.total_amount::numeric(14,2) AS total_amount,
          p.vat_bill_status
        FROM purchases p
        JOIN vendors v ON p.vendor_id = v.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY p.purchase_date_ad ASC, p.id ASC
      `;
      const res = await pool.query(query, params);

      let totalTaxable = 0;
      let totalVat = 0;
      let totalAmount = 0;
      let totalNonVat = 0;
      let verifiedVat = 0;
      let pendingVat = 0;

      const rows = res.rows.map((r) => {
        const pa = Number(r.purchase_amount);
        const va = Number(r.vat_amount);
        const ta = Number(r.total_amount);

        if (r.tax_type === 'NON_VAT') {
          totalNonVat += ta;
        } else {
          totalTaxable += pa;
          totalVat += va;
        }
        totalAmount += ta;

        if (r.vat_bill_status === 'VAT BILL VERIFIED') {
          verifiedVat += va;
        } else if (r.vat_bill_status === 'VAT BILL PENDING' || r.vat_bill_status === 'VAT BILL RECEIVED') {
          pendingVat += va;
        }

        return {
          purchase_code: r.purchase_code,
          bill_number: r.bill_number || '-',
          vendor_name: r.vendor_name,
          pan_vat_no: r.pan_vat_no,
          purchase_date_bs: r.purchase_date_bs,
          purchase_date_ad: formatDateString(r.purchase_date_ad),
          tax_type: r.tax_type,
          purchase_amount: pa,
          vat_amount: va,
          total_amount: ta,
          vat_bill_status: r.vat_bill_status,
        };
      });

      return {
        title: 'Purchase VAT Register & Tax Summary Report',
        columns: [
          { key: 'purchase_date_bs', label: 'Date (BS)', align: 'center', width: 12 },
          { key: 'bill_number', label: 'VAT Bill No', align: 'left', width: 14 },
          { key: 'vendor_name', label: 'Supplier Name', align: 'left', width: 22 },
          { key: 'pan_vat_no', label: 'PAN/VAT No', align: 'center', width: 14 },
          { key: 'tax_type', label: 'Tax Type', align: 'center', width: 12 },
          { key: 'purchase_amount', label: 'Taxable Purchase (NPR)', align: 'right', format: 'currency', width: 18 },
          { key: 'vat_amount', label: '13% Input VAT (NPR)', align: 'right', format: 'currency', width: 18 },
          { key: 'total_amount', label: 'Total Invoice (NPR)', align: 'right', format: 'currency', width: 18 },
          { key: 'vat_bill_status', label: 'Verification Status', align: 'center', width: 16 },
        ],
        rows,
        summary: {
          purchase_amount: totalTaxable,
          vat_amount: totalVat,
          total_amount: totalAmount,
          total_non_vat_amount: totalNonVat,
          verified_vat_amount: verifiedVat,
          pending_vat_amount: pendingVat,
        },
      };
    }

    // 8 Inventory Reports
    case 'product-stock': {
      const conditions: string[] = ['p.is_active = TRUE'];
      const params: any[] = [];

      if (filters.category) {
        params.push(filters.category);
        conditions.push(`p.category = $${params.length}`);
      }

      const query = `
        SELECT
          p.id,
          p.sku,
          p.name,
          COALESCE(p.category, '-') AS category,
          p.unit_of_measurement,
          p.current_stock::numeric(14,3) AS current_stock,
          p.min_stock_level::numeric(14,3) AS min_stock_level,
          p.avg_purchase_price::numeric(14,2) AS avg_purchase_price,
          (p.current_stock * p.avg_purchase_price)::numeric(14,2) AS valuation,
          CASE
            WHEN p.current_stock <= 0 THEN 'OUT_OF_STOCK'
            WHEN p.current_stock <= p.min_stock_level THEN 'LOW_STOCK'
            ELSE 'IN_STOCK'
          END AS stock_status
        FROM products p
        WHERE ${conditions.join(' AND ')}
        ORDER BY p.name ASC
      `;
      const res = await pool.query(query, params);

      let totalValuation = 0;
      let totalStock = 0;

      const rows = res.rows.map((r) => {
        const cs = Number(r.current_stock);
        const ms = Number(r.min_stock_level);
        const ap = Number(r.avg_purchase_price);
        const val = Number(r.valuation);

        totalValuation += val;
        totalStock += cs;

        return {
          sku: r.sku,
          name: r.name,
          category: r.category,
          unit_of_measurement: r.unit_of_measurement,
          current_stock: cs,
          min_stock_level: ms,
          avg_purchase_price: ap,
          stock_valuation: val,
          stock_status: r.stock_status,
        };
      });

      return {
        title: 'Current Product Stock & Valuation Report',
        columns: [
          { key: 'sku', label: 'SKU / Code', align: 'left', width: 14 },
          { key: 'name', label: 'Product Name', align: 'left', width: 26 },
          { key: 'category', label: 'Category', align: 'left', width: 16 },
          { key: 'unit_of_measurement', label: 'Unit', align: 'center', width: 10 },
          { key: 'current_stock', label: 'Current Qty', align: 'right', format: 'number', width: 14 },
          { key: 'min_stock_level', label: 'Min Level', align: 'right', format: 'number', width: 12 },
          { key: 'avg_purchase_price', label: 'Avg Unit Cost (NPR)', align: 'right', format: 'currency', width: 16 },
          { key: 'stock_valuation', label: 'Valuation (NPR)', align: 'right', format: 'currency', width: 18 },
          { key: 'stock_status', label: 'Status', align: 'center', width: 14 },
        ],
        rows,
        summary: {
          current_stock: totalStock,
          stock_valuation: totalValuation,
        },
      };
    }

    case 'stock-in': {
      const conditions: string[] = ["m.movement_type IN ('STOCK_IN', 'OPENING_STOCK', 'ADJUSTMENT_IN')"];
      const params: any[] = [];

      if (filters.fromAd && filters.toAd) {
        params.push(filters.fromAd, filters.toAd);
        conditions.push(`m.movement_date_ad >= $${params.length - 1} AND m.movement_date_ad <= $${params.length}`);
      }

      const query = `
        SELECT
          m.id,
          m.movement_date_bs,
          m.movement_date_ad,
          p.name AS product_name,
          p.sku,
          m.movement_type,
          COALESCE(m.reference_label, '-') AS reference_label,
          m.qty_in::numeric(14,3) AS qty_in,
          COALESCE(m.unit_cost, 0)::numeric(14,2) AS unit_cost,
          (m.qty_in * COALESCE(m.unit_cost, 0))::numeric(14,2) AS total_value,
          COALESCE(m.responsible_staff_name, '-') AS responsible_staff_name
        FROM inventory_movements m
        JOIN products p ON m.product_id = p.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY m.movement_date_ad DESC, m.id DESC
      `;
      const res = await pool.query(query, params);

      let totalQty = 0;
      let totalValue = 0;

      const rows = res.rows.map((r) => {
        const qi = Number(r.qty_in);
        const uc = Number(r.unit_cost);
        const tv = Number(r.total_value);
        totalQty += qi;
        totalValue += tv;

        return {
          movement_date_bs: r.movement_date_bs,
          movement_date_ad: formatDateString(r.movement_date_ad),
          product_name: r.product_name,
          sku: r.sku,
          movement_type: r.movement_type,
          reference_label: r.reference_label,
          qty_in: qi,
          unit_cost: uc,
          total_value: tv,
          responsible_staff_name: r.responsible_staff_name,
        };
      });

      return {
        title: 'Stock In & Inward Movements Log',
        columns: [
          { key: 'movement_date_bs', label: 'Date (BS)', align: 'center', width: 12 },
          { key: 'product_name', label: 'Product Name', align: 'left', width: 24 },
          { key: 'sku', label: 'SKU', align: 'left', width: 14 },
          { key: 'movement_type', label: 'Type', align: 'center', width: 14 },
          { key: 'reference_label', label: 'Reference / Voucher', align: 'left', width: 20 },
          { key: 'qty_in', label: 'Quantity In', align: 'right', format: 'number', width: 14 },
          { key: 'unit_cost', label: 'Unit Cost (NPR)', align: 'right', format: 'currency', width: 16 },
          { key: 'total_value', label: 'Total Value (NPR)', align: 'right', format: 'currency', width: 18 },
          { key: 'responsible_staff_name', label: 'Received By', align: 'left', width: 16 },
        ],
        rows,
        summary: {
          qty_in: totalQty,
          total_value: totalValue,
        },
      };
    }

    case 'stock-out': {
      const conditions: string[] = ["m.movement_type IN ('STOCK_OUT', 'ADJUSTMENT_OUT')"];
      const params: any[] = [];

      if (filters.fromAd && filters.toAd) {
        params.push(filters.fromAd, filters.toAd);
        conditions.push(`m.movement_date_ad >= $${params.length - 1} AND m.movement_date_ad <= $${params.length}`);
      }

      const query = `
        SELECT
          m.id,
          m.movement_date_bs,
          m.movement_date_ad,
          p.name AS product_name,
          p.sku,
          m.movement_type,
          m.reason,
          m.qty_out::numeric(14,3) AS qty_out,
          m.balance_after::numeric(14,3) AS balance_after,
          COALESCE(m.responsible_staff_name, '-') AS responsible_staff_name
        FROM inventory_movements m
        JOIN products p ON m.product_id = p.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY m.movement_date_ad DESC, m.id DESC
      `;
      const res = await pool.query(query, params);

      let totalQty = 0;

      const rows = res.rows.map((r) => {
        const qo = Number(r.qty_out);
        totalQty += qo;

        return {
          movement_date_bs: r.movement_date_bs,
          movement_date_ad: formatDateString(r.movement_date_ad),
          product_name: r.product_name,
          sku: r.sku,
          movement_type: r.movement_type,
          reason: r.reason,
          qty_out: qo,
          balance_after: Number(r.balance_after),
          responsible_staff_name: r.responsible_staff_name,
        };
      });

      return {
        title: 'Stock Out & Outward Movements Log',
        columns: [
          { key: 'movement_date_bs', label: 'Date (BS)', align: 'center', width: 12 },
          { key: 'product_name', label: 'Product Name', align: 'left', width: 24 },
          { key: 'sku', label: 'SKU', align: 'left', width: 14 },
          { key: 'movement_type', label: 'Type', align: 'center', width: 14 },
          { key: 'reason', label: 'Issue Reason', align: 'left', width: 18 },
          { key: 'qty_out', label: 'Issued Qty', align: 'right', format: 'number', width: 14 },
          { key: 'balance_after', label: 'Balance After', align: 'right', format: 'number', width: 14 },
          { key: 'responsible_staff_name', label: 'Issued By', align: 'left', width: 16 },
        ],
        rows,
        summary: {
          qty_out: totalQty,
        },
      };
    }

    case 'vendor-products': {
      const query = `
        SELECT
          v.company_name AS vendor_name,
          p.name AS product_name,
          p.sku,
          COALESCE(p.category, '-') AS category,
          p.unit_of_measurement,
          COALESCE(SUM(pi.quantity), 0)::numeric(14,3) AS total_qty_bought,
          COALESCE(AVG(pi.unit_price), 0)::numeric(14,2) AS avg_unit_price,
          COALESCE(MAX(pi.unit_price), 0)::numeric(14,2) AS latest_unit_price,
          COALESCE(SUM(pi.line_total), 0)::numeric(14,2) AS total_spend
        FROM purchase_items pi
        JOIN purchases pu ON pi.purchase_id = pu.id
        JOIN vendors v ON pu.vendor_id = v.id
        JOIN products p ON pi.product_id = p.id
        WHERE pu.is_deleted = FALSE
        GROUP BY v.company_name, p.name, p.sku, p.category, p.unit_of_measurement
        ORDER BY v.company_name ASC, total_spend DESC
      `;
      const res = await pool.query(query);

      let totalSpend = 0;
      const rows = res.rows.map((r) => {
        const ts = Number(r.total_spend);
        totalSpend += ts;
        return {
          vendor_name: r.vendor_name,
          product_name: r.product_name,
          sku: r.sku,
          category: r.category,
          unit_of_measurement: r.unit_of_measurement,
          total_qty_bought: Number(r.total_qty_bought),
          avg_unit_price: Number(r.avg_unit_price),
          latest_unit_price: Number(r.latest_unit_price),
          total_spend: ts,
        };
      });

      return {
        title: 'Vendor-wise Purchased Products Catalog',
        columns: [
          { key: 'vendor_name', label: 'Supplier / Vendor', align: 'left', width: 22 },
          { key: 'product_name', label: 'Product Name', align: 'left', width: 24 },
          { key: 'sku', label: 'SKU', align: 'left', width: 14 },
          { key: 'category', label: 'Category', align: 'left', width: 16 },
          { key: 'unit_of_measurement', label: 'Unit', align: 'center', width: 10 },
          { key: 'total_qty_bought', label: 'Total Qty Bought', align: 'right', format: 'number', width: 16 },
          { key: 'avg_unit_price', label: 'Avg Price (NPR)', align: 'right', format: 'currency', width: 16 },
          { key: 'latest_unit_price', label: 'Latest Price (NPR)', align: 'right', format: 'currency', width: 16 },
          { key: 'total_spend', label: 'Total Spend (NPR)', align: 'right', format: 'currency', width: 18 },
        ],
        rows,
        summary: {
          total_spend: totalSpend,
        },
      };
    }

    case 'monthly-inventory': {
      const query = `
        SELECT
          SUBSTRING(m.movement_date_bs FROM 1 FOR 7) AS bs_year_month,
          COUNT(m.id)::int AS movements_count,
          COALESCE(SUM(m.qty_in), 0)::numeric(14,3) AS stock_in_qty,
          COALESCE(SUM(m.qty_out), 0)::numeric(14,3) AS stock_out_qty,
          COALESCE(SUM(m.qty_in * COALESCE(m.unit_cost, 0)), 0)::numeric(14,2) AS total_in_value
        FROM inventory_movements m
        GROUP BY SUBSTRING(m.movement_date_bs FROM 1 FOR 7)
        ORDER BY bs_year_month DESC
      `;
      const res = await pool.query(query);

      let totalIn = 0;
      let totalOut = 0;
      let totalValue = 0;

      const rows = res.rows.map((r) => {
        const parts = (r.bs_year_month || '').split('-');
        let monthLabel = r.bs_year_month;
        if (parts.length === 2) {
          const y = parts[0];
          const m = parseInt(parts[1], 10);
          const mName = BS_MONTH_NAMES[m - 1] || `Month ${m}`;
          monthLabel = `${mName} ${y}`;
        }

        const inQty = Number(r.stock_in_qty);
        const outQty = Number(r.stock_out_qty);
        const inVal = Number(r.total_in_value);

        totalIn += inQty;
        totalOut += outQty;
        totalValue += inVal;

        return {
          bs_year_month: r.bs_year_month,
          month_label: monthLabel,
          movements_count: Number(r.movements_count),
          stock_in_qty: inQty,
          stock_out_qty: outQty,
          total_in_value: inVal,
        };
      });

      return {
        title: 'Monthly Inventory Flow Summary',
        columns: [
          { key: 'month_label', label: 'Nepali Month', align: 'left', width: 18 },
          { key: 'bs_year_month', label: 'Year-Month (BS)', align: 'center', width: 14 },
          { key: 'movements_count', label: 'Movements Count', align: 'right', format: 'number', width: 14 },
          { key: 'stock_in_qty', label: 'Stock In Qty', align: 'right', format: 'number', width: 16 },
          { key: 'stock_out_qty', label: 'Stock Out Qty', align: 'right', format: 'number', width: 16 },
          { key: 'total_in_value', label: 'Total Inflow Value (NPR)', align: 'right', format: 'currency', width: 20 },
        ],
        rows,
        summary: {
          stock_in_qty: totalIn,
          stock_out_qty: totalOut,
          total_in_value: totalValue,
        },
      };
    }

    case 'stock-valuation': {
      const query = `
        SELECT
          p.sku,
          p.name,
          COALESCE(p.category, '-') AS category,
          p.unit_of_measurement,
          p.current_stock::numeric(14,3) AS current_stock,
          p.avg_purchase_price::numeric(14,2) AS avg_purchase_price,
          p.latest_purchase_price::numeric(14,2) AS latest_purchase_price,
          (p.current_stock * p.avg_purchase_price)::numeric(14,2) AS valuation_avg_price,
          (p.current_stock * p.latest_purchase_price)::numeric(14,2) AS valuation_latest_price
        FROM products p
        WHERE p.is_active = TRUE AND p.current_stock > 0
        ORDER BY valuation_avg_price DESC
      `;
      const res = await pool.query(query);

      let totalAvgVal = 0;
      let totalLatestVal = 0;

      const rows = res.rows.map((r) => {
        const vav = Number(r.valuation_avg_price);
        const vlv = Number(r.valuation_latest_price);
        totalAvgVal += vav;
        totalLatestVal += vlv;

        return {
          sku: r.sku,
          name: r.name,
          category: r.category,
          unit_of_measurement: r.unit_of_measurement,
          current_stock: Number(r.current_stock),
          avg_purchase_price: Number(r.avg_purchase_price),
          latest_purchase_price: Number(r.latest_purchase_price),
          valuation_avg_price: vav,
          valuation_latest_price: vlv,
        };
      });

      return {
        title: 'Current Stock Valuation & Cost Basis Analysis',
        columns: [
          { key: 'sku', label: 'SKU', align: 'left', width: 14 },
          { key: 'name', label: 'Product Name', align: 'left', width: 26 },
          { key: 'category', label: 'Category', align: 'left', width: 16 },
          { key: 'current_stock', label: 'Current Qty', align: 'right', format: 'number', width: 14 },
          { key: 'avg_purchase_price', label: 'Avg Cost (NPR)', align: 'right', format: 'currency', width: 16 },
          { key: 'latest_purchase_price', label: 'Latest Cost (NPR)', align: 'right', format: 'currency', width: 16 },
          { key: 'valuation_avg_price', label: 'Valuation at Avg Cost (NPR)', align: 'right', format: 'currency', width: 22 },
          { key: 'valuation_latest_price', label: 'Valuation at Latest Cost (NPR)', align: 'right', format: 'currency', width: 22 },
        ],
        rows,
        summary: {
          valuation_avg_price: totalAvgVal,
          valuation_latest_price: totalLatestVal,
        },
      };
    }

    case 'low-stock': {
      const query = `
        SELECT
          p.sku,
          p.name,
          COALESCE(p.category, '-') AS category,
          p.unit_of_measurement,
          p.current_stock::numeric(14,3) AS current_stock,
          p.min_stock_level::numeric(14,3) AS min_stock_level,
          (p.min_stock_level - p.current_stock)::numeric(14,3) AS deficit_qty,
          p.avg_purchase_price::numeric(14,2) AS avg_purchase_price,
          ((p.min_stock_level - p.current_stock) * p.avg_purchase_price)::numeric(14,2) AS estimated_restock_cost
        FROM products p
        WHERE p.is_active = TRUE AND p.current_stock <= p.min_stock_level
        ORDER BY deficit_qty DESC
      `;
      const res = await pool.query(query);

      let totalCost = 0;
      let totalDeficit = 0;

      const rows = res.rows.map((r) => {
        const dq = Number(r.deficit_qty);
        const ec = Number(r.estimated_restock_cost);
        totalDeficit += dq;
        totalCost += ec;

        return {
          sku: r.sku,
          name: r.name,
          category: r.category,
          unit_of_measurement: r.unit_of_measurement,
          current_stock: Number(r.current_stock),
          min_stock_level: Number(r.min_stock_level),
          deficit_qty: dq,
          avg_purchase_price: Number(r.avg_purchase_price),
          estimated_restock_cost: ec,
        };
      });

      return {
        title: 'Low Stock & Reorder Alert Report',
        columns: [
          { key: 'sku', label: 'SKU', align: 'left', width: 14 },
          { key: 'name', label: 'Product Name', align: 'left', width: 26 },
          { key: 'category', label: 'Category', align: 'left', width: 16 },
          { key: 'unit_of_measurement', label: 'Unit', align: 'center', width: 10 },
          { key: 'current_stock', label: 'Current Qty', align: 'right', format: 'number', width: 12 },
          { key: 'min_stock_level', label: 'Min Level', align: 'right', format: 'number', width: 12 },
          { key: 'deficit_qty', label: 'Deficit Qty', align: 'right', format: 'number', width: 14 },
          { key: 'avg_purchase_price', label: 'Unit Cost (NPR)', align: 'right', format: 'currency', width: 16 },
          { key: 'estimated_restock_cost', label: 'Est. Restock Cost (NPR)', align: 'right', format: 'currency', width: 20 },
        ],
        rows,
        summary: {
          deficit_qty: totalDeficit,
          estimated_restock_cost: totalCost,
        },
      };
    }

    case 'stock-adjustments': {
      const conditions: string[] = ["m.movement_type IN ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT')"];
      const params: any[] = [];

      const query = `
        SELECT
          m.id,
          m.movement_date_bs,
          m.movement_date_ad,
          p.name AS product_name,
          p.sku,
          m.movement_type,
          m.reason,
          m.qty_in::numeric(14,3) AS qty_in,
          m.qty_out::numeric(14,3) AS qty_out,
          m.balance_after::numeric(14,3) AS balance_after,
          COALESCE(m.remarks, '-') AS remarks,
          COALESCE(m.responsible_staff_name, '-') AS responsible_staff_name
        FROM inventory_movements m
        JOIN products p ON m.product_id = p.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY m.movement_date_ad DESC, m.id DESC
      `;
      const res = await pool.query(query, params);

      let totalIn = 0;
      let totalOut = 0;

      const rows = res.rows.map((r) => {
        const qi = Number(r.qty_in);
        const qo = Number(r.qty_out);
        totalIn += qi;
        totalOut += qo;

        return {
          movement_date_bs: r.movement_date_bs,
          movement_date_ad: formatDateString(r.movement_date_ad),
          product_name: r.product_name,
          sku: r.sku,
          movement_type: r.movement_type,
          reason: r.reason,
          qty_in: qi,
          qty_out: qo,
          balance_after: Number(r.balance_after),
          remarks: r.remarks,
          responsible_staff_name: r.responsible_staff_name,
        };
      });

      return {
        title: 'Stock Adjustments & Corrections Audit Log',
        columns: [
          { key: 'movement_date_bs', label: 'Date (BS)', align: 'center', width: 12 },
          { key: 'product_name', label: 'Product Name', align: 'left', width: 24 },
          { key: 'sku', label: 'SKU', align: 'left', width: 14 },
          { key: 'movement_type', label: 'Adjustment Type', align: 'center', width: 16 },
          { key: 'reason', label: 'Reason', align: 'left', width: 18 },
          { key: 'qty_in', label: 'Adj In (+)', align: 'right', format: 'number', width: 12 },
          { key: 'qty_out', label: 'Adj Out (-)', align: 'right', format: 'number', width: 12 },
          { key: 'balance_after', label: 'Balance After', align: 'right', format: 'number', width: 14 },
          { key: 'remarks', label: 'Remarks', align: 'left', width: 22 },
          { key: 'responsible_staff_name', label: 'Staff', align: 'left', width: 16 },
        ],
        rows,
        summary: {
          qty_in: totalIn,
          qty_out: totalOut,
        },
      };
    }

    default:
      throw ApiError.badRequest(`Unsupported report type: "${reportType}"`);
  }
}

// 1. JSON Report Endpoint
reportsRouter.get('/:reportType', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reportType = req.params.reportType as ReportSlug;
    if (!VALID_REPORT_SLUGS.includes(reportType)) {
      throw ApiError.badRequest(
        `Invalid report type: "${reportType}". Supported reports: ${VALID_REPORT_SLUGS.join(', ')}`
      );
    }

    const filters = resolveReportFilters(req.query);
    const reportData = await generateReportData(reportType, filters);

    res.json({
      report_type: reportType,
      title: reportData.title,
      filters,
      columns: reportData.columns,
      rows: reportData.rows,
      summary: reportData.summary,
    });
  } catch (err) {
    next(err);
  }
});

// 2. Download / Export Endpoint
reportsRouter.get('/:reportType/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reportType = req.params.reportType as ReportSlug;
    if (!VALID_REPORT_SLUGS.includes(reportType)) {
      throw ApiError.badRequest(
        `Invalid report type: "${reportType}". Supported reports: ${VALID_REPORT_SLUGS.join(', ')}`
      );
    }

    const format = String(req.query.format || '').toLowerCase();
    if (!['xlsx', 'csv', 'pdf'].includes(format)) {
      throw ApiError.badRequest(`Unsupported export format: "${format}". Supported formats: xlsx, csv, pdf.`);
    }

    const filters = resolveReportFilters(req.query);
    const report = await generateReportData(reportType, filters);
    const company = await fetchCompanySettings();
    const now = getNowNpt();

    const exportPayload: ReportExportData = {
      title: report.title,
      companyName: company.company_name,
      companyAddress: company.company_address,
      companyPan: company.company_pan,
      filters: filters as Record<string, any>,
      generatedAt: `${now.dateBs} BS (${now.dateAd} AD ${now.timeNpt} NPT)`,
      columns: report.columns,
      rows: report.rows,
      summary: report.summary,
    };

    const filename = `${reportType}-${now.dateBs}.${format}`;

    if (format === 'csv') {
      const csvString = generateCsv(exportPayload);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(csvString);
    }

    if (format === 'xlsx') {
      const xlsxBuffer = await generateXlsx(exportPayload);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(xlsxBuffer);
    }

    if (format === 'pdf') {
      const pdfBuffer = await generatePdf(exportPayload);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(pdfBuffer);
    }
  } catch (err) {
    next(err);
  }
});
