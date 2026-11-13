import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { runMigrations } from '../src/db/migrate.js';
import { seedDatabase, verifyPassword } from '../src/db/seed.js';

const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  'postgresql://anishkhatri@localhost:5432/nepal_vat_system_test';
const testPool = new pg.Pool({ connectionString: testDbUrl });

test.before(async () => {
  // Reset test database to completely clean state
  await testPool.query(`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;`);
});

test.after(async () => {
  await testPool.end();
});

test('runMigrations creates all 11 core tables and enforces unique stock_in per purchase_item', async () => {
  // First run creates tables
  await runMigrations(testDbUrl);

  // Second run tests idempotency
  await runMigrations(testDbUrl);

  const res = await testPool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
  );
  const names = res.rows.map((r: { table_name: string }) => r.table_name);
  const requiredTables = [
    'app_settings',
    'users',
    'vendors',
    'products',
    'purchases',
    'purchase_items',
    'vat_bills',
    'payments',
    'payment_slips',
    'inventory_movements',
    'activity_logs',
  ];

  for (const t of requiredTables) {
    assert.ok(names.includes(t), `Missing table ${t}`);
  }

  // Verify unique index on inventory_movements(purchase_item_id) for STOCK_IN
  const userRes = await testPool.query(`
    INSERT INTO users (full_name, username, email, password_hash, role)
    VALUES ('Test Admin', 'test_admin_unique', 'test_unique@example.com', 'hash', 'ADMIN')
    RETURNING id
  `);
  const userId = userRes.rows[0].id;

  const vendorRes = await testPool.query(`
    INSERT INTO vendors (company_name, pan_number, created_by)
    VALUES ('Vendor Unique', '123456789', $1)
    RETURNING id
  `, [userId]);
  const vendorId = vendorRes.rows[0].id;

  const prodRes = await testPool.query(`
    INSERT INTO products (name, sku, created_by)
    VALUES ('Test Cement', 'SKU-TEST-01', $1)
    RETURNING id
  `, [userId]);
  const prodId = prodRes.rows[0].id;

  const purRes = await testPool.query(`
    INSERT INTO purchases (
      purchase_code, vendor_id, bill_number, product_summary,
      entry_date_ad, entry_time_npt, entry_date_bs, purchase_date_ad, purchase_date_bs, fiscal_year,
      entered_amount, purchase_amount, vat_amount, total_amount, submitted_by
    ) VALUES (
      'PUR-TEST-0001', $1, 'BILL-01', 'Cement',
      '2026-11-13', '18:15:00', '2083-07-27', '2026-11-13', '2083-07-27', '2083/84',
      11300, 10000, 1300, 11300, $2
    ) RETURNING id
  `, [vendorId, userId]);
  const purchaseId = purRes.rows[0].id;

  const itemRes = await testPool.query(`
    INSERT INTO purchase_items (
      purchase_id, product_id, product_name, quantity, unit_price, line_subtotal, line_vat_amount, line_total
    ) VALUES (
      $1, $2, 'Test Cement', 10, 1000, 10000, 1300, 11300
    ) RETURNING id
  `, [purchaseId, prodId]);
  const itemId = itemRes.rows[0].id;

  // First STOCK_IN should succeed
  await testPool.query(`
    INSERT INTO inventory_movements (
      product_id, purchase_id, purchase_item_id, movement_type, reason,
      qty_in, qty_out, balance_after, unit_cost, movement_date_ad, movement_date_bs, created_by
    ) VALUES (
      $1, $2, $3, 'STOCK_IN', 'PURCHASE_RECEIPT',
      10, 0, 10, 1000, '2026-11-13', '2083-07-27', $4
    )
  `, [prodId, purchaseId, itemId, userId]);

  // Second STOCK_IN for the same purchase_item_id must fail due to unique constraint
  await assert.rejects(
    async () => {
      await testPool.query(`
        INSERT INTO inventory_movements (
          product_id, purchase_id, purchase_item_id, movement_type, reason,
          qty_in, qty_out, balance_after, unit_cost, movement_date_ad, movement_date_bs, created_by
        ) VALUES (
          $1, $2, $3, 'STOCK_IN', 'PURCHASE_RECEIPT',
          10, 0, 20, 1000, '2026-11-13', '2083-07-27', $4
        )
      `, [prodId, purchaseId, itemId, userId]);
    },
    (err: any) => {
      assert.strictEqual(err.code, '23505'); // unique_violation
      return true;
    }
  );

  // Also verify duplicate vendor bill number constraint fails
  await assert.rejects(
    async () => {
      await testPool.query(`
        INSERT INTO purchases (
          purchase_code, vendor_id, bill_number, product_summary,
          entry_date_ad, entry_time_npt, entry_date_bs, purchase_date_ad, purchase_date_bs, fiscal_year,
          entered_amount, purchase_amount, vat_amount, total_amount, submitted_by
        ) VALUES (
          'PUR-TEST-0002', $1, 'bill-01', 'Cement Duplicate',
          '2026-11-13', '18:15:00', '2083-07-27', '2026-11-13', '2083-07-27', '2083/84',
          11300, 10000, 1300, 11300, $2
        )
      `, [vendorId, userId]);
    },
    (err: any) => {
      assert.strictEqual(err.code, '23505'); // unique_violation (case-insensitive bill_number)
      return true;
    }
  );
});

test('seedDatabase creates admin, staff, settings, and demo records with valid scrypt password verification', async () => {
  await seedDatabase({ withDemo: true, databaseUrl: testDbUrl });

  // Verify users
  const adminRes = await testPool.query(`SELECT * FROM users WHERE username = 'admin'`);
  assert.strictEqual(adminRes.rows.length, 1);
  const admin = adminRes.rows[0];
  assert.strictEqual(admin.role, 'ADMIN');

  // Verify password verification with scrypt
  const passwordValid = await verifyPassword('Admin@123', admin.password_hash);
  assert.strictEqual(passwordValid, true);

  const passwordInvalid = await verifyPassword('WrongPassword', admin.password_hash);
  assert.strictEqual(passwordInvalid, false);

  // Verify staff
  const staffRes = await testPool.query(`SELECT * FROM users WHERE username = 'staff'`);
  assert.strictEqual(staffRes.rows.length, 1);
  assert.strictEqual(staffRes.rows[0].role, 'STAFF');

  // Verify settings
  const settingsRes = await testPool.query(`SELECT * FROM app_settings WHERE id = 1`);
  assert.strictEqual(settingsRes.rows.length, 1);
  assert.strictEqual(settingsRes.rows[0].default_vat_mode, 'EXCLUSIVE');

  // Verify demo purchases
  const purchasesRes = await testPool.query(`SELECT purchase_code, vat_bill_status, review_status, payment_status FROM purchases ORDER BY purchase_code`);
  const codes = purchasesRes.rows.map((p: { purchase_code: string }) => p.purchase_code);
  assert.ok(codes.includes('PUR-2083-0001'));
  assert.ok(codes.includes('PUR-2083-0002'));
  assert.ok(codes.includes('PUR-2083-0003'));

  const pendingVat = purchasesRes.rows.find((p: { purchase_code: string }) => p.purchase_code === 'PUR-2083-0002');
  assert.strictEqual(pendingVat.vat_bill_status, 'VAT BILL PENDING');
  assert.strictEqual(pendingVat.payment_status, 'PARTIALLY PAID');
});
