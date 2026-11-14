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
});

test.after(async () => {
  await testPool.end();
});

// ==================== VENDOR TESTS ====================

test('Vendors API requires authentication', async () => {
  const getRes = await request(app).get('/api/vendors');
  assert.strictEqual(getRes.status, 401);

  const postRes = await request(app).post('/api/vendors').send({ company_name: 'Unauth Co' });
  assert.strictEqual(postRes.status, 401);

  const patchRes = await request(app).patch('/api/vendors/1').send({ company_name: 'Unauth Co' });
  assert.strictEqual(patchRes.status, 401);

  const getByIdRes = await request(app).get('/api/vendors/1');
  assert.strictEqual(getByIdRes.status, 401);
});

test('POST /api/vendors: Staff and Admin can create vendor with full Nepal details and audit log', async () => {
  const vendorPayload = {
    company_name: 'Himalayan Hardware & Electricals Pvt. Ltd.',
    pan_number: '609876543',
    vat_number: '609876543',
    contact_person: 'Anil Shakya',
    contact_number: '9841888999',
    alt_contact_number: '01-4455667',
    address: 'Kuleshwor, Kathmandu',
    bank_name: 'Everest Bank Ltd.',
    bank_branch: 'New Road',
    bank_account_holder: 'Himalayan Hardware Pvt. Ltd.',
    bank_account_number: '01100500123456',
    account_type: 'Current',
    email: 'contact@himalayanhardware.com.np',
    notes: 'Primary electrical supplier with credit terms of 30 days',
  };

  const res = await request(app)
    .post('/api/vendors')
    .set('Cookie', staffCookie)
    .send(vendorPayload);

  assert.strictEqual(res.status, 201);
  assert.ok(res.body.vendor);
  assert.strictEqual(res.body.vendor.company_name, vendorPayload.company_name);
  assert.strictEqual(res.body.vendor.pan_number, vendorPayload.pan_number);
  assert.strictEqual(res.body.vendor.vat_number, vendorPayload.vat_number);
  assert.strictEqual(res.body.vendor.contact_person, vendorPayload.contact_person);
  assert.strictEqual(res.body.vendor.contact_number, vendorPayload.contact_number);
  assert.strictEqual(res.body.vendor.alt_contact_number, vendorPayload.alt_contact_number);
  assert.strictEqual(res.body.vendor.bank_name, vendorPayload.bank_name);
  assert.strictEqual(res.body.vendor.is_active, true);
  assert.strictEqual(typeof res.body.vendor.id, 'number');

  // Verify audit log entry
  const auditRes = await testPool.query(
    `SELECT * FROM activity_logs WHERE entity_type = 'VENDOR' AND entity_id = $1 AND action = 'CREATE'`,
    [res.body.vendor.id]
  );
  assert.strictEqual(auditRes.rows.length, 1);
  assert.strictEqual(auditRes.rows[0].performed_by_name, 'Store Manager / Staff');
});

test('POST /api/vendors: Rejects invalid payloads (missing company_name)', async () => {
  const res = await request(app)
    .post('/api/vendors')
    .set('Cookie', adminCookie)
    .send({
      pan_number: '123456789',
    });

  assert.strictEqual(res.status, 400);
});

test('PATCH /api/vendors/:id: Updates vendor details and records audit log', async () => {
  // First fetch existing demo vendor (Shivam Cements, id=1)
  const patchRes = await request(app)
    .patch('/api/vendors/1')
    .set('Cookie', adminCookie)
    .send({
      contact_number: '9851099999',
      notes: 'Updated credit term 45 days after review',
    });

  assert.strictEqual(patchRes.status, 200);
  assert.strictEqual(patchRes.body.vendor.contact_number, '9851099999');
  assert.strictEqual(patchRes.body.vendor.notes, 'Updated credit term 45 days after review');

  // Verify audit log
  const auditRes = await testPool.query(
    `SELECT * FROM activity_logs WHERE entity_type = 'VENDOR' AND entity_id = 1 AND action = 'UPDATE' ORDER BY id DESC LIMIT 1`
  );
  assert.strictEqual(auditRes.rows.length, 1);
  assert.strictEqual(auditRes.rows[0].performed_by_name, 'System Administrator');
});

test('PATCH /api/vendors/:id: Returns 404 for non-existent vendor', async () => {
  const res = await request(app)
    .patch('/api/vendors/999999')
    .set('Cookie', adminCookie)
    .send({ company_name: 'Ghost' });

  assert.strictEqual(res.status, 404);
});

test('GET /api/vendors: Lists vendors and supports multi-field search (q)', async () => {
  // 1. List all
  const listRes = await request(app)
    .get('/api/vendors')
    .set('Cookie', staffCookie);

  assert.strictEqual(listRes.status, 200);
  assert.ok(Array.isArray(listRes.body.vendors));
  assert.ok(listRes.body.vendors.length >= 3);

  // 2. Search by company name
  const searchNameRes = await request(app)
    .get('/api/vendors?q=shivam')
    .set('Cookie', staffCookie);
  assert.strictEqual(searchNameRes.status, 200);
  assert.strictEqual(searchNameRes.body.vendors.length, 1);
  assert.strictEqual(searchNameRes.body.vendors[0].company_name, 'Shivam Cements Ltd.');

  // 3. Search by PAN number
  const searchPanRes = await request(app)
    .get('/api/vendors?q=302345678')
    .set('Cookie', staffCookie);
  assert.strictEqual(searchPanRes.status, 200);
  assert.strictEqual(searchPanRes.body.vendors.length, 1);
  assert.strictEqual(searchPanRes.body.vendors[0].company_name, 'Jagdamba Steels Pvt. Ltd.');

  // 4. Search by phone / contact number
  const searchPhoneRes = await request(app)
    .get('/api/vendors?q=9801987654')
    .set('Cookie', staffCookie);
  assert.strictEqual(searchPhoneRes.status, 200);
  assert.strictEqual(searchPhoneRes.body.vendors.length, 1);
  assert.strictEqual(searchPhoneRes.body.vendors[0].company_name, 'Asian Paints Nepal Pvt. Ltd.');

  // 5. Search by contact person
  const searchPersonRes = await request(app)
    .get('/api/vendors?q=Suresh')
    .set('Cookie', staffCookie);
  assert.strictEqual(searchPersonRes.status, 200);
  assert.strictEqual(searchPersonRes.body.vendors.length, 1);
  assert.strictEqual(searchPersonRes.body.vendors[0].company_name, 'Jagdamba Steels Pvt. Ltd.');

  // 6. Search with wildcard % matches only literal characters, not everything
  const searchWildcard = await request(app)
    .get('/api/vendors?q=%')
    .set('Cookie', staffCookie);
  assert.strictEqual(searchWildcard.status, 200);
  assert.strictEqual(searchWildcard.body.vendors.length, 0);
});

test('GET /api/vendors/:id: Returns full profile with summary KPIs, purchases, and payments history', async () => {
  // Demo vendor 1 (Shivam Cements) has Purchase 1 in demo seed:
  // total_amount = 81360.00, vat_amount = 9360.00, purchase_amount = 72000.00, paid_amount = 81360.00
  const res = await request(app)
    .get('/api/vendors/1')
    .set('Cookie', staffCookie);

  assert.strictEqual(res.status, 200);
  assert.ok(res.body.vendor);
  assert.strictEqual(res.body.vendor.id, 1);
  assert.strictEqual(res.body.vendor.company_name, 'Shivam Cements Ltd.');

  // Summary KPIs verification
  const summary = res.body.summary || res.body.vendor.summary;
  assert.ok(summary, 'Vendor summary KPIs must be present');
  assert.strictEqual(summary.total_purchases_count, 1);
  assert.strictEqual(Number(summary.total_purchase_amount), 72000);
  assert.strictEqual(Number(summary.total_vat_amount), 9360);
  assert.strictEqual(Number(summary.total_amount), 81360);
  assert.strictEqual(Number(summary.total_paid_amount), 81360);
  assert.strictEqual(Number(summary.total_unpaid_amount), 0);
  assert.strictEqual(summary.pending_vat_bills_count, 0);

  // Purchases array
  const purchases = res.body.purchases || res.body.vendor.purchases;
  assert.ok(Array.isArray(purchases));
  assert.strictEqual(purchases.length, 1);
  assert.strictEqual(purchases[0].purchase_code, 'PUR-2083-0001');

  // Payments history array
  const payments = res.body.payments || res.body.vendor.payments;
  assert.ok(Array.isArray(payments));
  assert.strictEqual(payments.length, 1);
  assert.strictEqual(Number(payments[0].amount), 81360);
  assert.strictEqual(payments[0].transaction_ref, 'NABIL-TRF-982341');
  assert.ok('slip' in payments[0], 'Payment must have a slip property (null or object)');

  // Verify soft-deleted purchase exclusion:
  // Add a deleted purchase for vendor 1, check that it does not show up in summary or purchases
  await testPool.query(`
    INSERT INTO purchases (
      purchase_code, vendor_id, bill_number, product_summary,
      entry_date_ad, entry_time_npt, entry_date_bs, purchase_date_ad, purchase_date_bs, fiscal_year,
      tax_type, vat_calc_mode, entered_amount, purchase_amount, vat_amount, total_amount, paid_amount,
      review_status, vat_bill_status, payment_status, is_deleted
    ) VALUES (
      'PUR-DEL-0001', 1, 'DEL-01', 'Deleted Purchase Test',
      '2026-11-05', '12:00:00', '2083-07-19', '2026-11-05', '2083-07-19', '2083/84',
      'VAT_13', 'EXCLUSIVE', 50000, 50000, 6500, 56500, 0,
      'PENDING_REVIEW', 'VAT BILL PENDING', 'PAYMENT PENDING', TRUE
    )
  `);

  const afterDelRes = await request(app)
    .get('/api/vendors/1')
    .set('Cookie', staffCookie);

  const afterSummary = afterDelRes.body.summary || afterDelRes.body.vendor.summary;
  assert.strictEqual(afterSummary.total_purchases_count, 1, 'Deleted purchase must NOT be counted');
  assert.strictEqual(Number(afterSummary.total_amount), 81360, 'Deleted purchase amount must NOT be summed');
});

// ==================== PRODUCT TESTS ====================

test('Products API requires authentication', async () => {
  const getRes = await request(app).get('/api/products');
  assert.strictEqual(getRes.status, 401);

  const postRes = await request(app).post('/api/products').send({ name: 'Unauth Prod', sku: 'UNAUTH-1' });
  assert.strictEqual(postRes.status, 401);

  const patchRes = await request(app).patch('/api/products/1').send({ name: 'Unauth Prod' });
  assert.strictEqual(patchRes.status, 401);

  const getByIdRes = await request(app).get('/api/products/1');
  assert.strictEqual(getByIdRes.status, 401);
});

test('POST /api/products: Creates new product and logs audit activity', async () => {
  const prodPayload = {
    name: 'UltraTech Super Cement (50kg)',
    sku: 'CEM-ULTRATECH-50KG',
    category: 'Building Materials',
    brand: 'UltraTech',
    description: 'Premium composite cement 50kg bag',
    unit_of_measurement: 'bag',
    min_stock_level: 40,
    current_stock: 0,
    avg_purchase_price: 750.00,
    latest_purchase_price: 750.00,
  };

  const res = await request(app)
    .post('/api/products')
    .set('Cookie', staffCookie)
    .send(prodPayload);

  assert.strictEqual(res.status, 201);
  assert.ok(res.body.product);
  assert.strictEqual(res.body.product.name, prodPayload.name);
  assert.strictEqual(res.body.product.sku, prodPayload.sku);
  assert.strictEqual(res.body.product.unit_of_measurement, 'bag');
  assert.strictEqual(Number(res.body.product.min_stock_level), 40);
  assert.strictEqual(res.body.product.is_active, true);
  assert.strictEqual(typeof res.body.product.id, 'number');

  // Verify audit log
  const auditRes = await testPool.query(
    `SELECT * FROM activity_logs WHERE entity_type = 'PRODUCT' AND entity_id = $1 AND action = 'CREATE'`,
    [res.body.product.id]
  );
  assert.strictEqual(auditRes.rows.length, 1);
  assert.strictEqual(auditRes.rows[0].performed_by_name, 'Store Manager / Staff');
});

test('POST /api/products: Rejects duplicate SKU case-insensitively with 409 Conflict', async () => {
  // Existing SKU in demo seed: CEM-SHIVAM-OPC
  const dupSkuRes = await request(app)
    .post('/api/products')
    .set('Cookie', adminCookie)
    .send({
      name: 'Another Cement Brand',
      sku: 'cem-shivam-opc', // lowercase duplicate
      category: 'Building Materials',
    });

  assert.strictEqual(dupSkuRes.status, 409);
  assert.ok(dupSkuRes.body.error.toLowerCase().includes('sku'));
});

test('POST /api/products: Rejects duplicate Name case-insensitively with 409 Conflict', async () => {
  // Existing Name in demo seed: 'Shivam OPC Cement (50kg)'
  const dupNameRes = await request(app)
    .post('/api/products')
    .set('Cookie', adminCookie)
    .send({
      name: 'shivam opc cement (50kg)', // lowercase duplicate
      sku: 'CEM-UNIQUE-NEW-01',
      category: 'Building Materials',
    });

  assert.strictEqual(dupNameRes.status, 409);
  assert.ok(dupNameRes.body.error.toLowerCase().includes('name'));
});

test('PATCH /api/products/:id: Updates product and enforces duplicate SKU/name checks', async () => {
  // Update product 1 (Shivam OPC Cement) brand and min_stock_level
  const patchRes = await request(app)
    .patch('/api/products/1')
    .set('Cookie', adminCookie)
    .send({
      brand: 'Shivam Cement Official',
      min_stock_level: 75,
    });

  assert.strictEqual(patchRes.status, 200);
  assert.strictEqual(patchRes.body.product.brand, 'Shivam Cement Official');
  assert.strictEqual(Number(patchRes.body.product.min_stock_level), 75);

  // Updating with same SKU should NOT conflict with itself
  const selfUpdateRes = await request(app)
    .patch('/api/products/1')
    .set('Cookie', adminCookie)
    .send({
      sku: 'CEM-SHIVAM-OPC',
    });
  assert.strictEqual(selfUpdateRes.status, 200);

  // Updating product 2's SKU to product 1's SKU should return 409 Conflict
  const conflictSkuRes = await request(app)
    .patch('/api/products/2')
    .set('Cookie', adminCookie)
    .send({
      sku: 'cem-shivam-opc',
    });
  assert.strictEqual(conflictSkuRes.status, 409);

  // Updating product 2's name to product 1's name should return 409 Conflict
  const conflictNameRes = await request(app)
    .patch('/api/products/2')
    .set('Cookie', adminCookie)
    .send({
      name: 'Shivam OPC Cement (50kg)',
    });
  assert.strictEqual(conflictNameRes.status, 409);

  // Non-existent product ID returns 404
  const notFoundRes = await request(app)
    .patch('/api/products/999999')
    .set('Cookie', adminCookie)
    .send({ name: 'Ghost' });
  assert.strictEqual(notFoundRes.status, 404);
});

test('GET /api/products: Supports search (q), category, and stockStatus filters', async () => {
  // 1. Search by SKU
  const searchSkuRes = await request(app)
    .get('/api/products?q=STEEL-JAG-12MM')
    .set('Cookie', staffCookie);
  assert.strictEqual(searchSkuRes.status, 200);
  assert.strictEqual(searchSkuRes.body.products.length, 1);
  assert.strictEqual(searchSkuRes.body.products[0].sku, 'STEEL-JAG-12MM');

  // 2. Search by brand
  const searchBrandRes = await request(app)
    .get('/api/products?q=Asian Paints')
    .set('Cookie', staffCookie);
  assert.strictEqual(searchBrandRes.status, 200);
  assert.strictEqual(searchBrandRes.body.products.length, 1);
  assert.strictEqual(searchBrandRes.body.products[0].brand, 'Asian Paints');

  // Search with wildcard % matches literal % only, not all products
  const searchProductWildcard = await request(app)
    .get('/api/products?q=%')
    .set('Cookie', staffCookie);
  assert.strictEqual(searchProductWildcard.status, 200);
  assert.strictEqual(searchProductWildcard.body.products.length, 0);

  // 3. Filter by category
  const catRes = await request(app)
    .get('/api/products?category=Building Materials')
    .set('Cookie', staffCookie);
  assert.strictEqual(catRes.status, 200);
  assert.ok(catRes.body.products.length >= 1);
  for (const p of catRes.body.products) {
    assert.strictEqual(p.category, 'Building Materials');
  }

  // 4. Test stockStatus filters
  // Create an out-of-stock product
  await request(app)
    .post('/api/products')
    .set('Cookie', adminCookie)
    .send({
      name: 'Out of Stock Test Product',
      sku: 'OUT-OF-STOCK-01',
      min_stock_level: 10,
      current_stock: 0,
    });

  // Create a low-stock product
  await request(app)
    .post('/api/products')
    .set('Cookie', adminCookie)
    .send({
      name: 'Low Stock Test Product',
      sku: 'LOW-STOCK-01',
      min_stock_level: 20,
      current_stock: 5,
    });

  const outRes = await request(app)
    .get('/api/products?stockStatus=out')
    .set('Cookie', staffCookie);
  assert.strictEqual(outRes.status, 200);
  assert.ok(outRes.body.products.some((p: any) => p.sku === 'OUT-OF-STOCK-01'));

  const lowRes = await request(app)
    .get('/api/products?stockStatus=low')
    .set('Cookie', staffCookie);
  assert.strictEqual(lowRes.status, 200);
  assert.ok(lowRes.body.products.some((p: any) => p.sku === 'LOW-STOCK-01'));

  const availRes = await request(app)
    .get('/api/products?stockStatus=available')
    .set('Cookie', staffCookie);
  assert.strictEqual(availRes.status, 200);
  assert.ok(availRes.body.products.some((p: any) => p.sku === 'STEEL-JAG-12MM'));
});

test('GET /api/products/:id: Returns full profile and complete inventory ledger with purchase_code and vendor_name', async () => {
  // Product 1 (Shivam OPC Cement) in demo seed has:
  // Movement 1: OPENING_STOCK (150 in, balance 150)
  // Movement 2: STOCK_IN for Purchase 1 PUR-2083-0001 (100 in, balance 250)
  const res = await request(app)
    .get('/api/products/1')
    .set('Cookie', staffCookie);

  assert.strictEqual(res.status, 200);
  assert.ok(res.body.product);
  assert.strictEqual(res.body.product.id, 1);
  assert.strictEqual(res.body.product.sku, 'CEM-SHIVAM-OPC');

  const movements = res.body.inventory_movements || res.body.product.inventory_movements;
  assert.ok(Array.isArray(movements));
  assert.strictEqual(movements.length, 2);

  // Movement 1: Opening balance
  assert.strictEqual(movements[0].movement_type, 'OPENING_STOCK');
  assert.strictEqual(Number(movements[0].qty_in), 150);
  assert.strictEqual(Number(movements[0].balance_after), 150);

  // Movement 2: Linked to purchase PUR-2083-0001 and vendor Shivam Cements Ltd.
  assert.strictEqual(movements[1].movement_type, 'STOCK_IN');
  assert.strictEqual(Number(movements[1].qty_in), 100);
  assert.strictEqual(Number(movements[1].balance_after), 250);
  assert.strictEqual(movements[1].purchase_code, 'PUR-2083-0001');
  assert.strictEqual(movements[1].vendor_name, 'Shivam Cements Ltd.');

  // Non-existent product ID returns 404
  const notFoundRes = await request(app)
    .get('/api/products/999999')
    .set('Cookie', staffCookie);
  assert.strictEqual(notFoundRes.status, 404);
});

// ==================== ROLE GUARDS & STOCK TAMPERING TESTS ====================

test('Role Guards & Deactivation: Staff cannot deactivate vendors or products via PATCH or DELETE (403); Admin can DELETE (200)', async () => {
  // 1. Create a vendor for deactivation testing
  const vRes = await request(app)
    .post('/api/vendors')
    .set('Cookie', adminCookie)
    .send({ company_name: 'Deactivation Guard Vendor Pvt. Ltd.' });
  assert.strictEqual(vRes.status, 201);
  const vId = vRes.body.vendor.id;

  // Staff cannot deactivate vendor via PATCH
  const staffPatchVendor = await request(app)
    .patch(`/api/vendors/${vId}`)
    .set('Cookie', staffCookie)
    .send({ is_active: false });
  assert.strictEqual(staffPatchVendor.status, 403);
  assert.strictEqual(staffPatchVendor.body.error, 'Only admins can activate or deactivate records');

  // Staff cannot deactivate vendor via DELETE
  const staffDeleteVendor = await request(app)
    .delete(`/api/vendors/${vId}`)
    .set('Cookie', staffCookie);
  assert.strictEqual(staffDeleteVendor.status, 403);
  assert.strictEqual(staffDeleteVendor.body.error, 'Admin access required');

  // Admin can deactivate vendor via DELETE
  const adminDeleteVendor = await request(app)
    .delete(`/api/vendors/${vId}`)
    .set('Cookie', adminCookie);
  assert.strictEqual(adminDeleteVendor.status, 200);
  assert.strictEqual(adminDeleteVendor.body.success, true);

  // Verify vendor is deactivated in DB
  const checkVRes = await testPool.query('SELECT is_active FROM vendors WHERE id = $1', [vId]);
  assert.strictEqual(checkVRes.rows[0].is_active, false);

  // 2. Create a product for deactivation testing
  const pRes = await request(app)
    .post('/api/products')
    .set('Cookie', adminCookie)
    .send({
      name: 'Deactivation Guard Product',
      sku: 'GUARD-PROD-01',
      min_stock_level: 5,
      current_stock: 15,
    });
  assert.strictEqual(pRes.status, 201);
  const pId = pRes.body.product.id;

  // Staff cannot deactivate product via PATCH
  const staffPatchProduct = await request(app)
    .patch(`/api/products/${pId}`)
    .set('Cookie', staffCookie)
    .send({ is_active: false });
  assert.strictEqual(staffPatchProduct.status, 403);
  assert.strictEqual(staffPatchProduct.body.error, 'Only admins can activate or deactivate records');

  // Staff cannot deactivate product via DELETE
  const staffDeleteProduct = await request(app)
    .delete(`/api/products/${pId}`)
    .set('Cookie', staffCookie);
  assert.strictEqual(staffDeleteProduct.status, 403);
  assert.strictEqual(staffDeleteProduct.body.error, 'Admin access required');

  // Admin can deactivate product via DELETE
  const adminDeleteProduct = await request(app)
    .delete(`/api/products/${pId}`)
    .set('Cookie', adminCookie);
  assert.strictEqual(adminDeleteProduct.status, 200);
  assert.strictEqual(adminDeleteProduct.body.success, true);

  // Verify product is deactivated in DB
  const checkPRes = await testPool.query('SELECT is_active FROM products WHERE id = $1', [pId]);
  assert.strictEqual(checkPRes.rows[0].is_active, false);
});

test('PATCH /api/products/:id ignores direct current_stock / price tampering', async () => {
  // Create a product with current_stock = 25
  const createRes = await request(app)
    .post('/api/products')
    .set('Cookie', adminCookie)
    .send({
      name: 'Stock Integrity Test Product',
      sku: 'STOCK-INT-001',
      min_stock_level: 10,
      current_stock: 25,
      avg_purchase_price: 500,
      latest_purchase_price: 500,
    });
  assert.strictEqual(createRes.status, 201);
  const pId = createRes.body.product.id;

  // Attempt to tamper current_stock and valuation via PATCH
  const patchRes = await request(app)
    .patch(`/api/products/${pId}`)
    .set('Cookie', adminCookie)
    .send({
      current_stock: 9999,
      avg_purchase_price: 1,
      latest_purchase_price: 1,
      description: 'Attempted stock modification',
    });

  assert.strictEqual(patchRes.status, 200);
  assert.strictEqual(patchRes.body.product.description, 'Attempted stock modification');
  // current_stock must remain 25, NOT 9999
  assert.strictEqual(Number(patchRes.body.product.current_stock), 25);
  assert.strictEqual(Number(patchRes.body.product.avg_purchase_price), 500);

  // Double check in database directly
  const dbCheck = await testPool.query(
    'SELECT current_stock, avg_purchase_price, latest_purchase_price FROM products WHERE id = $1',
    [pId]
  );
  assert.strictEqual(Number(dbCheck.rows[0].current_stock), 25);
  assert.strictEqual(Number(dbCheck.rows[0].avg_purchase_price), 500);
});

test('PATCH records complete dynamic oldValues and newValues in activity_logs', async () => {
  // 1. Dynamic audit log test for Vendor
  const vCreate = await request(app)
    .post('/api/vendors')
    .set('Cookie', adminCookie)
    .send({
      company_name: 'Audit Log Test Vendor',
      contact_person: 'Old Person',
      email: 'old@example.com',
      address: 'Old Address',
    });
  const vId = vCreate.body.vendor.id;

  await request(app)
    .patch(`/api/vendors/${vId}`)
    .set('Cookie', adminCookie)
    .send({
      contact_person: 'New Person',
      email: 'new@example.com',
      address: 'New Address',
    });

  const vAudit = await testPool.query(
    `SELECT old_values, new_values FROM activity_logs WHERE entity_type = 'VENDOR' AND entity_id = $1 AND action = 'UPDATE' ORDER BY id DESC LIMIT 1`,
    [vId]
  );
  assert.strictEqual(vAudit.rows.length, 1);
  assert.deepStrictEqual(vAudit.rows[0].old_values, {
    contact_person: 'Old Person',
    email: 'old@example.com',
    address: 'Old Address',
  });
  assert.deepStrictEqual(vAudit.rows[0].new_values, {
    contact_person: 'New Person',
    email: 'new@example.com',
    address: 'New Address',
  });

  // 2. Dynamic audit log test for Product
  const pCreate = await request(app)
    .post('/api/products')
    .set('Cookie', adminCookie)
    .send({
      name: 'Audit Log Test Product',
      sku: 'AUDIT-PROD-01',
      brand: 'Old Brand',
      min_stock_level: 10,
    });
  const pId = pCreate.body.product.id;

  await request(app)
    .patch(`/api/products/${pId}`)
    .set('Cookie', adminCookie)
    .send({
      brand: 'New Brand',
      min_stock_level: 20,
    });

  const pAudit = await testPool.query(
    `SELECT old_values, new_values FROM activity_logs WHERE entity_type = 'PRODUCT' AND entity_id = $1 AND action = 'UPDATE' ORDER BY id DESC LIMIT 1`,
    [pId]
  );
  assert.strictEqual(pAudit.rows.length, 1);
  assert.deepStrictEqual(pAudit.rows[0].old_values, {
    brand: 'Old Brand',
    min_stock_level: 10,
  });
  assert.deepStrictEqual(pAudit.rows[0].new_values, {
    brand: 'New Brand',
    min_stock_level: 20,
  });
});
