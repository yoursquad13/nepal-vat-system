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
import { calculateDiscountedPurchase } from '../src/utils/money.js';
import {
  normalizeNepaliDigits,
  normalizeDateToken,
  normalizeExtractedBill,
  matchVendorFromDb,
  setBillExtractorOverride,
} from '../src/services/billExtractor.js';

const testPool = new pg.Pool({ connectionString: testDbUrl });
const app = createApp();

let staffCookie: string;
let vendorId: number;

test.before(async () => {
  await testPool.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await runMigrations(testDbUrl);
  await seedDatabase({ withDemo: false, databaseUrl: testDbUrl });

  const vRes = await testPool.query(
    `INSERT INTO vendors (company_name, pan_number, vat_number, address, is_active)
     VALUES ('Bhairavkunda Spring Water Pvt. Ltd.', '610005257', '610005257', 'Sindhupalchok', TRUE)
     RETURNING id`
  );
  vendorId = Number(vRes.rows[0].id);

  const staffLogin = await request(app)
    .post('/api/auth/login')
    .send({ username: 'staff', password: 'Staff@123' });
  const cookies = staffLogin.headers['set-cookie'];
  assert.ok(cookies);
  staffCookie = cookies.find((c: string) => c.startsWith('token='))!;
});

test.afterEach(() => {
  setBillExtractorOverride(null);
});

test.after(async () => {
  await testPool.end();
});

test('normalizeNepaliDigits and normalizeDateToken convert Devanagari numerals and slashes cleanly', () => {
  assert.equal(normalizeNepaliDigits('बिल नं. ०३७१ / २०८३-०७-१५'), 'बिल नं. 0371 / 2083-07-15');
  assert.equal(normalizeDateToken('२०८३/०७/२७'), '2083-07-27');
  assert.equal(normalizeDateToken('2083.7.9'), '2083-07-09');
  assert.equal(normalizeDateToken('not-a-date'), null);
});

test('normalizeExtractedBill enforces TAX_INVOICE exclusive rules and resolves BS/AD dates', () => {
  const { extracted, warnings } = normalizeExtractedBill({
    document_type: 'TAX_INVOICE',
    language: 'MIXED',
    vendor: {
      name: 'रोसिल सप्लायर्स',
      name_english: 'Rosil Suppliers',
      vat_number: '३०४३७५७८१',
      address: 'कपन, काठमाण्डौ',
    },
    bill_number: '०३७१',
    purchase_date_bs: '2083/07/15',
    tax_type: 'VAT_13',
    vat_calc_mode: 'EXCLUSIVE',
    payment_mode: 'Cash',
    product_summary: 'Lays 70g Mix',
    taxable_amount: 10343.76,
    vat_amount: 1344.68,
    total_amount: 11688.44,
    line_items: [
      {
        name: '1905 Lays 70g Mix',
        unit: 'pcs',
        quantity: 168,
        unit_price: 61.57,
        line_total: 10343.76,
      },
    ],
  });

  assert.equal(warnings.length, 0);
  assert.equal(extracted.vendor.pan_number, '304375781');
  assert.equal(extracted.vendor.vat_number, '304375781');
  assert.equal(extracted.bill_number, '0371');
  assert.equal(extracted.purchase_date_bs, '2083-07-15');
  assert.ok(extracted.purchase_date_ad && /^\d{4}-\d{2}-\d{2}$/.test(extracted.purchase_date_ad));
  assert.equal(extracted.fiscal_year, '2083/84');
  assert.equal(extracted.vat_calc_mode, 'EXCLUSIVE');
  assert.equal(extracted.entered_amount, 10343.76);
  assert.equal(extracted.remarks, 'Payment Mode: Cash');
});

test('normalizeExtractedBill enforces ABBREVIATED_TAX_INVOICE inclusive mode and handles invalid BS dates safely', () => {
  const { extracted, warnings } = normalizeExtractedBill({
    document_type: 'ABBREVIATED_TAX_INVOICE',
    language: 'NE',
    vendor: {
      name: 'रमेश बर्मा ट्रेडिङ्ग एण्ड सप्लायर्स प्रा. लि.',
      vat_number: '६२३६९५७२०',
    },
    bill_number: '००३',
    purchase_date_bs: '2083-02-35', // invalid day for Jestha 2083
    total_amount: 7990,
    line_items: [
      { name: 'Lizol', unit: 'pcs', quantity: 1, unit_price: 0, line_total: 450 },
    ],
  });

  assert.equal(extracted.tax_type, 'VAT_13');
  assert.equal(extracted.vat_calc_mode, 'INCLUSIVE');
  assert.equal(extracted.vat_amount, 919.2);
  assert.equal(extracted.taxable_amount, 7070.8);
  assert.equal(extracted.entered_amount, 7990);
  assert.equal(extracted.line_items[0].unit_price, 450);
  assert.equal(extracted.purchase_date_bs, null);
  assert.ok(warnings.some((w) => w.includes('2083-02-35')));
});

test('matchVendorFromDb matches by exact 9-digit PAN/VAT or normalized company name', async () => {
  const byPan = await matchVendorFromDb({
    name: 'Some Different Name',
    name_english: null,
    pan_number: '610005257',
    vat_number: null,
    phone: null,
    address: null,
  });
  assert.ok(byPan);
  assert.equal(byPan.id, vendorId);
  assert.equal(byPan.match_reason, 'PAN_OR_VAT_MATCH');

  const byName = await matchVendorFromDb({
    name: 'Bhairavkunda Spring Water',
    name_english: null,
    pan_number: null,
    vat_number: null,
    phone: null,
    address: null,
  });
  assert.ok(byName);
  assert.equal(byName.id, vendorId);
  assert.equal(byName.match_reason, 'NAME_MATCH');
});

test('POST /api/purchases/extract-bill enforces auth, file validation, and returns extracted JSON', async () => {
  // Unauthenticated
  const unauthRes = await request(app).post('/api/purchases/extract-bill');
  assert.equal(unauthRes.status, 401);

  // Missing file
  const missingFileRes = await request(app)
    .post('/api/purchases/extract-bill')
    .set('Cookie', staffCookie);
  assert.equal(missingFileRes.status, 400);

  // Unsupported file type
  const badFileRes = await request(app)
    .post('/api/purchases/extract-bill')
    .set('Cookie', staffCookie)
    .attach('file', Buffer.from('not an image'), {
      filename: 'notes.txt',
      contentType: 'text/plain',
    });
  assert.equal(badFileRes.status, 400);

  // Valid upload with injected extractor
  setBillExtractorOverride(async ({ mimeType }) => {
    assert.equal(mimeType, 'image/jpeg');
    const matched = await matchVendorFromDb({
      name: 'Bhairavkunda Spring Water Pvt. Ltd.',
      name_english: 'Bhairavkunda Spring Water Pvt. Ltd.',
      pan_number: '610005257',
      vat_number: '610005257',
      phone: null,
      address: 'Sindhupalchok',
    });
    return {
      extracted: normalizeExtractedBill({
        document_type: 'TAX_INVOICE',
        language: 'EN',
        vendor: {
          name: 'Bhairavkunda Spring Water Pvt. Ltd.',
          pan_number: '610005257',
        },
        bill_number: '459',
        purchase_date_bs: '2083-07-09',
        tax_type: 'VAT_13',
        vat_calc_mode: 'EXCLUSIVE',
        product_summary: '750 ml bottle water',
        taxable_amount: 12945.13,
        vat_amount: 1682.87,
        total_amount: 14627.99,
        line_items: [
          { name: '750 ml bottle water', unit: 'ctn', quantity: 53, unit_price: 244.24, line_total: 12945.13 },
        ],
      }).extracted,
      matched_vendor: matched,
      warnings: [],
      model: 'gemini-3-flash-preview',
    };
  });

  const okRes = await request(app)
    .post('/api/purchases/extract-bill')
    .set('Cookie', staffCookie)
    .attach('file', Buffer.from([0xff, 0xd8, 0xff, 0xe0]), {
      filename: 'bill.jpg',
      contentType: 'image/jpeg',
    });

  assert.equal(okRes.status, 200);
  assert.equal(okRes.body.extracted.bill_number, '459');
  assert.equal(okRes.body.matched_vendor.id, vendorId);
});

test('calculateDiscountedPurchase matches Dreamy Boutique Hotel #268 bill math, INCLUSIVE mode, and validation', () => {
  const exactLineAmounts = [3451.32, 2831.85, 5575.22, 2212.38, 2123.89, 3451.32, 2831.85, 2654.86, 1858.4];
  assert.equal(Number(exactLineAmounts.reduce((a, b) => a + b, 0).toFixed(2)), 26991.09);

  const calc = calculateDiscountedPurchase({
    lineAmounts: exactLineAmounts,
    discountAmount: 3778.71,
    taxType: 'VAT_13',
    mode: 'EXCLUSIVE',
  });

  assert.equal(calc.discountAmount, '3778.71');
  assert.equal(calc.enteredAmount, '23212.38');
  assert.equal(calc.purchaseAmount, '23212.38');
  assert.equal(calc.vatAmount, '3017.61');
  assert.equal(calc.totalAmount, '26229.99');
  assert.equal(calc.items.length, 9);

  const sumItemBases = calc.items.reduce((acc, it) => acc + Number(it.baseAmount), 0);
  const sumItemDiscounts = calc.items.reduce((acc, it) => acc + it.discountPaisa, 0);
  assert.equal(sumItemDiscounts, 377871);
  assert.equal(sumItemBases.toFixed(2), '23212.38');

  // INCLUSIVE mode with single amount
  const incl = calculateDiscountedPurchase({
    enteredAmount: 1230,
    discountAmount: 100,
    taxType: 'VAT_13',
    mode: 'INCLUSIVE',
  });
  assert.equal(incl.discountAmount, '100.00');
  assert.equal(incl.enteredAmount, '1130.00');
  assert.equal(incl.purchaseAmount, '1000.00');
  assert.equal(incl.vatAmount, '130.00');
  assert.equal(incl.totalAmount, '1130.00');

  // Validation errors
  assert.throws(
    () =>
      calculateDiscountedPurchase({
        enteredAmount: 500,
        discountAmount: -1,
        taxType: 'VAT_13',
        mode: 'EXCLUSIVE',
      }),
    /cannot be negative/i
  );
  assert.throws(
    () =>
      calculateDiscountedPurchase({
        lineAmounts: [100, 200],
        discountAmount: 300.01,
        taxType: 'VAT_13',
        mode: 'EXCLUSIVE',
      }),
    /cannot exceed subtotal before discount/i
  );
});

test('normalizeExtractedBill derives discount_percent and handles discounted bills cleanly', () => {
  const { extracted, warnings } = normalizeExtractedBill({
    document_type: 'TAX_INVOICE',
    language: 'EN',
    vendor: {
      name: 'Dreamy Boutique Hotel',
      pan_number: '623530470',
    },
    bill_number: '268',
    purchase_date_bs: '2083-06-22',
    tax_type: 'VAT_13',
    vat_calc_mode: 'EXCLUSIVE',
    product_summary: 'Food & Restaurant Order',
    subtotal_before_discount: 26991.09,
    discount_amount: 3778.71,
    taxable_amount: 23212.38,
    vat_amount: 3017.62,
    total_amount: 26230,
    line_items: [
      { name: 'Veg cheeze pizza', unit: 'pcs', quantity: 6, unit_price: 575.22, line_total: 3451.32 },
    ],
  });

  assert.equal(extracted.subtotal_before_discount, 26991.09);
  assert.equal(extracted.discount_amount, 3778.71);
  assert.equal(extracted.discount_percent, 14);
  assert.equal(extracted.taxable_amount, 23212.38);
  assert.equal(extracted.entered_amount, 23212.38);
  assert.equal(extracted.vat_amount, 3017.62);
  assert.equal(extracted.total_amount, 26230);
  assert.equal(warnings.length, 0);
});

test('POST /api/purchases, PATCH /api/purchases/:id, and receive-stock handle discounts accurately', async () => {
  const adminLogin = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'Admin@123' });
  assert.equal(adminLogin.status, 200);
  const adminCookie = (adminLogin.headers['set-cookie'] || []).find((c: string) =>
    c.startsWith('token=')
  )!;

  const prodRes = await testPool.query(
    `INSERT INTO products (name, sku, unit_of_measurement, current_stock, avg_purchase_price, latest_purchase_price, is_active)
     VALUES ('Pizza Test Item', 'PIZ-DISC-01', 'pcs', 0, 0, 0, TRUE)
     RETURNING id`
  );
  const productId = Number(prodRes.rows[0].id);

  // 1. POST with items + discount_amount
  const itemsPayload = [
    { product_id: productId, product_name: 'Pizza Test Item', quantity: 10, unit_of_measurement: 'pcs', unit_price: 200 },
    { product_name: 'Side Salad', quantity: 5, unit_of_measurement: 'pcs', unit_price: 100 },
  ];
  const createItemsRes = await request(app)
    .post('/api/purchases')
    .set('Cookie', staffCookie)
    .send({
      vendor_id: vendorId,
      product_summary: 'Discounted Food Supplies',
      purchase_date_ad: '2026-11-14',
      purchase_date_bs: '2083-07-28',
      fiscal_year: '2083/84',
      tax_type: 'VAT_13',
      vat_calc_mode: 'EXCLUSIVE',
      discount_amount: 500,
      items: JSON.stringify(itemsPayload),
    });

  assert.equal(createItemsRes.status, 201);
  const createdId = Number(createItemsRes.body.purchase.id);
  // Gross = 2000 + 500 = 2500, Discount = 500 -> Net = 2000, VAT = 260, Total = 2260
  assert.equal(createItemsRes.body.purchase.discount_amount, 500);
  assert.equal(createItemsRes.body.purchase.entered_amount, 2000);
  assert.equal(createItemsRes.body.purchase.purchase_amount, 2000);
  assert.equal(createItemsRes.body.purchase.vat_amount, 260);
  assert.equal(createItemsRes.body.purchase.total_amount, 2260);
  // Proportionally allocated: item 1 gets 400 discount -> net 1600 -> avg cost 160/pc
  assert.equal(Number(createItemsRes.body.items[0].line_subtotal), 1600);
  assert.equal(Number(createItemsRes.body.items[1].line_subtotal), 400);

  // 2. PATCH updating discount_amount (without re-sending items)
  const patchDiscRes = await request(app)
    .patch(`/api/purchases/${createdId}`)
    .set('Cookie', staffCookie)
    .send({ discount_amount: 250 });

  assert.equal(patchDiscRes.status, 200);
  assert.equal(patchDiscRes.body.purchase.discount_amount, 250);
  assert.equal(patchDiscRes.body.purchase.purchase_amount, 2250);
  assert.equal(patchDiscRes.body.purchase.vat_amount, 292.5);
  assert.equal(patchDiscRes.body.purchase.total_amount, 2542.5);
  // Proportionally allocated: item 1 gets 200 discount -> net 1800 -> avg cost 180/pc
  assert.equal(Number(patchDiscRes.body.items[0].line_subtotal), 1800);

  // 3. Approve and receive-stock -> verify weighted avg cost uses discounted line_subtotal (1800 / 10 = 180)
  const approveRes = await request(app)
    .post(`/api/purchases/${createdId}/approve`)
    .set('Cookie', adminCookie)
    .send({ action: 'APPROVE' });
  assert.equal(approveRes.status, 200);

  const stockRes = await request(app)
    .post(`/api/purchases/${createdId}/receive-stock`)
    .set('Cookie', staffCookie)
    .send({});
  assert.equal(stockRes.status, 200);

  const checkProd = await testPool.query(
    'SELECT current_stock, avg_purchase_price FROM products WHERE id = $1',
    [productId]
  );
  assert.equal(Number(checkProd.rows[0].current_stock), 10);
  assert.equal(Number(checkProd.rows[0].avg_purchase_price), 180);

  // 4. POST & PATCH single-amount + discount_amount
  const createSingleRes = await request(app)
    .post('/api/purchases')
    .set('Cookie', staffCookie)
    .send({
      vendor_id: vendorId,
      product_summary: 'Quick Discounted Entry',
      purchase_date_ad: '2026-11-14',
      purchase_date_bs: '2083-07-28',
      fiscal_year: '2083/84',
      tax_type: 'VAT_13',
      vat_calc_mode: 'EXCLUSIVE',
      entered_amount: 1000,
      discount_amount: 100,
    });
  assert.equal(createSingleRes.status, 201);
  assert.equal(createSingleRes.body.purchase.discount_amount, 100);
  assert.equal(createSingleRes.body.purchase.entered_amount, 900);
  assert.equal(createSingleRes.body.purchase.purchase_amount, 900);
  assert.equal(createSingleRes.body.purchase.vat_amount, 117);
  assert.equal(createSingleRes.body.purchase.total_amount, 1017);

  const singleId = Number(createSingleRes.body.purchase.id);
  const patchSingleRes = await request(app)
    .patch(`/api/purchases/${singleId}`)
    .set('Cookie', staffCookie)
    .send({ discount_amount: 200 });
  assert.equal(patchSingleRes.status, 200);
  // Gross stays 900 + 100 = 1000 -> minus new 200 = 800
  assert.equal(patchSingleRes.body.purchase.discount_amount, 200);
  assert.equal(patchSingleRes.body.purchase.entered_amount, 800);
  assert.equal(patchSingleRes.body.purchase.purchase_amount, 800);
  assert.equal(patchSingleRes.body.purchase.vat_amount, 104);
  assert.equal(patchSingleRes.body.purchase.total_amount, 904);
});

test('POST and PATCH /api/purchases support exact printed totals alongside line items and discount without tampering', async () => {
  const dreamyItems = [
    { product_name: 'Veg cheeze pizza', quantity: 6, unit_price: 575.22 },
    { product_name: 'Chicken pizza', quantity: 4, unit_price: 707.96 },
    { product_name: 'Chicken sekuwa 1/2', quantity: 7, unit_price: 796.46 },
    { product_name: 'Hot garlic wings', quantity: 5, unit_price: 442.47 },
    { product_name: 'Fruit salad', quantity: 4, unit_price: 530.97 },
    { product_name: 'Buff sukuti sadheko', quantity: 6, unit_price: 575.22 },
    { product_name: 'Mix Keema Noodles', quantity: 8, unit_price: 353.98 },
    { product_name: 'Pork sekuwa', quantity: 5, unit_price: 530.97 },
    { product_name: 'Mutton dum biryani', quantity: 3, unit_price: 619.46 },
  ];

  // Valid seller-rounding override keeping all 9 line items + discount + exact printed totals
  const createRes = await request(app)
    .post('/api/purchases')
    .set('Cookie', staffCookie)
    .send({
      vendor_id: vendorId,
      product_summary: 'Dreamy Boutique Hotel Food Order',
      purchase_date_ad: '2026-10-08',
      purchase_date_bs: '2083-06-22',
      fiscal_year: '2083/84',
      tax_type: 'VAT_13',
      vat_calc_mode: 'EXCLUSIVE',
      entered_amount: 26991.09,
      discount_amount: 3778.71,
      exact_vat_amount: 3017.62,
      exact_total_amount: 26230.0,
      items: JSON.stringify(dreamyItems),
    });

  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.items.length, 9);
  assert.equal(createRes.body.purchase.discount_amount, 3778.71);
  assert.equal(createRes.body.purchase.entered_amount, 23212.38);
  assert.equal(createRes.body.purchase.purchase_amount, 23212.38);
  assert.equal(createRes.body.purchase.vat_amount, 3017.62);
  assert.equal(createRes.body.purchase.total_amount, 26230);

  // Reject excessive tampering beyond +/- Rs. 5 rounding allowance
  const tamperRes = await request(app)
    .post('/api/purchases')
    .set('Cookie', staffCookie)
    .send({
      vendor_id: vendorId,
      product_summary: 'Excessive Override Attempt',
      purchase_date_ad: '2026-10-08',
      purchase_date_bs: '2083-06-22',
      fiscal_year: '2083/84',
      tax_type: 'VAT_13',
      vat_calc_mode: 'EXCLUSIVE',
      entered_amount: 1000,
      exact_vat_amount: 500,
      exact_total_amount: 1500,
    });
  assert.equal(tamperRes.status, 400);
});
