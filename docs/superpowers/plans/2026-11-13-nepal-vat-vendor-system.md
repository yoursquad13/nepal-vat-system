# Nepal VAT Bill, Vendor Payment & Inventory Management System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-stack, responsive Nepal VAT Bill, Vendor Payment, and Inventory Management web application with Bikram Sambat (BS) + AD dual dates in NPT (`UTC+5:45`), 13% inclusive/exclusive VAT + optional `NON_VAT` bills, independent VAT/Payment/Stock workflows, Excel/CSV/PDF reports, and PostgreSQL persistence.

**Architecture:** TypeScript Express REST API (`server/`) backed by the user's running PostgreSQL instance via `pg`, paired with a React + Vite + Tailwind CSS + Recharts SPA (`client/`). Monetary math uses exact integer paisa arithmetic on both server and client; uploaded VAT bills and payment slips live outside `public/` and stream only via authenticated endpoints; authentication uses `scrypt` password hashes + `HttpOnly` JWT cookies.

**Tech Stack:** Node.js 26, TypeScript, Express, PostgreSQL (`pg`), Zod, Multer, `exceljs`, `pdfkit`, React 19, Vite, Tailwind CSS, Recharts, Lucide React, Node test runner (`tsx --test`) + Supertest.

**Spec:** `docs/superpowers/specs/2026-11-13-nepal-vat-vendor-system-design.md`

## Global Constraints

- Database must be PostgreSQL (local running instance at `localhost:5432`), using `BIGINT GENERATED ALWAYS AS IDENTITY` IDs, `NUMERIC(14,2)` for NPR money, `NUMERIC(14,3)` for quantities, `TIMESTAMPTZ` for timestamps, `TEXT` for strings, and parameterized queries only.
- All monetary formatting must use Nepali/standard NPR `Rs.` prefix and `tabular-nums` in UI; internal math must use integer paisa (`Math.round(amount * 100)`).
- Entry timestamps (`entry_at`, `entry_date_ad`, `entry_time_npt`, `entry_date_bs`) must be generated exclusively by the server in `Asia/Kathmandu` (`UTC+5:45`) and never overwritten on edit.
- Bikram Sambat (BS) dates (`YYYY-MM-DD`) and Nepali Fiscal Year (`YYYY/YY`, Shrawan–Ashadh) must display and filter alongside AD dates across purchases, payments, inventory, and reports.
- VAT Bill Status (`VAT BILL PENDING`, `VAT BILL RECEIVED`, `VAT BILL VERIFIED`, `VAT BILL REJECTED`, `NOT APPLICABLE`), Payment Status (`PAYMENT PENDING`, `APPROVED`, `PARTIALLY PAID`, `PAID`), Purchase Review Status (`PENDING_REVIEW`, `APPROVED`, `REJECTED`), and Physical Stock Receipt (`stock_received`) must operate independently per spec Section 4.
- Product line items on a purchase must be optional at entry and attachable later; physical `STOCK_IN` is once-per-item on `APPROVED` purchases only.
- Strict role enforcement: `STAFF` receives `403 Forbidden` on approvals, VAT verification, payment recording/voiding, payment slip upload, soft-deletes, user management, settings, `OPENING_STOCK`/`ADJUSTMENT_*`, negative-stock overrides, and DB backups.
- Uploads restricted to `image/jpeg`, `image/png`, `image/webp`, `application/pdf` (max 10 MB) with UUID filenames served behind auth (`X-Content-Type-Options: nosniff`).

## Review Focus

- **13% VAT rounding boundary:** Inclusive inputs like `Rs. 100.00` must compute `vatPaisa = Math.round(10000 * 13 / 113) = 1150` (`Rs. 11.50`) and `basePaisa = totalPaisa - vatPaisa = 8850` (`Rs. 88.50`) so `purchase_amount + vat_amount === total_amount` holds identically in DB and UI (pinned in Task 2).
- **BS calendar boundary & invalid dates:** Month-end / leap transitions (e.g., Ashadh 32, Chaitra 30, Shrawan 1 fiscal year boundary) and invalid BS strings like `2083-02-33` must convert deterministically or reject with `400` without silent JS date rollover (pinned in Task 2).
- **Duplicate purchase & duplicate stock-in race:** Concurrent/repeated submission with identical `idempotency_key` or `(vendor_id, bill_number)`, or invoking `POST /api/inventory/receive-purchase` twice on the same item, must return `409` / skip already-received items and never double-increment `products.current_stock` (pinned in Task 5 & Task 7).
- **Overpayment & payment void recalculation:** Concurrent or single payment exceeding `total_amount - paid_amount` must fail atomically via `SELECT ... FOR UPDATE`; voiding a payment must recompute `paid_amount` and revert `payment_status` from `PAID` to `PARTIALLY PAID` or `APPROVED` (pinned in Task 6).
- **Auth & upload security boundaries:** Unauthenticated `GET /api/files/...` returns `401`, disallowed MIME/extension (`.html`/`.exe`/spoofed header) returns `400`/`415`, and `STAFF` calling `POST /api/purchases/:id/approve` or `POST /api/payments` returns `403` (pinned in Task 3 & Task 5).

---

### Task 1: Project Scaffolding, PostgreSQL Schema, Migrations & Seed

**Files:**
- Create: `package.json`, `.gitignore`, `.env.example`, `.env`
- Create: `server/package.json`, `server/tsconfig.json`, `server/src/config/env.ts`, `server/src/config/db.ts`
- Create: `server/src/db/migrations/001_initial_schema.sql`, `server/src/db/migrate.ts`, `server/src/db/seed.ts`
- Create: `client/package.json`, `client/tsconfig.json`, `client/vite.config.ts`, `client/index.html`, `client/src/main.tsx`, `client/src/App.tsx`, `client/src/index.css`
- Test: `server/tests/schema.test.ts`

**Interfaces:**
- Produces:
  - `pool: pg.Pool`, `query(sql, params)`, `withTransaction(fn)` in `server/src/config/db.ts`
  - `runMigrations(databaseUrl?: string): Promise<void>` in `server/src/db/migrate.ts`
  - `seedDatabase(options?: { withDemo?: boolean }): Promise<void>` in `server/src/db/seed.ts`

- [ ] **Step 1: Initialize git repo, create `.gitignore`, `.env.example`, root `package.json`, and PostgreSQL databases**

Create `nepal_vat_system` and `nepal_vat_system_test` databases in local PostgreSQL (`createdb nepal_vat_system && createdb nepal_vat_system_test`), initialize `git init`, and configure root npm workspaces/scripts (`dev`, `build`, `start`, `test`, `db:migrate`, `db:seed`).

- [ ] **Step 2: Write the failing schema migration test**

In `server/tests/schema.test.ts`:
```ts
test('runMigrations creates all 11 core tables and enforces unique stock_in per purchase_item', async () => {
  await runMigrations(process.env.TEST_DATABASE_URL);
  const res = await testPool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
  );
  const names = res.rows.map(r => r.table_name);
  for (const t of ['app_settings','users','vendors','products','purchases','purchase_items','vat_bills','payments','payment_slips','inventory_movements','activity_logs']) {
    assert.ok(names.includes(t), `Missing table ${t}`);
  }
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm --workspace=server test -- tests/schema.test.ts`
Expected: FAIL because `migrate.ts` and `001_initial_schema.sql` do not exist yet.

- [ ] **Step 4: Implement `server/src/config/env.ts`, `server/src/config/db.ts`, `001_initial_schema.sql`, `migrate.ts`, and `seed.ts`**

- `001_initial_schema.sql` defines all 11 tables from Spec Section 3, `schema_migrations` tracking table, `NUMERIC(14,2)` money columns, `NUMERIC(14,3)` qty columns, foreign key indexes, partial unique index on `purchases(vendor_id, LOWER(bill_number))` and `inventory_movements(purchase_item_id) WHERE purchase_item_id IS NOT NULL AND movement_type = 'STOCK_IN'`.
- `seed.ts` hashes initial Admin (`admin` / `Admin@123`) and Staff (`staff` / `Staff@123`) credentials using `scrypt`, inserts `app_settings` (`id = 1`), and when `withDemo: true` inserts realistic Nepali vendors (with PAN/VAT/Bank info), products (Cement, Iron Rod, Paint), purchases (both `VAT BILL PENDING` and `VAT BILL VERIFIED`), partial payments, and opening stock movements.
- Scaffold minimal Vite + React + Tailwind v4 client (`client/vite.config.ts` proxying `/api` to `http://localhost:4000`).

- [ ] **Step 5: Run schema test and seed to verify**

Run: `npm --workspace=server test -- tests/schema.test.ts && npm run db:migrate && npm run db:seed`
Expected: PASS; all 11 tables created and seeded in `nepal_vat_system`.

- [ ] **Step 6: Commit**

```bash
git add .gitignore package.json .env.example server client docs
git commit -m "chore: scaffold project, PostgreSQL schema migrations, and seed"
```

---

### Task 2: Exact Paisa VAT Math, BS↔AD Calendar & NPT (`UTC+5:45`) Utilities

**Files:**
- Create: `server/src/utils/money.ts`
- Create: `server/src/utils/nepaliDate.ts`
- Create: `client/src/utils/money.ts`
- Create: `client/src/utils/nepaliDate.ts`
- Test: `server/tests/vat-and-dates.test.ts`

**Interfaces:**
- Produces in `money.ts`:
  - `toPaisa(amount: number | string): number`
  - `fromPaisa(paisa: number): string` (2-decimal string e.g. `"100000.00"`)
  - `calculateVat(params: { enteredAmount: number | string; taxType: 'VAT_13' | 'NON_VAT'; mode: 'EXCLUSIVE' | 'INCLUSIVE' }): { enteredPaisa: number; basePaisa: number; vatPaisa: number; totalPaisa: number; baseAmount: string; vatAmount: string; totalAmount: string }`
  - `formatNpr(amount: number | string): string` (e.g. `"Rs. 1,13,000.00"` or `"Rs. 100,000.00"` — use standard South Asian/Nepali grouping or clean `en-NP` `Rs.` format)
- Produces in `nepaliDate.ts`:
  - `adToBs(adDateStr: string): string` (`YYYY-MM-DD`)
  - `bsToAd(bsDateStr: string): string` (`YYYY-MM-DD`, throws on invalid BS date)
  - `getFiscalYearFromBs(bsDateStr: string): string` (e.g. `"2083/84"`)
  - `getNowNpt(now?: Date): { isoUtc: string; dateAd: string; timeNpt: string; dateBs: string; fiscalYear: string }`
  - `resolveDatePreset(preset: 'today' | 'yesterday' | 'this_week' | 'this_month' | 'fiscal_year', refDate?: Date): { fromAd: string; toAd: string }`

- [ ] **Step 1: Write failing tests for VAT rounding boundaries and BS↔AD conversion**

In `server/tests/vat-and-dates.test.ts`:
- `calculateVat({ enteredAmount: 100000, taxType: 'VAT_13', mode: 'EXCLUSIVE' })` -> `baseAmount === '100000.00'`, `vatAmount === '13000.00'`, `totalAmount === '113000.00'`.
- `calculateVat({ enteredAmount: 113000, taxType: 'VAT_13', mode: 'INCLUSIVE' })` -> `baseAmount === '100000.00'`, `vatAmount === '13000.00'`, `totalAmount === '113000.00'`.
- Review Focus test: `calculateVat({ enteredAmount: 100, taxType: 'VAT_13', mode: 'INCLUSIVE' })` -> `vatPaisa === 1150`, `basePaisa === 8850`, `basePaisa + vatPaisa === 10000`.
- `calculateVat({ enteredAmount: 5000, taxType: 'NON_VAT', mode: 'EXCLUSIVE' })` -> `vatAmount === '0.00'`, `totalAmount === '5000.00'`.
- BS↔AD round-trip tests for known dates (e.g. `2026-11-13` <-> `2083-07-27`, `2026-07-17` <-> `2083-04-01` -> fiscalYear `'2083/84'`, `2026-07-16` <-> `2083-03-32` -> fiscalYear `'2082/83'`).
- Review Focus test: `bsToAd('2083-02-33')` throws validation error rather than rolling over.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace=server test -- tests/vat-and-dates.test.ts`
Expected: FAIL with missing module errors.

- [ ] **Step 3: Implement `money.ts` and `nepaliDate.ts` (server + client mirror)**

Include complete verified BS month-days table from 2000 BS to 2090 BS anchored to `2000-01-01 BS = 1943-04-14 AD`, plus `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu', ... })` for NPT date/time extraction.

- [ ] **Step 4: Run tests to verify pass**

Run: `npm --workspace=server test -- tests/vat-and-dates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/utils/money.ts server/src/utils/nepaliDate.ts client/src/utils/money.ts client/src/utils/nepaliDate.ts server/tests/vat-and-dates.test.ts
git commit -m "feat: add paisa VAT calculation and BS/AD NPT date utilities"
```

---

### Task 3: Authentication, Role Guards, Audit Logger, Users & Settings APIs

**Files:**
- Create: `server/src/utils/password.ts`, `server/src/utils/audit.ts`, `server/src/utils/errors.ts`
- Create: `server/src/middleware/auth.ts`, `server/src/middleware/validate.ts`, `server/src/middleware/errorHandler.ts`
- Create: `server/src/routes/auth.ts`, `server/src/routes/users.ts`, `server/src/routes/settings.ts`
- Create: `server/src/app.ts`, `server/src/index.ts`
- Test: `server/tests/auth-users-settings.test.ts`

**Interfaces:**
- Produces:
  - `hashPassword(plain: string): Promise<string>`, `verifyPassword(plain: string, stored: string): Promise<boolean>`
  - `requireAuth`, `requireAdmin` (attaches `req.user: { id: number; username: string; fullName: string; role: 'ADMIN' | 'STAFF' }`)
  - `logActivity(client, entry)` writing to `activity_logs`
  - Endpoints: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `GET/POST/PATCH /api/users`, `GET/PATCH /api/settings`, `GET /api/audit-logs`

- [ ] **Step 1: Write failing tests for auth, cookie session, inactive user block, and Staff `403` guards**

Test:
- Login sets `HttpOnly` JWT cookie; `GET /api/auth/me` returns user; unauthenticated request returns `401`.
- Admin creates/updates/deactivates Staff user; inactive user cannot log in (`403`).
- Staff calling `POST /api/users` or `PATCH /api/settings` receives `403 Forbidden`.
- Admin updates `default_vat_mode` to `INCLUSIVE` and `activity_logs` records the change.

- [ ] **Step 2: Run test to verify failure**

Run: `npm --workspace=server test -- tests/auth-users-settings.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement auth, middleware, app, users, and settings routes**

Wire Helmet/security headers, `cookie-parser`, JSON body limit, rate limiting on `/api/auth/login`, centralized Zod & `ApiError` error handler.

- [ ] **Step 4: Run test to verify pass**

Run: `npm --workspace=server test -- tests/auth-users-settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src
git commit -m "feat: add scrypt cookie auth, RBAC middleware, users, and settings APIs"
```

---

### Task 4: Vendors & Products Master APIs

**Files:**
- Create: `server/src/routes/vendors.ts`
- Create: `server/src/routes/products.ts`
- Modify: `server/src/app.ts`
- Test: `server/tests/vendors-products.test.ts`

**Interfaces:**
- Consumes: `requireAuth`, `requireAdmin`, `logActivity`, `pool`
- Produces:
  - `GET /api/vendors` (search by name, PAN, VAT, phone), `POST /api/vendors`, `PATCH /api/vendors/:id`, `GET /api/vendors/:id` (returns profile + summary totals + purchases + payment history)
  - `GET /api/products` (search by name, SKU, category, brand), `POST /api/products` (rejects duplicate SKU/name case-insensitively with `409`), `PATCH /api/products/:id`, `GET /api/products/:id` (returns profile + complete `inventory_movements` ledger with running balance & `purchase_code` link)

- [ ] **Step 1: Write failing tests for Vendor CRUD/profile and Product duplicate SKU/name rejection**

Include tests for: creating vendor with full Nepal PAN/VAT/Bank details, searching by phone/PAN, creating product, rejecting duplicate SKU (`CEM-001` vs `cem-001`) or duplicate name with `409`.

- [ ] **Step 2: Run test to verify failure**

Run: `npm --workspace=server test -- tests/vendors-products.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `vendors.ts` and `products.ts` and mount in `app.ts`**

- [ ] **Step 4: Run test to verify pass**

Run: `npm --workspace=server test -- tests/vendors-products.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/vendors.ts server/src/routes/products.ts server/src/app.ts server/tests/vendors-products.test.ts
git commit -m "feat: add vendors directory/profile and product master APIs"
```

---

### Task 5: Purchases, Optional Line Items, VAT Bill Upload/Verify & Secure File Streaming

**Files:**
- Create: `server/src/utils/upload.ts`
- Create: `server/src/routes/purchases.ts`
- Create: `server/src/routes/vatBills.ts`
- Create: `server/src/routes/files.ts`
- Modify: `server/src/app.ts`
- Test: `server/tests/purchases-vat.test.ts`

**Interfaces:**
- Consumes: `calculateVat`, `getNowNpt`, `adToBs`, `bsToAd`, `getFiscalYearFromBs`, `requireAuth`, `requireAdmin`, `logActivity`
- Produces:
  - `POST /api/purchases` (multipart or JSON; optional `vatBillFile`, optional `items[]`, server-stamped `entry_at` NPT, `idempotency_key` & `(vendor_id, bill_number)` duplicate guard)
  - `GET /api/purchases` (filters: `preset`, `fromAd`, `toAd`, `fromBs`, `toBs`, `fiscalYear`, `vendorId`, `staffId`, `vatStatus`, `paymentStatus`, `reviewStatus`, `q`, pagination)
  - `GET /api/purchases/vat-pending` (dedicated VAT Pending List with `days_pending` calculated in NPT)
  - `GET /api/purchases/:id` (header, vendor, items, vat_bills history, payments + slips, activity_logs)
  - `PATCH /api/purchases/:id` (never overwrites `entry_at`; locks financial header fields once `APPROVED`, `paid_amount > 0`, or `stock_received = TRUE`; allows attaching/updating unstocked `items[]` anytime)
  - `DELETE /api/purchases/:id` (Admin-only soft delete; returns `409` if active payments or `STOCK_IN` exist)
  - `POST /api/purchases/:id/approve`, `POST /api/purchases/:id/reject` (Admin-only)
  - `POST /api/purchases/:id/vat-bill` (upload/re-upload delayed VAT bill by Staff or Admin)
  - `POST /api/vat-bills/:id/verify`, `POST /api/vat-bills/:id/reject` (Admin-only)
  - `GET /api/files/vat-bills/:id`, `GET /api/files/payment-slips/:id` (authenticated stream)

- [ ] **Step 1: Write failing integration tests covering purchase lifecycle & security**

Include:
- Staff creates purchase without VAT bill & without line items -> `vat_bill_status === 'VAT BILL PENDING'`, `payment_status === 'PAYMENT PENDING'`, `entry_date_bs` & `entry_time_npt` stamped by server.
- Editing purchase preserves original `entry_at` / `entry_date_ad` / `entry_time_npt` unchanged.
- Duplicate `(vendor_id, bill_number)` returns `409 Conflict`.
- Optional line items attached later via `PATCH /api/purchases/:id`.
- Delayed VAT bill upload transitions `VAT BILL PENDING` -> `VAT BILL RECEIVED` and logs `vat_bill_uploaded_at`.
- Staff attempting approve/verify/delete returns `403`.
- Unauthenticated `GET /api/files/vat-bills/:id` returns `401`; uploading `.html`/disallowed file returns `400`.
- Admin approves purchase -> `review_status === 'APPROVED'`, `payment_status === 'APPROVED'`; verifies VAT bill -> `VAT BILL VERIFIED`.

- [ ] **Step 2: Run test to verify failure**

Run: `npm --workspace=server test -- tests/purchases-vat.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `upload.ts`, `purchases.ts`, `vatBills.ts`, and `files.ts`**

- [ ] **Step 4: Run test to verify pass**

Run: `npm --workspace=server test -- tests/purchases-vat.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/utils/upload.ts server/src/routes/purchases.ts server/src/routes/vatBills.ts server/src/routes/files.ts server/src/app.ts server/tests/purchases-vat.test.ts
git commit -m "feat: add purchase entry, optional items, delayed VAT bill tracking, and secure file streaming"
```

---

### Task 6: Vendor Payments, Partial Payments, Payment Slips & Payment Voiding

**Files:**
- Create: `server/src/routes/payments.ts`
- Modify: `server/src/app.ts`
- Test: `server/tests/payments.test.ts`

**Interfaces:**
- Consumes: `withTransaction`, `toPaisa`, `fromPaisa`, `adToBs`, `bsToAd`, `uploadSlip`, `requireAuth`, `requireAdmin`, `logActivity`
- Produces:
  - `POST /api/purchases/:id/payments` (Admin-only; accepts multipart slip PDF/image, `amount`, `paymentDateAd`/`Bs`, `transactionRef`, `companyBankAccount`, `paymentMethod`, `remarks`)
  - `POST /api/payments/:id/void` (Admin-only; voids payment with `voidReason` and recalculates `paid_amount` & `payment_status`)
  - `GET /api/payments/vendor-summary` (Admin-only Vendor Payment Dashboard KPIs + vendor-wise table + unpaid purchase drilldown)

- [ ] **Step 1: Write failing tests for partial/full payments, VAT-pending payment independence, overpayment guard, and payment voiding**

Include:
- Payment blocked when `review_status !== 'APPROVED'` (`409`).
- Payment **allowed** even when `vat_bill_status === 'VAT BILL PENDING'`.
- Recording two partial payments transitions `APPROVED` -> `PARTIALLY PAID` -> `PAID` (with `paid_at` timestamp).
- Overpayment (`amount > remaining`) rejected (`400`) inside transaction.
- Admin voiding second payment reverts `PAID` -> `PARTIALLY PAID` and updates `paid_amount`.
- Staff hitting `POST /api/purchases/:id/payments` gets `403`.

- [ ] **Step 2: Run test to verify failure**

Run: `npm --workspace=server test -- tests/payments.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `payments.ts` and mount in `app.ts`**

- [ ] **Step 4: Run test to verify pass**

Run: `npm --workspace=server test -- tests/payments.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/payments.ts server/src/app.ts server/tests/payments.test.ts
git commit -m "feat: add transactional partial vendor payments, slips, and voiding"
```

---

### Task 7: Integrated Inventory Movements (Idempotent Stock-In, Stock-Out & Adjustments)

**Files:**
- Create: `server/src/routes/inventory.ts`
- Modify: `server/src/app.ts`
- Test: `server/tests/inventory.test.ts`

**Interfaces:**
- Consumes: `withTransaction`, `requireAuth`, `requireAdmin`, `logActivity`, `adToBs`, `bsToAd`
- Produces:
  - `GET /api/inventory/dashboard` (KPIs: total products, total qty, total valuation, low stock count, out of stock count, low stock list, stock table, recent in/out)
  - `GET /api/inventory/movements` (filterable by `productId`, `type`, `category`, date range)
  - `POST /api/purchases/:id/receive-stock` (marks unreceived `purchase_items` of an `APPROVED` purchase as `stock_received = TRUE`, inserts `STOCK_IN`, updates `current_stock`, weighted `avg_purchase_price` & `latest_purchase_price`; works regardless of VAT/payment status; idempotent on repeated calls)
  - `POST /api/inventory/stock-out` (Staff/Admin; `SOLD`, `INTERNAL_ISSUE`, `DAMAGED_EXPIRED`, `OTHER`; blocks negative stock unless `ADMIN` passes `allowNegativeOverride: true` with remarks)
  - `POST /api/inventory/adjustments` (Admin-only `OPENING_STOCK`, `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`)

- [ ] **Step 1: Write failing tests for stock receipt idempotency, weighted average cost, stock-out negative guard, and role enforcement**

Include:
- Unapproved purchase (`PENDING_REVIEW`) cannot receive stock (`409`).
- Approved purchase with `VAT BILL PENDING` and `PAYMENT PENDING` **can** receive stock (`STOCK_IN`), updating `current_stock` from 50 to 150 and calculating weighted `avg_purchase_price` using VAT-exclusive net unit cost.
- Calling `POST /api/purchases/:id/receive-stock` a second time does NOT add stock again (returns already-received summary / `409` if 0 pending items).
- Stock-out leaving negative balance blocked (`400`) for Staff; allowed for Admin only with `allowNegativeOverride: true`.
- Staff calling `POST /api/inventory/adjustments` gets `403`.

- [ ] **Step 2: Run test to verify failure**

Run: `npm --workspace=server test -- tests/inventory.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `inventory.ts` and mount in `app.ts`**

- [ ] **Step 4: Run test to verify pass**

Run: `npm --workspace=server test -- tests/inventory.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/inventory.ts server/src/app.ts server/tests/inventory.test.ts
git commit -m "feat: add idempotent stock receipt, stock-out, adjustments, and inventory dashboard API"
```

---

### Task 8: Dashboard Analytics, Global Search, Reports (Excel/CSV/PDF) & DB Backups

**Files:**
- Create: `server/src/utils/exporters.ts` (CSV, `exceljs` XLSX, `pdfkit` PDF generators)
- Create: `server/src/routes/dashboard.ts`
- Create: `server/src/routes/search.ts`
- Create: `server/src/routes/reports.ts`
- Create: `server/src/routes/backups.ts`
- Modify: `server/src/app.ts`
- Test: `server/tests/reports-search-backup.test.ts`

**Interfaces:**
- Produces:
  - `GET /api/dashboard` (KPIs, monthly BS/AD charts, vendor-wise chart, paid vs unpaid, VAT received vs pending, recent entries newest-first, low-stock alerts)
  - `GET /api/search?q=...` (searches products, vendors, phone, PAN, VAT no, purchase dates BS/AD, bill numbers)
  - `GET /api/reports/:reportType` and `GET /api/reports/:reportType/export?format=xlsx|csv|pdf` covering all 7 Purchase/VAT reports (`daily-purchases`, `monthly-purchases`, `vendor-purchases`, `vat-pending`, `payment-pending`, `paid-bills`, `vat-summary`) and all 8 Inventory reports (`product-stock`, `stock-in`, `stock-out`, `vendor-products`, `monthly-inventory`, `stock-valuation`, `low-stock`, `stock-adjustments`)
  - `GET /api/backups`, `POST /api/backups` (runs `pg_dump` safely without shell interpolation + JSON backup option), `GET /api/backups/:filename/download` (Admin-only)

- [ ] **Step 1: Write failing tests for dashboard, global search, all report exports, and admin-only backups**

Test:
- Global search for `"Cement"` returns matching products, vendors purchased from, contact info, and purchase/payment status.
- Global search for PAN or phone returns matching vendor + pending bills.
- Exporting `vat-summary` and `product-stock` in `csv`, `xlsx`, and `pdf` returns `200` with proper `Content-Type` and non-empty binary/text payload.
- Staff accessing `POST /api/backups` returns `403`; Admin creates and downloads backup (`200`).

- [ ] **Step 2: Run test to verify failure**

Run: `npm --workspace=server test -- tests/reports-search-backup.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `exporters.ts`, `dashboard.ts`, `search.ts`, `reports.ts`, `backups.ts`**

- [ ] **Step 4: Run test to verify pass**

Run: `npm --workspace=server test -- tests/reports-search-backup.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src
git commit -m "feat: add dashboard analytics, global search, Excel/CSV/PDF reports, and DB backups"
```

---

### Task 9: Frontend Foundation — Design System, Auth, Navigation Shell, BS/AD Picker & Search Modal

**Files:**
- Create: `client/src/api/client.ts` (typed fetch + domain helpers)
- Create: `client/src/context/AuthContext.tsx`, `client/src/context/ToastContext.tsx`
- Create: `client/src/components/Layout.tsx`, `client/src/components/StatusBadges.tsx`, `client/src/components/BsAdDatePicker.tsx`, `client/src/components/FilePreviewModal.tsx`, `client/src/components/GlobalSearchModal.tsx`, `client/src/components/PrintableVoucher.tsx`
- Create: `client/src/pages/LoginPage.tsx`
- Modify: `client/src/index.css`, `client/src/App.tsx`

- [ ] **Step 1: Implement clean financial design tokens, typography (`tabular-nums`, antialiased smoothing), and responsive sidebar + mobile drawer shell**
- [ ] **Step 2: Implement `AuthContext`, `LoginPage` (with clear credential form & optional quick demo helper), and role-aware navigation**
- [ ] **Step 3: Implement `BsAdDatePicker` (toggle/input BS or AD date showing live dual preview), `StatusBadges` (exact spec labels), `FilePreviewModal` (zoomable image + embedded PDF viewer), and `GlobalSearchModal` (`Cmd+K` / header search with clickable `tel:` Call links)**
- [ ] **Step 4: Verify TypeScript compilation (`npm --workspace=client run build`)**
- [ ] **Step 5: Commit**

```bash
git add client
git commit -m "feat: add frontend shell, auth, BS/AD date picker, preview modal, and global search"
```

---

### Task 10: Frontend Core — Dashboards, Purchases Table, Add/Edit Purchase & VAT Pending List

**Files:**
- Create: `client/src/pages/DashboardPage.tsx`
- Create: `client/src/pages/PurchasesPage.tsx`
- Create: `client/src/pages/PurchaseFormPage.tsx`
- Create: `client/src/pages/PurchaseDetailPage.tsx`
- Create: `client/src/pages/VatPendingPage.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Build `DashboardPage`** — Admin KPI cards in `Rs.`, Recharts (Monthly Purchase Expenses, Monthly VAT, Vendor-wise Purchases, Paid vs Unpaid, VAT Received vs Pending), Recent Entries (newest first), Low Stock alerts; Staff view with My Recent Entries & Pending VAT quick actions.
- [ ] **Step 2: Build `PurchasesPage`** — Full columns (`Entry Date`, `Entry Time`, `Purchase Date BS/AD`, `VAT Bill Date`, `Vendor`, `Product`, `Purchase Amount`, `VAT 13%`, `Entered By`, `VAT Bill Status`, `Payment Status`), presets (`Today`, `Yesterday`, `This Week`, `This Month`, `Fiscal Year`, `Custom BS/AD Range`), Staff/Vendor filters.
- [ ] **Step 3: Build `PurchaseFormPage`** — Searchable vendor dropdown + quick-add vendor modal, automatic 13% Exclusive/Inclusive/`NON_VAT` calculator showing calculation method clearly, optional VAT bill drag-and-drop upload, and optional collapsible/expandable multi-product line-item builder (auto line totals + 13% VAT + grand total).
- [ ] **Step 4: Build `PurchaseDetailPage` & `VatPendingPage`** — Complete audit history, delayed VAT bill upload button, add/edit optional product items later, physical stock receipt trigger, printable voucher button (`window.print()`), and dedicated `VatPendingPage` with `Days Pending` & filters.
- [ ] **Step 5: Verify build & commit**

Run: `npm --workspace=client run build`
```bash
git add client
git commit -m "feat: add dashboard charts, purchase entry/detail, optional line items, and VAT pending UI"
```

---

### Task 11: Frontend Operations — Admin Review & Payments, Vendors, Vendor Payments & Inventory

**Files:**
- Create: `client/src/pages/AdminReviewPage.tsx`
- Create: `client/src/pages/VendorsPage.tsx`
- Create: `client/src/pages/VendorProfilePage.tsx`
- Create: `client/src/pages/VendorPaymentsPage.tsx`
- Create: `client/src/pages/InventoryDashboardPage.tsx`
- Create: `client/src/pages/ProductsPage.tsx`
- Create: `client/src/pages/ProductDetailPage.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Build `AdminReviewPage`** — Review queue with inline VAT bill image/PDF preview, Verify/Reject VAT bill, Approve/Reject entry with remarks, Record Partial/Full Payment + slip upload + bank account + transaction ref, Void Payment.
- [ ] **Step 2: Build `VendorsPage`, `VendorProfilePage`, and `VendorPaymentsPage`** — Searchable directory with clickable `tel:` **CALL** button, full vendor profile (company, bank, KPIs, purchase records, payment history), and Vendor Payment Dashboard table with drilldown to unpaid bills.
- [ ] **Step 3: Build `InventoryDashboardPage`, `ProductsPage`, and `ProductDetailPage`** — Inventory KPIs, Low/Out-of-Stock alert banner, stock table (`Available`, `Low Stock`, `Out of Stock`), Stock Out & Admin Adjustment modals, Product Master CRUD, and clickable Product Detail ledger with original purchase links.
- [ ] **Step 4: Verify build & commit**

Run: `npm --workspace=client run build`
```bash
git add client
git commit -m "feat: add admin review, payments, vendor management, and inventory UI"
```

---

### Task 12: Frontend Reports, Admin Controls & Full End-to-End Verification

**Files:**
- Create: `client/src/pages/ReportsPage.tsx`
- Create: `client/src/pages/AdminUsersPage.tsx`
- Create: `client/src/pages/SettingsBackupsPage.tsx`
- Modify: `client/src/App.tsx`, `server/src/index.ts` (ensure production static serving works from `client/dist`)

- [ ] **Step 1: Build `ReportsPage`, `AdminUsersPage`, and `SettingsBackupsPage`**

- `ReportsPage`: Tabs for Purchase/VAT Reports (7) & Inventory Reports (8), BS/AD date + Fiscal Year + Vendor/Category filters, instant preview table, and Excel (`.xlsx`), CSV (`.csv`), and PDF (`.pdf`) export buttons.
- `AdminUsersPage`: Create/edit/deactivate Staff & Admin users, reset passwords.
- `SettingsBackupsPage`: Company details, default `EXCLUSIVE`/`INCLUSIVE` VAT mode, Staff override toggle, one-click PostgreSQL `.sql` backup + JSON export download, and searchable Activity Audit Log.

- [ ] **Step 2: Run full backend test suite + production build**

Run: `npm --workspace=server test && npm run build`
Expected: All tests PASS and production bundle builds cleanly.

- [ ] **Step 3: End-to-end live verification against PostgreSQL**

Start production/dev server, test complete workflow in real browser (or headless verification + API verification): Staff purchase without VAT bill → delayed VAT bill upload → Admin VAT verify & approval → Stock receipt (verify once-only) → Stock-out → Partial payment + slip → Final payment → Reports export → Database backup.

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: complete reports, admin settings/backups, and verify end-to-end workflow"
```
