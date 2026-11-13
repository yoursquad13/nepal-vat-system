import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

process.env.NODE_ENV = 'test';
const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  'postgresql://anishkhatri@localhost:5432/nepal_vat_system_test';
process.env.DATABASE_URL = testDbUrl;

import { runMigrations } from '../src/db/migrate.js';
import { seedDatabase } from '../src/db/seed.js';
import { createApp } from '../src/app.js';

const testPool = new pg.Pool({ connectionString: testDbUrl });
const app = createApp();

let adminCookie: string;
let staffCookie: string;
let testVendorId: number;

test.before(async () => {
  await testPool.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await runMigrations(testDbUrl);
  await seedDatabase({ withDemo: true, databaseUrl: testDbUrl });

  // Login as admin
  const adminLogin = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'Admin@123' });
  const adminCookies = adminLogin.headers['set-cookie'];
  assert.ok(adminCookies, 'admin set-cookie header must be present');
  adminCookie = adminCookies.find((c: string) => c.startsWith('token='));

  // Login as staff
  const staffLogin = await request(app)
    .post('/api/auth/login')
    .send({ username: 'staff', password: 'Staff@123' });
  const staffCookies = staffLogin.headers['set-cookie'];
  assert.ok(staffCookies, 'staff set-cookie header must be present');
  staffCookie = staffCookies.find((c: string) => c.startsWith('token='));

  // Get demo vendor
  const vendorRes = await testPool.query('SELECT id FROM vendors ORDER BY id ASC LIMIT 1');
  testVendorId = Number(vendorRes.rows[0].id);
});

test.after(async () => {
  await testPool.end();
});

// ==================== AUTHENTICATION & ROLE GUARDS ====================

test('Inventory endpoints require authentication', async () => {
  const dashRes = await request(app).get('/api/inventory/dashboard');
  assert.equal(dashRes.status, 401, 'Unauthenticated GET /api/inventory/dashboard must return 401');

  const movRes = await request(app).get('/api/inventory/movements');
  assert.equal(movRes.status, 401, 'Unauthenticated GET /api/inventory/movements must return 401');

  const outRes = await request(app)
    .post('/api/inventory/stock-out')
    .send({ productId: 1, quantity: 5, reason: 'SOLD' });
  assert.equal(outRes.status, 401, 'Unauthenticated POST /api/inventory/stock-out must return 401');

  const adjRes = await request(app)
    .post('/api/inventory/adjustments')
    .send({ productId: 1, type: 'ADJUSTMENT_IN', quantity: 5 });
  assert.equal(adjRes.status, 401, 'Unauthenticated POST /api/inventory/adjustments must return 401');

  const recRes = await request(app)
    .post('/api/purchases/1/receive-stock')
    .send({});
  assert.equal(recRes.status, 401, 'Unauthenticated POST /api/purchases/:id/receive-stock must return 401');
});

test('Role restrictions: Staff gets 403 on adjustments; Staff can access stock-out and dashboard', async () => {
  // Staff calling adjustments -> 403 Forbidden
  const staffAdjRes = await request(app)
    .post('/api/inventory/adjustments')
    .set('Cookie', staffCookie)
    .send({ productId: 1, type: 'ADJUSTMENT_IN', quantity: 5 });
  assert.equal(staffAdjRes.status, 403, 'Staff must receive 403 Forbidden on adjustments');

  // Staff calling dashboard -> 200 OK
  const staffDashRes = await request(app)
    .get('/api/inventory/dashboard')
    .set('Cookie', staffCookie);
  assert.equal(staffDashRes.status, 200, 'Staff must be allowed to view inventory dashboard');
});

// ==================== PHYSICAL STOCK RECEIPT (IDEMPOTENCY & WEIGHTED COST) ====================

test('Unapproved purchase (PENDING_REVIEW) cannot receive stock (409 Conflict)', async () => {
  // 1. Create a dedicated product
  const prodRes = await request(app)
    .post('/api/products')
    .set('Cookie', adminCookie)
    .send({
      name: 'Unapproved Test Cement',
      sku: 'SKU-UNAPP-001',
      current_stock: 10,
      avg_purchase_price: 500,
      latest_purchase_price: 500,
      unit_of_measurement: 'bag',
    });
  assert.equal(prodRes.status, 201);
  const productId = prodRes.body.product.id;

  // 2. Staff creates a purchase with line item (PENDING_REVIEW)
  const purRes = await request(app)
    .post('/api/purchases')
    .set('Cookie', staffCookie)
    .send({
      vendor_id: testVendorId,
      bill_number: 'BILL-UNAPP-01',
      purchase_date_bs: '2083-07-20',
      product_summary: 'Unapproved purchase test item',
      tax_type: 'VAT_13',
      vat_calc_mode: 'EXCLUSIVE',
      items: [
        {
          product_id: productId,
          product_name: 'Unapproved Test Cement',
          sku: 'SKU-UNAPP-001',
          quantity: 20,
          unit_of_measurement: 'bag',
          unit_price: 600,
        },
      ],
    });
  assert.equal(purRes.status, 201);
  const purchaseId = purRes.body.purchase.id;
  assert.equal(purRes.body.purchase.review_status, 'PENDING_REVIEW');

  // 3. Attempt physical stock receipt -> 409 Conflict
  const recRes = await request(app)
    .post(`/api/purchases/${purchaseId}/receive-stock`)
    .set('Cookie', staffCookie)
    .send({});
  assert.equal(recRes.status, 409, 'Unapproved purchase cannot receive stock');

  // Verify stock did not change
  const checkProd = await testPool.query('SELECT current_stock FROM products WHERE id = $1', [productId]);
  assert.equal(Number(checkProd.rows[0].current_stock), 10, 'Stock must remain unchanged');
});

test('Purchase with no line items returns 400/409 on receive-stock', async () => {
  // Create a purchase without line items
  const purRes = await request(app)
    .post('/api/purchases')
    .set('Cookie', staffCookie)
    .send({
      vendor_id: testVendorId,
      bill_number: 'BILL-NOLINES-01',
      purchase_date_bs: '2083-07-20',
      product_summary: 'Lump-sum service work without items',
      tax_type: 'VAT_13',
      vat_calc_mode: 'EXCLUSIVE',
      entered_amount: 10000,
    });
  assert.equal(purRes.status, 201);
  const purchaseId = purRes.body.purchase.id;

  // Admin approves it
  const appRes = await request(app)
    .post(`/api/purchases/${purchaseId}/approve`)
    .set('Cookie', adminCookie)
    .send({ admin_remarks: 'Approved header-only bill' });
  assert.equal(appRes.status, 200);

  // Attempt stock receive -> 400 or 409
  const recRes = await request(app)
    .post(`/api/purchases/${purchaseId}/receive-stock`)
    .set('Cookie', staffCookie)
    .send({});
  assert.ok(
    recRes.status === 400 || recRes.status === 409,
    `Empty line items must return 400 or 409 (got ${recRes.status})`
  );
});

test('Approved purchase with VAT BILL PENDING & PAYMENT PENDING receives stock, calculates weighted avg, and is strictly idempotent', async () => {
  // 1. Create a product with initial stock = 50 and avg_purchase_price = 100.00
  const prodRes = await request(app)
    .post('/api/products')
    .set('Cookie', adminCookie)
    .send({
      name: 'Weighted Paint Primer',
      sku: 'SKU-W-PAINT-001',
      current_stock: 50,
      avg_purchase_price: 100.0,
      latest_purchase_price: 100.0,
      unit_of_measurement: 'litre',
    });
  assert.equal(prodRes.status, 201);
  const productId = prodRes.body.product.id;

  // 2. Staff creates purchase: 100 litres @ Rs 160.00 net unit price (EXCLUSIVE)
  // line_subtotal = 16,000.00, VAT = 2,080.00, total = 18,080.00
  const purRes = await request(app)
    .post('/api/purchases')
    .set('Cookie', staffCookie)
    .send({
      vendor_id: testVendorId,
      bill_number: 'BILL-WEIGHTED-01',
      purchase_date_bs: '2083-07-21',
      product_summary: '100 Litres Primer',
      tax_type: 'VAT_13',
      vat_calc_mode: 'EXCLUSIVE',
      items: [
        {
          product_id: productId,
          product_name: 'Weighted Paint Primer',
          sku: 'SKU-W-PAINT-001',
          quantity: 100,
          unit_of_measurement: 'litre',
          unit_price: 160.0,
        },
      ],
    });
  assert.equal(purRes.status, 201);
  const purchaseId = purRes.body.purchase.id;

  // 3. Admin approves purchase WITHOUT vat bill and WITHOUT payment
  const appRes = await request(app)
    .post(`/api/purchases/${purchaseId}/approve`)
    .set('Cookie', adminCookie)
    .send({ admin_remarks: 'Approved for delivery' });
  assert.equal(appRes.status, 200);
  assert.equal(appRes.body.purchase.review_status, 'APPROVED');
  assert.equal(appRes.body.purchase.vat_bill_status, 'VAT BILL PENDING');
  assert.equal(Number(appRes.body.purchase.paid_amount), 0, 'No payment recorded yet');

  // 4. Staff receives physical stock
  const recRes = await request(app)
    .post(`/api/purchases/${purchaseId}/receive-stock`)
    .set('Cookie', staffCookie)
    .send({ remarks: 'Received at Central Warehouse' });
  assert.equal(recRes.status, 200, 'Approved purchase must receive stock even if VAT bill/payment pending');

  // 5. Verify product stock & weighted average price:
  // old_stock = 50 @ 100.00 = 5,000.00
  // new_stock_in = 100 @ 160.00 = 16,000.00
  // total_val = 21,000.00 / 150 = 140.00
  const prodCheck = await testPool.query('SELECT * FROM products WHERE id = $1', [productId]);
  const updatedProduct = prodCheck.rows[0];
  assert.equal(Number(updatedProduct.current_stock), 150, 'current_stock must increase from 50 to 150');
  assert.equal(Number(updatedProduct.avg_purchase_price), 140.0, 'avg_purchase_price must be weighted 140.00');
  assert.equal(Number(updatedProduct.latest_purchase_price), 160.0, 'latest_purchase_price must be 160.00');
  assert.equal(Number(updatedProduct.total_purchased_qty), 150, 'total_purchased_qty must be 150 (initial 50 + received 100)');

  // 6. Verify purchase_items status
  const itemCheck = await testPool.query('SELECT * FROM purchase_items WHERE purchase_id = $1', [purchaseId]);
  assert.equal(itemCheck.rows.length, 1);
  assert.equal(itemCheck.rows[0].stock_received, true, 'stock_received must be true');
  assert.ok(itemCheck.rows[0].stock_received_at, 'stock_received_at must be populated');
  assert.ok(itemCheck.rows[0].stock_received_by, 'stock_received_by must be set');

  // 7. Verify inventory_movements ledger entry
  const movCheck = await testPool.query(
    'SELECT * FROM inventory_movements WHERE purchase_id = $1',
    [purchaseId]
  );
  assert.equal(movCheck.rows.length, 1, 'Exactly one STOCK_IN movement must be recorded');
  const movement = movCheck.rows[0];
  assert.equal(movement.movement_type, 'STOCK_IN');
  assert.equal(movement.reason, 'PURCHASE_RECEIPT');
  assert.equal(Number(movement.qty_in), 100);
  assert.equal(Number(movement.qty_out), 0);
  assert.equal(Number(movement.balance_after), 150);
  assert.equal(Number(movement.unit_cost), 160.0);
  assert.ok(movement.reference_label.includes(purRes.body.purchase.purchase_code));

  // 8. IDEMPOTENCY: Calling receive-stock again must return 409 Conflict
  const recRes2 = await request(app)
    .post(`/api/purchases/${purchaseId}/receive-stock`)
    .set('Cookie', staffCookie)
    .send({});
  assert.equal(recRes2.status, 409, 'Subsequent receive-stock call must return 409 Conflict');

  // Verify stock was NOT incremented again
  const prodCheck2 = await testPool.query('SELECT * FROM products WHERE id = $1', [productId]);
  assert.equal(Number(prodCheck2.rows[0].current_stock), 150, 'current_stock must stay at 150');

  // Verify no duplicate movement was added
  const movCount = await testPool.query(
    'SELECT COUNT(*) FROM inventory_movements WHERE purchase_id = $1',
    [purchaseId]
  );
  assert.equal(Number(movCount.rows[0].count), 1, 'Must still have exactly 1 movement');
});

// ==================== STOCK OUT & NEGATIVE STOCK GUARDS ====================

test('Stock-out: Staff can issue available stock; Staff blocked on negative stock', async () => {
  // 1. Create product with stock = 20
  const prodRes = await request(app)
    .post('/api/products')
    .set('Cookie', adminCookie)
    .send({
      name: 'Safety Helmets Yellow',
      sku: 'SKU-HELMET-001',
      current_stock: 20,
      avg_purchase_price: 350,
      unit_of_measurement: 'pcs',
    });
  assert.equal(prodRes.status, 201);
  const productId = prodRes.body.product.id;

  // 2. Staff issues 5 helmets (Valid)
  const outRes = await request(app)
    .post('/api/inventory/stock-out')
    .set('Cookie', staffCookie)
    .send({
      productId,
      quantity: 5,
      reason: 'INTERNAL_ISSUE',
      remarks: 'Issued to Site A electrical team',
    });
  assert.equal(outRes.status, 200, 'Valid stock-out by Staff must succeed');
  assert.equal(outRes.body.product.current_stock, 15);

  // 3. Staff attempts to issue 20 helmets (insufficient stock: 15 available)
  const failRes1 = await request(app)
    .post('/api/inventory/stock-out')
    .set('Cookie', staffCookie)
    .send({
      productId,
      quantity: 20,
      reason: 'SOLD',
    });
  assert.equal(failRes1.status, 400, 'Staff must be blocked from causing negative stock');

  // 4. Staff attempts negative stock even with allowNegativeOverride: true -> still blocked!
  const failRes2 = await request(app)
    .post('/api/inventory/stock-out')
    .set('Cookie', staffCookie)
    .send({
      productId,
      quantity: 20,
      reason: 'SOLD',
      allowNegativeOverride: true,
      remarks: 'Staff override attempt',
    });
  assert.equal(failRes2.status, 400, 'Staff cannot use allowNegativeOverride');

  // Verify stock remained 15
  const prodCheck = await testPool.query('SELECT current_stock FROM products WHERE id = $1', [productId]);
  assert.equal(Number(prodCheck.rows[0].current_stock), 15);
});

test('Stock-out: Admin negative stock override requires allowNegativeOverride: true AND non-empty remarks', async () => {
  // Create product with stock = 10
  const prodRes = await request(app)
    .post('/api/products')
    .set('Cookie', adminCookie)
    .send({
      name: 'Emergency Oxygen Cylinders',
      sku: 'SKU-O2-001',
      current_stock: 10,
      avg_purchase_price: 2500,
      unit_of_measurement: 'cylinder',
    });
  assert.equal(prodRes.status, 201);
  const productId = prodRes.body.product.id;

  // 1. Admin attempts to issue 15 without allowNegativeOverride -> 400
  const failRes1 = await request(app)
    .post('/api/inventory/stock-out')
    .set('Cookie', adminCookie)
    .send({
      productId,
      quantity: 15,
      reason: 'INTERNAL_ISSUE',
      remarks: 'Emergency issue',
    });
  assert.equal(failRes1.status, 400, 'Admin without override flag must be blocked');

  // 2. Admin attempts with allowNegativeOverride: true but empty remarks -> 400
  const failRes2 = await request(app)
    .post('/api/inventory/stock-out')
    .set('Cookie', adminCookie)
    .send({
      productId,
      quantity: 15,
      reason: 'INTERNAL_ISSUE',
      allowNegativeOverride: true,
      remarks: '',
    });
  assert.equal(failRes2.status, 400, 'Admin override without remarks must be blocked');

  // 3. Admin attempts with allowNegativeOverride: true AND non-empty remarks -> 200 OK
  const okRes = await request(app)
    .post('/api/inventory/stock-out')
    .set('Cookie', adminCookie)
    .send({
      productId,
      quantity: 15,
      reason: 'INTERNAL_ISSUE',
      allowNegativeOverride: true,
      remarks: 'Authorized emergency dispatch prior to paper GRN entry',
    });
  assert.equal(okRes.status, 200, 'Admin override with valid remarks must succeed');
  assert.equal(okRes.body.product.current_stock, -5, 'Stock should reflect -5');

  // Verify movement recorded balance_after = -5
  const movRes = await testPool.query(
    "SELECT * FROM inventory_movements WHERE product_id = $1 AND movement_type = 'STOCK_OUT' ORDER BY id DESC LIMIT 1",
    [productId]
  );
  assert.equal(Number(movRes.rows[0].balance_after), -5);
  assert.equal(Number(movRes.rows[0].qty_out), 15);
});

// ==================== INVENTORY ADJUSTMENTS (ADMIN ONLY) ====================

test('POST /api/inventory/adjustments: Admin can perform OPENING_STOCK, ADJUSTMENT_IN, and ADJUSTMENT_OUT', async () => {
  // 1. Create new product with 0 stock
  const prodRes = await request(app)
    .post('/api/products')
    .set('Cookie', adminCookie)
    .send({
      name: 'Adjustable LED Panels',
      sku: 'SKU-LED-ADJ-001',
      current_stock: 0,
      avg_purchase_price: 0,
      unit_of_measurement: 'pcs',
    });
  assert.equal(prodRes.status, 201);
  const productId = prodRes.body.product.id;

  // 2. Admin sets OPENING_STOCK: 80 pcs @ Rs 450.00
  const openRes = await request(app)
    .post('/api/inventory/adjustments')
    .set('Cookie', adminCookie)
    .send({
      productId,
      type: 'OPENING_STOCK',
      quantity: 80,
      unitCost: 450.0,
      remarks: 'Initial physical inventory count',
    });
  assert.equal(openRes.status, 200);
  assert.equal(openRes.body.product.current_stock, 80);
  assert.equal(openRes.body.product.avg_purchase_price, 450.0);
  assert.equal(openRes.body.product.latest_purchase_price, 450.0);

  // 3. Admin records ADJUSTMENT_IN: +20 pcs
  const inRes = await request(app)
    .post('/api/inventory/adjustments')
    .set('Cookie', adminCookie)
    .send({
      productId,
      type: 'ADJUSTMENT_IN',
      quantity: 20,
      remarks: 'Found extra unopened carton',
    });
  assert.equal(inRes.status, 200);
  assert.equal(inRes.body.product.current_stock, 100);

  // 4. Admin records ADJUSTMENT_OUT: -15 pcs
  const outRes = await request(app)
    .post('/api/inventory/adjustments')
    .set('Cookie', adminCookie)
    .send({
      productId,
      type: 'ADJUSTMENT_OUT',
      quantity: 15,
      remarks: 'Damaged during forklift transit',
    });
  assert.equal(outRes.status, 200);
  assert.equal(outRes.body.product.current_stock, 85);

  // 5. Verify movements recorded
  const movRes = await testPool.query(
    'SELECT movement_type, qty_in, qty_out, balance_after FROM inventory_movements WHERE product_id = $1 ORDER BY id ASC',
    [productId]
  );
  assert.equal(movRes.rows.length, 3);
  assert.equal(movRes.rows[0].movement_type, 'OPENING_STOCK');
  assert.equal(Number(movRes.rows[0].balance_after), 80);
  assert.equal(movRes.rows[1].movement_type, 'ADJUSTMENT_IN');
  assert.equal(Number(movRes.rows[1].balance_after), 100);
  assert.equal(movRes.rows[2].movement_type, 'ADJUSTMENT_OUT');
  assert.equal(Number(movRes.rows[2].balance_after), 85);
});

// ==================== INVENTORY DASHBOARD & MOVEMENTS LIST ====================

test('GET /api/inventory/dashboard returns comprehensive KPIs, low stock alerts and recent movements', async () => {
  const dashRes = await request(app)
    .get('/api/inventory/dashboard')
    .set('Cookie', staffCookie);
  assert.equal(dashRes.status, 200);

  const body = dashRes.body;
  // KPIs
  assert.ok(typeof body.total_products === 'number' || typeof body.kpis?.total_products === 'number');
  assert.ok(typeof body.total_stock_quantity === 'number' || typeof body.kpis?.total_stock_quantity === 'number');
  assert.ok(typeof body.total_inventory_valuation === 'number' || typeof body.kpis?.total_inventory_valuation === 'number');
  assert.ok(typeof body.low_stock_count === 'number' || typeof body.kpis?.low_stock_count === 'number');
  assert.ok(typeof body.out_of_stock_count === 'number' || typeof body.kpis?.out_of_stock_count === 'number');

  // Tables
  assert.ok(Array.isArray(body.low_stock_products), 'low_stock_products must be an array');
  assert.ok(Array.isArray(body.stock_table), 'stock_table must be an array');

  // Recent movements
  assert.ok(body.recent_movements, 'recent_movements must be present');
  assert.ok(Array.isArray(body.recent_movements.in), 'recent_movements.in must be an array');
  assert.ok(Array.isArray(body.recent_movements.out), 'recent_movements.out must be an array');
});

test('GET /api/inventory/movements supports filtering by productId, type, and pagination', async () => {
  // 1. Basic pagination
  const allRes = await request(app)
    .get('/api/inventory/movements?page=1&limit=10')
    .set('Cookie', staffCookie);
  assert.equal(allRes.status, 200);
  assert.ok(Array.isArray(allRes.body.movements));
  assert.ok(typeof allRes.body.total === 'number');
  assert.equal(allRes.body.page, 1);
  assert.equal(allRes.body.limit, 10);

  // 2. Filter by movement type STOCK_IN
  const inRes = await request(app)
    .get('/api/inventory/movements?type=STOCK_IN')
    .set('Cookie', staffCookie);
  assert.equal(inRes.status, 200);
  for (const m of inRes.body.movements) {
    assert.equal(m.movement_type, 'STOCK_IN');
  }

  // 3. Filter by productId
  const firstMov = allRes.body.movements[0];
  if (firstMov) {
    const prodRes = await request(app)
      .get(`/api/inventory/movements?productId=${firstMov.product_id}`)
      .set('Cookie', staffCookie);
    assert.equal(prodRes.status, 200);
    for (const m of prodRes.body.movements) {
      assert.equal(m.product_id, firstMov.product_id);
    }
  }
});
