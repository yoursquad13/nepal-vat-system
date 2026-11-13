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

  // Get a test vendor id
  const vendorRes = await testPool.query('SELECT id FROM vendors ORDER BY id ASC LIMIT 1');
  testVendorId = Number(vendorRes.rows[0].id);
});

test.after(async () => {
  await testPool.end();
});

// ==================== AUTHENTICATION & ROLE GUARDS ====================

test('Payments APIs require authentication and Admin role', async () => {
  // 1. Unauthenticated requests return 401
  const unauthRecord = await request(app).post('/api/purchases/1/payments').send({ amount: 1000 });
  assert.strictEqual(unauthRecord.status, 401);

  const unauthVoid = await request(app).post('/api/payments/1/void').send({ voidReason: 'Mistake' });
  assert.strictEqual(unauthVoid.status, 401);

  const unauthSummary = await request(app).get('/api/payments/vendor-summary');
  assert.strictEqual(unauthSummary.status, 401);

  // 2. Staff requests return 403 Forbidden
  const staffRecord = await request(app)
    .post('/api/purchases/1/payments')
    .set('Cookie', staffCookie)
    .send({ amount: 1000 });
  assert.strictEqual(staffRecord.status, 403, 'Staff must not record payments');

  const staffVoid = await request(app)
    .post('/api/payments/1/void')
    .set('Cookie', staffCookie)
    .send({ voidReason: 'Mistake' });
  assert.strictEqual(staffVoid.status, 403, 'Staff must not void payments');

  const staffSummary = await request(app)
    .get('/api/payments/vendor-summary')
    .set('Cookie', staffCookie);
  assert.strictEqual(staffSummary.status, 403, 'Staff must not view vendor summary dashboard');
});

// ==================== REVIEW STATUS GUARD & VAT INDEPENDENCE ====================

test('Payment blocked when review_status !== APPROVED, allowed when vat_bill_status is PENDING', async () => {
  // Create an unapproved purchase in PENDING_REVIEW
  const createRes = await request(app)
    .post('/api/purchases')
    .set('Cookie', staffCookie)
    .send({
      vendor_id: testVendorId,
      bill_number: 'TEST-PAY-001',
      tax_type: 'VAT_13',
      vat_calc_mode: 'EXCLUSIVE',
      entered_amount: 10000, // Rs. 10,000 base -> Rs. 1,300 VAT -> Rs. 11,300 total
      product_summary: 'Pending Review Hardware',
    });
  assert.strictEqual(createRes.status, 201);
  const purId = createRes.body.purchase.id;
  assert.strictEqual(createRes.body.purchase.review_status, 'PENDING_REVIEW');
  assert.strictEqual(createRes.body.purchase.vat_bill_status, 'VAT BILL PENDING');

  // Attempt payment on unapproved purchase -> 409 Conflict
  const unapprovedPay = await request(app)
    .post(`/api/purchases/${purId}/payments`)
    .set('Cookie', adminCookie)
    .send({
      amount: 5000,
      paymentMethod: 'BANK_TRANSFER',
    });
  assert.strictEqual(unapprovedPay.status, 409, 'Payment must be blocked if purchase not APPROVED');

  // Admin approves purchase
  const approveRes = await request(app)
    .post(`/api/purchases/${purId}/approve`)
    .set('Cookie', adminCookie)
    .send({ admin_remarks: 'Approved for payment' });
  assert.strictEqual(approveRes.status, 200);
  assert.strictEqual(approveRes.body.purchase.review_status, 'APPROVED');
  // Notice VAT bill status is still 'VAT BILL PENDING'
  assert.strictEqual(approveRes.body.purchase.vat_bill_status, 'VAT BILL PENDING');

  // Payment is ALLOWED even though vat_bill_status === 'VAT BILL PENDING'
  const payRes = await request(app)
    .post(`/api/purchases/${purId}/payments`)
    .set('Cookie', adminCookie)
    .send({
      amount: 5000,
      paymentMethod: 'BANK_TRANSFER',
      transactionRef: 'TXN-VAT-PENDING-01',
    });
  assert.strictEqual(payRes.status, 201, 'Payment must succeed even when VAT bill is pending');
  assert.strictEqual(Number(payRes.body.purchase.paid_amount), 5000);
  assert.strictEqual(payRes.body.purchase.payment_status, 'PARTIALLY PAID');
});

// ==================== PARTIAL PAYMENTS, SLIP UPLOAD, FULL PAYMENT ====================

test('Recording partial payments transitions APPROVED -> PARTIALLY PAID -> PAID, supports slip upload & file streaming', async () => {
  // Create a clean purchase with entered_amount Rs. 10,000 INCLUSIVE (Total Rs. 10,000)
  const createRes = await request(app)
    .post('/api/purchases')
    .set('Cookie', staffCookie)
    .send({
      vendor_id: testVendorId,
      bill_number: 'TEST-PAY-002',
      tax_type: 'VAT_13',
      vat_calc_mode: 'INCLUSIVE',
      entered_amount: 10000, // Total = 10000.00
      product_summary: 'Dual Payment Electrical Fittings',
    });
  assert.strictEqual(createRes.status, 201);
  const purId = createRes.body.purchase.id;
  assert.strictEqual(Number(createRes.body.purchase.total_amount), 10000);

  // Admin approves purchase
  await request(app)
    .post(`/api/purchases/${purId}/approve`)
    .set('Cookie', adminCookie)
    .send({});

  // 1. First partial payment: Rs. 4,000 with multipart PDF slip upload
  const slipBuffer = Buffer.from('%PDF-1.4 Bank transfer voucher slip content');
  const pay1Res = await request(app)
    .post(`/api/purchases/${purId}/payments`)
    .set('Cookie', adminCookie)
    .field('amount', '4000')
    .field('paymentDateBs', '2083-07-28')
    .field('paymentMethod', 'BANK_TRANSFER')
    .field('transactionRef', 'NABIL-TRF-001')
    .field('companyBankAccount', 'Global IME 0101010101')
    .field('remarks', 'Advance 40% payment')
    .attach('slipFile', slipBuffer, {
      filename: 'Payment_Slip_4000.pdf',
      contentType: 'application/pdf',
    });

  assert.strictEqual(pay1Res.status, 201, `Expected 201: ${JSON.stringify(pay1Res.body)}`);
  assert.strictEqual(Number(pay1Res.body.payment.amount), 4000);
  assert.strictEqual(pay1Res.body.payment.payment_method, 'BANK_TRANSFER');
  assert.strictEqual(pay1Res.body.payment.payment_date_bs, '2083-07-28');
  assert.strictEqual(pay1Res.body.payment.payment_date_ad, bsToAd('2083-07-28'));
  assert.strictEqual(pay1Res.body.payment.is_voided, false);

  // Check slip metadata
  const slip = pay1Res.body.payment.slip || pay1Res.body.payment.slips?.[0];
  assert.ok(slip, 'Payment slip must be returned');
  assert.strictEqual(slip.original_name, 'Payment_Slip_4000.pdf');
  assert.strictEqual(slip.mime_type, 'application/pdf');

  // Check purchase status in response
  assert.strictEqual(Number(pay1Res.body.purchase.paid_amount), 4000);
  assert.strictEqual(pay1Res.body.purchase.payment_status, 'PARTIALLY PAID');
  assert.strictEqual(pay1Res.body.purchase.paid_at, null);

  // Verify slip file streaming through files endpoint
  const streamRes = await request(app)
    .get(`/api/files/payment-slips/${slip.id}`)
    .set('Cookie', adminCookie);
  assert.strictEqual(streamRes.status, 200);
  assert.strictEqual(streamRes.headers['content-type'], 'application/pdf');
  assert.ok(streamRes.headers['content-disposition'].includes('Payment_Slip_4000.pdf'));

  // 2. Second payment: Rs. 6,000 without slip (JSON payload)
  const pay2Res = await request(app)
    .post(`/api/purchases/${purId}/payments`)
    .set('Cookie', adminCookie)
    .send({
      amount: 6000,
      paymentMethod: 'FONEPAY',
      transactionRef: 'FONEPAY-998877',
      remarks: 'Final 60% settlement',
    });

  assert.strictEqual(pay2Res.status, 201);
  assert.strictEqual(Number(pay2Res.body.payment.amount), 6000);
  assert.strictEqual(Number(pay2Res.body.purchase.paid_amount), 10000);
  assert.strictEqual(pay2Res.body.purchase.payment_status, 'PAID');
  assert.ok(pay2Res.body.purchase.paid_at, 'paid_at timestamp must be set on full payment');

  // Verify GET /api/purchases/:id reflects both payments and slip
  const getPur = await request(app)
    .get(`/api/purchases/${purId}`)
    .set('Cookie', adminCookie);
  assert.strictEqual(getPur.status, 200);
  assert.strictEqual(getPur.body.purchase.payment_status, 'PAID');
  assert.strictEqual(getPur.body.payments.length, 2);
});

// ==================== OVERPAYMENT & VALIDATION GUARDS ====================

test('Overpayment and invalid amount guards strictly enforce monetary bounds inside transaction', async () => {
  // Create an approved purchase with entered_amount Rs. 5,000
  const createRes = await request(app)
    .post('/api/purchases')
    .set('Cookie', staffCookie)
    .send({
      vendor_id: testVendorId,
      bill_number: 'TEST-PAY-003',
      tax_type: 'NON_VAT',
      entered_amount: 5000,
      product_summary: 'Guard check purchase',
    });
  const purId = createRes.body.purchase.id;
  await request(app).post(`/api/purchases/${purId}/approve`).set('Cookie', adminCookie).send({});

  // 1. Negative or zero amount rejected (400)
  const zeroPay = await request(app)
    .post(`/api/purchases/${purId}/payments`)
    .set('Cookie', adminCookie)
    .send({ amount: 0 });
  assert.strictEqual(zeroPay.status, 400, 'Zero amount must be rejected with 400');

  const negPay = await request(app)
    .post(`/api/purchases/${purId}/payments`)
    .set('Cookie', adminCookie)
    .send({ amount: -100 });
  assert.strictEqual(negPay.status, 400, 'Negative amount must be rejected with 400');

  // 2. Overpayment (amount > total_amount) rejected (400)
  const overPay = await request(app)
    .post(`/api/purchases/${purId}/payments`)
    .set('Cookie', adminCookie)
    .send({ amount: 5000.01 });
  assert.strictEqual(overPay.status, 400, 'Payment exceeding total balance must return 400');

  // 3. Pay exact partial amount (Rs. 3,000) -> remaining is Rs. 2,000
  const partPay = await request(app)
    .post(`/api/purchases/${purId}/payments`)
    .set('Cookie', adminCookie)
    .send({ amount: 3000 });
  assert.strictEqual(partPay.status, 201);

  // 4. Overpayment on remaining balance (trying to pay Rs. 2000.01) rejected (400)
  const overPartPay = await request(app)
    .post(`/api/purchases/${purId}/payments`)
    .set('Cookie', adminCookie)
    .send({ amount: 2000.01 });
  assert.strictEqual(overPartPay.status, 400, 'Payment exceeding remaining balance must return 400');

  // 5. Pay exact remaining balance (Rs. 2,000) -> PAID
  const fullPay = await request(app)
    .post(`/api/purchases/${purId}/payments`)
    .set('Cookie', adminCookie)
    .send({ amount: 2000 });
  assert.strictEqual(fullPay.status, 201);
  assert.strictEqual(fullPay.body.purchase.payment_status, 'PAID');

  // 6. Attempt payment on already fully PAID purchase -> rejected (400 or 409)
  const extraPay = await request(app)
    .post(`/api/purchases/${purId}/payments`)
    .set('Cookie', adminCookie)
    .send({ amount: 100 });
  assert.ok(extraPay.status === 400 || extraPay.status === 409, 'Payment on already PAID purchase must be rejected');

  // 7. Invalid file extension (.html or .txt) returns 400 and cleans up uploaded file
  const invalidUpload = await request(app)
    .post(`/api/purchases/${purId}/payments`)
    .set('Cookie', adminCookie)
    .field('amount', '100')
    .attach('slipFile', Buffer.from('script file'), {
      filename: 'slip.txt',
      contentType: 'text/plain',
    });
  assert.strictEqual(invalidUpload.status, 400, 'Disallowed MIME must return 400');
});

// ==================== PAYMENT VOIDING & STATUS REVERSALS ====================

test('Admin voids payments with mandatory voidReason, reverting PAID -> PARTIALLY PAID -> APPROVED and logging audit trail', async () => {
  // Create and approve a purchase with Rs. 8,000 total
  const createRes = await request(app)
    .post('/api/purchases')
    .set('Cookie', staffCookie)
    .send({
      vendor_id: testVendorId,
      bill_number: 'TEST-PAY-004',
      tax_type: 'NON_VAT',
      entered_amount: 8000,
      product_summary: 'Void testing equipment',
    });
  const purId = createRes.body.purchase.id;
  await request(app).post(`/api/purchases/${purId}/approve`).set('Cookie', adminCookie).send({});

  // Payment 1: Rs. 3,000
  const pay1Res = await request(app)
    .post(`/api/purchases/${purId}/payments`)
    .set('Cookie', adminCookie)
    .send({ amount: 3000, remarks: 'Payment 1' });
  const pay1Id = pay1Res.body.payment.id;

  // Payment 2: Rs. 5,000 -> PAID
  const pay2Res = await request(app)
    .post(`/api/purchases/${purId}/payments`)
    .set('Cookie', adminCookie)
    .send({ amount: 5000, remarks: 'Payment 2' });
  const pay2Id = pay2Res.body.payment.id;
  assert.strictEqual(pay2Res.body.purchase.payment_status, 'PAID');
  assert.ok(pay2Res.body.purchase.paid_at);

  // 1. Attempt to void without reason -> 400 Bad Request
  const emptyReasonVoid = await request(app)
    .post(`/api/payments/${pay2Id}/void`)
    .set('Cookie', adminCookie)
    .send({ voidReason: '   ' });
  assert.strictEqual(emptyReasonVoid.status, 400, 'Empty voidReason must return 400');

  // 2. Void Payment 2 (Rs. 5,000) with valid reason
  const voidPay2 = await request(app)
    .post(`/api/payments/${pay2Id}/void`)
    .set('Cookie', adminCookie)
    .send({ voidReason: 'Entered wrong bank account reference' });
  assert.strictEqual(voidPay2.status, 200, `Expected 200: ${JSON.stringify(voidPay2.body)}`);
  assert.strictEqual(voidPay2.body.payment.is_voided, true);
  assert.strictEqual(voidPay2.body.payment.void_reason, 'Entered wrong bank account reference');
  assert.ok(voidPay2.body.payment.voided_at);

  // Purchase should revert from PAID to PARTIALLY PAID with paid_amount = 3000 and paid_at = null
  assert.strictEqual(Number(voidPay2.body.purchase.paid_amount), 3000);
  assert.strictEqual(voidPay2.body.purchase.payment_status, 'PARTIALLY PAID');
  assert.strictEqual(voidPay2.body.purchase.paid_at, null);

  // 3. Attempt to void Payment 2 again -> 409 Conflict (already voided)
  const duplicateVoid = await request(app)
    .post(`/api/payments/${pay2Id}/void`)
    .set('Cookie', adminCookie)
    .send({ voidReason: 'Attempting duplicate void' });
  assert.strictEqual(duplicateVoid.status, 409, 'Voiding already voided payment must return 409 Conflict');

  // 4. Void Payment 1 (Rs. 3,000)
  const voidPay1 = await request(app)
    .post(`/api/payments/${pay1Id}/void`)
    .set('Cookie', adminCookie)
    .send({ voidReason: 'Vendor refunded check' });
  assert.strictEqual(voidPay1.status, 200);
  assert.strictEqual(voidPay1.body.payment.is_voided, true);

  // Purchase should revert to APPROVED with paid_amount = 0 and paid_at = null
  assert.strictEqual(Number(voidPay1.body.purchase.paid_amount), 0);
  assert.strictEqual(voidPay1.body.purchase.payment_status, 'APPROVED');
  assert.strictEqual(voidPay1.body.purchase.paid_at, null);

  // 5. Verify audit logs record RECORD_PAYMENT and VOID_PAYMENT
  const logsRes = await testPool.query(
    `SELECT action, summary, entity_type FROM activity_logs WHERE entity_type = 'PAYMENT' ORDER BY id DESC LIMIT 4`
  );
  assert.ok(logsRes.rows.some((l) => l.action === 'VOID_PAYMENT'), 'VOID_PAYMENT action logged');
  assert.ok(logsRes.rows.some((l) => l.action === 'RECORD_PAYMENT'), 'RECORD_PAYMENT action logged');
});

// ==================== VENDOR SUMMARY DASHBOARD ====================

test('GET /api/payments/vendor-summary: Admin views KPI totals, vendor table rows, and unpaid purchases drilldown', async () => {
  const summaryRes = await request(app)
    .get('/api/payments/vendor-summary')
    .set('Cookie', adminCookie);

  assert.strictEqual(summaryRes.status, 200, `Expected 200: ${JSON.stringify(summaryRes.body)}`);

  // Check top-level KPIs
  const body = summaryRes.body;
  const summary = body.summary || body;
  assert.ok(typeof summary.total_purchases === 'number');
  assert.ok(typeof summary.total_purchase_amount === 'number');
  assert.ok(typeof summary.total_vat_amount === 'number');
  assert.ok(typeof summary.total_paid_amount === 'number');
  assert.ok(typeof summary.total_unpaid_amount === 'number');
  assert.ok(typeof summary.pending_payments_count === 'number');
  assert.ok(typeof summary.pending_vat_bills_count === 'number');

  // Check vendors array
  assert.ok(Array.isArray(body.vendors), 'vendors list must be an array');
  const vendorRow = body.vendors.find((v: any) => Number(v.vendor_id) === testVendorId);
  assert.ok(vendorRow, 'test vendor should be present in summary');
  assert.ok(vendorRow.company_name);
  assert.ok(typeof vendorRow.purchase_amount === 'number');
  assert.ok(typeof vendorRow.vat_amount === 'number');
  assert.ok(typeof vendorRow.total_amount === 'number');
  assert.ok(typeof vendorRow.paid_amount === 'number');
  assert.ok(typeof vendorRow.unpaid_amount === 'number');

  // Check unpaid purchases drilldown
  assert.ok(Array.isArray(body.unpaid_purchases), 'unpaid_purchases must be an array');
  if (body.unpaid_purchases.length > 0) {
    const unpaid = body.unpaid_purchases[0];
    assert.ok(unpaid.purchase_code);
    assert.ok(unpaid.vendor_name || unpaid.company_name);
    assert.ok(typeof unpaid.remaining_balance === 'number' || typeof unpaid.unpaid_amount === 'number');
  }

  // Filter by vendorId
  const vendorFiltered = await request(app)
    .get(`/api/payments/vendor-summary?vendorId=${testVendorId}`)
    .set('Cookie', adminCookie);
  assert.strictEqual(vendorFiltered.status, 200);
  assert.ok(Array.isArray(vendorFiltered.body.vendors));
  assert.ok(vendorFiltered.body.vendors.every((v: any) => Number(v.vendor_id) === testVendorId));
  assert.ok(vendorFiltered.body.unpaid_purchases.every((p: any) => Number(p.vendor_id) === testVendorId));
});
