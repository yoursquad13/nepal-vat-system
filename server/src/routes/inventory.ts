import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../config/db.js';
import { logActivity } from '../utils/audit.js';
import { ApiError } from '../utils/errors.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { adToBs, bsToAd, getNowNpt } from '../utils/nepaliDate.js';

export const inventoryRouter = Router();

// All inventory endpoints require authentication
inventoryRouter.use(requireAuth);

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

export function formatProduct(row: any) {
  return {
    ...row,
    id: Number(row.id),
    min_stock_level: Number(row.min_stock_level),
    current_stock: Number(row.current_stock),
    avg_purchase_price: Number(row.avg_purchase_price),
    latest_purchase_price: Number(row.latest_purchase_price),
    total_purchased_qty: Number(row.total_purchased_qty),
    total_issued_qty: Number(row.total_issued_qty),
    created_by: row.created_by ? Number(row.created_by) : null,
  };
}

export function formatMovement(row: any) {
  return {
    ...row,
    id: Number(row.id),
    product_id: Number(row.product_id),
    purchase_id: row.purchase_id ? Number(row.purchase_id) : null,
    purchase_item_id: row.purchase_item_id ? Number(row.purchase_item_id) : null,
    reference_no: row.reference_label,
    qty_in: Number(row.qty_in),
    qty_out: Number(row.qty_out),
    quantity: Number(row.qty_in > 0 ? row.qty_in : row.qty_out),
    balance_after: Number(row.balance_after),
    unit_cost: row.unit_cost !== null && row.unit_cost !== undefined ? Number(row.unit_cost) : null,
    movement_date_ad: formatDateString(row.movement_date_ad),
    movement_date_bs: row.movement_date_bs,
    responsible_staff_id: row.responsible_staff_id ? Number(row.responsible_staff_id) : null,
    created_by: row.created_by ? Number(row.created_by) : null,
    vendor_id: row.vendor_id ? Number(row.vendor_id) : null,
  };
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
  };
}

// ==================== 1. RECEIVE PURCHASE STOCK HANDLER ====================

/**
 * POST /api/purchases/:id/receive-stock
 * Physical stock receipt for purchase line items.
 * Staff or Admin.
 * Strictly idempotent; requires purchase review_status === 'APPROVED'.
 * Works independently of vat_bill_status or payment_status.
 */
export async function receivePurchaseStockHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const purchaseId = Number(req.params.id);
    if (isNaN(purchaseId)) {
      throw ApiError.badRequest('Invalid purchase ID');
    }
    const body = req.body || {};

    const result = await withTransaction(async (client) => {
      // 1. Lock purchase row
      const purRes = await client.query(
        'SELECT * FROM purchases WHERE id = $1 AND is_deleted = FALSE FOR UPDATE',
        [purchaseId]
      );

      if (purRes.rows.length === 0) {
        throw ApiError.notFound('Purchase record not found');
      }

      const purchase = purRes.rows[0];

      // Fetch vendor name for reference label
      let vendorName = '';
      if (purchase.vendor_id) {
        const vRes = await client.query('SELECT company_name FROM vendors WHERE id = $1', [purchase.vendor_id]);
        if (vRes.rows.length > 0) {
          vendorName = vRes.rows[0].company_name;
        }
      }

      // 2. Review status guard: Only APPROVED purchases can receive stock
      if (purchase.review_status !== 'APPROVED') {
        throw ApiError.conflict('Only APPROVED purchases can receive stock into inventory');
      }

      // 3. Lock purchase items
      const itemsRes = await client.query(
        'SELECT * FROM purchase_items WHERE purchase_id = $1 ORDER BY id ASC FOR UPDATE',
        [purchaseId]
      );
      const items = itemsRes.rows;

      if (items.length === 0) {
        throw ApiError.badRequest('No line items on this purchase to receive into stock');
      }

      // Filter catalog-linked items
      const linkedItems = items.filter(
        (it: any) => it.product_id !== null && it.product_id !== undefined
      );
      if (linkedItems.length === 0) {
        throw ApiError.badRequest(
          'Cannot receive stock: purchase items are not linked to catalog products. Please link items to products first.'
        );
      }

      // Check pending unreceived linked items
      const pendingItems = linkedItems.filter((it: any) => !it.stock_received);
      if (pendingItems.length === 0) {
        throw ApiError.conflict('All linked items on this purchase have already been received into stock');
      }

      // 4. Lock products that need stock update in consistent ascending order
      const distinctProductIds = Array.from(
        new Set(pendingItems.map((it: any) => Number(it.product_id)))
      ).sort((a, b) => a - b);

      const productMap = new Map<number, any>();
      if (distinctProductIds.length > 0) {
        const prodRes = await client.query(
          'SELECT * FROM products WHERE id = ANY($1::bigint[]) ORDER BY id ASC FOR UPDATE',
          [distinctProductIds]
        );
        for (const p of prodRes.rows) {
          productMap.set(Number(p.id), p);
        }
      }

      // Verify all referenced products exist
      for (const pid of distinctProductIds) {
        if (!productMap.has(pid)) {
          throw ApiError.notFound(`Referenced product ID ${pid} not found`);
        }
      }

      // Determine movement dates
      let movementDateAd: string;
      let movementDateBs: string;

      if (body.movementDateAd || body.movement_date_ad) {
        movementDateAd = formatDateString(body.movementDateAd || body.movement_date_ad);
        movementDateBs = body.movementDateBs || body.movement_date_bs || adToBs(movementDateAd);
      } else if (purchase.purchase_date_ad) {
        movementDateAd = formatDateString(purchase.purchase_date_ad);
        movementDateBs = purchase.purchase_date_bs || adToBs(movementDateAd);
      } else {
        const nowNpt = getNowNpt();
        movementDateAd = nowNpt.dateAd;
        movementDateBs = nowNpt.dateBs;
      }

      const insertedMovements: any[] = [];
      const refLabel = `${purchase.purchase_code} ${vendorName}`.trim();

      // 5. Process each pending line item
      for (const item of pendingItems) {
        const pid = Number(item.product_id);
        const prod = productMap.get(pid)!;
        const qty = Number(item.quantity);
        const lineSubtotal = Number(item.line_subtotal);

        // VAT-exclusive net unit cost (subtotal / qty)
        const netUnitCost = qty > 0 ? Math.round((lineSubtotal / qty) * 100) / 100 : 0;
        const oldStock = Number(prod.current_stock);
        const oldAvg = Number(prod.avg_purchase_price);

        // Weighted average price calculation:
        // If oldStock > 0: ((oldStock * oldAvg) + (qty * netUnitCost)) / (oldStock + qty)
        // If oldStock <= 0: netUnitCost
        let newAvg: number;
        if (oldStock > 0) {
          newAvg = Math.round((((oldStock * oldAvg) + (qty * netUnitCost)) / (oldStock + qty)) * 100) / 100;
        } else {
          newAvg = netUnitCost;
        }

        const newStock = Math.round((oldStock + qty) * 1000) / 1000;
        const newPurchasedQty = Math.round((Number(prod.total_purchased_qty) + qty) * 1000) / 1000;

        // Update in-memory product cache for consecutive items
        prod.current_stock = newStock;
        prod.avg_purchase_price = newAvg;
        prod.latest_purchase_price = netUnitCost;
        prod.total_purchased_qty = newPurchasedQty;
        const balanceAfter = newStock;

        // Update product in database
        await client.query(
          `UPDATE products
           SET current_stock = $1,
               avg_purchase_price = $2,
               latest_purchase_price = $3,
               total_purchased_qty = $4,
               updated_at = NOW()
           WHERE id = $5`,
          [newStock, newAvg, netUnitCost, newPurchasedQty, pid]
        );

        // Insert immutable inventory movement record
        const movRes = await client.query(
          `INSERT INTO inventory_movements (
            product_id, purchase_id, purchase_item_id, movement_type, reason, reference_label,
            qty_in, qty_out, balance_after, unit_cost, movement_date_ad, movement_date_bs,
            responsible_staff_id, responsible_staff_name, remarks, created_by
          ) VALUES (
            $1, $2, $3, 'STOCK_IN', 'PURCHASE_RECEIPT', $4,
            $5, 0, $6, $7, $8, $9,
            $10, $11, $12, $13
          ) RETURNING *`,
          [
            pid,
            purchase.id,
            item.id,
            refLabel,
            qty,
            balanceAfter,
            netUnitCost,
            movementDateAd,
            movementDateBs,
            req.user?.id || null,
            req.user?.fullName || null,
            body.remarks || null,
            req.user?.id || null,
          ]
        );
        insertedMovements.push(movRes.rows[0]);

        // Log inventory activity
        await logActivity(client, {
          entityType: 'INVENTORY',
          entityId: pid,
          action: 'STOCK_IN',
          summary: `Stock in ${qty} ${item.unit_of_measurement} for ${prod.name} (${prod.sku}) from purchase ${purchase.purchase_code}`,
          oldValues: { current_stock: oldStock, avg_purchase_price: oldAvg },
          newValues: { current_stock: newStock, avg_purchase_price: newAvg, latest_purchase_price: netUnitCost },
          performedBy: req.user?.id,
          performedByName: req.user?.fullName,
        });

        // Mark this linked purchase item as stock_received = TRUE
        await client.query(
          `UPDATE purchase_items
           SET stock_received = TRUE,
               stock_received_at = NOW(),
               stock_received_by = $1,
               updated_at = NOW()
           WHERE id = $2`,
          [req.user?.id || null, item.id]
        );
      }

      // Log purchase activity
      await logActivity(client, {
        entityType: 'PURCHASE',
        entityId: purchase.id,
        action: 'PURCHASE_STOCK_RECEIVED',
        summary: `Physical stock received for ${pendingItems.length} item(s) on purchase ${purchase.purchase_code} by ${req.user?.fullName}`,
        performedBy: req.user?.id,
        performedByName: req.user?.fullName,
      });

      // Refetch purchase
      const updatedPurRes = await client.query('SELECT * FROM purchases WHERE id = $1', [purchaseId]);
      return {
        purchase: updatedPurRes.rows[0],
        receivedCount: pendingItems.length,
        movements: insertedMovements,
      };
    });

    res.status(200).json({
      success: true,
      message: `Physical stock received successfully for ${result.receivedCount} item(s)`,
      purchase_id: purchaseId,
      purchase: formatPurchase(result.purchase),
      received_items_count: result.receivedCount,
      movements: result.movements.map(formatMovement),
    });
  } catch (err) {
    next(err);
  }
}

// ==================== 2. STOCK OUT ====================

const stockOutSchema = z.object({
  productId: z.coerce.number().int().positive('Product ID is required'),
  quantity: z.coerce.number().positive('Quantity must be greater than 0'),
  reason: z.enum(['SOLD', 'INTERNAL_ISSUE', 'DAMAGED_EXPIRED', 'OTHER']),
  movementDateAd: z.string().trim().optional(),
  movementDateBs: z.string().trim().optional(),
  referenceNo: z.string().trim().optional().nullable(),
  remarks: z.string().trim().optional().nullable(),
  allowNegativeOverride: z.boolean().optional().default(false),
});

/**
 * POST /api/inventory/stock-out
 * Issue / sell stock from warehouse.
 * Staff or Admin.
 * Blocks negative stock for Staff; requires admin override flag + non-empty remarks for Admin.
 */
inventoryRouter.post(
  '/stock-out',
  validateBody(stockOutSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {
        productId,
        quantity,
        reason,
        movementDateAd,
        movementDateBs,
        referenceNo,
        remarks,
        allowNegativeOverride,
      } = req.body;

      const result = await withTransaction(async (client) => {
        // Lock product
        const prodRes = await client.query(
          'SELECT * FROM products WHERE id = $1 FOR UPDATE',
          [productId]
        );
        if (prodRes.rows.length === 0) {
          throw ApiError.notFound('Product not found');
        }

        const product = prodRes.rows[0];
        const oldStock = Number(product.current_stock);
        const newStock = Math.round((oldStock - quantity) * 1000) / 1000;

        // Negative stock check
        if (newStock < 0) {
          if (req.user?.role !== 'ADMIN') {
            throw ApiError.badRequest('Insufficient stock. Stock cannot go negative.');
          }
          if (!allowNegativeOverride) {
            throw ApiError.badRequest('Insufficient stock. Negative stock requires admin override.');
          }
          if (!remarks || remarks.trim() === '') {
            throw ApiError.badRequest('Admin override for negative stock requires non-empty remarks.');
          }
        }

        // Determine date
        let dateAd: string;
        let dateBs: string;
        if (movementDateAd) {
          dateAd = formatDateString(movementDateAd);
          dateBs = movementDateBs || adToBs(dateAd);
        } else if (movementDateBs) {
          dateBs = movementDateBs;
          dateAd = movementDateAd || bsToAd(dateBs);
        } else {
          const nowNpt = getNowNpt();
          dateAd = nowNpt.dateAd;
          dateBs = nowNpt.dateBs;
        }

        const newIssued = Math.round((Number(product.total_issued_qty) + quantity) * 1000) / 1000;

        // Update product
        const updRes = await client.query(
          `UPDATE products
           SET current_stock = $1,
               total_issued_qty = $2,
               updated_at = NOW()
           WHERE id = $3
           RETURNING *`,
          [newStock, newIssued, productId]
        );
        const updatedProduct = updRes.rows[0];

        // Cost used in stock-out movement is current avg_purchase_price (or latest)
        const unitCost = Number(product.avg_purchase_price) || Number(product.latest_purchase_price) || 0;
        const refLabel = referenceNo || remarks || 'Stock Issue';

        // Insert movement
        const movRes = await client.query(
          `INSERT INTO inventory_movements (
            product_id, movement_type, reason, reference_label,
            qty_in, qty_out, balance_after, unit_cost, movement_date_ad, movement_date_bs,
            responsible_staff_id, responsible_staff_name, remarks, created_by
          ) VALUES (
            $1, 'STOCK_OUT', $2, $3,
            0, $4, $5, $6, $7, $8,
            $9, $10, $11, $12
          ) RETURNING *`,
          [
            productId,
            reason,
            refLabel,
            quantity,
            newStock,
            unitCost,
            dateAd,
            dateBs,
            req.user?.id || null,
            req.user?.fullName || null,
            remarks || null,
            req.user?.id || null,
          ]
        );
        const movement = movRes.rows[0];

        // Log audit
        await logActivity(client, {
          entityType: 'INVENTORY',
          entityId: productId,
          action: 'STOCK_OUT',
          summary: `Stock out ${quantity} ${product.unit_of_measurement} for ${product.name} (${product.sku}) - Reason: ${reason}`,
          oldValues: { current_stock: oldStock },
          newValues: { current_stock: newStock, reason, remarks },
          performedBy: req.user?.id,
          performedByName: req.user?.fullName,
        });

        return { product: updatedProduct, movement };
      });

      res.status(200).json({
        success: true,
        message: 'Stock out recorded successfully',
        product: formatProduct(result.product),
        movement: formatMovement(result.movement),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ==================== 3. INVENTORY ADJUSTMENTS (ADMIN ONLY) ====================

const adjustmentSchema = z.object({
  productId: z.coerce.number().int().positive('Product ID is required'),
  type: z.enum(['OPENING_STOCK', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT']),
  quantity: z.coerce.number().positive('Quantity must be greater than 0'),
  unitCost: z.coerce.number().min(0).optional().nullable(),
  reason: z.string().trim().optional(),
  movementDateAd: z.string().trim().optional(),
  movementDateBs: z.string().trim().optional(),
  referenceNo: z.string().trim().optional().nullable(),
  remarks: z.string().trim().optional().nullable(),
  allowNegativeOverride: z.boolean().optional().default(false),
});

/**
 * POST /api/inventory/adjustments
 * Admin-only opening stock and physical count adjustments.
 */
inventoryRouter.post(
  '/adjustments',
  requireAdmin,
  validateBody(adjustmentSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {
        productId,
        type,
        quantity,
        unitCost,
        reason,
        movementDateAd,
        movementDateBs,
        referenceNo,
        remarks,
        allowNegativeOverride,
      } = req.body;

      const result = await withTransaction(async (client) => {
        // Lock product
        const prodRes = await client.query(
          'SELECT * FROM products WHERE id = $1 FOR UPDATE',
          [productId]
        );
        if (prodRes.rows.length === 0) {
          throw ApiError.notFound('Product not found');
        }

        const product = prodRes.rows[0];
        const oldStock = Number(product.current_stock);
        const oldAvg = Number(product.avg_purchase_price);

        let qtyIn = 0;
        let qtyOut = 0;
        let newStock = oldStock;

        if (type === 'OPENING_STOCK' || type === 'ADJUSTMENT_IN') {
          qtyIn = quantity;
          newStock = Math.round((oldStock + quantity) * 1000) / 1000;
        } else if (type === 'ADJUSTMENT_OUT') {
          qtyOut = quantity;
          newStock = Math.round((oldStock - quantity) * 1000) / 1000;
        }

        // Negative stock check
        if (newStock < 0) {
          if (!allowNegativeOverride) {
            throw ApiError.badRequest(
              'Adjustment would result in negative stock. Negative stock requires allowNegativeOverride: true.'
            );
          }
          if (!remarks || remarks.trim() === '') {
            throw ApiError.badRequest('Admin override for negative stock requires non-empty remarks.');
          }
        }

        // Cost update if unitCost supplied for OPENING_STOCK or ADJUSTMENT_IN
        let newAvg = oldAvg;
        let newLatest = Number(product.latest_purchase_price);

        if (unitCost !== undefined && unitCost !== null && (type === 'OPENING_STOCK' || type === 'ADJUSTMENT_IN')) {
          const cost = Number(unitCost);
          if (oldStock > 0) {
            newAvg = Math.round((((oldStock * oldAvg) + (quantity * cost)) / (oldStock + quantity)) * 100) / 100;
          } else {
            newAvg = cost;
          }
          newLatest = cost;
        }

        // Determine date
        let dateAd: string;
        let dateBs: string;
        if (movementDateAd) {
          dateAd = formatDateString(movementDateAd);
          dateBs = movementDateBs || adToBs(dateAd);
        } else if (movementDateBs) {
          dateBs = movementDateBs;
          dateAd = movementDateAd || bsToAd(dateBs);
        } else {
          const nowNpt = getNowNpt();
          dateAd = nowNpt.dateAd;
          dateBs = nowNpt.dateBs;
        }

        // Update product
        const updRes = await client.query(
          `UPDATE products
           SET current_stock = $1,
               avg_purchase_price = $2,
               latest_purchase_price = $3,
               updated_at = NOW()
           WHERE id = $4
           RETURNING *`,
          [newStock, newAvg, newLatest, productId]
        );
        const updatedProduct = updRes.rows[0];

        const defaultReason =
          type === 'OPENING_STOCK'
            ? 'OPENING_BALANCE'
            : type === 'ADJUSTMENT_IN'
            ? 'STOCK_ADJUSTMENT'
            : 'STOCK_ADJUSTMENT';
        const actualReason = reason || defaultReason;
        const movementUnitCost =
          unitCost !== undefined && unitCost !== null
            ? Number(unitCost)
            : Number(product.avg_purchase_price) || 0;
        const refLabel = referenceNo || remarks || type;

        // Insert movement
        const movRes = await client.query(
          `INSERT INTO inventory_movements (
            product_id, movement_type, reason, reference_label,
            qty_in, qty_out, balance_after, unit_cost, movement_date_ad, movement_date_bs,
            responsible_staff_id, responsible_staff_name, remarks, created_by
          ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14
          ) RETURNING *`,
          [
            productId,
            type,
            actualReason,
            refLabel,
            qtyIn,
            qtyOut,
            newStock,
            movementUnitCost,
            dateAd,
            dateBs,
            req.user?.id || null,
            req.user?.fullName || null,
            remarks || null,
            req.user?.id || null,
          ]
        );
        const movement = movRes.rows[0];

        // Audit log
        await logActivity(client, {
          entityType: 'INVENTORY',
          entityId: productId,
          action: type,
          summary: `Inventory ${type} of ${quantity} ${product.unit_of_measurement} for ${product.name} (${product.sku})`,
          oldValues: { current_stock: oldStock, avg_purchase_price: oldAvg },
          newValues: { current_stock: newStock, avg_purchase_price: newAvg, latest_purchase_price: newLatest },
          performedBy: req.user?.id,
          performedByName: req.user?.fullName,
        });

        return { product: updatedProduct, movement };
      });

      res.status(200).json({
        success: true,
        message: 'Inventory adjustment recorded successfully',
        product: formatProduct(result.product),
        movement: formatMovement(result.movement),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ==================== 4. INVENTORY DASHBOARD ====================

/**
 * GET /api/inventory/dashboard
 * Staff or Admin dashboard with KPIs, low-stock warnings, stock table and recent movements.
 */
inventoryRouter.get(
  '/dashboard',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // 1. KPI Queries
      const kpiSql = `
        SELECT
          COUNT(*) FILTER (WHERE is_active = TRUE) AS total_products,
          COALESCE(SUM(current_stock) FILTER (WHERE is_active = TRUE), 0) AS total_stock_quantity,
          COALESCE(SUM(current_stock * avg_purchase_price) FILTER (WHERE is_active = TRUE AND current_stock > 0), 0) AS total_inventory_valuation,
          COUNT(*) FILTER (WHERE is_active = TRUE AND current_stock > 0 AND current_stock <= min_stock_level) AS low_stock_count,
          COUNT(*) FILTER (WHERE is_active = TRUE AND current_stock <= 0) AS out_of_stock_count
        FROM products
      `;
      const kpiRes = await pool.query(kpiSql);
      const kpiRow = kpiRes.rows[0];

      const kpis = {
        total_products: Number(kpiRow.total_products || 0),
        total_stock_quantity: Number(kpiRow.total_stock_quantity || 0),
        total_inventory_valuation: Math.round(Number(kpiRow.total_inventory_valuation || 0) * 100) / 100,
        low_stock_count: Number(kpiRow.low_stock_count || 0),
        out_of_stock_count: Number(kpiRow.out_of_stock_count || 0),
      };

      // 2. Low-stock products list
      const lowStockSql = `
        SELECT
          p.*,
          CASE
            WHEN p.current_stock <= 0 THEN 'OUT_OF_STOCK'
            WHEN p.current_stock <= p.min_stock_level THEN 'LOW_STOCK'
            ELSE 'IN_STOCK'
          END AS stock_status,
          ROUND(GREATEST(0, (p.current_stock * p.avg_purchase_price))::numeric, 2) AS valuation
        FROM products p
        WHERE p.is_active = TRUE AND p.current_stock <= p.min_stock_level
        ORDER BY p.current_stock ASC, p.name ASC
        LIMIT 50
      `;
      const lowStockRes = await pool.query(lowStockSql);
      const lowStockProducts = lowStockRes.rows.map((row) => ({
        ...formatProduct(row),
        stock_status: row.stock_status,
        valuation: Number(row.valuation || 0),
      }));

      // 3. Stock Table (Active products)
      const stockTableSql = `
        SELECT
          p.*,
          CASE
            WHEN p.current_stock <= 0 THEN 'OUT_OF_STOCK'
            WHEN p.current_stock <= p.min_stock_level THEN 'LOW_STOCK'
            ELSE 'IN_STOCK'
          END AS stock_status,
          ROUND(GREATEST(0, (p.current_stock * p.avg_purchase_price))::numeric, 2) AS valuation
        FROM products p
        WHERE p.is_active = TRUE
        ORDER BY p.name ASC
        LIMIT 100
      `;
      const stockTableRes = await pool.query(stockTableSql);
      const stockTable = stockTableRes.rows.map((row) => ({
        ...formatProduct(row),
        stock_status: row.stock_status,
        valuation: Number(row.valuation || 0),
      }));

      // 4. Recent movements IN
      const recentInSql = `
        SELECT
          im.*,
          p.name AS product_name,
          p.sku,
          p.unit_of_measurement,
          pur.purchase_code,
          v.company_name AS vendor_name
        FROM inventory_movements im
        JOIN products p ON p.id = im.product_id
        LEFT JOIN purchases pur ON pur.id = im.purchase_id
        LEFT JOIN vendors v ON v.id = pur.vendor_id
        WHERE im.qty_in > 0
        ORDER BY im.movement_date_ad DESC, im.id DESC
        LIMIT 10
      `;
      const recentInRes = await pool.query(recentInSql);
      const recentIn = recentInRes.rows.map(formatMovement);

      // 5. Recent movements OUT
      const recentOutSql = `
        SELECT
          im.*,
          p.name AS product_name,
          p.sku,
          p.unit_of_measurement
        FROM inventory_movements im
        JOIN products p ON p.id = im.product_id
        WHERE im.qty_out > 0
        ORDER BY im.movement_date_ad DESC, im.id DESC
        LIMIT 10
      `;
      const recentOutRes = await pool.query(recentOutSql);
      const recentOut = recentOutRes.rows.map(formatMovement);

      res.status(200).json({
        kpis,
        ...kpis,
        low_stock_products: lowStockProducts,
        stock_table: stockTable,
        recent_movements: {
          in: recentIn,
          out: recentOut,
        },
        recent_in: recentIn,
        recent_out: recentOut,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ==================== 5. INVENTORY MOVEMENTS LIST ====================

/**
 * GET /api/inventory/movements
 * Search and filter stock movement ledger with pagination.
 */
inventoryRouter.get(
  '/movements',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const productId = req.query.productId || req.query.product_id;
      const type = req.query.type || req.query.movementType || req.query.movement_type;
      const category = req.query.category;
      let fromDate = typeof req.query.fromDate === 'string' ? req.query.fromDate.trim() : (typeof req.query.from_date === 'string' ? req.query.from_date.trim() : undefined);
      let toDate = typeof req.query.toDate === 'string' ? req.query.toDate.trim() : (typeof req.query.to_date === 'string' ? req.query.to_date.trim() : undefined);
      const fromBs = typeof req.query.fromBs === 'string' ? req.query.fromBs.trim() : (typeof req.query.from_bs === 'string' ? req.query.from_bs.trim() : undefined);
      const toBs = typeof req.query.toBs === 'string' ? req.query.toBs.trim() : (typeof req.query.to_bs === 'string' ? req.query.to_bs.trim() : undefined);

      if (!fromDate && fromBs) {
        try {
          fromDate = bsToAd(fromBs);
        } catch {
          // ignore invalid BS date
        }
      }
      if (!toDate && toBs) {
        try {
          toDate = bsToAd(toBs);
        } catch {
          // ignore invalid BS date
        }
      }

      const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
      const offset = (page - 1) * limit;

      const conditions: string[] = [];
      const values: any[] = [];
      let valIdx = 1;

      if (productId !== undefined && productId !== null && productId !== '') {
        const pid = Number(productId);
        if (!Number.isInteger(pid) || pid <= 0) {
          throw ApiError.badRequest('Invalid productId filter');
        }
        conditions.push(`im.product_id = $${valIdx++}`);
        values.push(pid);
      }

      if (type && typeof type === 'string') {
        conditions.push(`im.movement_type = $${valIdx++}`);
        values.push(type.trim());
      }

      if (category && typeof category === 'string') {
        conditions.push(`p.category = $${valIdx++}`);
        values.push(category.trim());
      }

      if (fromDate) {
        conditions.push(`im.movement_date_ad >= $${valIdx++}`);
        values.push(fromDate);
      }

      if (toDate) {
        conditions.push(`im.movement_date_ad <= $${valIdx++}`);
        values.push(toDate);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Count query
      const countSql = `
        SELECT COUNT(*)
        FROM inventory_movements im
        JOIN products p ON p.id = im.product_id
        ${whereClause}
      `;
      const countRes = await pool.query(countSql, values);
      const total = Number(countRes.rows[0].count);

      // Movements query
      const movementsSql = `
        SELECT
          im.*,
          p.name AS product_name,
          p.sku,
          p.category,
          p.unit_of_measurement,
          pur.purchase_code,
          v.id AS vendor_id,
          v.company_name AS vendor_name
        FROM inventory_movements im
        JOIN products p ON p.id = im.product_id
        LEFT JOIN purchases pur ON pur.id = im.purchase_id
        LEFT JOIN vendors v ON v.id = pur.vendor_id
        ${whereClause}
        ORDER BY im.movement_date_ad DESC, im.id DESC
        LIMIT $${valIdx++} OFFSET $${valIdx++}
      `;
      values.push(limit, offset);

      const movementsRes = await pool.query(movementsSql, values);
      const movements = movementsRes.rows.map(formatMovement);

      res.status(200).json({
        movements,
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      });
    } catch (err) {
      next(err);
    }
  }
);
