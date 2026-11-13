import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';

export const searchRouter = Router();

// Search requires authentication
searchRouter.use(requireAuth);

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

searchRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawQ = req.query.q;
    const query = typeof rawQ === 'string' ? rawQ.trim() : '';

    if (!query) {
      return res.json({
        query: '',
        products: [],
        vendors: [],
        purchases: [],
      });
    }

    // Escape SQL LIKE wildcard characters to avoid syntax drift or wild matches
    const escaped = query.replace(/[%_\\]/g, '\\$&');
    const likePattern = `%${escaped}%`;

    // 1. Search Products
    const prodRes = await pool.query(
      `
      SELECT
        p.id,
        p.name,
        p.sku,
        p.category,
        p.brand,
        p.description,
        p.unit_of_measurement,
        p.current_stock::numeric(14,3) AS current_stock,
        p.min_stock_level::numeric(14,3) AS min_stock_level,
        p.avg_purchase_price::numeric(14,2) AS avg_purchase_price,
        p.latest_purchase_price::numeric(14,2) AS latest_purchase_price
      FROM products p
      WHERE (
        p.name ILIKE $1
        OR p.sku ILIKE $1
        OR COALESCE(p.category, '') ILIKE $1
        OR COALESCE(p.brand, '') ILIKE $1
        OR COALESCE(p.description, '') ILIKE $1
      ) AND p.is_active = TRUE
      ORDER BY p.name ASC
      LIMIT 20
    `,
      [likePattern]
    );

    // For matched products, find vendors bought from with contact and purchase history
    const productsWithVendors = await Promise.all(
      prodRes.rows.map(async (prod) => {
        const prodId = Number(prod.id);
        const vendorsRes = await pool.query(
          `
          SELECT
            v.id,
            v.company_name,
            v.pan_number,
            v.vat_number,
            v.contact_person,
            v.contact_number,
            v.alt_contact_number,
            v.email,
            COUNT(DISTINCT pu.id)::int AS purchase_count,
            MAX(pu.purchase_date_ad) AS last_purchase_date_ad,
            MAX(pu.purchase_date_bs) AS last_purchase_date_bs,
            COALESCE(SUM(pi.quantity), 0)::numeric(14,3) AS total_quantity_bought,
            COALESCE(MAX(pi.unit_price), 0)::numeric(14,2) AS latest_unit_price,
            ARRAY_AGG(DISTINCT pu.payment_status) AS payment_statuses,
            ARRAY_AGG(DISTINCT pu.vat_bill_status) AS vat_statuses
          FROM purchase_items pi
          JOIN purchases pu ON pi.purchase_id = pu.id
          JOIN vendors v ON pu.vendor_id = v.id
          WHERE pi.product_id = $1 AND pu.is_deleted = FALSE
          GROUP BY v.id, v.company_name, v.pan_number, v.vat_number, v.contact_person, v.contact_number, v.alt_contact_number, v.email
          ORDER BY purchase_count DESC
          LIMIT 10
        `,
          [prodId]
        );

        const vendors = vendorsRes.rows.map((v) => ({
          id: Number(v.id),
          company_name: v.company_name,
          pan_number: v.pan_number,
          vat_number: v.vat_number,
          contact_person: v.contact_person,
          contact_number: v.contact_number,
          tel_link: v.contact_number ? `tel:${v.contact_number.replace(/\s+/g, '')}` : null,
          alt_contact_number: v.alt_contact_number,
          email: v.email,
          purchase_count: Number(v.purchase_count),
          last_purchase_date_ad: formatDateString(v.last_purchase_date_ad),
          last_purchase_date_bs: v.last_purchase_date_bs,
          total_quantity_bought: Number(v.total_quantity_bought),
          latest_unit_price: Number(v.latest_unit_price),
          payment_statuses: v.payment_statuses || [],
          vat_statuses: v.vat_statuses || [],
        }));

        return {
          id: prodId,
          name: prod.name,
          sku: prod.sku,
          category: prod.category,
          brand: prod.brand,
          description: prod.description,
          unit_of_measurement: prod.unit_of_measurement,
          current_stock: Number(prod.current_stock),
          min_stock_level: Number(prod.min_stock_level),
          avg_purchase_price: Number(prod.avg_purchase_price),
          latest_purchase_price: Number(prod.latest_purchase_price),
          vendors,
        };
      })
    );

    // 2. Search Vendors
    const vendorRes = await pool.query(
      `
      SELECT
        v.id,
        v.company_name,
        v.pan_number,
        v.vat_number,
        v.contact_person,
        v.contact_number,
        v.alt_contact_number,
        v.address,
        v.email
      FROM vendors v
      WHERE (
        v.company_name ILIKE $1
        OR COALESCE(v.pan_number, '') ILIKE $1
        OR COALESCE(v.vat_number, '') ILIKE $1
        OR COALESCE(v.contact_number, '') ILIKE $1
        OR COALESCE(v.alt_contact_number, '') ILIKE $1
        OR COALESCE(v.contact_person, '') ILIKE $1
        OR COALESCE(v.email, '') ILIKE $1
      ) AND v.is_active = TRUE
      ORDER BY v.company_name ASC
      LIMIT 20
    `,
      [likePattern]
    );

    // For matched vendors, attach pending and recent purchases
    const vendorsWithPurchases = await Promise.all(
      vendorRes.rows.map(async (v) => {
        const vendorId = Number(v.id);
        const purchasesRes = await pool.query(
          `
          SELECT
            p.id,
            p.purchase_code,
            p.bill_number,
            p.product_summary,
            p.purchase_date_ad,
            p.purchase_date_bs,
            p.total_amount::numeric(14,2) AS total_amount,
            p.paid_amount::numeric(14,2) AS paid_amount,
            (p.total_amount - p.paid_amount)::numeric(14,2) AS outstanding_amount,
            p.vat_bill_status,
            p.payment_status,
            p.review_status
          FROM purchases p
          WHERE p.vendor_id = $1 AND p.is_deleted = FALSE
          ORDER BY p.purchase_date_ad DESC, p.id DESC
          LIMIT 5
        `,
          [vendorId]
        );

        const recent_purchases = purchasesRes.rows.map((p) => ({
          id: Number(p.id),
          purchase_code: p.purchase_code,
          bill_number: p.bill_number,
          product_summary: p.product_summary,
          purchase_date_ad: formatDateString(p.purchase_date_ad),
          purchase_date_bs: p.purchase_date_bs,
          total_amount: Number(p.total_amount),
          paid_amount: Number(p.paid_amount),
          outstanding_amount: Number(p.outstanding_amount),
          vat_bill_status: p.vat_bill_status,
          payment_status: p.payment_status,
          review_status: p.review_status,
        }));

        return {
          id: vendorId,
          company_name: v.company_name,
          pan_number: v.pan_number,
          vat_number: v.vat_number,
          contact_person: v.contact_person,
          contact_number: v.contact_number,
          tel_link: v.contact_number ? `tel:${v.contact_number.replace(/\s+/g, '')}` : null,
          alt_contact_number: v.alt_contact_number,
          address: v.address,
          email: v.email,
          recent_purchases,
        };
      })
    );

    // 3. Search Purchases
    const purchasesRes = await pool.query(
      `
      SELECT
        p.id,
        p.purchase_code,
        p.bill_number,
        p.product_summary,
        p.description,
        p.vendor_id,
        v.company_name AS vendor_name,
        p.purchase_date_ad,
        p.purchase_date_bs,
        p.entry_date_ad,
        p.entry_date_bs,
        p.entry_time_npt,
        p.total_amount::numeric(14,2) AS total_amount,
        p.paid_amount::numeric(14,2) AS paid_amount,
        p.vat_amount::numeric(14,2) AS vat_amount,
        p.tax_type,
        p.vat_bill_status,
        p.payment_status,
        p.review_status
      FROM purchases p
      JOIN vendors v ON p.vendor_id = v.id
      WHERE (
        COALESCE(p.bill_number, '') ILIKE $1
        OR p.purchase_code ILIKE $1
        OR p.product_summary ILIKE $1
        OR COALESCE(p.description, '') ILIKE $1
        OR COALESCE(p.remarks, '') ILIKE $1
        OR p.purchase_date_bs ILIKE $1
        OR CAST(p.purchase_date_ad AS TEXT) ILIKE $1
      ) AND p.is_deleted = FALSE
      ORDER BY p.purchase_date_ad DESC, p.id DESC
      LIMIT 20
    `,
      [likePattern]
    );

    const purchases = purchasesRes.rows.map((p) => ({
      id: Number(p.id),
      purchase_code: p.purchase_code,
      bill_number: p.bill_number,
      product_summary: p.product_summary,
      description: p.description,
      vendor_id: Number(p.vendor_id),
      vendor_name: p.vendor_name,
      purchase_date_ad: formatDateString(p.purchase_date_ad),
      purchase_date_bs: p.purchase_date_bs,
      entry_date_ad: formatDateString(p.entry_date_ad),
      entry_date_bs: p.entry_date_bs,
      entry_time_npt: p.entry_time_npt,
      total_amount: Number(p.total_amount),
      paid_amount: Number(p.paid_amount),
      vat_amount: Number(p.vat_amount),
      tax_type: p.tax_type,
      vat_bill_status: p.vat_bill_status,
      payment_status: p.payment_status,
      review_status: p.review_status,
    }));

    res.json({
      query,
      products: productsWithVendors,
      vendors: vendorsWithPurchases,
      purchases,
    });
  } catch (err) {
    next(err);
  }
});
