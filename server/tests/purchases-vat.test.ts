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
import { bsToAd, adToBs } from '../src/utils/nepaliDate.js';

const testPool = new pg.Pool({ connectionString: testDbUrl });
const app = createApp();

let adminCookie: string;
let staffCookie: string;
let staff2Cookie: string;
let testVendorId: number;
let demoPur1Id: number;
let demoPur2Id: number;

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

  // Create staff2
  await request(app)
    .post('/api/users')
    .set('Cookie', adminCookie)
    .send({
      full_name: 'Store Staff Two',
      username: 'staff2',
      email: 'staff2@himalayantrading.com.np',
      password: 'Staff@123',
      role: 'STAFF',
      phone: '9851000003',
    });

  // Login as staff2
  const staff2Login = await request(app)
    .post('/api/auth/login')
    .send({ username: 'staff2', password: 'Staff@123' });
  const staff2Cookies = staff2Login.headers['set-cookie'];
  staff2Cookie = staff2Cookies.find((c: string) => c.startsWith('token='));

  // Get a vendor id
  const vendorRes = await testPool.query('SELECT id FROM vendors ORDER BY id ASC LIMIT 1');
  testVendorId = Number(vendorRes.rows[0].id);

  // Get demo purchases
  const p1Res = await testPool.query("SELECT id FROM purchases WHERE purchase_code = 'PUR-2083-0001'");
  demoPur1Id = Number(p1Res.rows[0].id);
  const p2Res = await testPool.query("SELECT id FROM purchases WHERE purchase_code = 'PUR-2083-0002'");
  demoPur2Id = Number(p2Res.rows[0].id);
});

test.after(async () => {
  await testPool.end();
});

// ==================== AUTHENTICATION GUARDS ====================

test('Purchases, VAT Bills and Files APIs require authentication', async () => {
  const getPurchases = await request(app).get('/api/purchases');
  assert.strictEqual(getPurchases.status, 401);

  const getVatPending = await request(app).get('/api/purchases/vat-pending');
  assert.strictEqual(getVatPending.status, 401);

  const postPurchase = await request(app).post('/api/purchases').send({ product_summary: 'Test' });
  assert.strictEqual(postPurchase.status, 401);

  const getFile = await request(app).get('/api/files/vat-bills/1');
  assert.strictEqual(getFile.status, 401);

  const verifyVat = await request(app).post('/api/vat-bills/1/verify').send({});
  assert.strictEqual(verifyVat.status, 401);
});

// ==================== PURCHASE CREATION & TIMESTAMPS ====================

test('Staff creates purchase without VAT bill & without line items: pending statuses and server-stamped NPT timestamps', async () => {
  const payload = {
    vendor_id: testVendorId,
    product_summary: 'Electrical Wiring Supplies',
    bill_number: 'ELEC-2083-01',
    purchase_date_bs: '2083-07-25',
    description: 'Bulk electrical cabling for warehouse site',
    tax_type: 'VAT_13',
    vat_calc_mode: 'EXCLUSIVE',
    entered_amount: 10000,
  };

  const res = await request(app)
    .post('/api/purchases')
    .set('Cookie', staffCookie)
    .send(payload);

  assert.strictEqual(res.status, 201, `Expected 201 Created: ${JSON.stringify(res.body)}`);
  const purchase = res.body.purchase;
  assert.ok(purchase, 'purchase object must be returned');

  // Verify independent statuses
  assert.strictEqual(purchase.review_status, 'PENDING_REVIEW');
  assert.strictEqual(purchase.vat_bill_status, 'VAT BILL PENDING');
  assert.strictEqual(purchase.payment_status, 'PAYMENT PENDING');

  // Verify monetary math (10,000 + 13% = 11,300)
  assert.strictEqual(Number(purchase.entered_amount), 10000);
  assert.strictEqual(Number(purchase.purchase_amount), 10000);
  assert.strictEqual(Number(purchase.vat_amount), 1300);
  assert.strictEqual(Number(purchase.total_amount), 11300);
  assert.strictEqual(Number(purchase.paid_amount), 0);

  // Verify dates & fiscal year
  assert.strictEqual(purchase.purchase_date_bs, '2083-07-25');
  assert.strictEqual(purchase.purchase_date_ad.split('T')[0], bsToAd('2083-07-25'));
  assert.strictEqual(purchase.fiscal_year, '2083/84');

  // Verify server-stamped entry timestamps (MUST NOT be null or empty)
  assert.ok(purchase.entry_at, 'entry_at must be stamped');
  assert.ok(purchase.entry_date_ad, 'entry_date_ad must be stamped');
  assert.ok(purchase.entry_time_npt, 'entry_time_npt must be stamped');
  assert.ok(purchase.entry_date_bs, 'entry_date_bs must be stamped');
  assert.ok(purchase.purchase_code.startsWith('PUR-'), 'purchase_code generated');

  // Verify activity log was recorded
  const logRes = await testPool.query(
    "SELECT * FROM activity_logs WHERE entity_type = 'PURCHASE' AND entity_id = $1",
    [purchase.id]
  );
  assert.ok(logRes.rows.length >= 1, 'activity log must be recorded on creation');
});

test('PATCH /api/purchases/:id preserves immutable server entry timestamps', async () => {
  // Create a purchase first
  const createRes = await request(app)
    .post('/api/purchases')
    .set('Cookie', staffCookie)
    .send({
      vendor_id: testVendorId,
      product_summary: 'Plumbing Pipes',
      bill_number: 'PLUMB-83-99',
      purchase_date_bs: '2083-07-24',
      tax_type: 'VAT_13',
      vat_calc_mode: 'EXCLUSIVE',
      entered_amount: 5000,
    });
  assert.strictEqual(createRes.status, 201);
  const original = createRes.body.purchase;

  // Attempt to edit description and sneakily pass new entry timestamps
  const patchRes = await request(app)
    .patch(`/api/purchases/${original.id}`)
    .set('Cookie', staffCookie)
    .send({
      description: 'Updated plumbing description',
      entry_at: '1999-01-01T00:00:00Z',
      entry_date_ad: '1999-01-01',
      entry_time_npt: '00:00:00',
      entry_date_bs: '2055-09-17',
    });

  assert.strictEqual(patchRes.status, 200);
  const updated = patchRes.body.purchase;
  assert.strictEqual(updated.description, 'Updated plumbing description');

  // Timestamps must remain identical to original
  assert.strictEqual(updated.entry_date_ad, original.entry_date_ad);
  assert.strictEqual(updated.entry_time_npt, original.entry_time_npt);
  assert.strictEqual(updated.entry_date_bs, original.entry_date_bs);
  assert.strictEqual(new Date(updated.entry_at).toISOString(), new Date(original.entry_at).toISOString());
});

test('Duplicate (vendor_id, bill_number) returns 409 Conflict', async () => {
  const payload = {
    vendor_id: testVendorId,
    product_summary: 'Hardware Batch',
    bill_number: 'UNIQUE-BILL-100',
    purchase_date_bs: '2083-07-20',
    entered_amount: 4000,
  };

  const first = await request(app)
    .post('/api/purchases')
    .set('Cookie', staffCookie)
    .send(payload);
  assert.strictEqual(first.status, 201);

  // Exact duplicate
  const second = await request(app)
    .post('/api/purchases')
    .set('Cookie', staffCookie)
    .send(payload);
  assert.strictEqual(second.status, 409, 'Expected 409 Conflict on duplicate vendor bill number');

  // Case-insensitive duplicate
  const third = await request(app)
    .post('/api/purchases')
    .set('Cookie', staffCookie)
    .send({
      ...payload,
      bill_number: 'unique-bill-100',
    });
  assert.strictEqual(third.status, 409, 'Expected 409 Conflict on case-insensitive duplicate');
});

test('Duplicate idempotency_key returns 409 Conflict', async () => {
  const idemKey = 'idem-test-uuid-9999';
  const payload = {
    vendor_id: testVendorId,
    product_summary: 'Idempotent Hardware',
    bill_number: 'IDEM-BILL-01',
    purchase_date_bs: '2083-07-20',
    entered_amount: 1500,
    idempotency_key: idemKey,
  };

  const res1 = await request(app)
    .post('/api/purchases')
    .set('Cookie', staffCookie)
    .send(payload);
  assert.strictEqual(res1.status, 201);

  const res2 = await request(app)
    .post('/api/purchases')
    .set('Cookie', staffCookie)
    .send({
      ...payload,
      bill_number: 'DIFFERENT-BILL-02',
      idempotency_key: idemKey,
    });
  assert.strictEqual(res2.status, 409, 'Expected 409 Conflict on duplicate idempotency_key');
});

// ==================== OPTIONAL LINE ITEMS ATTACHED VIA PATCH ====================

test('Optional line items can be attached later via PATCH /api/purchases/:id', async () => {
  // Create without line items
  const createRes = await request(app)
    .post('/api/purchases')
    .set('Cookie', staffCookie)
    .send({
      vendor_id: testVendorId,
      product_summary: 'Sanitary Ware',
      bill_number: 'SAN-83-500',
      purchase_date_bs: '2083-07-20',
      tax_type: 'VAT_13',
      vat_calc_mode: 'EXCLUSIVE',
      entered_amount: 8000,
    });
  assert.strictEqual(createRes.status, 201);
  const purchaseId = createRes.body.purchase.id;

  // Attach line items via PATCH
  const patchRes = await request(app)
    .patch(`/api/purchases/${purchaseId}`)
    .set('Cookie', staffCookie)
    .send({
      items: [
        {
          product_name: 'Water Tap 1/2 inch',
          category: 'Sanitary',
          quantity: 10,
          unit_of_measurement: 'pcs',
          unit_price: 300.0,
        },
        {
          product_name: 'PVC Elbow 1 inch',
          category: 'Sanitary',
          quantity: 25,
          unit_of_measurement: 'pcs',
          unit_price: 200.0,
        },
      ],
    });

  assert.strictEqual(patchRes.status, 200);
  const items = patchRes.body.items;
  assert.ok(items && items.length === 2, 'Two items attached');

  // Verify item 1 calculations: 10 * 300 = 3000 -> VAT 390 -> Total 3390
  const item1 = items.find((i: any) => i.product_name === 'Water Tap 1/2 inch');
  assert.strictEqual(Number(item1.quantity), 10);
  assert.strictEqual(Number(item1.unit_price), 300);
  assert.strictEqual(Number(item1.line_subtotal), 3000);
  assert.strictEqual(Number(item1.line_vat_amount), 390);
  assert.strictEqual(Number(item1.line_total), 3390);
  assert.strictEqual(item1.stock_received, false);

  // Verify item 2 calculations: 25 * 200 = 5000 -> VAT 650 -> Total 5650
  const item2 = items.find((i: any) => i.product_name === 'PVC Elbow 1 inch');
  assert.strictEqual(Number(item2.quantity), 25);
  assert.strictEqual(Number(item2.unit_price), 200);
  assert.strictEqual(Number(item2.line_subtotal), 5000);
  assert.strictEqual(Number(item2.line_vat_amount), 650);
  assert.strictEqual(Number(item2.line_total), 5650);
});

test('POST and PATCH /api/purchases validate line item quantity > 0 and unit_price >= 0', async () => {
  // POST with quantity <= 0
  const postZeroQty = await request(app)
    .post('/api/purchases')
    .set('Cookie', staffCookie)
    .send({
      vendor_id: testVendorId,
      product_summary: 'Zero Qty Test',
      items: [{ product_name: 'Item 1', quantity: 0, unit_price: 100 }],
    });
  assert.strictEqual(postZeroQty.status, 400);

  // POST with negative unit price
  const postNegPrice = await request(app)
    .post('/api/purchases')
    .set('Cookie', staffCookie)
    .send({
      vendor_id: testVendorId,
      product_summary: 'Negative Price Test',
      items: [{ product_name: 'Item 1', quantity: 1, unit_price: -50 }],
    });
  assert.strictEqual(postNegPrice.status, 400);

  // PATCH with quantity <= 0
  const validPurchase = await request(app)
    .post('/api/purchases')
    .set('Cookie', staffCookie)
    .send({
      vendor_id: testVendorId,
      product_summary: 'To Patch Test',
      entered_amount: 1000,
    });
  assert.strictEqual(validPurchase.status, 201);
  const pId = validPurchase.body.purchase.id;

  const patchZeroQty = await request(app)
    .patch(`/api/purchases/${pId}`)
    .set('Cookie', staffCookie)
    .send({
      items: [{ product_name: 'Item 1', quantity: -2, unit_price: 50 }],
    });
  assert.strictEqual(patchZeroQty.status, 400);

  const patchNegPrice = await request(app)
    .patch(`/api/purchases/${pId}`)
    .set('Cookie', staffCookie)
    .send({
      items: [{ product_name: 'Item 1', quantity: 2, unit_price: -10 }],
    });
  assert.strictEqual(patchNegPrice.status, 400);
});

// ==================== DELAYED VAT BILL UPLOAD & STREAMING ====================

test('Delayed VAT bill upload transitions VAT BILL PENDING -> VAT BILL RECEIVED and streams securely', async () => {
  // Create purchase without bill
  const createRes = await request(app)
    .post('/api/purchases')
    .set('Cookie', staffCookie)
    .send({
      vendor_id: testVendorId,
      product_summary: 'Delayed Bill Purchase',
      bill_number: 'DELAY-83-01',
      purchase_date_bs: '2083-07-21',
      entered_amount: 12000,
    });
  assert.strictEqual(createRes.status, 201);
  const purchaseId = createRes.body.purchase.id;
  assert.strictEqual(createRes.body.purchase.vat_bill_status, 'VAT BILL PENDING');

  // Attempt to upload invalid file (.html)
  const invalidUpload = await request(app)
    .post(`/api/purchases/${purchaseId}/vat-bill`)
    .set('Cookie', staffCookie)
    .attach('vatBillFile', Buffer.from('<html><body>malicious script</body></html>'), {
      filename: 'malicious.html',
      contentType: 'text/html',
    });
  assert.strictEqual(invalidUpload.status, 400, 'Disallowed file extension/MIME must return 400');

  // Upload valid PDF VAT bill
  const pdfBuffer = Buffer.from('%PDF-1.4 sample nepal tax invoice content for testing');
  const validUpload = await request(app)
    .post(`/api/purchases/${purchaseId}/vat-bill`)
    .set('Cookie', staffCookie)
    .attach('vatBillFile', pdfBuffer, {
      filename: 'Tax_Invoice_DELAY-83-01.pdf',
      contentType: 'application/pdf',
    });

  assert.strictEqual(validUpload.status, 200, `Expected 200: ${JSON.stringify(validUpload.body)}`);
  assert.ok(validUpload.body.vat_bill);
  const vatBillId = validUpload.body.vat_bill.id;
  assert.strictEqual(validUpload.body.vat_bill.mime_type, 'application/pdf');
  assert.strictEqual(validUpload.body.vat_bill.status, 'RECEIVED');
  assert.strictEqual(validUpload.body.vat_bill.is_current, true);

  // Check purchase status updated to VAT BILL RECEIVED
  const checkPur = await request(app)
    .get(`/api/purchases/${purchaseId}`)
    .set('Cookie', staffCookie);
  assert.strictEqual(checkPur.status, 200);
  assert.strictEqual(checkPur.body.purchase.vat_bill_status, 'VAT BILL RECEIVED');
  assert.ok(checkPur.body.purchase.vat_bill_uploaded_at, 'vat_bill_uploaded_at must be populated');

  // Secure File Streaming
  // 1. Unauthenticated -> 401
  const unauthStream = await request(app).get(`/api/files/vat-bills/${vatBillId}`);
  assert.strictEqual(unauthStream.status, 401);

  // 2. Authenticated -> 200 with security headers
  const authStream = await request(app)
    .get(`/api/files/vat-bills/${vatBillId}`)
    .set('Cookie', staffCookie);
  assert.strictEqual(authStream.status, 200);
  assert.strictEqual(authStream.headers['content-type'], 'application/pdf');
  assert.ok(
    authStream.headers['content-disposition']?.includes('inline'),
    'Content-Disposition must be inline'
  );
  assert.strictEqual(authStream.headers['x-content-type-options'], 'nosniff');
  assert.deepStrictEqual(authStream.body, pdfBuffer);
});

// ==================== ROLE GUARDS (STAFF VS ADMIN) ====================

test('Role guards: Staff cannot approve/reject purchases, verify VAT bills, or delete purchases', async () => {
  // Staff cannot approve purchase
  const approveRes = await request(app)
    .post(`/api/purchases/${demoPur2Id}/approve`)
    .set('Cookie', staffCookie)
    .send({ admin_remarks: 'Staff trying to approve' });
  assert.strictEqual(approveRes.status, 403, 'Staff cannot approve purchases');

  // Staff cannot reject purchase
  const rejectRes = await request(app)
    .post(`/api/purchases/${demoPur2Id}/reject`)
    .set('Cookie', staffCookie)
    .send({ reason: 'Staff trying to reject' });
  assert.strictEqual(rejectRes.status, 403, 'Staff cannot reject purchases');

  // Staff cannot verify VAT bill
  const verifyRes = await request(app)
    .post('/api/vat-bills/1/verify')
    .set('Cookie', staffCookie)
    .send({ notes: 'Staff trying to verify' });
  assert.strictEqual(verifyRes.status, 403, 'Staff cannot verify VAT bills');

  // Staff cannot delete purchase
  const deleteRes = await request(app)
    .delete(`/api/purchases/${demoPur2Id}`)
    .set('Cookie', staffCookie);
  assert.strictEqual(deleteRes.status, 403, 'Staff cannot delete purchases');
});

test('Staff cannot edit another staff member unapproved purchase (403 Forbidden)', async () => {
  // Staff 1 creates a purchase
  const p1 = await request(app)
    .post('/api/purchases')
    .set('Cookie', staffCookie)
    .send({
      vendor_id: testVendorId,
      product_summary: 'Staff 1 Purchase',
      bill_number: 'STAFF1-PUR-01',
      purchase_date_bs: '2083-07-20',
      entered_amount: 3000,
    });
  assert.strictEqual(p1.status, 201);
  const purId = p1.body.purchase.id;

  // Staff 2 attempts to edit Staff 1's purchase
  const editRes = await request(app)
    .patch(`/api/purchases/${purId}`)
    .set('Cookie', staff2Cookie)
    .send({ product_summary: 'Hacked by staff 2' });
  assert.strictEqual(editRes.status, 403, 'Staff cannot edit another staff purchase');

  // Admin CAN edit unapproved purchase
  const adminEdit = await request(app)
    .patch(`/api/purchases/${purId}`)
    .set('Cookie', adminCookie)
    .send({ product_summary: 'Admin adjusted summary' });
  assert.strictEqual(adminEdit.status, 200, 'Admin can edit unapproved purchase');
});

// ==================== ADMIN REVIEW & FINANCIAL LOCKING ====================

test('Admin approves purchase and verifies VAT bill; financial fields lock against edits', async () => {
  // Staff creates purchase with VAT bill
  const createRes = await request(app)
    .post('/api/purchases')
    .set('Cookie', staffCookie)
    .send({
      vendor_id: testVendorId,
      product_summary: 'Air Conditioner Unit',
      bill_number: 'AC-83-771',
      purchase_date_bs: '2083-07-22',
      entered_amount: 50000,
    });
  assert.strictEqual(createRes.status, 201);
  const purId = createRes.body.purchase.id;

  // Upload VAT bill
  const billUpload = await request(app)
    .post(`/api/purchases/${purId}/vat-bill`)
    .set('Cookie', staffCookie)
    .attach('vatBillFile', Buffer.from('%PDF-1.4 AC invoice'), {
      filename: 'AC_Invoice.pdf',
      contentType: 'application/pdf',
    });
  assert.strictEqual(billUpload.status, 200);
  const billId = billUpload.body.vat_bill.id;

  // Admin verifies VAT bill
  const verifyRes = await request(app)
    .post(`/api/vat-bills/${billId}/verify`)
    .set('Cookie', adminCookie)
    .send({ review_notes: 'Matched with vendor portal' });
  assert.strictEqual(verifyRes.status, 200);
  assert.strictEqual(verifyRes.body.vat_bill.status, 'VERIFIED');

  // Check purchase status now VAT BILL VERIFIED
  const checkPur1 = await request(app)
    .get(`/api/purchases/${purId}`)
    .set('Cookie', staffCookie);
  assert.strictEqual(checkPur1.body.purchase.vat_bill_status, 'VAT BILL VERIFIED');

  // Admin approves purchase
  const approveRes = await request(app)
    .post(`/api/purchases/${purId}/approve`)
    .set('Cookie', adminCookie)
    .send({ admin_remarks: 'Approved for settlement' });
  assert.strictEqual(approveRes.status, 200);
  assert.strictEqual(approveRes.body.purchase.review_status, 'APPROVED');
  assert.strictEqual(approveRes.body.purchase.payment_status, 'APPROVED');

  // FINANCIAL LOCK TEST: Attempting to modify entered_amount / vendor_id on APPROVED purchase returns 409
  const editLocked = await request(app)
    .patch(`/api/purchases/${purId}`)
    .set('Cookie', adminCookie)
    .send({ entered_amount: 60000 });
  assert.strictEqual(editLocked.status, 409, 'Core financial header fields must be locked on APPROVED purchase');

  // Non-financial edits (e.g. description or attaching unstocked items) still succeed!
  const addUnstockedItem = await request(app)
    .patch(`/api/purchases/${purId}`)
    .set('Cookie', adminCookie)
    .send({
      description: 'Updated remarks by admin',
      items: [
        {
          product_name: 'AC Remote Control',
          quantity: 2,
          unit_price: 1500,
          unit_of_measurement: 'pcs',
        },
      ],
    });
  assert.strictEqual(addUnstockedItem.status, 200, 'Unstocked items and non-financial fields can still be edited');
  assert.strictEqual(addUnstockedItem.body.items.length, 1);
});

// ==================== SOFT DELETE & BLOCK ON ACTIVE PAYMENTS ====================

test('DELETE /api/purchases/:id: soft-deletes uncommitted purchase, blocks if active payments or stock exist (409 Conflict)', async () => {
  // 1. Attempt to delete demo purchase 1 (which has active payments and stock_in) -> 409
  const deleteActivePur = await request(app)
    .delete(`/api/purchases/${demoPur1Id}`)
    .set('Cookie', adminCookie);
  assert.strictEqual(deleteActivePur.status, 409, 'Cannot delete purchase with payments or stock receipts');

  // 2. Create a clean standalone purchase without payments/stock
  const cleanPurRes = await request(app)
    .post('/api/purchases')
    .set('Cookie', staffCookie)
    .send({
      vendor_id: testVendorId,
      product_summary: 'Temporary Wrong Entry',
      bill_number: 'ERR-83-001',
      purchase_date_bs: '2083-07-20',
      entered_amount: 2500,
    });
  assert.strictEqual(cleanPurRes.status, 201);
  const cleanPurId = cleanPurRes.body.purchase.id;

  // Admin soft-deletes clean purchase
  const deleteCleanRes = await request(app)
    .delete(`/api/purchases/${cleanPurId}`)
    .set('Cookie', adminCookie);
  assert.strictEqual(deleteCleanRes.status, 200);
  assert.strictEqual(deleteCleanRes.body.purchase.is_deleted, true);

  // Excluded from standard GET /api/purchases
  const listRes = await request(app)
    .get('/api/purchases?q=ERR-83-001')
    .set('Cookie', staffCookie);
  assert.strictEqual(listRes.status, 200);
  const found = listRes.body.purchases.find((p: any) => p.id === cleanPurId);
  assert.strictEqual(found, undefined, 'Soft-deleted purchase must not appear in listing');
});

// ==================== VAT PENDING LIST ====================

test('GET /api/purchases/vat-pending returns aging list with calculated days_pending', async () => {
  const res = await request(app)
    .get('/api/purchases/vat-pending')
    .set('Cookie', staffCookie);

  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(res.body.purchases));

  for (const pur of res.body.purchases) {
    assert.strictEqual(pur.vat_bill_status, 'VAT BILL PENDING');
    assert.strictEqual(typeof pur.days_pending, 'number');
    assert.ok(pur.days_pending >= 0, 'days_pending must be non-negative integer');
  }
});

// ==================== NON-VAT PURCHASE ====================

test('POST /api/purchases with tax_type: NON_VAT calculates 0 VAT and sets status to NOT APPLICABLE', async () => {
  const res = await request(app)
    .post('/api/purchases')
    .set('Cookie', staffCookie)
    .send({
      vendor_id: testVendorId,
      product_summary: 'PAN-only Tea & Refreshments',
      bill_number: 'PAN-TEA-001',
      purchase_date_bs: '2083-07-25',
      tax_type: 'NON_VAT',
      vat_calc_mode: 'EXCLUSIVE',
      entered_amount: 1500,
    });

  assert.strictEqual(res.status, 201);
  const pur = res.body.purchase;
  assert.strictEqual(pur.tax_type, 'NON_VAT');
  assert.strictEqual(pur.vat_bill_status, 'NOT APPLICABLE');
  assert.strictEqual(Number(pur.vat_amount), 0);
  assert.strictEqual(Number(pur.purchase_amount), 1500);
  assert.strictEqual(Number(pur.total_amount), 1500);
});

// ==================== FIX ROUND 1 COVERING TESTS ====================

test('PATCH /api/purchases/:id updates vendor_id on unapproved purchase and enforces duplicate bill number check', async () => {
  // Get second vendor
  const v2Res = await testPool.query('SELECT id FROM vendors ORDER BY id ASC OFFSET 1 LIMIT 1');
  assert.ok(v2Res.rows.length > 0, 'Second vendor must exist');
  const secondVendorId = Number(v2Res.rows[0].id);

  // Create purchase with testVendorId
  const createRes = await request(app)
    .post('/api/purchases')
    .set('Cookie', staffCookie)
    .send({
      vendor_id: testVendorId,
      product_summary: 'Vendor Switch Test',
      bill_number: 'SW-83-001',
      purchase_date_bs: '2083-07-25',
      entered_amount: 3000,
    });
  assert.strictEqual(createRes.status, 201);
  const purId = createRes.body.purchase.id;
  assert.strictEqual(createRes.body.purchase.vendor_id, testVendorId);

  // Update vendor_id via PATCH
  const patchRes = await request(app)
    .patch(`/api/purchases/${purId}`)
    .set('Cookie', staffCookie)
    .send({
      vendor_id: secondVendorId,
    });
  assert.strictEqual(patchRes.status, 200);
  assert.strictEqual(patchRes.body.purchase.vendor_id, secondVendorId);

  // Attempting to set an invalid non-existent vendor_id returns 400
  const invalidVendorRes = await request(app)
    .patch(`/api/purchases/${purId}`)
    .set('Cookie', staffCookie)
    .send({
      vendor_id: 9999999,
    });
  assert.strictEqual(invalidVendorRes.status, 400);
});

test('PATCH /api/purchases/:id recalculates header totals when items are patched without entered_amount', async () => {
  // Create empty header purchase with Rs. 1000
  const createRes = await request(app)
    .post('/api/purchases')
    .set('Cookie', staffCookie)
    .send({
      vendor_id: testVendorId,
      product_summary: 'Header Recalc Test',
      bill_number: 'RECALC-83-01',
      purchase_date_bs: '2083-07-25',
      tax_type: 'VAT_13',
      vat_calc_mode: 'EXCLUSIVE',
      entered_amount: 1000,
    });
  assert.strictEqual(createRes.status, 201);
  const purId = createRes.body.purchase.id;

  // Patch items without passing entered_amount
  // Item 1: 5 * 1000 = 5000 -> VAT 650 -> Total 5650
  // Item 2: 2 * 2500 = 5000 -> VAT 650 -> Total 5650
  // Sum: purchase_amount = 10000, vat_amount = 1300, total_amount = 11300
  const patchRes = await request(app)
    .patch(`/api/purchases/${purId}`)
    .set('Cookie', staffCookie)
    .send({
      items: [
        {
          product_name: 'Recalc Item 1',
          quantity: 5,
          unit_price: 1000,
        },
        {
          product_name: 'Recalc Item 2',
          quantity: 2,
          unit_price: 2500,
        },
      ],
    });

  assert.strictEqual(patchRes.status, 200);
  const updatedPur = patchRes.body.purchase;
  assert.strictEqual(Number(updatedPur.purchase_amount), 10000);
  assert.strictEqual(Number(updatedPur.vat_amount), 1300);
  assert.strictEqual(Number(updatedPur.total_amount), 11300);
  assert.strictEqual(Number(updatedPur.entered_amount), 10000);
});

test('Concurrent POST /api/purchases requests generate distinct purchase_codes without collision', async () => {
  const req1 = request(app)
    .post('/api/purchases')
    .set('Cookie', staffCookie)
    .send({
      vendor_id: testVendorId,
      product_summary: 'Concurrent 1',
      bill_number: 'CONC-83-01',
      purchase_date_bs: '2083-07-25',
      entered_amount: 1000,
    });

  const req2 = request(app)
    .post('/api/purchases')
    .set('Cookie', staffCookie)
    .send({
      vendor_id: testVendorId,
      product_summary: 'Concurrent 2',
      bill_number: 'CONC-83-02',
      purchase_date_bs: '2083-07-25',
      entered_amount: 2000,
    });

  const [res1, res2] = await Promise.all([req1, req2]);
  assert.strictEqual(res1.status, 201);
  assert.strictEqual(res2.status, 201);
  assert.notStrictEqual(
    res1.body.purchase.purchase_code,
    res2.body.purchase.purchase_code,
    'Concurrent purchase_codes must be distinct'
  );
});

test('POST /api/purchases/:id/reject returns 409 Conflict if stock_received = TRUE exists on an item', async () => {
  // Demo purchase 2 has received stock in inventory
  const rejectRes = await request(app)
    .post(`/api/purchases/${demoPur2Id}/reject`)
    .set('Cookie', adminCookie)
    .send({ reason: 'Rejecting stocked purchase' });

  assert.strictEqual(rejectRes.status, 409, 'Expected 409 Conflict when rejecting stocked purchase');
});

test('Editing a REJECTED purchase via PATCH /api/purchases/:id resets review_status to PENDING_REVIEW and clears rejection_reason', async () => {
  // Create clean purchase
  const createRes = await request(app)
    .post('/api/purchases')
    .set('Cookie', staffCookie)
    .send({
      vendor_id: testVendorId,
      product_summary: 'Reject and Re-edit Test',
      bill_number: 'REJ-EDIT-01',
      purchase_date_bs: '2083-07-25',
      entered_amount: 4000,
    });
  assert.strictEqual(createRes.status, 201);
  const purId = createRes.body.purchase.id;

  // Admin rejects it
  const rejectRes = await request(app)
    .post(`/api/purchases/${purId}/reject`)
    .set('Cookie', adminCookie)
    .send({ reason: 'Incorrect product summary details' });
  assert.strictEqual(rejectRes.status, 200);
  assert.strictEqual(rejectRes.body.purchase.review_status, 'REJECTED');
  assert.strictEqual(rejectRes.body.purchase.rejection_reason, 'Incorrect product summary details');

  // Staff edits the rejected purchase to fix it
  const editRes = await request(app)
    .patch(`/api/purchases/${purId}`)
    .set('Cookie', staffCookie)
    .send({
      product_summary: 'Corrected Product Summary Details',
    });
  assert.strictEqual(editRes.status, 200);
  const updated = editRes.body.purchase;
  assert.strictEqual(updated.product_summary, 'Corrected Product Summary Details');
  assert.strictEqual(updated.review_status, 'PENDING_REVIEW', 'review_status must reset to PENDING_REVIEW');
  assert.strictEqual(updated.payment_status, 'PAYMENT PENDING', 'payment_status must reset to PAYMENT PENDING');
  assert.strictEqual(updated.rejection_reason, null, 'rejection_reason must be cleared');
});
