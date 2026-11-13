import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
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

test('1. Authentication guards across all dashboard, search, reports, and backups endpoints', async () => {
  const dashRes = await request(app).get('/api/dashboard');
  assert.equal(dashRes.status, 401, 'Unauthenticated GET /api/dashboard must return 401');

  const searchRes = await request(app).get('/api/search?q=test');
  assert.equal(searchRes.status, 401, 'Unauthenticated GET /api/search must return 401');

  const reportRes = await request(app).get('/api/reports/vat-summary');
  assert.equal(reportRes.status, 401, 'Unauthenticated GET /api/reports/:type must return 401');

  const exportRes = await request(app).get('/api/reports/vat-summary/export?format=csv');
  assert.equal(exportRes.status, 401, 'Unauthenticated GET /api/reports/:type/export must return 401');

  const backupsRes = await request(app).get('/api/backups');
  assert.equal(backupsRes.status, 401, 'Unauthenticated GET /api/backups must return 401');

  const postBackupRes = await request(app).post('/api/backups').send({ format: 'json' });
  assert.equal(postBackupRes.status, 401, 'Unauthenticated POST /api/backups must return 401');
});

test('2. Global Search: searches products, vendors with contact info, and purchases', async () => {
  // Empty query returns empty structures
  const emptyRes = await request(app)
    .get('/api/search?q=')
    .set('Cookie', staffCookie);
  assert.equal(emptyRes.status, 200);
  assert.deepEqual(emptyRes.body.products, []);
  assert.deepEqual(emptyRes.body.vendors, []);
  assert.deepEqual(emptyRes.body.purchases, []);

  // Search "Cement" -> finds product Shivam OPC Cement + vendor details
  const cementRes = await request(app)
    .get('/api/search?q=Cement')
    .set('Cookie', staffCookie);
  assert.equal(cementRes.status, 200);
  assert.ok(cementRes.body.products.length >= 1, 'Should find at least 1 product');
  const cementProd = cementRes.body.products.find((p: any) =>
    p.name.includes('Shivam OPC Cement')
  );
  assert.ok(cementProd, 'Should find Shivam OPC Cement product');
  assert.ok(Array.isArray(cementProd.vendors), 'Product search should include vendors purchased from');
  assert.ok(cementProd.vendors.length >= 1, 'Product should have at least 1 supplier vendor');
  const supplier = cementProd.vendors[0];
  assert.ok(supplier.company_name.includes('Shivam'), 'Supplier should be Shivam Cements');
  assert.ok(supplier.contact_number, 'Supplier must include contact number');

  // Search by PAN number -> finds vendor Shivam Cements with pending/recent purchases
  const panRes = await request(app)
    .get('/api/search?q=301234567')
    .set('Cookie', staffCookie);
  assert.equal(panRes.status, 200);
  assert.ok(panRes.body.vendors.length >= 1, 'Should find vendor by PAN');
  assert.equal(panRes.body.vendors[0].pan_number, '301234567');
  assert.ok(Array.isArray(panRes.body.vendors[0].recent_purchases), 'Vendor should include recent purchases');

  // Search by phone number -> finds vendor by phone
  const phoneRes = await request(app)
    .get('/api/search?q=9851012345')
    .set('Cookie', staffCookie);
  assert.equal(phoneRes.status, 200);
  assert.ok(phoneRes.body.vendors.length >= 1, 'Should find vendor by phone number');

  // Search by bill number / purchase code -> finds purchase
  const billRes = await request(app)
    .get('/api/search?q=SHV-83-1042')
    .set('Cookie', staffCookie);
  assert.equal(billRes.status, 200);
  assert.ok(billRes.body.purchases.length >= 1, 'Should find purchase by bill number');
  assert.equal(billRes.body.purchases[0].bill_number, 'SHV-83-1042');
  assert.ok(billRes.body.purchases[0].vendor_name, 'Purchase result must include vendor_name');

  // Wildcard characters escaping test: % and _ should not cause SQL error
  const wildcardRes = await request(app)
    .get('/api/search?q=%25_test')
    .set('Cookie', staffCookie);
  assert.equal(wildcardRes.status, 200, 'Search with % and _ should succeed safely');
});

test('3. Dashboard: Admin receives full analytics, charts, KPIs, low-stock alerts, and date filtering', async () => {
  const dashRes = await request(app)
    .get('/api/dashboard')
    .set('Cookie', adminCookie);
  assert.equal(dashRes.status, 200);
  const data = dashRes.body;

  // KPIs
  assert.ok(data.kpis, 'Dashboard must return kpis object');
  assert.ok(typeof data.kpis.total_purchases_count === 'number');
  assert.ok(typeof data.kpis.total_purchase_amount === 'number');
  assert.ok(typeof data.kpis.total_vat_amount === 'number');
  assert.ok(typeof data.kpis.total_amount_inc_vat === 'number');
  assert.ok(typeof data.kpis.total_paid_amount === 'number');
  assert.ok(typeof data.kpis.total_outstanding_amount === 'number');
  assert.ok(typeof data.kpis.pending_vat_bills_count === 'number');
  assert.ok(typeof data.kpis.total_vendors_count === 'number');
  assert.ok(typeof data.kpis.total_products === 'number');
  assert.ok(typeof data.kpis.total_inventory_valuation === 'number');

  // Charts
  assert.ok(Array.isArray(data.charts.monthly_series), 'monthly_series chart array must exist');
  assert.ok(Array.isArray(data.charts.vendor_wise_purchases), 'vendor_wise_purchases chart array must exist');
  assert.ok(data.charts.paid_vs_unpaid, 'paid_vs_unpaid chart data must exist');
  assert.ok(data.charts.vat_status_breakdown, 'vat_status_breakdown chart data must exist');

  // Recent entries and low stock
  assert.ok(Array.isArray(data.recent_entries), 'recent_entries must be an array');
  assert.ok(Array.isArray(data.low_stock_alerts), 'low_stock_alerts must be an array');

  // Date filtering: preset=this_month_bs
  const filteredDash = await request(app)
    .get('/api/dashboard?preset=this_month_bs')
    .set('Cookie', adminCookie);
  assert.equal(filteredDash.status, 200);

  // Staff accessing dashboard gets 200 with operational KPIs
  const staffDash = await request(app)
    .get('/api/dashboard')
    .set('Cookie', staffCookie);
  assert.equal(staffDash.status, 200);
  assert.ok(staffDash.body.kpis, 'Staff dashboard must return kpis');
  assert.ok(Array.isArray(staffDash.body.recent_entries), 'Staff dashboard must return recent_entries');
});

test('4. Reports: covers all 15 report types in JSON format', async () => {
  const allSlugs = [
    // 7 Purchase/VAT reports
    'daily-purchases',
    'monthly-purchases',
    'vendor-purchases',
    'vat-pending',
    'payment-pending',
    'paid-bills',
    'vat-summary',
    // 8 Inventory reports
    'product-stock',
    'stock-in',
    'stock-out',
    'vendor-products',
    'monthly-inventory',
    'stock-valuation',
    'low-stock',
    'stock-adjustments',
  ];

  for (const slug of allSlugs) {
    const res = await request(app)
      .get(`/api/reports/${slug}`)
      .set('Cookie', staffCookie);
    assert.equal(res.status, 200, `Report ${slug} must return 200 OK`);
    assert.equal(res.body.report_type, slug, `report_type must match slug for ${slug}`);
    assert.ok(typeof res.body.title === 'string', `title must be string for ${slug}`);
    assert.ok(Array.isArray(res.body.columns), `columns must be array for ${slug}`);
    assert.ok(Array.isArray(res.body.rows), `rows must be array for ${slug}`);
    assert.ok(res.body.summary !== undefined, `summary must be present for ${slug}`);
    assert.ok(res.body.filters !== undefined, `filters must be present for ${slug}`);
  }

  // Unknown report type returns 400
  const unknownRes = await request(app)
    .get('/api/reports/non-existent-report')
    .set('Cookie', staffCookie);
  assert.equal(unknownRes.status, 400, 'Unknown report slug must return 400 Bad Request');
});

test('5. Reports Export: supports CSV, XLSX, and PDF exports with proper headers and payloads', async () => {
  // Test CSV export of vat-summary
  const csvRes = await request(app)
    .get('/api/reports/vat-summary/export?format=csv')
    .set('Cookie', staffCookie);
  assert.equal(csvRes.status, 200);
  assert.match(csvRes.headers['content-type'], /text\/csv/);
  assert.match(csvRes.headers['content-disposition'], /attachment; filename="vat-summary/);
  assert.ok(csvRes.text.length > 0, 'CSV export text should not be empty');

  // Test XLSX export of vat-summary
  const xlsxRes = await request(app)
    .get('/api/reports/vat-summary/export?format=xlsx')
    .set('Cookie', staffCookie);
  assert.equal(xlsxRes.status, 200);
  assert.match(
    xlsxRes.headers['content-type'],
    /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/
  );
  assert.match(xlsxRes.headers['content-disposition'], /attachment; filename="vat-summary/);
  assert.ok(
    (typeof xlsxRes.text === 'string' && xlsxRes.text.length > 0) ||
      Buffer.isBuffer(xlsxRes.body) ||
      (xlsxRes.body && Object.keys(xlsxRes.body).length > 0),
    'XLSX export should return binary content'
  );

  // Test PDF export of vat-summary
  const pdfRes = await request(app)
    .get('/api/reports/vat-summary/export?format=pdf')
    .set('Cookie', staffCookie);
  assert.equal(pdfRes.status, 200);
  assert.match(pdfRes.headers['content-type'], /application\/pdf/);
  assert.match(pdfRes.headers['content-disposition'], /attachment; filename="vat-summary/);
  assert.ok(
    (typeof pdfRes.text === 'string' && pdfRes.text.length > 0) ||
      Buffer.isBuffer(pdfRes.body) ||
      (pdfRes.body && Object.keys(pdfRes.body).length > 0),
    'PDF export should return binary content'
  );

  // Test CSV, XLSX, PDF on an inventory report (product-stock)
  for (const fmt of ['csv', 'xlsx', 'pdf']) {
    const invExport = await request(app)
      .get(`/api/reports/product-stock/export?format=${fmt}`)
      .set('Cookie', staffCookie);
    assert.equal(invExport.status, 200, `Exporting product-stock as ${fmt} must return 200`);
  }

  // Unsupported export format returns 400
  const invalidFmtRes = await request(app)
    .get('/api/reports/vat-summary/export?format=docx')
    .set('Cookie', staffCookie);
  assert.equal(invalidFmtRes.status, 400, 'Unsupported format docx must return 400');
});

test('6. Backups: Staff forbidden (403), Admin can list, create JSON & SQL backups, and download safely', async () => {
  // Staff forbidden on GET, POST, download
  const staffList = await request(app)
    .get('/api/backups')
    .set('Cookie', staffCookie);
  assert.equal(staffList.status, 403, 'Staff must get 403 on GET /api/backups');

  const staffCreate = await request(app)
    .post('/api/backups')
    .send({ format: 'json' })
    .set('Cookie', staffCookie);
  assert.equal(staffCreate.status, 403, 'Staff must get 403 on POST /api/backups');

  const staffDownload = await request(app)
    .get('/api/backups/test.json/download')
    .set('Cookie', staffCookie);
  assert.equal(staffDownload.status, 403, 'Staff must get 403 on download');

  // Admin creates JSON backup
  const adminJsonRes = await request(app)
    .post('/api/backups')
    .send({ format: 'json' })
    .set('Cookie', adminCookie);
  assert.equal(adminJsonRes.status, 201, 'Admin POST /api/backups with json must return 201');
  assert.ok(adminJsonRes.body.backup, 'Response must include backup info');
  const jsonFilename = adminJsonRes.body.backup.filename;
  assert.ok(jsonFilename.endsWith('.json'), 'JSON backup must end with .json');

  // Admin creates SQL backup (pg_dump)
  const adminSqlRes = await request(app)
    .post('/api/backups')
    .send({ format: 'sql' })
    .set('Cookie', adminCookie);
  assert.equal(adminSqlRes.status, 201, 'Admin POST /api/backups with sql must return 201');
  const sqlFilename = adminSqlRes.body.backup.filename;
  assert.ok(sqlFilename.endsWith('.sql'), 'SQL backup must end with .sql');

  // Admin lists backups
  const listRes = await request(app)
    .get('/api/backups')
    .set('Cookie', adminCookie);
  assert.equal(listRes.status, 200);
  assert.ok(Array.isArray(listRes.body.backups));
  assert.ok(listRes.body.backups.some((b: any) => b.filename === jsonFilename));
  assert.ok(listRes.body.backups.some((b: any) => b.filename === sqlFilename));

  // Admin downloads created JSON backup
  const downloadRes = await request(app)
    .get(`/api/backups/${jsonFilename}/download`)
    .set('Cookie', adminCookie);
  assert.equal(downloadRes.status, 200);
  assert.equal(downloadRes.headers['x-content-type-options'], 'nosniff');
  assert.match(downloadRes.headers['content-disposition'], new RegExp(`attachment; filename="${jsonFilename}"`));

  // Path traversal guard: reject malicious filenames
  const traversalRes = await request(app)
    .get('/api/backups/..%2F..%2Fpackage.json/download')
    .set('Cookie', adminCookie);
  assert.ok(
    traversalRes.status === 400 || traversalRes.status === 404,
    `Path traversal attempt must return 400 or 404, got ${traversalRes.status}`
  );

  // Missing file returns 404
  const missingRes = await request(app)
    .get('/api/backups/nonexistent-backup-file.json/download')
    .set('Cookie', adminCookie);
  assert.equal(missingRes.status, 404, 'Missing backup file must return 404');

  // Verify activity_logs recorded CREATE_BACKUP with entity_id null
  const auditRes = await testPool.query(
    `SELECT * FROM activity_logs WHERE entity_type = 'BACKUP' AND action = 'CREATE_BACKUP' ORDER BY id DESC LIMIT 2`
  );
  assert.ok(auditRes.rows.length >= 1, 'CREATE_BACKUP action must be recorded in activity_logs');
  assert.equal(auditRes.rows[0].entity_id, null, 'entity_id must be null for system-level backup');
});
