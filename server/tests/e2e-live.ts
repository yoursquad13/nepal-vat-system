/**
 * Full End-to-End Live Production Verification Script
 * Starts the built production server (NODE_ENV=production node server/dist/index.js on port 4100)
 * against PostgreSQL, verifies static assets, deep SPA routing, and runs the complete business flow.
 */

import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const BASE_URL = 'http://localhost:4100';
const JWT_SECRET = 'production-verified-secret-key-for-nepal-vat-system-12345';

function extractCookie(res: Response): string {
  const getSetCookie = (res.headers as any).getSetCookie;
  if (typeof getSetCookie === 'function') {
    const cookies = getSetCookie.call(res.headers);
    if (cookies && cookies.length > 0) {
      return cookies.map((c: string) => c.split(';')[0]).join('; ');
    }
  }
  const raw = res.headers.get('set-cookie');
  if (raw) return raw.split(';')[0];
  return '';
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServerReady(retries = 30, delayMs = 500): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${BASE_URL}/`);
      if (res.status === 200) return true;
    } catch {
      // still starting
    }
    await sleep(delayMs);
  }
  return false;
}

async function runLiveE2E() {
  console.log('========================================================');
  console.log('STARTING LIVE PRODUCTION SERVER ON PORT 4100');
  console.log('========================================================\n');

  // Ensure client dist exists
  const clientDist = path.resolve(process.cwd(), 'client/dist/index.html');
  if (!fs.existsSync(clientDist)) {
    throw new Error(`client/dist not found at ${clientDist}. Please run "npm run build" first!`);
  }

  // Spawn production server process
  const serverProcess: ChildProcess = spawn(
    'node',
    ['server/dist/index.js'],
    {
      env: {
        ...process.env,
        PORT: '4100',
        NODE_ENV: 'production',
        JWT_SECRET,
        DATABASE_URL:
          process.env.DATABASE_URL ||
          'postgresql://anishkhatri@localhost:5432/nepal_vat_system',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    }
  );

  serverProcess.stdout?.on('data', (d) => {
    const line = d.toString().trim();
    if (line) console.log(`[PROD SERVER] ${line}`);
  });

  serverProcess.stderr?.on('data', (d) => {
    const line = d.toString().trim();
    if (line) console.error(`[PROD SERVER ERR] ${line}`);
  });

  try {
    const isReady = await waitForServerReady();
    if (!isReady) {
      throw new Error('Production server failed to start within timeout on port 4100');
    }
    console.log('✔ Production server is up and responding at', BASE_URL);

    // ========================================================
    // TEST 1: Static SPA Serving & Asset Headers
    // ========================================================
    console.log('\n--- TEST 1: Static SPA Assets & Routing ---');

    // 1. Root index.html
    const rootRes = await fetch(`${BASE_URL}/`);
    if (rootRes.status !== 200) throw new Error(`Root GET / returned status ${rootRes.status}`);
    const rootHtml = await rootRes.text();
    if (!rootHtml.includes('<div id="root"></div>')) {
      throw new Error('Root HTML does not contain #root mounting container');
    }
    console.log('✔ GET / serves client index.html (200 OK)');

    // 2. Extract asset JS link and verify static bundle serving with MIME type
    const jsMatch = rootHtml.match(/src="(\/assets\/[^"]+\.js)"/);
    if (jsMatch?.[1]) {
      const jsUrl = `${BASE_URL}${jsMatch[1]}`;
      const jsRes = await fetch(jsUrl);
      const ct = jsRes.headers.get('content-type') || '';
      if (!ct.includes('javascript')) {
        throw new Error(`Expected JS Content-Type for ${jsUrl}, got: ${ct}`);
      }
      console.log(`✔ Static JS asset loads with valid MIME (${ct}): ${jsMatch[1]}`);
    }

    // 3. Deep SPA Route (should serve index.html via Express rewrite)
    const deepRoutes = ['/reports', '/admin/users', '/admin/settings', '/purchases'];
    for (const r of deepRoutes) {
      const spaRes = await fetch(`${BASE_URL}${r}`);
      if (spaRes.status !== 200) throw new Error(`Deep SPA route ${r} returned status ${spaRes.status}`);
      const spaHtml = await spaRes.text();
      if (!spaHtml.includes('<div id="root"></div>')) {
        throw new Error(`Deep SPA route ${r} did not return index.html`);
      }
      console.log(`✔ Deep route ${r} resolves SPA index.html (200 OK)`);
    }

    // ========================================================
    // TEST 2: Complete End-to-End Business Flow
    // ========================================================
    console.log('\n--- TEST 2: Complete Business Workflow via HTTP API ---');

    // 1. Staff Login
    console.log('1. Logging in as Staff (staff / Staff@123)...');
    const staffLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'staff', password: 'Staff@123' }),
    });
    if (staffLoginRes.status !== 200) {
      throw new Error(`Staff login failed with status ${staffLoginRes.status}`);
    }
    const staffCookie = extractCookie(staffLoginRes);
    const staffData = await staffLoginRes.json();
    console.log(`✔ Staff authenticated: ${staffData.user.fullName} (${staffData.user.role})`);

    // 2. Staff creates purchase without VAT bill
    console.log('2. Staff creating Purchase entry without VAT bill (delayed bill)...');
    const createPurchaseRes = await fetch(`${BASE_URL}/api/purchases`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: staffCookie,
      },
      body: JSON.stringify({
        vendor_id: 1,
        bill_number: `BILL-E2E-${Date.now().toString().slice(-4)}`,
        product_summary: '50 Bags Shivam Cement (E2E Verification Batch)',
        tax_type: 'VAT_13',
        vat_calc_mode: 'EXCLUSIVE',
        entered_amount: 36000,
        purchase_date_ad: '2026-11-14',
        purchase_date_bs: '2083-07-28',
        items: [
          {
            product_id: 1,
            product_name: 'Shivam OPC Cement (50kg)',
            quantity: 50,
            unit_of_measurement: 'bag',
            unit_price: 720,
            line_subtotal: 36000,
            line_vat_amount: 4680,
            line_total: 40680,
          },
        ],
      }),
    });
    if (createPurchaseRes.status !== 201) {
      const err = await createPurchaseRes.json();
      throw new Error(`Create purchase failed: ${JSON.stringify(err)}`);
    }
    const purchaseJson = await createPurchaseRes.json();
    const purchase = purchaseJson.purchase;
    const purchaseId = purchase.id;
    console.log(`✔ Purchase created: ID #${purchaseId} [${purchase.purchase_code}]`);
    console.log(`  - VAT Status: ${purchase.vat_bill_status}`);
    console.log(`  - Payment Status: ${purchase.payment_status}`);
    console.log(`  - Review Status: ${purchase.review_status}`);
    console.log(`  - Subtotal: Rs. ${purchase.purchase_amount}, VAT: Rs. ${purchase.vat_amount}, Total: Rs. ${purchase.total_amount}`);

    if (purchase.vat_bill_status !== 'VAT BILL PENDING') {
      throw new Error(`Expected VAT BILL PENDING, got ${purchase.vat_bill_status}`);
    }
    if (purchase.payment_status !== 'PAYMENT PENDING') {
      throw new Error(`Expected PAYMENT PENDING, got ${purchase.payment_status}`);
    }
    if (purchase.review_status !== 'PENDING_REVIEW') {
      throw new Error(`Expected PENDING_REVIEW, got ${purchase.review_status}`);
    }

    // 3. Delayed VAT bill upload
    console.log('3. Staff uploading delayed VAT bill photo...');
    const vatBillFd = new FormData();
    const dummyPngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48,
      0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00,
      0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78,
      0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
      0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    const imageBlob = new Blob([dummyPngBuffer], { type: 'image/png' });
    vatBillFd.append('file', imageBlob, 'vat_bill_sample.png');
    vatBillFd.append('bill_date_ad', '2026-11-14');
    vatBillFd.append('bill_date_bs', '2083-07-28');
    vatBillFd.append('vat_bill_number', 'VAT-TAX-9988');

    const uploadVatRes = await fetch(`${BASE_URL}/api/purchases/${purchaseId}/vat-bill`, {
      method: 'POST',
      headers: { Cookie: staffCookie },
      body: vatBillFd,
    });
    if (uploadVatRes.status !== 200 && uploadVatRes.status !== 201) {
      const err = await uploadVatRes.json();
      throw new Error(`Upload VAT bill failed: ${JSON.stringify(err)}`);
    }
    const uploadVatJson = await uploadVatRes.json();
    const vatBillId = uploadVatJson.vat_bill.id;
    console.log(`✔ VAT bill uploaded: ID #${vatBillId}`);
    console.log(`  - Purchase VAT status updated to: ${uploadVatJson.purchase.vat_bill_status}`);
    if (uploadVatJson.purchase.vat_bill_status !== 'VAT BILL RECEIVED') {
      throw new Error(`Expected VAT BILL RECEIVED, got ${uploadVatJson.purchase.vat_bill_status}`);
    }

    // 4. Admin Login
    console.log('4. Logging in as Administrator (admin / Admin@123)...');
    const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'Admin@123' }),
    });
    if (adminLoginRes.status !== 200) {
      throw new Error(`Admin login failed with status ${adminLoginRes.status}`);
    }
    const adminCookie = extractCookie(adminLoginRes);
    const adminData = await adminLoginRes.json();
    console.log(`✔ Admin authenticated: ${adminData.user.fullName} (${adminData.user.role})`);

    // 5. Admin previews & verifies VAT bill
    console.log('5. Admin previewing VAT bill file stream and verifying...');
    const previewRes = await fetch(`${BASE_URL}/api/files/vat-bills/${vatBillId}`, {
      headers: { Cookie: adminCookie },
    });
    if (previewRes.status !== 200) {
      throw new Error(`VAT bill preview failed with status ${previewRes.status}`);
    }
    const cd = previewRes.headers.get('content-disposition') || '';
    if (!cd.includes('inline')) {
      throw new Error(`Expected inline Content-Disposition for VAT bill preview, got: ${cd}`);
    }
    console.log(`✔ VAT bill file streamed inline: ${previewRes.headers.get('content-type')} (${cd})`);

    const verifyVatRes = await fetch(`${BASE_URL}/api/vat-bills/${vatBillId}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ review_notes: 'Verified against IRD tax invoice stamp' }),
    });
    if (verifyVatRes.status !== 200) {
      const err = await verifyVatRes.json();
      throw new Error(`Verify VAT bill failed: ${JSON.stringify(err)}`);
    }
    console.log('✔ VAT bill verified successfully by Admin');

    // 6. Admin approves purchase
    console.log('6. Admin approving purchase...');
    const approveRes = await fetch(`${BASE_URL}/api/purchases/${purchaseId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ admin_remarks: 'Approved for inventory receipt & payment' }),
    });
    if (approveRes.status !== 200) {
      const err = await approveRes.json();
      throw new Error(`Approve purchase failed: ${JSON.stringify(err)}`);
    }
    const approveJson = await approveRes.json();
    console.log(`✔ Purchase approved: review_status = ${approveJson.purchase.review_status}`);

    // 7. Stock receipt
    console.log('7. Receiving stock into inventory...');
    const receiveStockRes = await fetch(`${BASE_URL}/api/purchases/${purchaseId}/receive-stock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ responsible_staff_name: 'Store Keeper' }),
    });
    if (receiveStockRes.status !== 200) {
      const err = await receiveStockRes.json();
      throw new Error(`Receive stock failed: ${JSON.stringify(err)}`);
    }
    const receiveJson = await receiveStockRes.json();
    console.log(`✔ Stock received: ${receiveJson.movements.length} movement(s) recorded`);

    // Verify idempotency (second receipt blocked)
    const secondReceiveRes = await fetch(`${BASE_URL}/api/purchases/${purchaseId}/receive-stock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({}),
    });
    if (secondReceiveRes.status !== 400 && secondReceiveRes.status !== 409) {
      throw new Error(`Expected 400/409 on duplicate receive-stock, got ${secondReceiveRes.status}`);
    }
    console.log(`✔ Duplicate stock receipt blocked as expected (${secondReceiveRes.status})`);

    // 8. Stock-Out
    console.log('8. Recording stock-out (issue 5 bags for construction)...');
    const stockOutRes = await fetch(`${BASE_URL}/api/inventory/stock-out`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        productId: 1,
        quantity: 5,
        reason: 'INTERNAL_ISSUE',
        remarks: 'Issued for site repair work',
      }),
    });
    if (stockOutRes.status !== 200 && stockOutRes.status !== 201) {
      const err = await stockOutRes.json();
      throw new Error(`Stock-out failed: ${JSON.stringify(err)}`);
    }
    const stockOutJson = await stockOutRes.json();
    console.log(`✔ Stock-out recorded: Balance after = ${stockOutJson.movement.balance_after}`);

    // 9. Partial Payment + Slip
    console.log('9. Recording partial payment (Rs. 20,000)...');
    const paymentFd = new FormData();
    paymentFd.append('amount', '20000');
    paymentFd.append('payment_method', 'BANK_TRANSFER');
    paymentFd.append('payment_date_ad', '2026-11-14');
    paymentFd.append('payment_date_bs', '2083-07-28');
    paymentFd.append('transaction_ref', 'NABIL-TRX-1122');
    paymentFd.append('slip', imageBlob, 'payment_slip.png');

    const partialPayRes = await fetch(`${BASE_URL}/api/payments/purchases/${purchaseId}`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
      body: paymentFd,
    });
    if (partialPayRes.status !== 201) {
      const err = await partialPayRes.json();
      throw new Error(`Partial payment failed: ${JSON.stringify(err)}`);
    }
    const partialPayJson = await partialPayRes.json();
    console.log(`✔ Partial payment recorded: ID #${partialPayJson.payment.id}`);
    console.log(`  - Purchase payment status: ${partialPayJson.purchase.payment_status} (Paid: Rs. ${partialPayJson.purchase.paid_amount})`);
    if (partialPayJson.purchase.payment_status !== 'PARTIALLY PAID') {
      throw new Error(`Expected PARTIALLY PAID, got ${partialPayJson.purchase.payment_status}`);
    }

    // 10. Final Payment
    console.log('10. Recording final payment (remaining Rs. 20,680)...');
    const finalPayFd = new FormData();
    finalPayFd.append('amount', '20680');
    finalPayFd.append('payment_method', 'CHEQUE');
    finalPayFd.append('payment_date_ad', '2026-11-14');
    finalPayFd.append('payment_date_bs', '2083-07-28');
    finalPayFd.append('transaction_ref', 'CHQ-889900');

    const finalPayRes = await fetch(`${BASE_URL}/api/payments/purchases/${purchaseId}`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
      body: finalPayFd,
    });
    if (finalPayRes.status !== 201) {
      const err = await finalPayRes.json();
      throw new Error(`Final payment failed: ${JSON.stringify(err)}`);
    }
    const finalPayJson = await finalPayRes.json();
    console.log(`✔ Final payment settled: ID #${finalPayJson.payment.id}`);
    console.log(`  - Purchase payment status: ${finalPayJson.purchase.payment_status} (Paid: Rs. ${finalPayJson.purchase.paid_amount})`);
    if (finalPayJson.purchase.payment_status !== 'PAID') {
      throw new Error(`Expected PAID, got ${finalPayJson.purchase.payment_status}`);
    }

    // ========================================================
    // TEST 3: Reports & Exports Verification
    // ========================================================
    console.log('\n--- TEST 3: Reports JSON & File Export Endpoints ---');

    const all15Slugs = [
      'daily-purchases',
      'monthly-purchases',
      'vendor-purchases',
      'vat-pending',
      'payment-pending',
      'paid-bills',
      'vat-summary',
      'product-stock',
      'stock-in',
      'stock-out',
      'vendor-products',
      'monthly-inventory',
      'stock-valuation',
      'low-stock',
      'stock-adjustments',
    ];

    console.log(`Testing all ${all15Slugs.length} report endpoints via JSON API...`);
    for (const slug of all15Slugs) {
      const rRes = await fetch(`${BASE_URL}/api/reports/${slug}`, {
        headers: { Cookie: adminCookie },
      });
      if (rRes.status !== 200) {
        throw new Error(`Report ${slug} returned status ${rRes.status}`);
      }
      const rJson = await rRes.json();
      if (!Array.isArray(rJson.columns) || !Array.isArray(rJson.rows) || typeof rJson.summary !== 'object') {
        throw new Error(`Report ${slug} invalid structure: missing columns/rows/summary`);
      }
      console.log(`  ✔ Report "${slug}": ${rJson.title} (${rJson.rows.length} rows, ${rJson.columns.length} columns)`);
    }

    // Test Report File Exports
    console.log('\nTesting binary exports (Excel, CSV, PDF)...');

    // Excel
    const xlsxRes = await fetch(`${BASE_URL}/api/reports/daily-purchases/export?format=xlsx`, {
      headers: { Cookie: adminCookie },
    });
    if (xlsxRes.status !== 200) throw new Error(`Excel export failed: ${xlsxRes.status}`);
    const xlsxBytes = await xlsxRes.arrayBuffer();
    console.log(`  ✔ Excel export (.xlsx) returned 200 OK (${xlsxBytes.byteLength} bytes)`);

    // CSV
    const csvRes = await fetch(`${BASE_URL}/api/reports/daily-purchases/export?format=csv`, {
      headers: { Cookie: adminCookie },
    });
    if (csvRes.status !== 200) throw new Error(`CSV export failed: ${csvRes.status}`);
    const csvText = await csvRes.text();
    console.log(`  ✔ CSV export (.csv) returned 200 OK (${csvText.length} characters)`);

    // PDF
    const pdfRes = await fetch(`${BASE_URL}/api/reports/vat-summary/export?format=pdf`, {
      headers: { Cookie: adminCookie },
    });
    if (pdfRes.status !== 200) throw new Error(`PDF export failed: ${pdfRes.status}`);
    const pdfBytes = await pdfRes.arrayBuffer();
    console.log(`  ✔ PDF export (.pdf) returned 200 OK (${pdfBytes.byteLength} bytes)`);

    // ========================================================
    // TEST 4: Admin Controls, Settings & Backups
    // ========================================================
    console.log('\n--- TEST 4: Admin Controls & Database Backups ---');

    // 1. Users List
    const usersRes = await fetch(`${BASE_URL}/api/users`, {
      headers: { Cookie: adminCookie },
    });
    if (usersRes.status !== 200) throw new Error(`List users failed: ${usersRes.status}`);
    const usersJson = await usersRes.json();
    console.log(`✔ Admin listed ${usersJson.users.length} users successfully`);

    // 2. Settings Update
    const patchSettingsRes = await fetch(`${BASE_URL}/api/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        company_name: 'Himalayan Trading Suppliers Pvt. Ltd. (Verified)',
        allow_staff_vat_mode_override: true,
      }),
    });
    if (patchSettingsRes.status !== 200) {
      throw new Error(`Patch settings failed: ${patchSettingsRes.status}`);
    }
    console.log('✔ Company settings updated successfully by Admin');

    // 3. Create JSON Snapshot Backup
    console.log('Creating JSON snapshot backup...');
    const jsonBackupRes = await fetch(`${BASE_URL}/api/backups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ format: 'json' }),
    });
    if (jsonBackupRes.status !== 201) {
      const err = await jsonBackupRes.json();
      throw new Error(`Create JSON backup failed: ${JSON.stringify(err)}`);
    }
    const jsonBackupJson = await jsonBackupRes.json();
    const jsonFilename = jsonBackupJson.backup.filename;
    console.log(`✔ JSON backup created: ${jsonFilename} (${jsonBackupJson.backup.size} bytes)`);

    // Download JSON backup
    const dlJsonRes = await fetch(`${BASE_URL}/api/backups/${jsonFilename}/download`, {
      headers: { Cookie: adminCookie },
    });
    if (dlJsonRes.status !== 200) {
      throw new Error(`Download JSON backup failed: ${dlJsonRes.status}`);
    }
    const downloadedData = await dlJsonRes.json();
    if (!downloadedData.purchases || !downloadedData.vendors) {
      throw new Error('Downloaded JSON backup is missing tables');
    }
    console.log('✔ Downloaded JSON backup validated successfully');

    // 4. Create SQL Dump Backup (if pg_dump available)
    try {
      const sqlBackupRes = await fetch(`${BASE_URL}/api/backups`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({ format: 'sql' }),
      });
      if (sqlBackupRes.status === 201) {
        const sqlJson = await sqlBackupRes.json();
        console.log(`✔ PostgreSQL .sql backup created: ${sqlJson.backup.filename} (${sqlJson.backup.size} bytes)`);
      } else {
        const sqlErr = await sqlBackupRes.json();
        console.log(`ℹ SQL backup response: ${sqlErr.message || sqlErr.error}`);
      }
    } catch (e: any) {
      console.log(`ℹ SQL dump check: ${e.message}`);
    }

    // 5. Activity Audit Log
    const auditRes = await fetch(`${BASE_URL}/api/audit-logs?limit=10`, {
      headers: { Cookie: adminCookie },
    });
    if (auditRes.status !== 200) throw new Error(`List audit logs failed: ${auditRes.status}`);
    const auditJson = await auditRes.json();
    console.log(`✔ Activity audit log retrieved (${auditJson.logs.length} recent entries verified)`);

    console.log('\n========================================================');
    console.log('ALL LIVE END-TO-END VERIFICATION CHECKS PASSED PERFECTLY!');
    console.log('========================================================\n');
  } finally {
    console.log('Terminating production test server cleanly...');
    serverProcess.kill('SIGTERM');
    await sleep(1000);
    if (!serverProcess.killed) {
      serverProcess.kill('SIGKILL');
    }
    console.log('Production test server stopped.');
  }
}

runLiveE2E().catch((err) => {
  console.error('\n❌ LIVE E2E VERIFICATION FAILED:', err);
  process.exit(1);
});
