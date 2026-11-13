import crypto from 'node:crypto';
import { promisify } from 'node:util';
import pg from 'pg';
import { env } from '../config/env.js';

const scryptAsync = promisify(crypto.scrypt);

/**
 * Reusable scrypt password hashing function (salt:hash format)
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verify scrypt password against salt:hash format
 */
export async function verifyPassword(password: string, combined: string): Promise<boolean> {
  const [salt, key] = combined.split(':');
  if (!salt || !key) return false;
  const keyBuffer = Buffer.from(key, 'hex');
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return crypto.timingSafeEqual(keyBuffer, derivedKey);
}

export interface SeedOptions {
  withDemo?: boolean;
  databaseUrl?: string;
}

export async function seedDatabase(options?: SeedOptions): Promise<void> {
  const targetUrl = options?.databaseUrl || env.DATABASE_URL;
  const pool = new pg.Pool({ connectionString: targetUrl });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    console.log(`[seed] Seeding database: ${targetUrl.split('@')[1] || targetUrl}...`);

    // 1. Initial Admin & Staff Users
    const adminHash = await hashPassword('Admin@123');
    const staffHash = await hashPassword('Staff@123');

    const adminRes = await client.query(`
      INSERT INTO users (full_name, username, email, password_hash, role, phone, is_active)
      VALUES ('System Administrator', 'admin', 'admin@himalayantrading.com.np', $1, 'ADMIN', '9851000001', TRUE)
      ON CONFLICT (username) DO UPDATE
      SET password_hash = EXCLUDED.password_hash,
          role = 'ADMIN',
          full_name = EXCLUDED.full_name
      RETURNING id
    `, [adminHash]);
    const adminId = adminRes.rows[0].id;

    const staffRes = await client.query(`
      INSERT INTO users (full_name, username, email, password_hash, role, phone, is_active)
      VALUES ('Store Manager / Staff', 'staff', 'staff@himalayantrading.com.np', $1, 'STAFF', '9851000002', TRUE)
      ON CONFLICT (username) DO UPDATE
      SET password_hash = EXCLUDED.password_hash,
          role = 'STAFF',
          full_name = EXCLUDED.full_name
      RETURNING id
    `, [staffHash]);
    const staffId = staffRes.rows[0].id;

    // 2. Initial App Settings (Singleton id = 1)
    await client.query(`
      INSERT INTO app_settings (
        id, company_name, company_pan, company_vat, company_address,
        default_vat_mode, allow_staff_vat_mode_override, allow_negative_stock_admin_only,
        updated_by, updated_at
      ) VALUES (
        1, 'Himalayan Trading Suppliers Pvt. Ltd.', '601234567', '601234567',
        'Tripureshwor, Kathmandu, Nepal', 'EXCLUSIVE', TRUE, TRUE, $1, NOW()
      )
      ON CONFLICT (id) DO UPDATE
      SET company_name = EXCLUDED.company_name,
          company_pan = EXCLUDED.company_pan,
          company_vat = EXCLUDED.company_vat,
          company_address = EXCLUDED.company_address,
          updated_at = NOW();
    `, [adminId]);

    console.log('[seed] Core users (admin/staff) and app settings seeded.');

    // 3. Optional Demo Data
    if (options?.withDemo) {
      console.log('[seed] Seeding realistic Nepali demo data (vendors, products, purchases, stock)...');

      // Demo Vendors
      const v1Res = await client.query(`
        INSERT INTO vendors (
          company_name, pan_number, vat_number, contact_person, contact_number,
          alt_contact_number, address, bank_name, bank_branch, bank_account_holder,
          bank_account_number, account_type, email, notes, created_by
        ) VALUES (
          'Shivam Cements Ltd.', '301234567', '301234567', 'Ramesh Thapa', '9851012345',
          '01-4256789', 'Hetauda Industrial Estate / Kathmandu Office', 'Nabil Bank Ltd.', 'Teendhara',
          'Shivam Cements Ltd.', '00101017500123', 'Current', 'sales@shivancement.com',
          'Major OPC cement supplier with direct factory delivery', $1
        ) RETURNING id
      `, [adminId]);
      const v1Id = v1Res.rows[0].id;

      const v2Res = await client.query(`
        INSERT INTO vendors (
          company_name, pan_number, vat_number, contact_person, contact_number,
          alt_contact_number, address, bank_name, bank_branch, bank_account_holder,
          bank_account_number, account_type, email, notes, created_by
        ) VALUES (
          'Jagdamba Steels Pvt. Ltd.', '302345678', '302345678', 'Suresh Shrestha', '9841234567',
          '01-5544332', 'Simara, Bara / Lalitpur Depot', 'Nepal Investment Mega Bank Ltd.', 'Durbarmarg',
          'Jagdamba Steels Pvt. Ltd.', '01201050098765', 'Current', 'orders@jagdambasteel.com',
          'Primary rebar & steel rod manufacturer', $1
        ) RETURNING id
      `, [adminId]);
      const v2Id = v2Res.rows[0].id;

      const v3Res = await client.query(`
        INSERT INTO vendors (
          company_name, pan_number, vat_number, contact_person, contact_number,
          address, bank_name, bank_branch, bank_account_holder,
          bank_account_number, account_type, email, notes, created_by
        ) VALUES (
          'Asian Paints Nepal Pvt. Ltd.', '300123987', '300123987', 'Bikash Adhikari', '9801987654',
          'Banda, Hetauda / Balkhu, Kathmandu', 'Global IME Bank Ltd.', 'Kamaladi',
          'Asian Paints Nepal Pvt. Ltd.', '04501010043210', 'Current', 'info@asianpaintsnepal.com',
          'Paints, primers, and waterproofing chemicals', $1
        ) RETURNING id
      `, [adminId]);
      const v3Id = v3Res.rows[0].id;

      // Demo Products
      const p1Res = await client.query(`
        INSERT INTO products (
          name, sku, category, brand, description, unit_of_measurement,
          min_stock_level, current_stock, avg_purchase_price, latest_purchase_price,
          total_purchased_qty, total_issued_qty, created_by
        ) VALUES (
          'Shivam OPC Cement (50kg)', 'CEM-SHIVAM-OPC', 'Building Materials', 'Shivam',
          '50 kg bag 53 grade ordinary Portland cement', 'bag',
          50, 250, 720.00, 720.00, 250, 0, $1
        ) RETURNING id
      `, [adminId]);
      const p1Id = p1Res.rows[0].id;

      const p2Res = await client.query(`
        INSERT INTO products (
          name, sku, category, brand, description, unit_of_measurement,
          min_stock_level, current_stock, avg_purchase_price, latest_purchase_price,
          total_purchased_qty, total_issued_qty, created_by
        ) VALUES (
          'Jagdamba Fe 500D TMT Rebar (12mm)', 'STEEL-JAG-12MM', 'Steel & Rebar', 'Jagdamba',
          'High strength earthquake resistant 12mm TMT steel rod', 'kg',
          500, 2000, 98.00, 98.00, 2000, 0, $1
        ) RETURNING id
      `, [adminId]);
      const p2Id = p2Res.rows[0].id;

      const p3Res = await client.query(`
        INSERT INTO products (
          name, sku, category, brand, description, unit_of_measurement,
          min_stock_level, current_stock, avg_purchase_price, latest_purchase_price,
          total_purchased_qty, total_issued_qty, created_by
        ) VALUES (
          'Apex Ultima Weatherproof Exterior Paint (20L)', 'PNT-APEX-20L', 'Paints & Finishes', 'Asian Paints',
          'High durability acrylic exterior emulsion paint 20 Litre bucket', 'bucket',
          10, 25, 6800.00, 6800.00, 25, 0, $1
        ) RETURNING id
      `, [adminId]);
      const p3Id = p3Res.rows[0].id;

      // Opening Stock Movements
      await client.query(`
        INSERT INTO inventory_movements (
          product_id, movement_type, reason, reference_label,
          qty_in, qty_out, balance_after, unit_cost, movement_date_ad, movement_date_bs,
          responsible_staff_name, created_by
        ) VALUES
        ($1, 'OPENING_STOCK', 'OPENING_BALANCE', 'Initial Store Stock', 150, 0, 150, 720.00, '2026-11-01', '2083-07-15', 'Store Admin', $4),
        ($2, 'OPENING_STOCK', 'OPENING_BALANCE', 'Initial Store Stock', 1200, 0, 1200, 98.00, '2026-11-01', '2083-07-15', 'Store Admin', $4),
        ($3, 'OPENING_STOCK', 'OPENING_BALANCE', 'Initial Store Stock', 25, 0, 25, 6800.00, '2026-11-01', '2083-07-15', 'Store Admin', $4)
      `, [p1Id, p2Id, p3Id, adminId]);

      // Demo Purchase 1: APPROVED, VAT BILL VERIFIED, PAID, Stock Received
      const pur1Res = await client.query(`
        INSERT INTO purchases (
          purchase_code, vendor_id, bill_number, product_summary, description,
          entry_date_ad, entry_time_npt, entry_date_bs, purchase_date_ad, purchase_date_bs, fiscal_year,
          vat_bill_date_ad, vat_bill_date_bs,
          tax_type, vat_calc_mode, entered_amount, purchase_amount, vat_amount, total_amount, paid_amount,
          review_status, vat_bill_status, payment_status,
          submitted_by, approved_by, approved_at, admin_remarks,
          vat_bill_uploaded_at, vat_verified_by, vat_verified_at, paid_at
        ) VALUES (
          'PUR-2083-0001', $1, 'SHV-83-1042', '100 Bags Shivam OPC Cement', 'Factory direct supply for Site A',
          '2026-11-05', '10:30:00', '2083-07-19', '2026-11-05', '2083-07-19', '2083/84',
          '2026-11-05', '2083-07-19',
          'VAT_13', 'EXCLUSIVE', 72000.00, 72000.00, 9360.00, 81360.00, 81360.00,
          'APPROVED', 'VAT BILL VERIFIED', 'PAID',
          $2, $3, NOW(), 'Approved by admin, verified with tax portal',
          NOW(), $3, NOW(), NOW()
        ) RETURNING id
      `, [v1Id, staffId, adminId]);
      const pur1Id = pur1Res.rows[0].id;

      // Purchase 1 Item
      const item1Res = await client.query(`
        INSERT INTO purchase_items (
          purchase_id, product_id, product_name, category, sku, quantity, unit_of_measurement,
          unit_price, line_subtotal, line_vat_amount, line_total, stock_received, stock_received_at, stock_received_by
        ) VALUES (
          $1, $2, 'Shivam OPC Cement (50kg)', 'Building Materials', 'CEM-SHIVAM-OPC',
          100, 'bag', 720.00, 72000.00, 9360.00, 81360.00, TRUE, NOW(), $3
        ) RETURNING id
      `, [pur1Id, p1Id, staffId]);
      const item1Id = item1Res.rows[0].id;

      // Stock In Movement for Purchase 1
      await client.query(`
        INSERT INTO inventory_movements (
          product_id, purchase_id, purchase_item_id, movement_type, reason, reference_label,
          qty_in, qty_out, balance_after, unit_cost, movement_date_ad, movement_date_bs,
          responsible_staff_name, created_by
        ) VALUES (
          $1, $2, $3, 'STOCK_IN', 'PURCHASE_RECEIPT', 'PUR-2083-0001 Shivam Cements',
          100, 0, 250, 720.00, '2026-11-05', '2083-07-19', 'Store Staff', $4
        )
      `, [p1Id, pur1Id, item1Id, staffId]);

      // VAT Bill record for Purchase 1
      await client.query(`
        INSERT INTO vat_bills (
          purchase_id, file_name, original_name, mime_type, file_size, storage_path,
          bill_date_ad, bill_date_bs, vat_bill_number, status, review_notes,
          uploaded_by, uploaded_at, reviewed_by, reviewed_at, is_current
        ) VALUES (
          $1, 'demo-shivam-vat-bill.pdf', 'Shivam_VAT_Tax_Invoice_1042.pdf', 'application/pdf',
          102400, 'uploads/vat-bills/demo-shivam-vat-bill.pdf',
          '2026-11-05', '2083-07-19', 'SHV-83-1042', 'VERIFIED', 'Verified against IRD bill records',
          $2, NOW(), $3, NOW(), TRUE
        )
      `, [pur1Id, staffId, adminId]);

      // Payment for Purchase 1
      const pay1Res = await client.query(`
        INSERT INTO payments (
          purchase_id, vendor_id, amount, payment_date_ad, payment_date_bs, paid_at,
          transaction_ref, company_bank_account, payment_method, remarks, recorded_by
        ) VALUES (
          $1, $2, 81360.00, '2026-11-06', '2083-07-20', NOW(),
          'NABIL-TRF-982341', '00101017500123', 'BANK_TRANSFER', 'Full settlement via Nabil online transfer', $3
        ) RETURNING id
      `, [pur1Id, v1Id, adminId]);
      const pay1Id = pay1Res.rows[0].id;

      // Payment Slip for Payment 1
      await client.query(`
        INSERT INTO payment_slips (
          payment_id, purchase_id, file_name, original_name, mime_type, file_size, storage_path, uploaded_by
        ) VALUES (
          $1, $2, 'demo-shivam-bank-slip.jpg', 'Nabil_Transfer_Voucher.jpg', 'image/jpeg',
          85000, 'uploads/payment-slips/demo-shivam-bank-slip.jpg', $3
        )
      `, [pay1Id, pur1Id, adminId]);

      // Demo Purchase 2: APPROVED, VAT BILL PENDING (Aging bill!), PARTIALLY PAID, Stock Received
      const pur2Res = await client.query(`
        INSERT INTO purchases (
          purchase_code, vendor_id, bill_number, product_summary, description,
          entry_date_ad, entry_time_npt, entry_date_bs, purchase_date_ad, purchase_date_bs, fiscal_year,
          tax_type, vat_calc_mode, entered_amount, purchase_amount, vat_amount, total_amount, paid_amount,
          review_status, vat_bill_status, payment_status,
          submitted_by, approved_by, approved_at, admin_remarks
        ) VALUES (
          'PUR-2083-0002', $1, 'JAG-2083-0491', '800 kg Jagdamba 12mm Rebar', 'Site B reinforcement delivery',
          '2026-11-08', '14:20:00', '2083-07-22', '2026-11-08', '2083-07-22', '2083/84',
          'VAT_13', 'EXCLUSIVE', 78400.00, 78400.00, 10192.00, 88592.00, 50000.00,
          'APPROVED', 'VAT BILL PENDING', 'PARTIALLY PAID',
          $2, $3, NOW(), 'Approved. Physical VAT bill to be provided by vendor driver on next visit.'
        ) RETURNING id
      `, [v2Id, staffId, adminId]);
      const pur2Id = pur2Res.rows[0].id;

      // Purchase 2 Item
      const item2Res = await client.query(`
        INSERT INTO purchase_items (
          purchase_id, product_id, product_name, category, sku, quantity, unit_of_measurement,
          unit_price, line_subtotal, line_vat_amount, line_total, stock_received, stock_received_at, stock_received_by
        ) VALUES (
          $1, $2, 'Jagdamba Fe 500D TMT Rebar (12mm)', 'Steel & Rebar', 'STEEL-JAG-12MM',
          800, 'kg', 98.00, 78400.00, 10192.00, 88592.00, TRUE, NOW(), $3
        ) RETURNING id
      `, [pur2Id, p2Id, staffId]);
      const item2Id = item2Res.rows[0].id;

      // Stock In Movement for Purchase 2
      await client.query(`
        INSERT INTO inventory_movements (
          product_id, purchase_id, purchase_item_id, movement_type, reason, reference_label,
          qty_in, qty_out, balance_after, unit_cost, movement_date_ad, movement_date_bs,
          responsible_staff_name, created_by
        ) VALUES (
          $1, $2, $3, 'STOCK_IN', 'PURCHASE_RECEIPT', 'PUR-2083-0002 Jagdamba Steels',
          800, 0, 2000, 98.00, '2026-11-08', '2083-07-22', 'Store Staff', $4
        )
      `, [p2Id, pur2Id, item2Id, staffId]);

      // Partial Payment for Purchase 2
      await client.query(`
        INSERT INTO payments (
          purchase_id, vendor_id, amount, payment_date_ad, payment_date_bs, paid_at,
          transaction_ref, company_bank_account, payment_method, remarks, recorded_by
        ) VALUES (
          $1, $2, 50000.00, '2026-11-10', '2083-07-24', NOW(),
          'NIMB-TRF-110294', '01201050098765', 'BANK_TRANSFER',
          'Advance payment of 50k transfer, remaining 38,592 payable upon delivery of verified VAT bill', $3
        )
      `, [pur2Id, v2Id, adminId]);

      // Demo Purchase 3: PENDING_REVIEW, VAT BILL RECEIVED, PAYMENT PENDING, Not yet stocked
      const pur3Res = await client.query(`
        INSERT INTO purchases (
          purchase_code, vendor_id, bill_number, product_summary, description,
          entry_date_ad, entry_time_npt, entry_date_bs, purchase_date_ad, purchase_date_bs, fiscal_year,
          vat_bill_date_ad, vat_bill_date_bs,
          tax_type, vat_calc_mode, entered_amount, purchase_amount, vat_amount, total_amount, paid_amount,
          review_status, vat_bill_status, payment_status,
          submitted_by, vat_bill_uploaded_at
        ) VALUES (
          'PUR-2083-0003', $1, 'AP-KAT-8831', '10 Buckets Apex Ultima Exterior Paint', 'Premises exterior coating',
          '2026-11-12', '16:45:00', '2083-07-26', '2026-11-12', '2083-07-26', '2083/84',
          '2026-11-12', '2083-07-26',
          'VAT_13', 'EXCLUSIVE', 68000.00, 68000.00, 8840.00, 76840.00, 0.00,
          'PENDING_REVIEW', 'VAT BILL RECEIVED', 'PAYMENT PENDING',
          $2, NOW()
        ) RETURNING id
      `, [v3Id, staffId]);
      const pur3Id = pur3Res.rows[0].id;

      // Purchase 3 Item (Unstocked)
      await client.query(`
        INSERT INTO purchase_items (
          purchase_id, product_id, product_name, category, sku, quantity, unit_of_measurement,
          unit_price, line_subtotal, line_vat_amount, line_total, stock_received
        ) VALUES (
          $1, $2, 'Apex Ultima Weatherproof Exterior Paint (20L)', 'Paints & Finishes', 'PNT-APEX-20L',
          10, 'bucket', 6800.00, 68000.00, 8840.00, 76840.00, FALSE
        )
      `, [pur3Id, p3Id]);

      // VAT Bill for Purchase 3 (Pending review)
      await client.query(`
        INSERT INTO vat_bills (
          purchase_id, file_name, original_name, mime_type, file_size, storage_path,
          bill_date_ad, bill_date_bs, vat_bill_number, status, review_notes,
          uploaded_by, uploaded_at, is_current
        ) VALUES (
          $1, 'demo-asian-paints-bill.jpg', 'Asian_Paints_Tax_Invoice_8831.jpg', 'image/jpeg',
          145000, 'uploads/vat-bills/demo-asian-paints-bill.jpg',
          '2026-11-12', '2083-07-26', 'AP-KAT-8831', 'RECEIVED', 'Uploaded by staff, awaiting admin approval',
          $2, NOW(), TRUE
        )
      `, [pur3Id, staffId]);

      // Initial Activity Log
      await client.query(`
        INSERT INTO activity_logs (
          entity_type, entity_id, action, summary, performed_by, performed_by_name
        ) VALUES
        ('PURCHASE', $1, 'CREATE', 'Initial purchase entry PUR-2083-0001 created', $3, 'System Administrator'),
        ('PURCHASE', $2, 'CREATE', 'Initial purchase entry PUR-2083-0002 created', $4, 'Store Manager / Staff')
      `, [pur1Id, pur2Id, adminId, staffId]);

      console.log('[seed] Demo data seeded successfully.');
    }

    await client.query('COMMIT');
    console.log('[seed] Seeding completed.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[seed] Seeding failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

// Allow CLI invocation
const isMain = process.argv[1] && (
  process.argv[1].endsWith('seed.ts') ||
  process.argv[1].endsWith('seed.js') ||
  process.argv[1].includes('seed')
);

if (isMain) {
  const withDemo = process.argv.includes('--demo') || true; // default demo in dev
  seedDatabase({ withDemo })
    .then(() => {
      console.log('[seed] Database seeded successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[seed] Database seed failed:', err);
      process.exit(1);
    });
}
