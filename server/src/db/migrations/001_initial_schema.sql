-- Migration: 001_initial_schema.sql
-- Nepal VAT Bill, Vendor Payment & Inventory Management System

-- 1. Schema Migrations table (if not exists)
CREATE TABLE IF NOT EXISTS schema_migrations (
  id SERIAL PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Users Table
CREATE TABLE IF NOT EXISTS users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  full_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'STAFF')),
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 3. App Settings Table (Singleton id=1)
CREATE TABLE IF NOT EXISTS app_settings (
  id BIGINT PRIMARY KEY CHECK (id = 1),
  company_name TEXT NOT NULL DEFAULT 'Himalayan Trading Suppliers Pvt. Ltd.',
  company_pan TEXT,
  company_vat TEXT,
  company_address TEXT,
  default_vat_mode TEXT NOT NULL DEFAULT 'EXCLUSIVE' CHECK (default_vat_mode IN ('EXCLUSIVE', 'INCLUSIVE')),
  allow_staff_vat_mode_override BOOLEAN NOT NULL DEFAULT TRUE,
  allow_negative_stock_admin_only BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by BIGINT REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Vendors Table
CREATE TABLE IF NOT EXISTS vendors (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_name TEXT NOT NULL,
  pan_number TEXT,
  vat_number TEXT,
  contact_person TEXT,
  contact_number TEXT,
  alt_contact_number TEXT,
  address TEXT,
  bank_name TEXT,
  bank_branch TEXT,
  bank_account_holder TEXT,
  bank_account_number TEXT,
  account_type TEXT,
  email TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendors_company_name ON vendors(company_name);
CREATE INDEX IF NOT EXISTS idx_vendors_pan_number ON vendors(pan_number);
CREATE INDEX IF NOT EXISTS idx_vendors_vat_number ON vendors(vat_number);
CREATE INDEX IF NOT EXISTS idx_vendors_contact_number ON vendors(contact_number);
CREATE INDEX IF NOT EXISTS idx_vendors_is_active ON vendors(is_active);

-- 5. Products Table
CREATE TABLE IF NOT EXISTS products (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  category TEXT,
  brand TEXT,
  description TEXT,
  unit_of_measurement TEXT NOT NULL DEFAULT 'pcs',
  min_stock_level NUMERIC(14,3) NOT NULL DEFAULT 0,
  current_stock NUMERIC(14,3) NOT NULL DEFAULT 0,
  avg_purchase_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  latest_purchase_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_purchased_qty NUMERIC(14,3) NOT NULL DEFAULT 0,
  total_issued_qty NUMERIC(14,3) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku_unique_lower ON products(LOWER(sku));
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);

-- 6. Purchases Table
CREATE TABLE IF NOT EXISTS purchases (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  purchase_code TEXT NOT NULL UNIQUE,
  vendor_id BIGINT NOT NULL REFERENCES vendors(id),
  bill_number TEXT,
  product_summary TEXT NOT NULL,
  description TEXT,

  -- Dates & Immutable Entry Tracking
  entry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  entry_date_ad DATE NOT NULL,
  entry_time_npt TEXT NOT NULL,
  entry_date_bs TEXT NOT NULL,
  purchase_date_ad DATE NOT NULL,
  purchase_date_bs TEXT NOT NULL,
  fiscal_year TEXT NOT NULL,
  vat_bill_date_ad DATE,
  vat_bill_date_bs TEXT,

  -- Tax, Monetary & VAT Fields (NUMERIC(14,2))
  tax_type TEXT NOT NULL DEFAULT 'VAT_13' CHECK (tax_type IN ('VAT_13', 'NON_VAT')),
  vat_calc_mode TEXT NOT NULL DEFAULT 'EXCLUSIVE' CHECK (vat_calc_mode IN ('EXCLUSIVE', 'INCLUSIVE')),
  entered_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  purchase_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- Independent Workflow Statuses
  review_status TEXT NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (review_status IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED')),
  vat_bill_status TEXT NOT NULL DEFAULT 'VAT BILL PENDING' CHECK (vat_bill_status IN ('VAT BILL PENDING', 'VAT BILL RECEIVED', 'VAT BILL VERIFIED', 'VAT BILL REJECTED', 'NOT APPLICABLE')),
  payment_status TEXT NOT NULL DEFAULT 'PAYMENT PENDING' CHECK (payment_status IN ('PAYMENT PENDING', 'APPROVED', 'PARTIALLY PAID', 'PAID')),

  -- Workflow Metadata
  submitted_by BIGINT REFERENCES users(id),
  approved_by BIGINT REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  admin_remarks TEXT,
  rejection_reason TEXT,
  vat_bill_uploaded_at TIMESTAMPTZ,
  vat_verified_by BIGINT REFERENCES users(id),
  vat_verified_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  remarks TEXT,
  idempotency_key TEXT UNIQUE,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial unique index to prevent duplicate vendor invoice numbers
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_vendor_bill_unique
  ON purchases(vendor_id, LOWER(bill_number))
  WHERE bill_number IS NOT NULL AND bill_number <> '' AND is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_purchases_vendor_id ON purchases(vendor_id);
CREATE INDEX IF NOT EXISTS idx_purchases_purchase_date_ad ON purchases(purchase_date_ad);
CREATE INDEX IF NOT EXISTS idx_purchases_fiscal_year ON purchases(fiscal_year);
CREATE INDEX IF NOT EXISTS idx_purchases_review_status ON purchases(review_status);
CREATE INDEX IF NOT EXISTS idx_purchases_vat_bill_status ON purchases(vat_bill_status);
CREATE INDEX IF NOT EXISTS idx_purchases_payment_status ON purchases(payment_status);
CREATE INDEX IF NOT EXISTS idx_purchases_is_deleted ON purchases(is_deleted);
CREATE INDEX IF NOT EXISTS idx_purchases_submitted_by ON purchases(submitted_by);

-- 7. Purchase Items Table
CREATE TABLE IF NOT EXISTS purchase_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  purchase_id BIGINT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id BIGINT REFERENCES products(id),
  product_name TEXT NOT NULL,
  category TEXT,
  sku TEXT,
  description TEXT,
  quantity NUMERIC(14,3) NOT NULL DEFAULT 1,
  unit_of_measurement TEXT NOT NULL DEFAULT 'pcs',
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_vat_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  stock_received BOOLEAN NOT NULL DEFAULT FALSE,
  stock_received_at TIMESTAMPTZ,
  stock_received_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase_id ON purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_product_id ON purchase_items(product_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_stock_received ON purchase_items(stock_received);

-- 8. VAT Bills Table
CREATE TABLE IF NOT EXISTS vat_bills (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  purchase_id BIGINT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  storage_path TEXT NOT NULL,
  bill_date_ad DATE,
  bill_date_bs TEXT,
  vat_bill_number TEXT,
  status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED', 'VERIFIED', 'REJECTED')),
  review_notes TEXT,
  uploaded_by BIGINT REFERENCES users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by BIGINT REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  is_current BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_vat_bills_purchase_id ON vat_bills(purchase_id);
CREATE INDEX IF NOT EXISTS idx_vat_bills_status ON vat_bills(status);
CREATE INDEX IF NOT EXISTS idx_vat_bills_is_current ON vat_bills(is_current);

-- 9. Payments Table
CREATE TABLE IF NOT EXISTS payments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  purchase_id BIGINT NOT NULL REFERENCES purchases(id),
  vendor_id BIGINT NOT NULL REFERENCES vendors(id),
  amount NUMERIC(14,2) NOT NULL,
  payment_date_ad DATE NOT NULL,
  payment_date_bs TEXT NOT NULL,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  transaction_ref TEXT,
  company_bank_account TEXT,
  payment_method TEXT NOT NULL DEFAULT 'BANK_TRANSFER',
  remarks TEXT,
  recorded_by BIGINT REFERENCES users(id),
  is_voided BOOLEAN NOT NULL DEFAULT FALSE,
  voided_at TIMESTAMPTZ,
  voided_by BIGINT REFERENCES users(id),
  void_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_purchase_id ON payments(purchase_id);
CREATE INDEX IF NOT EXISTS idx_payments_vendor_id ON payments(vendor_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_date_ad ON payments(payment_date_ad);
CREATE INDEX IF NOT EXISTS idx_payments_is_voided ON payments(is_voided);

-- 10. Payment Slips Table
CREATE TABLE IF NOT EXISTS payment_slips (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  payment_id BIGINT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  purchase_id BIGINT NOT NULL REFERENCES purchases(id),
  file_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  storage_path TEXT NOT NULL,
  uploaded_by BIGINT REFERENCES users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_slips_payment_id ON payment_slips(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_slips_purchase_id ON payment_slips(purchase_id);

-- 11. Inventory Movements Table
CREATE TABLE IF NOT EXISTS inventory_movements (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id),
  purchase_id BIGINT REFERENCES purchases(id),
  purchase_item_id BIGINT REFERENCES purchase_items(id),
  movement_type TEXT NOT NULL CHECK (movement_type IN ('OPENING_STOCK', 'STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT')),
  reason TEXT NOT NULL,
  reference_label TEXT,
  qty_in NUMERIC(14,3) NOT NULL DEFAULT 0,
  qty_out NUMERIC(14,3) NOT NULL DEFAULT 0,
  balance_after NUMERIC(14,3) NOT NULL,
  unit_cost NUMERIC(14,2),
  movement_date_ad DATE NOT NULL,
  movement_date_bs TEXT NOT NULL,
  responsible_staff_id BIGINT REFERENCES users(id),
  responsible_staff_name TEXT,
  remarks TEXT,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotency guard: Each purchase item can only be stocked in once
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_movements_purchase_item_stock_in
  ON inventory_movements(purchase_item_id)
  WHERE purchase_item_id IS NOT NULL AND movement_type = 'STOCK_IN';

CREATE INDEX IF NOT EXISTS idx_inventory_movements_product_id ON inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_purchase_id ON inventory_movements(purchase_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_movement_date_ad ON inventory_movements(movement_date_ad);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_movement_type ON inventory_movements(movement_type);

-- 12. Activity Logs Table
CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('PURCHASE', 'VAT_BILL', 'PAYMENT', 'VENDOR', 'PRODUCT', 'INVENTORY', 'USER', 'SETTINGS', 'BACKUP')),
  entity_id BIGINT NOT NULL,
  action TEXT NOT NULL,
  summary TEXT NOT NULL,
  old_values JSONB,
  new_values JSONB,
  performed_by BIGINT REFERENCES users(id),
  performed_by_name TEXT,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_performed_at ON activity_logs(performed_at);
CREATE INDEX IF NOT EXISTS idx_activity_logs_performed_by ON activity_logs(performed_by);
