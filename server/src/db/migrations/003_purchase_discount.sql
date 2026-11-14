-- Migration: 003_purchase_discount.sql
-- Store bill-level discount_amount on purchases so bills with discounts calculate net taxable/total accurately.

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
