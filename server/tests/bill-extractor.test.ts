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
