import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { pool } from '../config/db.js';
import { logActivity } from '../utils/audit.js';
import { ApiError } from '../utils/errors.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

export const productsRouter = Router();

// All product endpoints require authentication
productsRouter.use(requireAuth);

const createProductSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required'),
  sku: z.string().trim().min(1, 'SKU is required'),
  category: z.string().trim().optional().nullable(),
  brand: z.string().trim().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  unit_of_measurement: z.string().trim().optional().default('pcs'),
  min_stock_level: z.coerce.number().min(0, 'Minimum stock level cannot be negative').optional().default(0),
  current_stock: z.coerce.number().optional().default(0),
  avg_purchase_price: z.coerce.number().min(0).optional().default(0),
  latest_purchase_price: z.coerce.number().min(0).optional().default(0),
  is_active: z.boolean().optional().default(true),
});

const updateProductSchema = z.object({
  name: z.string().trim().min(1, 'Product name cannot be empty').optional(),
  sku: z.string().trim().min(1, 'SKU cannot be empty').optional(),
  category: z.string().trim().optional().nullable(),
  brand: z.string().trim().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  unit_of_measurement: z.string().trim().optional(),
  min_stock_level: z.coerce.number().min(0).optional(),
  current_stock: z.coerce.number().optional(),
  avg_purchase_price: z.coerce.number().min(0).optional(),
  latest_purchase_price: z.coerce.number().min(0).optional(),
  is_active: z.boolean().optional(),
});

function formatProduct(row: any) {
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

// GET /api/products - List, search & filter products
productsRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
      const stockStatus = typeof req.query.stockStatus === 'string' ? req.query.stockStatus.trim().toLowerCase() : '';
      const isActiveParam = req.query.is_active;

      const conditions: string[] = [];
      const values: any[] = [];
      let valIdx = 1;

      if (q) {
        conditions.push(`(
          p.name ILIKE $${valIdx} OR
          p.sku ILIKE $${valIdx} OR
          p.category ILIKE $${valIdx} OR
          p.brand ILIKE $${valIdx}
        )`);
        values.push(`%${q}%`);
        valIdx++;
      }

      if (category) {
        conditions.push(`p.category = $${valIdx}`);
        values.push(category);
        valIdx++;
      }

      if (stockStatus) {
        if (stockStatus === 'low') {
          conditions.push(`(p.current_stock > 0 AND p.current_stock <= p.min_stock_level)`);
        } else if (stockStatus === 'out') {
          conditions.push(`p.current_stock <= 0`);
        } else if (stockStatus === 'available') {
          conditions.push(`p.current_stock > p.min_stock_level`);
        }
      }

      if (isActiveParam !== undefined) {
        conditions.push(`p.is_active = $${valIdx}`);
        values.push(isActiveParam === 'true');
        valIdx++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const querySql = `
        SELECT
          p.id,
          p.name,
          p.sku,
          p.category,
          p.brand,
          p.description,
          p.unit_of_measurement,
          p.min_stock_level,
          p.current_stock,
          p.avg_purchase_price,
          p.latest_purchase_price,
          p.total_purchased_qty,
          p.total_issued_qty,
          p.is_active,
          p.created_by,
          p.created_at,
          p.updated_at
        FROM products p
        ${whereClause}
        ORDER BY p.name ASC
      `;

      const result = await pool.query(querySql, values);
      const products = result.rows.map(formatProduct);

      res.status(200).json({ products });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/products - Create product
productsRouter.post(
  '/',
  validateBody(createProductSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {
        name,
        sku,
        category,
        brand,
        description,
        unit_of_measurement,
        min_stock_level,
        current_stock,
        avg_purchase_price,
        latest_purchase_price,
        is_active,
      } = req.body;

      // Duplicate SKU check (case-insensitive)
      const skuCheck = await pool.query(
        'SELECT id FROM products WHERE LOWER(sku) = LOWER($1)',
        [sku]
      );
      if (skuCheck.rows.length > 0) {
        throw ApiError.conflict(`Product with SKU '${sku}' already exists`);
      }

      // Duplicate Name check (case-insensitive)
      const nameCheck = await pool.query(
        'SELECT id FROM products WHERE LOWER(name) = LOWER($1)',
        [name]
      );
      if (nameCheck.rows.length > 0) {
        throw ApiError.conflict(`Product with name '${name}' already exists`);
      }

      const createdBy = req.user?.id || null;

      const insertSql = `
        INSERT INTO products (
          name, sku, category, brand, description, unit_of_measurement,
          min_stock_level, current_stock, avg_purchase_price, latest_purchase_price,
          total_purchased_qty, total_issued_qty, is_active, created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10,
          $11, $12, $13, $14
        )
        RETURNING *
      `;

      const values = [
        name,
        sku,
        category || null,
        brand || null,
        description || null,
        unit_of_measurement || 'pcs',
        min_stock_level !== undefined ? min_stock_level : 0,
        current_stock !== undefined ? current_stock : 0,
        avg_purchase_price !== undefined ? avg_purchase_price : 0,
        latest_purchase_price !== undefined ? latest_purchase_price : 0,
        current_stock !== undefined ? current_stock : 0, // initial total_purchased_qty if starting stock
        0, // initial total_issued_qty
        is_active !== undefined ? is_active : true,
        createdBy,
      ];

      const result = await pool.query(insertSql, values);
      const newProduct = result.rows[0];

      await logActivity(pool, {
        entityType: 'PRODUCT',
        entityId: Number(newProduct.id),
        action: 'CREATE',
        summary: `Product ${newProduct.name} (${newProduct.sku}) created`,
        newValues: {
          id: Number(newProduct.id),
          name: newProduct.name,
          sku: newProduct.sku,
          category: newProduct.category,
          min_stock_level: Number(newProduct.min_stock_level),
          current_stock: Number(newProduct.current_stock),
        },
        performedBy: req.user?.id,
        performedByName: req.user?.fullName,
      });

      res.status(201).json({
        product: formatProduct(newProduct),
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/products/:id - Product profile + complete inventory movements ledger
productsRouter.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const productId = Number(req.params.id);
      if (isNaN(productId)) {
        throw ApiError.badRequest('Invalid product ID');
      }

      // 1. Fetch product
      const productRes = await pool.query('SELECT * FROM products WHERE id = $1', [productId]);
      if (productRes.rows.length === 0) {
        throw ApiError.notFound('Product not found');
      }
      const product = formatProduct(productRes.rows[0]);

      // 2. Fetch inventory movements with joined purchase_code and vendor_name
      const movementsSql = `
        SELECT
          im.id,
          im.product_id,
          im.purchase_id,
          im.purchase_item_id,
          im.movement_type,
          im.reason,
          im.reference_label,
          im.qty_in,
          im.qty_out,
          im.balance_after,
          im.unit_cost,
          im.movement_date_ad,
          im.movement_date_bs,
          im.responsible_staff_id,
          im.responsible_staff_name,
          im.remarks,
          im.created_by,
          im.created_at,
          p.purchase_code,
          v.company_name AS vendor_name,
          v.id AS vendor_id
        FROM inventory_movements im
        LEFT JOIN purchases p ON p.id = im.purchase_id
        LEFT JOIN vendors v ON v.id = p.vendor_id
        WHERE im.product_id = $1
        ORDER BY im.movement_date_ad ASC, im.id ASC
      `;

      const movementsRes = await pool.query(movementsSql, [productId]);
      const inventoryMovements = movementsRes.rows.map((row) => ({
        ...row,
        id: Number(row.id),
        product_id: Number(row.product_id),
        purchase_id: row.purchase_id ? Number(row.purchase_id) : null,
        purchase_item_id: row.purchase_item_id ? Number(row.purchase_item_id) : null,
        qty_in: Number(row.qty_in),
        qty_out: Number(row.qty_out),
        balance_after: Number(row.balance_after),
        unit_cost: row.unit_cost !== null && row.unit_cost !== undefined ? Number(row.unit_cost) : null,
        responsible_staff_id: row.responsible_staff_id ? Number(row.responsible_staff_id) : null,
        created_by: row.created_by ? Number(row.created_by) : null,
        vendor_id: row.vendor_id ? Number(row.vendor_id) : null,
      }));

      const productWithLedger = {
        ...product,
        inventory_movements: inventoryMovements,
      };

      res.status(200).json({
        product: productWithLedger,
        inventory_movements: inventoryMovements,
      });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/products/:id - Update product
productsRouter.patch(
  '/:id',
  validateBody(updateProductSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const productId = Number(req.params.id);
      if (isNaN(productId)) {
        throw ApiError.badRequest('Invalid product ID');
      }

      const existRes = await pool.query('SELECT * FROM products WHERE id = $1', [productId]);
      if (existRes.rows.length === 0) {
        throw ApiError.notFound('Product not found');
      }
      const oldProduct = existRes.rows[0];

      const { name, sku, category, brand, description, unit_of_measurement, min_stock_level, current_stock, avg_purchase_price, latest_purchase_price, is_active } = req.body;

      // Duplicate SKU check if SKU changed
      if (sku && sku.toLowerCase() !== oldProduct.sku.toLowerCase()) {
        const skuCheck = await pool.query(
          'SELECT id FROM products WHERE LOWER(sku) = LOWER($1) AND id != $2',
          [sku, productId]
        );
        if (skuCheck.rows.length > 0) {
          throw ApiError.conflict(`Product with SKU '${sku}' already exists`);
        }
      }

      // Duplicate Name check if Name changed
      if (name && name.toLowerCase() !== oldProduct.name.toLowerCase()) {
        const nameCheck = await pool.query(
          'SELECT id FROM products WHERE LOWER(name) = LOWER($1) AND id != $2',
          [name, productId]
        );
        if (nameCheck.rows.length > 0) {
          throw ApiError.conflict(`Product with name '${name}' already exists`);
        }
      }

      const updatableFields: Record<string, any> = {
        name,
        sku,
        category,
        brand,
        description,
        unit_of_measurement,
        min_stock_level,
        current_stock,
        avg_purchase_price,
        latest_purchase_price,
        is_active,
      };

      const setClauses: string[] = [];
      const values: any[] = [];
      let valIdx = 1;

      for (const [key, val] of Object.entries(updatableFields)) {
        if (val !== undefined) {
          setClauses.push(`${key} = $${valIdx++}`);
          values.push(val);
        }
      }

      if (setClauses.length === 0) {
        res.status(200).json({
          product: formatProduct(oldProduct),
        });
        return;
      }

      setClauses.push(`updated_at = NOW()`);
      values.push(productId);

      const updateSql = `
        UPDATE products
        SET ${setClauses.join(', ')}
        WHERE id = $${valIdx}
        RETURNING *
      `;

      const updateRes = await pool.query(updateSql, values);
      const updatedProduct = updateRes.rows[0];

      const action = is_active === false ? 'DEACTIVATE' : 'UPDATE';
      await logActivity(pool, {
        entityType: 'PRODUCT',
        entityId: Number(updatedProduct.id),
        action,
        summary: `Product ${updatedProduct.name} (${updatedProduct.sku}) ${action.toLowerCase()}d`,
        oldValues: {
          name: oldProduct.name,
          sku: oldProduct.sku,
          min_stock_level: Number(oldProduct.min_stock_level),
          is_active: oldProduct.is_active,
        },
        newValues: {
          name: updatedProduct.name,
          sku: updatedProduct.sku,
          min_stock_level: Number(updatedProduct.min_stock_level),
          is_active: updatedProduct.is_active,
        },
        performedBy: req.user?.id,
        performedByName: req.user?.fullName,
      });

      res.status(200).json({
        product: formatProduct(updatedProduct),
      });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/products/:id - Soft-deactivate product (Admin only)
productsRouter.delete(
  '/:id',
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const productId = Number(req.params.id);
      if (isNaN(productId)) {
        throw ApiError.badRequest('Invalid product ID');
      }

      const existRes = await pool.query('SELECT * FROM products WHERE id = $1', [productId]);
      if (existRes.rows.length === 0) {
        throw ApiError.notFound('Product not found');
      }
      const product = existRes.rows[0];

      await pool.query('UPDATE products SET is_active = FALSE, updated_at = NOW() WHERE id = $1', [productId]);

      await logActivity(pool, {
        entityType: 'PRODUCT',
        entityId: productId,
        action: 'DEACTIVATE',
        summary: `Product ${product.name} (${product.sku}) deactivated`,
        oldValues: { is_active: product.is_active },
        newValues: { is_active: false },
        performedBy: req.user?.id,
        performedByName: req.user?.fullName,
      });

      res.status(200).json({
        success: true,
        message: 'Product deactivated successfully',
      });
    } catch (err) {
      next(err);
    }
  }
);
