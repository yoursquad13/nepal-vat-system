# Nepal VAT Bill, Vendor Payment & Inventory Management System — Design Document

**Date:** 2026-11-13 (2083-07-27 BS)
**Workspace:** `/Users/anishkhatri/Documents/VAT`
**Target Stack:** Node.js + Express + TypeScript + PostgreSQL (Backend) · React + Vite + Tailwind CSS + Recharts (Frontend)

---

## 1. Intent & Scope

Build a full-stack, production-grade web application for a company operating in Nepal to manage vendor purchases, 13% VAT bill compliance (including deferred/pending VAT bills), admin approvals, vendor payments and bank payment slips, integrated inventory/stock management, Bikram Sambat (BS) and AD dual-date tracking in Nepal Standard Time (`Asia/Kathmandu`, `UTC+5:45`), and financial/inventory reporting with Excel, CSV, and PDF exports.

### Core Goals
- Eliminate lost or forgotten VAT bills via explicit `VAT BILL PENDING` tracking and aging counters.
- Enforce strict separation between **Purchase Approval**, **VAT Bill Status**, **Payment Status**, and **Physical Stock Receipt**.
- Support fast bill entry without forcing immediate line-item product entry, while allowing detailed multi-item breakdown and inventory linkage either during entry or later.
- Provide complete auditability (`activity_logs`, immutable NPT entry timestamps, change history) and secure role-based access (`ADMIN` vs `STAFF`).
- Support both Bikram Sambat (BS) and Gregorian (AD) dates everywhere, including Nepali Fiscal Year (`Shrawan` to `Ashadh`, e.g., `2083/84`) filtering.

### Non-Goals
- Multi-tenant SaaS billing or external IRD e-filing API submission (reports export cleanly in Excel/CSV/PDF for accounting/IRD filing).
- Automated online bank payment execution (payments and bank slips are recorded/uploaded by Admin).

---

## 2. Selected Approach & Architecture

### Approaches Considered
1. **React (Vite) + Tailwind CSS + Express (TypeScript) + PostgreSQL** *(Selected)*
   - Clean separation between a typed Express REST API (`server/`) and a responsive React SPA (`client/`), connecting directly to the user's running local PostgreSQL instance.
   - In production, the Node/Express server serves the compiled Vite frontend bundle and streams authenticated uploads from a single port.
   - Tradeoff: Two dev processes (`vite` + `tsx watch`) wired under one `npm run dev` script; requires a configured PostgreSQL database connection.
2. **React + Express + SQLite (`node:sqlite`)**
   - Zero external DB setup, rejected because the user explicitly requested using their already installed and running PostgreSQL server.
3. **Next.js App Router + PostgreSQL**
   - Unified framework, rejected to avoid unnecessary SSR/App Router file-streaming complexity for an internal authenticated financial app.

### System Layout
```text
/Users/anishkhatri/Documents/VAT/
├── package.json                 # Root workspace scripts (dev, build, start, test, db:migrate, db:seed)
├── .env.example                 # DATABASE_URL, JWT_SECRET, UPLOAD_DIR, PORT, COMPANY_NAME
├── server/
│   ├── src/
│   │   ├── app.ts               # Express app, security headers, cookie parser, error handler
│   │   ├── index.ts             # Server bootstrap & static SPA fallback in prod
│   │   ├── config/              # Env config, PostgreSQL pool (`pg`)
│   │   ├── db/
│   │   │   ├── migrations/      # Versioned SQL migrations
│   │   │   ├── migrate.ts       # Migration runner
│   │   │   └── seed.ts          # Initial Admin, sample Staff, settings, optional demo seed
│   │   ├── middleware/          # Auth (HTTP-only JWT cookie), role guards, upload (multer), validation
│   │   ├── utils/               # Money/paisa VAT math, NPT/BS date converter, audit logger, CSV/XLSX/PDF builders
│   │   └── routes/              # auth, users, vendors, purchases, vat-bills, payments, products, inventory, dashboard, search, reports, settings, backups, files
│   └── tests/                   # API & business-logic integration tests
├── client/
│   ├── index.html
│   └── src/
│       ├── api/                 # Typed fetch wrapper + domain endpoints
│       ├── components/          # Layout/Sidebar, BS/AD DatePicker, FilePreviewModal, StatusBadges, PrintableVoucher
│       ├── context/             # AuthContext, SettingsContext, ToastContext
│       ├── pages/               # Dashboard, Purchases, New/Edit Purchase, Purchase Detail, VAT Pending,
│       │                        # Admin Review, Vendors, Vendor Profile, Vendor Payments,
│       │                        # Products, Product Detail, Inventory, Search, Reports, Users, Settings/Backups
│       └── utils/               # NPR formatter (Rs.), BS/AD display helpers, VAT preview math
└── uploads/                     # Local protected storage (vat-bills/, payment-slips/, backups/) — never served publicly without auth
```

---

## 3. Database Design (PostgreSQL)

Follows PostgreSQL best practices: `BIGINT GENERATED ALWAYS AS IDENTITY` primary keys, `NUMERIC(14,2)` for NPR money (`NUMERIC(14,3)` for quantities), `TIMESTAMPTZ` for all timestamps, `TEXT` strings, indexed foreign keys, and parameterized `pg` queries only.

### Tables

1. **`app_settings`**
   - `id` (singleton `1`), `company_name`, `company_pan`, `company_vat`, `company_address`, `default_vat_mode` (`'EXCLUSIVE' | 'INCLUSIVE'`), `allow_staff_vat_mode_override` (boolean), `allow_negative_stock_admin_only` (boolean), `updated_by`, `updated_at`.

2. **`users`**
   - `id`, `full_name`, `username` (unique), `email` (unique), `password_hash`, `role` (`'ADMIN' | 'STAFF'`), `phone`, `is_active` (boolean), `created_at`, `updated_at`.

3. **`vendors`**
   - `id`, `company_name`, `pan_number`, `vat_number`, `contact_person`, `contact_number`, `alt_contact_number`, `address`, `bank_name`, `bank_branch`, `bank_account_holder`, `bank_account_number`, `account_type`, `email`, `notes`, `is_active`, `created_by`, `created_at`, `updated_at`.
   - Indexes on `company_name`, `pan_number`, `vat_number`, `contact_number`.

4. **`products`**
   - `id`, `name`, `sku` (unique case-insensitive index), `category`, `brand`, `description`, `unit_of_measurement`, `min_stock_level` (`NUMERIC(14,3)`), `current_stock` (`NUMERIC(14,3)`), `avg_purchase_price` (`NUMERIC(14,2)`), `latest_purchase_price` (`NUMERIC(14,2)`), `total_purchased_qty` (`NUMERIC(14,3)`), `total_issued_qty` (`NUMERIC(14,3)`), `is_active`, `created_by`, `created_at`, `updated_at`.

5. **`purchases`**
   - `id`, `purchase_code` (generated e.g. `PUR-2083-0001`), `vendor_id` (FK -> `vendors`, NOT NULL), `bill_number`, `product_summary` (required summary name/title, e.g. `"Cement & Steel"`), `description`,
   - **Dates & Immutable Entry Tracking:**
     - `entry_at` (`TIMESTAMPTZ NOT NULL DEFAULT NOW()` — server-only, never editable),
     - `entry_date_ad` (`DATE NOT NULL`), `entry_time_npt` (`TEXT NOT NULL`), `entry_date_bs` (`TEXT NOT NULL`),
     - `purchase_date_ad` (`DATE NOT NULL`), `purchase_date_bs` (`TEXT NOT NULL`), `fiscal_year` (`TEXT NOT NULL`),
     - `vat_bill_date_ad` (`DATE`), `vat_bill_date_bs` (`TEXT`),
   - **Tax, Monetary & VAT Fields (`NUMERIC(14,2)`):**
     - `tax_type` (`'VAT_13' | 'NON_VAT'`, default `'VAT_13'` — supports optional 0% PAN-only/exempt bills without polluting `VAT BILL PENDING`),
     - `vat_calc_mode` (`'EXCLUSIVE' | 'INCLUSIVE'`),
     - `entered_amount` (`NUMERIC(14,2)`),
     - `purchase_amount` (`NUMERIC(14,2)` — VAT-exclusive base amount),
     - `vat_amount` (`NUMERIC(14,2)` — 13% VAT component, `0.00` for `'NON_VAT'`),
     - `total_amount` (`NUMERIC(14,2)` — Total including VAT),
     - `paid_amount` (`NUMERIC(14,2) DEFAULT 0`),
   - **Independent Workflow Statuses:**
     - `review_status` (`'PENDING_REVIEW' | 'APPROVED' | 'REJECTED'`),
     - `vat_bill_status` (`'VAT BILL PENDING' | 'VAT BILL RECEIVED' | 'VAT BILL VERIFIED' | 'VAT BILL REJECTED' | 'NOT APPLICABLE'`),
     - `payment_status` (`'PAYMENT PENDING' | 'APPROVED' | 'PARTIALLY PAID' | 'PAID'`),
   - **Workflow Metadata:**
     - `submitted_by` (FK -> `users`), `approved_by` (FK -> `users`), `approved_at` (`TIMESTAMPTZ`), `admin_remarks`, `rejection_reason`,
     - `vat_bill_uploaded_at` (`TIMESTAMPTZ`), `vat_verified_by` (FK -> `users`), `vat_verified_at` (`TIMESTAMPTZ`),
     - `paid_at` (`TIMESTAMPTZ` — timestamp when fully paid),
     - `remarks`, `idempotency_key` (unique nullable), `is_deleted` (soft-delete flag for Admin safety with audit log), `created_at`, `updated_at`.
   - Partial unique index on `(vendor_id, LOWER(bill_number)) WHERE bill_number IS NOT NULL AND bill_number <> '' AND is_deleted = FALSE` to prevent duplicate vendor invoice numbers.

6. **`purchase_items`**
   - Optional child rows (0 to N per purchase; can be added during initial entry or attached later):
   - `id`, `purchase_id` (FK -> `purchases` ON DELETE CASCADE), `product_id` (FK -> `products`),
   - `product_name`, `category`, `sku`, `description`, `quantity` (`NUMERIC(14,3)`), `unit_of_measurement`, `unit_price` (`NUMERIC(14,2)`), `line_subtotal` (`NUMERIC(14,2)`), `line_vat_amount` (`NUMERIC(14,2)`), `line_total` (`NUMERIC(14,2)`),
   - **Physical Stock Receipt Tracking (separate from purchase approval & payment/VAT):**
     - `stock_received` (`BOOLEAN DEFAULT FALSE` — each line item is stocked once in full upon receipt confirmation),
     - `stock_received_at` (`TIMESTAMPTZ`),
     - `stock_received_by` (FK -> `users`),
   - `created_at`, `updated_at`.

7. **`vat_bills`**
   - Stores current and historical uploaded VAT bill documents per purchase:
   - `id`, `purchase_id` (FK -> `purchases`), `file_name`, `original_name`, `mime_type`, `file_size`, `storage_path`, `bill_date_ad`, `bill_date_bs`, `vat_bill_number`, `status` (`'RECEIVED' | 'VERIFIED' | 'REJECTED'`), `review_notes`, `uploaded_by` (FK -> `users`), `uploaded_at` (`TIMESTAMPTZ`), `reviewed_by` (FK -> `users`), `reviewed_at` (`TIMESTAMPTZ`), `is_current` (`BOOLEAN DEFAULT TRUE`).

8. **`payments`**
   - Supports multiple & partial payments per purchase (with Admin void/reversal support):
   - `id`, `purchase_id` (FK -> `purchases`), `vendor_id` (FK -> `vendors`), `amount` (`NUMERIC(14,2)`), `payment_date_ad` (`DATE`), `payment_date_bs` (`TEXT`), `paid_at` (`TIMESTAMPTZ NOT NULL DEFAULT NOW()`), `transaction_ref`, `company_bank_account`, `payment_method`, `remarks`, `recorded_by` (FK -> `users`), `is_voided` (`BOOLEAN DEFAULT FALSE`), `voided_at` (`TIMESTAMPTZ`), `voided_by` (FK -> `users`), `void_reason`, `created_at`.

9. **`payment_slips`**
   - `id`, `payment_id` (FK -> `payments`), `purchase_id` (FK -> `purchases`), `file_name`, `original_name`, `mime_type`, `file_size`, `storage_path`, `uploaded_by` (FK -> `users`), `uploaded_at` (`TIMESTAMPTZ`).

10. **`inventory_movements`**
    - Immutable audit ledger for all stock changes:
    - `id`, `product_id` (FK -> `products`), `purchase_id` (FK -> `purchases` nullable), `purchase_item_id` (FK -> `purchase_items` nullable),
    - `movement_type` (`'OPENING_STOCK' | 'STOCK_IN' | 'STOCK_OUT' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT'`),
    - `reason` (e.g., `'PURCHASE_RECEIPT'`, `'SOLD'`, `'INTERNAL_ISSUE'`, `'DAMAGED_EXPIRED'`, `'STOCK_ADJUSTMENT'`, `'OPENING_BALANCE'`),
    - `reference_label` (vendor name, department, or voucher),
    - `qty_in` (`NUMERIC(14,3) DEFAULT 0`), `qty_out` (`NUMERIC(14,3) DEFAULT 0`), `balance_after` (`NUMERIC(14,3)`),
    - `unit_cost` (`NUMERIC(14,2)`), `movement_date_ad` (`DATE`), `movement_date_bs` (`TEXT`), `responsible_staff_id` (FK -> `users`), `responsible_staff_name`, `remarks`, `created_by` (FK -> `users`), `created_at` (`TIMESTAMPTZ`).
    - **Idempotency guard:** Partial unique index on `(purchase_item_id) WHERE purchase_item_id IS NOT NULL AND movement_type = 'STOCK_IN'` guarantees a purchase item can never add stock twice.

11. **`activity_logs`**
    - `id`, `entity_type` (`'PURCHASE' | 'VAT_BILL' | 'PAYMENT' | 'VENDOR' | 'PRODUCT' | 'INVENTORY' | 'USER' | 'SETTINGS' | 'BACKUP'`), `entity_id`, `action`, `summary`, `old_values` (`JSONB`), `new_values` (`JSONB`), `performed_by` (FK -> `users`), `performed_by_name`, `performed_at` (`TIMESTAMPTZ`).

---

## 4. Core Business Logic & Calculations

### 4.1 13% VAT & Non-VAT Calculation (Exact Integer Paisa Arithmetic)
All monetary values are converted to integer paisa (`Math.round(n * 100)`) before calculation and validated on the backend:
- **Standard 13% VAT (`tax_type = 'VAT_13'`, default):**
  - **VAT-Exclusive (`EXCLUSIVE`):**
    - `basePaisa = enteredPaisa`
    - `vatPaisa = Math.round(basePaisa * 13 / 100)`
    - `totalPaisa = basePaisa + vatPaisa`
  - **VAT-Inclusive (`INCLUSIVE`):**
    - `totalPaisa = enteredPaisa`
    - `vatPaisa = Math.round(totalPaisa * 13 / 113)`
    - `basePaisa = totalPaisa - vatPaisa`
- **Non-VAT / PAN-Only Bill (`tax_type = 'NON_VAT'` — sensible default extension):**
  - `basePaisa = enteredPaisa`, `vatPaisa = 0`, `totalPaisa = enteredPaisa`, and `vat_bill_status = 'NOT APPLICABLE'` (never enters `VAT Pending` aging or distorts 13% VAT totals).

### 4.2 Bikram Sambat (BS) & NPT (`UTC+5:45`) Handling
- Server formats and computes `entry_date_ad`, `entry_time_npt`, and `entry_date_bs` using `Asia/Kathmandu` timezone (`UTC+5:45`) on creation.
- A deterministic AD ↔ BS calendar utility (covering 2000 BS – 2090 BS, i.e., 1943–2034 AD) runs identically on backend and frontend:
  - Displays dual dates: e.g., `2083-07-27 BS` (`2026-11-13`).
  - Computes Nepali Fiscal Year automatically (`Shrawan` [month 4] onward belongs to `YYYY/(YY+1)`, `Baisakh–Ashadh` [months 1–3] belongs to `(YYYY-1)/YY`).
  - Supports filtering by Today, Yesterday, This Week, This Month (BS or AD), Fiscal Year, and Custom Date Range (BS or AD).

### 4.3 Optional Product Breakdown, Valuation & Independent Stock Receipt
- Staff can submit a purchase with **only header fields** (fast entry) or with **1..N product rows**.
- Product rows can also be added/updated later on the Purchase Detail page (as long as those items have not yet been marked `stock_received = TRUE`).
- **Unit Price & Inventory Valuation (Builder Call):**
  - Each `purchase_items.unit_price` follows the bill's `vat_calc_mode` (`EXCLUSIVE` or `INCLUSIVE`) so entry matches paper invoices.
  - The system calculates and stores `line_subtotal` (VAT-exclusive net amount), `line_vat_amount`, and `line_total`.
  - Inventory valuation (`inventory_movements.unit_cost`, `products.avg_purchase_price`, `products.latest_purchase_price`) uses the **VAT-exclusive net unit cost** (`line_subtotal / quantity`), following standard Nepal VAT accounting where 13% input VAT is recoverable.
  - If the user retains a bill header total that differs slightly from the sum of line items (e.g., discount or rounding), the line items' raw net cost is kept and the header variance is preserved on `purchases`.
- **Inventory Update Rule (Full Item Receipt Once):**
  - Stock enters `products` and `inventory_movements` **only** when a purchase is `review_status = 'APPROVED'` and an authorized user explicitly triggers physical stock receipt for its `purchase_items`.
  - Each `purchase_item` is received **once in full** (`stock_received = TRUE`), protected by the unique index on `inventory_movements (purchase_item_id)` so editing or re-approving a purchase can never double-count stock.
  - `vat_bill_status` and `payment_status` **never** block or trigger stock entry.

### 4.4 Independent Status Transitions, Mutability & Reversals
- **VAT Bill Status:**
  - `tax_type = 'NON_VAT'` -> `NOT APPLICABLE`
  - `VAT_13` created without file -> `VAT BILL PENDING`
  - Created with file or uploaded later (by any Staff or Admin) -> `VAT BILL RECEIVED` (sets `vat_bill_uploaded_at`)
  - Admin verifies image/PDF -> `VAT BILL VERIFIED`
  - Admin rejects image/PDF -> `VAT BILL REJECTED` (staff/admin can re-upload)
- **Review & Payment Status:**
  - Created -> `review_status = 'PENDING_REVIEW'`, `payment_status = 'PAYMENT PENDING'`
  - Admin approves purchase -> `review_status = 'APPROVED'`, `payment_status = 'APPROVED'` (if `paid_amount == 0`)
  - Admin records partial payment (`0 < paid_amount < total_amount`) -> `PARTIALLY PAID` (requires `review_status = 'APPROVED'`; independent of `vat_bill_status`)
  - Admin records remaining payment (`paid_amount == total_amount`) -> `PAID` (sets `paid_at`)
  - Admin rejects purchase -> `review_status = 'REJECTED'` (blocks payments and stock receipt until edited/resubmitted)
- **Post-Approval Mutability, Deletions & Payment Voids (Builder Call):**
  - Once a purchase is `APPROVED`, has non-voided `payments`, or has `stock_received = TRUE`, core financial fields (`vendor_id`, `tax_type`, `vat_calc_mode`, `entered_amount`, `purchase_amount`, `vat_amount`, `total_amount`) are locked.
  - Soft-delete (`is_deleted = TRUE`) is **blocked (`409 Conflict`)** if the purchase has active (non-voided) payments or `STOCK_IN` movements, preserving ledger integrity.
  - Admin can **Void Payment** (marks `payments.is_voided = TRUE` with `void_reason`, recalculates `paid_amount` and `payment_status`, and logs to `activity_logs`) if a payment was entered with a mistake.

---

## 5. Security, File Handling, Role Scope & Backups

- **Authentication:** `scrypt` password hashing (Node `crypto.scrypt` with random salt) + signed JWT stored in an `HttpOnly`, `SameSite=Lax` cookie.
- **Role Scope & Authorization (Sensible Defaults):**
  - **Staff Visibility & Actions:** `STAFF` can view all non-deleted purchases, vendors, and products across the company (so any staff member can upload delayed VAT bills, attach optional line items later, and look up vendor/product info), add vendors/products, submit purchases, edit their own `PENDING_REVIEW`/`REJECTED` purchases before approval/stock-in, upload delayed VAT bills, confirm physical stock receipt on `APPROVED` purchases, and record `STOCK_OUT` (sold / internal issue / damaged). Staff dashboard highlights "My Recent Entries".
  - **Admin-Only Endpoints (`403 Forbidden` for Staff):** Approving/rejecting purchases, verifying/rejecting VAT bills, recording/voiding payments, uploading payment slips, soft-deleting records, managing staff accounts, configuring VAT/company settings, recording `OPENING_STOCK` / `ADJUSTMENT_IN` / `ADJUSTMENT_OUT`, overriding negative-stock limits, and creating/downloading DB backups.
- **Uploads:** Strict MIME & extension allowlist (`image/jpeg`, `image/png`, `image/webp`, `application/pdf`), max 10 MB, stored with UUID filenames outside `public/` and served only through authenticated `GET /api/files/:type/:id` endpoints with `Content-Disposition: inline` / `X-Content-Type-Options: nosniff`.
- **Financial Backups:** Admin-only endpoint invokes `pg_dump` (with safe env credentials, no shell interpolation) to generate timestamped `.sql` backups in `uploads/backups/` and supports downloading backups + full JSON ledger export.

---

## 6. UI/UX & Frontend Structure

- **Visual Direction:** Clean, high-trust financial operations console (crisp slate-white surfaces, deep emerald/teal primary brand accent `#0F766E`, semantic status pills, `tabular-nums` on all NPR amounts/quantities/dates, concentric card radii, accessible 44px touch targets, responsive collapsible sidebar + mobile drawer).
- **Navigation Sections:**
  1. **Dashboard** (Role-aware: full analytics + Recharts + Recent Entries + Low Stock for Admin; personal Recent Entries + Pending VAT Bills + Quick Entry for Staff)
  2. **Purchases** (All Purchases with Entry Date/Time, Purchase Date BS/AD, VAT Bill Date, Vendor, Product, Amount, 13% VAT, Entered By, VAT Status, Payment Status; Quick Filters)
  3. **Add New Purchase** (Header + optional dynamic multi-product table + live 13% Inclusive/Exclusive VAT calculator + BS/AD picker + Upload VAT Bill)
  4. **VAT Pending List** (Dedicated aging view with Days Pending, filters, one-click Upload Bill / Verify)
  5. **Admin Review & Payments** *(Admin only)* (Review queue, lightbox bill preview, Approve/Reject, Record Partial/Full Payment + Slip Upload)
  6. **Vendors** (Searchable directory, clickable `CALL` button, full Vendor Profile with purchase/VAT/unpaid metrics & payment history)
  7. **Vendor Payment Dashboard** *(Admin only)* (Totals KPIs, vendor-wise payable table, click-to-drill unpaid bills)
  8. **Inventory & Products** (Inventory Dashboard with KPIs + Low/Out-of-Stock alerts, Product Master, Clickable Product Detail ledger, Stock In / Receive Purchase / Stock Out / Adjustments)
  9. **Global Search** (Top `Cmd+K` / instant search across products, vendors, phone, PAN, VAT no, dates, bill numbers)
  10. **Reports & Exports** (Purchase/VAT Reports: Daily, Monthly BS/AD, Vendor-wise, VAT Pending, Payment Pending, Paid Bills, Purchase VAT Summary; Inventory Reports: Product-wise stock, Stock-in, Stock-out, Vendor-wise purchased product, Monthly inventory purchase, Current stock valuation, Low-stock, Stock adjustment — all exportable to `.xlsx`, `.csv`, `.pdf`, plus Printable Purchase Voucher)
  11. **Admin Controls** *(Admin only)* (Staff Management, Company & VAT Settings, Database Backups & Activity Audit Log)

---

## 7. Verification Plan

1. **Automated Tests:**
   - Unit tests for 13% inclusive/exclusive paisa VAT math, BS ↔ AD conversion & Nepali Fiscal Year calculation, and stock-balance / duplicate-receipt guards.
   - API integration tests against PostgreSQL covering the full lifecycle: Staff creates purchase without VAT bill (`VAT BILL PENDING`) → Staff uploads VAT bill later (`VAT BILL RECEIVED`) → Admin verifies VAT bill (`VAT BILL VERIFIED`) and approves purchase (`APPROVED`) → Physical stock receipt updates `products` & `inventory_movements` once (second receipt blocked) → Admin records partial payment (`PARTIALLY PAID`) + slip → Admin records final payment (`PAID`) → Staff role-restriction tests (`403`) → Reports export endpoints (`.xlsx`, `.csv`, `.pdf`).
2. **End-to-End Browser Verification:**
   - Verify responsive layout (desktop & mobile), login as Staff & Admin, live VAT math, BS/AD picker, image/PDF preview modal, and global search against the running PostgreSQL database.
