/**
 * Nepal VAT & Vendor Management System — API Client & Contracts
 * Fully typed API interface strictly matching server endpoints and response schemas.
 */

export class ApiClientError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Universal JSON/FormData fetch client with credentials included for secure HTTP-only cookies.
 */
export async function apiFetch<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = new Headers(options.headers || {});

  if (!isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
    credentials: 'include',
  });

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  // Handle file download streams if requested or headers specify attachment
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/octet-stream') || contentType.includes('application/pdf')) {
    return response as unknown as T;
  }

  let json: any = null;
  try {
    json = await response.json();
  } catch {
    // If not valid JSON
    if (!response.ok) {
      throw new ApiClientError(response.statusText || 'API request failed', response.status);
    }
    return {} as T;
  }

  if (!response.ok) {
    const errorMsg =
      json?.error ||
      json?.message ||
      (Array.isArray(json?.details) ? json.details.map((d: any) => d.message).join(', ') : null) ||
      `HTTP Error ${response.status}`;
    throw new ApiClientError(errorMsg, response.status, json);
  }

  return json as T;
}

// ==========================================
// Domain Entity Models & Types
// ==========================================

export type UserRole = 'ADMIN' | 'STAFF';

export interface User {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  phone?: string | null;
  // Support both camelCase (from auth.ts) and snake_case (from users.ts / DB)
  fullName?: string;
  full_name?: string;
  isActive?: boolean;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CreateUserInput {
  full_name: string;
  username: string;
  email: string;
  password: string;
  role: UserRole;
  phone?: string | null;
}

export interface UpdateUserInput {
  full_name?: string;
  email?: string;
  password?: string;
  role?: UserRole;
  phone?: string | null;
  is_active?: boolean;
}

export type VatCalcMode = 'EXCLUSIVE' | 'INCLUSIVE';
export type TaxType = 'VAT_13' | 'NON_VAT';

export interface AppSettings {
  id: number;
  company_name: string;
  company_pan: string | null;
  company_vat: string | null;
  company_address: string | null;
  default_vat_mode: VatCalcMode;
  allow_staff_vat_mode_override: boolean;
  allow_negative_stock_admin_only: boolean;
  updated_by?: number | null;
  updated_at?: string;
}

export interface Vendor {
  id: number;
  company_name: string;
  pan_number: string | null;
  vat_number: string | null;
  contact_person: string | null;
  contact_number: string | null;
  alt_contact_number: string | null;
  address: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  bank_account_holder: string | null;
  bank_account_number: string | null;
  account_type: string | null;
  email: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  total_purchases_count?: number;
  total_amount?: number;
  total_paid_amount?: number;
  total_unpaid_amount?: number;
}

export interface Product {
  id: number;
  name: string;
  sku: string;
  category: string | null;
  brand: string | null;
  description: string | null;
  unit_of_measurement: string;
  min_stock_level: number;
  current_stock: number;
  avg_purchase_price: number;
  latest_purchase_price: number;
  total_purchased_qty: number;
  total_issued_qty: number;
  is_active: boolean;
  created_at: string;
}

export interface PurchaseItem {
  id: number;
  purchase_id: number;
  product_id?: number | null;
  product_name: string;
  category?: string | null;
  sku?: string | null;
  quantity: number;
  unit_of_measurement: string;
  unit_price: number;
  line_subtotal: number;
  line_vat_amount: number;
  line_total: number;
  stock_received: boolean;
  stock_received_at?: string | null;
  stock_received_by?: number | null;
}

export type VatBillStatus =
  | 'VAT BILL RECEIVED'
  | 'VAT BILL PENDING'
  | 'VAT BILL VERIFIED'
  | 'VAT BILL REJECTED'
  | 'NOT APPLICABLE';

export type PaymentStatus =
  | 'PAYMENT PENDING'
  | 'APPROVED'
  | 'PARTIALLY PAID'
  | 'PAID';

export type ReviewStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';

export interface VatBill {
  id: number;
  purchase_id: number;
  file_name: string;
  original_name: string;
  mime_type: string;
  file_size: number;
  storage_path: string;
  bill_date_ad: string | null;
  bill_date_bs: string | null;
  vat_bill_number: string | null;
  status: 'PENDING' | 'RECEIVED' | 'VERIFIED' | 'REJECTED';
  review_notes: string | null;
  uploaded_by: number | null;
  uploaded_at: string;
  reviewed_by: number | null;
  reviewed_at: string | null;
  is_current: boolean;
}

export interface PaymentSlip {
  id: number;
  payment_id: number;
  purchase_id: number;
  file_name: string;
  original_name: string;
  mime_type: string;
  file_size: number;
  uploaded_by: number | null;
  uploaded_at: string;
}

export interface Payment {
  id: number;
  purchase_id: number;
  purchase_code?: string;
  bill_number?: string | null;
  vendor_id: number;
  amount: number;
  payment_date_ad: string;
  payment_date_bs: string;
  paid_at: string;
  transaction_ref: string | null;
  company_bank_account: string | null;
  payment_method: string;
  remarks: string | null;
  is_void?: boolean;
  is_voided?: boolean;
  void_reason?: string | null;
  voided_at?: string | null;
  voided_by?: number | null;
  slip?: PaymentSlip | null;
  slips?: PaymentSlip[];
}

export interface ActivityLog {
  id: number;
  entity_type: string;
  entity_id: number | null;
  action: string;
  summary: string;
  old_values?: any;
  new_values?: any;
  performed_by: number;
  performed_by_name: string;
  performed_at: string;
}

export interface Purchase {
  id: number;
  purchase_code: string;
  vendor_id: number;
  vendor_name?: string;
  vendor_pan?: string | null;
  vendor_vat?: string | null;
  vendor_phone?: string | null;
  bill_number: string | null;
  product_summary: string;
  description: string | null;
  remarks?: string | null;
  entry_date_ad: string;
  entry_time_npt: string;
  entry_date_bs: string;
  purchase_date_ad: string;
  purchase_date_bs: string;
  fiscal_year: string;
  vat_bill_date_ad: string | null;
  vat_bill_date_bs: string | null;
  tax_type: TaxType;
  vat_calc_mode: VatCalcMode;
  entered_amount: number;
  purchase_amount: number;
  vat_amount: number;
  total_amount: number;
  paid_amount: number;
  review_status: ReviewStatus;
  vat_bill_status: VatBillStatus;
  payment_status: PaymentStatus;
  submitted_by: number;
  submitted_by_name?: string;
  approved_by: number | null;
  approved_at: string | null;
  admin_remarks: string | null;
  vat_bill_uploaded_at: string | null;
  vat_verified_by: number | null;
  vat_verified_at: string | null;
  paid_at: string | null;
  is_deleted: boolean;
  days_pending?: number;
  items?: PurchaseItem[];
  vat_bills?: VatBill[];
  payments?: Payment[];
  activity_logs?: ActivityLog[];
}

export interface InventoryMovement {
  id: number;
  product_id: number;
  purchase_id: number | null;
  purchase_item_id: number | null;
  movement_type: 'OPENING_STOCK' | 'STOCK_IN' | 'STOCK_OUT' | 'ADJUSTMENT_ADD' | 'ADJUSTMENT_SUB' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT';
  reason: string;
  reference_label: string | null;
  reference_no?: string | null;
  qty_in: number;
  qty_out: number;
  quantity?: number;
  balance_after: number;
  unit_cost: number | null;
  movement_date_ad: string;
  movement_date_bs: string;
  responsible_staff_name: string;
  responsible_staff_id?: number | null;
  created_at: string;
  product_name?: string;
  sku?: string;
  unit_of_measurement?: string;
  purchase_code?: string;
  vendor_name?: string;
  vendor_id?: number | null;
  remarks?: string | null;
}

export type StockOutReason = 'SOLD' | 'INTERNAL_ISSUE' | 'DAMAGED_EXPIRED' | 'OTHER';

export interface StockOutParams {
  productId: number;
  quantity: number;
  reason: StockOutReason;
  movementDateAd?: string;
  movementDateBs?: string;
  referenceNo?: string | null;
  remarks?: string | null;
  allowNegativeOverride?: boolean;
}

export type AdjustmentType = 'OPENING_STOCK' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT';

export interface AdjustmentParams {
  productId: number;
  type: AdjustmentType;
  quantity: number;
  unitCost?: number | null;
  reason?: string;
  movementDateAd?: string;
  movementDateBs?: string;
  referenceNo?: string | null;
  remarks?: string | null;
  allowNegativeOverride?: boolean;
}

// Search types
export interface SearchProductVendor {
  id: number;
  company_name: string;
  pan_number: string | null;
  vat_number: string | null;
  contact_person: string | null;
  contact_number: string | null;
  tel_link: string | null;
  alt_contact_number: string | null;
  email: string | null;
  purchase_count: number;
  last_purchase_date_ad: string;
  last_purchase_date_bs: string;
  total_quantity_bought: number;
  latest_unit_price: number;
  payment_statuses: string[];
  vat_statuses: string[];
}

export interface SearchProduct {
  id: number;
  name: string;
  sku: string;
  category: string | null;
  brand: string | null;
  description: string | null;
  unit_of_measurement: string;
  current_stock: number;
  min_stock_level: number;
  avg_purchase_price: number;
  latest_purchase_price: number;
  vendors: SearchProductVendor[];
}

export interface SearchVendorPurchase {
  id: number;
  purchase_code: string;
  bill_number: string | null;
  product_summary: string;
  purchase_date_ad: string;
  purchase_date_bs: string;
  total_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  vat_bill_status: VatBillStatus;
  payment_status: PaymentStatus;
  review_status: ReviewStatus;
}

export interface SearchVendor {
  id: number;
  company_name: string;
  pan_number: string | null;
  vat_number: string | null;
  contact_person: string | null;
  contact_number: string | null;
  tel_link: string | null;
  alt_contact_number: string | null;
  address: string | null;
  email: string | null;
  recent_purchases: SearchVendorPurchase[];
}

export interface SearchPurchase {
  id: number;
  purchase_code: string;
  bill_number: string | null;
  product_summary: string;
  description: string | null;
  vendor_id: number;
  vendor_name: string;
  purchase_date_ad: string;
  purchase_date_bs: string;
  entry_date_ad: string;
  entry_date_bs: string;
  entry_time_npt: string;
  total_amount: number;
  paid_amount: number;
  vat_amount: number;
  tax_type: TaxType;
  vat_bill_status: VatBillStatus;
  payment_status: PaymentStatus;
  review_status: ReviewStatus;
}

export interface SearchResponse {
  query: string;
  products: SearchProduct[];
  vendors: SearchVendor[];
  purchases: SearchPurchase[];
}

// Dashboard Types matching server/src/routes/dashboard.ts
export interface DashboardMonthlySeriesItem {
  bs_year_month: string;
  label: string;
  count: number;
  purchase_amount: number;
  vat_amount: number;
  total_amount: number;
  paid_amount: number;
}

export interface DashboardVendorWiseItem {
  vendor_id: number;
  vendor_name: string;
  count: number;
  total_amount: number;
  paid_amount: number;
  outstanding_amount: number;
}

export interface DashboardPaidVsUnpaid {
  paid_amount: number;
  unpaid_amount: number;
  paid_count: number;
  partial_count: number;
  unpaid_count: number;
}

export interface DashboardVatStatusItem {
  status: string;
  count: number;
  vat_amount: number;
  total_amount: number;
}

export interface DashboardCharts {
  monthly_series: DashboardMonthlySeriesItem[];
  vendor_wise_purchases: DashboardVendorWiseItem[];
  paid_vs_unpaid: DashboardPaidVsUnpaid;
  vat_status_breakdown: DashboardVatStatusItem[];
}

export interface DashboardResponse {
  role: UserRole;
  is_admin: boolean;
  today_npt: {
    isoUtc: string;
    dateAd: string;
    timeNpt: string;
    dateBs: string;
    fiscalYear: string;
  };
  filters_applied: {
    preset: string | null;
    fromDate: string | null;
    toDate: string | null;
    fiscalYear: string | null;
  };
  kpis: {
    total_purchases_count: number;
    pending_vat_bills_count: number;
    total_vendors_count: number;
    purchases_this_month_count: number;
    total_products: number;
    low_stock_count: number;
    out_of_stock_count: number;
    my_purchases_count?: number;
    my_pending_vat_count?: number;
    total_purchase_amount: number | null;
    total_vat_amount: number | null;
    total_amount_inc_vat: number | null;
    total_paid_amount: number | null;
    total_outstanding_amount: number | null;
    purchases_this_month_amount: number | null;
    total_inventory_valuation: number | null;
  };
  charts: DashboardCharts | null;
  recent_entries: any[];
  pending_vat_bills?: any[];
  low_stock_alerts: any[];
}

export interface BackupItem {
  filename: string;
  format: 'sql' | 'json';
  size: number;
  createdAt: string;
}

// Vendor Payment Summary types matching server/src/routes/payments.ts
export interface VendorPaymentSummaryKPI {
  total_purchases: number;
  total_purchase_amount: number;
  total_vat_amount: number;
  total_total_amount: number;
  total_paid_amount: number;
  total_unpaid_amount: number;
  pending_payments_count: number;
  pending_vat_bills_count: number;
}

export interface VendorPaymentSummaryRow {
  vendor_id: number;
  company_name: string;
  contact_number: string;
  pan_number: string;
  purchases_count: number;
  purchase_amount: number;
  vat_amount: number;
  total_amount: number;
  paid_amount: number;
  unpaid_amount: number;
  pending_vat_bills_count: number;
  received_vat_bills_count: number;
  verified_vat_bills_count: number;
}

export interface UnpaidPurchaseItem {
  id: number;
  purchase_code: string;
  bill_number: string | null;
  vendor_id: number;
  vendor_name: string;
  company_name?: string;
  contact_number: string;
  purchase_date_ad: string;
  purchase_date_bs: string;
  fiscal_year: string;
  total_amount: number;
  paid_amount: number;
  remaining_balance: number;
  unpaid_amount: number;
  review_status: ReviewStatus;
  vat_bill_status: VatBillStatus;
  payment_status: PaymentStatus;
  product_summary: string;
  created_at: string;
}

export interface VendorPaymentSummaryResponse {
  summary: VendorPaymentSummaryKPI;
  vendors: VendorPaymentSummaryRow[];
  unpaid_purchases: UnpaidPurchaseItem[];
}

// Inventory Dashboard Response
export interface InventoryDashboardResponse {
  kpis: {
    total_products: number;
    total_stock_quantity: number;
    total_inventory_valuation: number;
    low_stock_count: number;
    out_of_stock_count: number;
  };
  total_products?: number;
  total_stock_quantity?: number;
  total_inventory_valuation?: number;
  low_stock_count?: number;
  out_of_stock_count?: number;
  low_stock_products: any[];
  stock_table: any[];
  recent_movements: {
    in: InventoryMovement[];
    out: InventoryMovement[];
  };
  recent_in: InventoryMovement[];
  recent_out: InventoryMovement[];
}

// ==========================================
// API Helper Modules
// ==========================================

export const api = {
  // Auth
  auth: {
    login: (credentials: { username: string; password: string }) =>
      apiFetch<{ success: boolean; user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      }),
    logout: () =>
      apiFetch<{ success: boolean; message: string }>('/api/auth/logout', {
        method: 'POST',
      }),
    getMe: () =>
      apiFetch<{ user: User }>('/api/auth/me'),
  },

  // Users
  users: {
    list: () => apiFetch<{ users: User[] }>('/api/users'),
    create: (data: CreateUserInput) =>
      apiFetch<{ user: User }>('/api/users', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: number, data: UpdateUserInput) =>
      apiFetch<{ user: User }>(`/api/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
  },

  // App Settings
  settings: {
    get: () => apiFetch<{ settings: AppSettings }>('/api/settings'),
    update: (data: Partial<AppSettings>) =>
      apiFetch<{ settings: AppSettings }>('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
  },

  // Audit Logs (Admin only)
  auditLogs: {
    list: (params?: { entity_type?: string; limit?: number; offset?: number }) => {
      const sp = new URLSearchParams();
      if (params?.entity_type) sp.set('entity_type', params.entity_type);
      if (params?.limit !== undefined) sp.set('limit', String(params.limit));
      if (params?.offset !== undefined) sp.set('offset', String(params.offset));
      return apiFetch<{ logs: ActivityLog[] }>(`/api/audit-logs?${sp.toString()}`);
    },
  },

  // Vendors
  vendors: {
    list: (params?: { q?: string; is_active?: boolean }) => {
      const sp = new URLSearchParams();
      if (params?.q) sp.set('q', params.q);
      if (params?.is_active !== undefined) sp.set('is_active', String(params.is_active));
      return apiFetch<{ vendors: Vendor[] }>(`/api/vendors?${sp.toString()}`);
    },
    get: (id: number) =>
      apiFetch<{
        vendor: Vendor;
        summary: {
          total_purchases_count: number;
          total_purchase_amount: number;
          total_vat_amount: number;
          total_amount: number;
          total_paid_amount: number;
          total_unpaid_amount: number;
          pending_vat_bills_count: number;
        };
        purchases: Purchase[];
        payments: Payment[];
      }>(`/api/vendors/${id}`),
    create: (data: Partial<Vendor>) =>
      apiFetch<{ vendor: Vendor }>('/api/vendors', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: number, data: Partial<Vendor>) =>
      apiFetch<{ vendor: Vendor }>(`/api/vendors/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (id: number) =>
      apiFetch<{ success?: boolean; message: string; vendor?: Vendor }>(`/api/vendors/${id}`, {
        method: 'DELETE',
      }),
  },

  // Products
  products: {
    list: (params?: { q?: string; category?: string; is_active?: boolean }) => {
      const sp = new URLSearchParams();
      if (params?.q) sp.set('q', params.q);
      if (params?.category) sp.set('category', params.category);
      if (params?.is_active !== undefined) sp.set('is_active', String(params.is_active));
      return apiFetch<{ products: Product[] }>(`/api/products?${sp.toString()}`);
    },
    get: (id: number) =>
      apiFetch<{
        product: Product & { inventory_movements: InventoryMovement[] };
        inventory_movements: InventoryMovement[];
      }>(`/api/products/${id}`),
    create: (data: Partial<Product>) =>
      apiFetch<{ product: Product }>('/api/products', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: number, data: Partial<Product>) =>
      apiFetch<{ product: Product }>(`/api/products/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (id: number) =>
      apiFetch<{ success?: boolean; message: string; product?: Product }>(`/api/products/${id}`, {
        method: 'DELETE',
      }),
  },

  // Purchases
  purchases: {
    list: (params?: Record<string, any>) => {
      const sp = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== '') {
            sp.set(k, String(v));
          }
        });
      }
      return apiFetch<{
        purchases: Purchase[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>(`/api/purchases?${sp.toString()}`);
    },
    getVatPending: (params?: {
      q?: string;
      vendorId?: number;
      fiscalYear?: string;
      minDays?: number;
      maxDays?: number;
    }) => {
      const sp = new URLSearchParams();
      if (params?.q) sp.set('q', params.q);
      if (params?.vendorId) sp.set('vendorId', String(params.vendorId));
      if (params?.fiscalYear) sp.set('fiscalYear', params.fiscalYear);
      if (params?.minDays) sp.set('minDays', String(params.minDays));
      if (params?.maxDays) sp.set('maxDays', String(params.maxDays));
      return apiFetch<{ purchases: Purchase[]; total: number }>(`/api/purchases/vat-pending?${sp.toString()}`);
    },
    get: (id: number) =>
      apiFetch<{
        purchase: Purchase;
        items: PurchaseItem[];
        vat_bills: VatBill[];
        payments: Payment[];
        activity_logs: ActivityLog[];
      }>(`/api/purchases/${id}`),
    create: (body: FormData | Record<string, any>) => {
      const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
      return apiFetch<{
        message?: string;
        purchase: Purchase;
        items: PurchaseItem[];
        vat_bills: VatBill[];
        vat_bill?: VatBill | null;
      }>('/api/purchases', {
        method: 'POST',
        body: isFormData ? body : JSON.stringify(body),
      });
    },
    update: (id: number, data: Record<string, any>) =>
      apiFetch<{ purchase: Purchase }>(`/api/purchases/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (id: number) =>
      apiFetch<{ message: string; purchase: Purchase }>(`/api/purchases/${id}`, {
        method: 'DELETE',
      }),
    approve: (id: number, data?: { admin_remarks?: string; remarks?: string }) =>
      apiFetch<{ message: string; purchase: Purchase }>(`/api/purchases/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify(data || {}),
      }),
    reject: (id: number, data: { admin_remarks?: string; rejection_reason?: string; reason?: string }) =>
      apiFetch<{ message: string; purchase: Purchase }>(`/api/purchases/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    uploadVatBill: (
      id: number,
      body:
        | FormData
        | {
            file: File;
            bill_date_ad?: string | null;
            bill_date_bs?: string | null;
            vat_bill_number?: string | null;
            [k: string]: any;
          }
    ) => {
      let fd: FormData;
      if (typeof FormData !== 'undefined' && body instanceof FormData) {
        fd = body;
        // Normalize server contract aliases
        if (fd.has('vat_bill_date_ad') && !fd.has('bill_date_ad')) {
          fd.append('bill_date_ad', String(fd.get('vat_bill_date_ad')));
        }
        if (fd.has('vat_bill_date_bs') && !fd.has('bill_date_bs')) {
          fd.append('bill_date_bs', String(fd.get('vat_bill_date_bs')));
        }
        if (fd.has('bill_number') && !fd.has('vat_bill_number')) {
          fd.append('vat_bill_number', String(fd.get('bill_number')));
        }
      } else {
        fd = new FormData();
        const obj = body as any;
        if (obj.file) fd.append('file', obj.file);
        const dateAd = obj.bill_date_ad ?? obj.billDateAd ?? obj.vat_bill_date_ad ?? obj.vatBillDateAd;
        const dateBs = obj.bill_date_bs ?? obj.billDateBs ?? obj.vat_bill_date_bs ?? obj.vatBillDateBs;
        const billNo = obj.vat_bill_number ?? obj.vatBillNumber ?? obj.bill_number ?? obj.billNumber;
        if (dateAd) fd.append('bill_date_ad', String(dateAd));
        if (dateBs) fd.append('bill_date_bs', String(dateBs));
        if (billNo) fd.append('vat_bill_number', String(billNo));
      }
      return apiFetch<{ message: string; vat_bill: VatBill; purchase: Purchase }>(`/api/purchases/${id}/vat-bill`, {
        method: 'POST',
        body: fd,
      });
    },
    receiveStock: (id: number, data?: { item_ids?: number[]; responsible_staff_name?: string }) =>
      apiFetch<{ message: string; movements: any[]; items: PurchaseItem[] }>(`/api/purchases/${id}/receive-stock`, {
        method: 'POST',
        body: JSON.stringify(data || {}),
      }),
  },

  // VAT Bills
  vatBills: {
    verify: (id: number, data?: { review_notes?: string; notes?: string }) =>
      apiFetch<{ message: string; vat_bill: VatBill; purchase?: Purchase }>(`/api/vat-bills/${id}/verify`, {
        method: 'POST',
        body: JSON.stringify(data || {}),
      }),
    reject: (id: number, data?: { review_notes?: string; reason?: string; notes?: string }) =>
      apiFetch<{ message: string; vat_bill: VatBill; purchase?: Purchase }>(`/api/vat-bills/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify(data || {}),
      }),
  },

  // Payments
  payments: {
    getVendorSummary: (params?: { vendorId?: number; fromAd?: string; toAd?: string; fiscalYear?: string }) => {
      const sp = new URLSearchParams();
      if (params?.vendorId) sp.set('vendorId', String(params.vendorId));
      if (params?.fromAd) sp.set('fromAd', params.fromAd);
      if (params?.toAd) sp.set('toAd', params.toAd);
      if (params?.fiscalYear) sp.set('fiscalYear', params.fiscalYear);
      return apiFetch<VendorPaymentSummaryResponse>(`/api/payments/vendor-summary?${sp.toString()}`);
    },
    recordPayment: (purchaseId: number, body: FormData | Record<string, any>) => {
      const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
      return apiFetch<{
        message?: string;
        payment: Payment;
        purchase: Purchase;
        slip?: PaymentSlip | null;
      }>(`/api/payments/purchases/${purchaseId}`, {
        method: 'POST',
        body: isFormData ? body : JSON.stringify(body),
      });
    },
    voidPayment: (paymentId: number, data: { void_reason?: string; voidReason?: string; reason?: string }) =>
      apiFetch<{ message?: string; payment: Payment; purchase: Purchase }>(`/api/payments/${paymentId}/void`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  // Inventory
  inventory: {
    getDashboard: () =>
      apiFetch<InventoryDashboardResponse>('/api/inventory/dashboard'),
    getMovements: (params?: {
      productId?: number;
      movementType?: string;
      page?: number;
      limit?: number;
    }) => {
      const sp = new URLSearchParams();
      if (params?.productId) sp.set('productId', String(params.productId));
      if (params?.movementType) sp.set('movementType', params.movementType);
      if (params?.page) sp.set('page', String(params.page));
      if (params?.limit) sp.set('limit', String(params.limit));
      return apiFetch<{
        movements: InventoryMovement[];
        total: number;
        page: number;
        limit: number;
        totalPages?: number;
        total_pages?: number;
      }>(`/api/inventory/movements?${sp.toString()}`);
    },
    stockOut: (data: StockOutParams) =>
      apiFetch<{ message: string; movement: InventoryMovement }>('/api/inventory/stock-out', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    adjustStock: (data: AdjustmentParams) =>
      apiFetch<{ message: string; movement: InventoryMovement }>('/api/inventory/adjustments', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  // Dashboard
  dashboard: {
    get: (params?: { preset?: string; fromDate?: string; toDate?: string; fiscalYear?: string }) => {
      const sp = new URLSearchParams();
      if (params?.preset) sp.set('preset', params.preset);
      if (params?.fromDate) sp.set('fromDate', params.fromDate);
      if (params?.toDate) sp.set('toDate', params.toDate);
      if (params?.fiscalYear) sp.set('fiscalYear', params.fiscalYear);
      return apiFetch<DashboardResponse>(`/api/dashboard?${sp.toString()}`);
    },
  },

  // Search
  search: {
    query: (q: string) =>
      apiFetch<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}`),
  },

  // Reports
  reports: {
    get: (reportType: string, params?: Record<string, any>) => {
      const sp = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== '') {
            sp.set(k, String(v));
          }
        });
      }
      return apiFetch<{
        report_type: string;
        title: string;
        filters: any;
        columns: Array<{ key: string; label: string; align?: string }>;
        rows: any[];
        summary: any;
      }>(`/api/reports/${reportType}?${sp.toString()}`);
    },
    getExportUrl: (reportType: string, format: 'xlsx' | 'csv' | 'pdf', params?: Record<string, any>) => {
      const sp = new URLSearchParams();
      sp.set('format', format);
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== '') {
            sp.set(k, String(v));
          }
        });
      }
      return `/api/reports/${reportType}/export?${sp.toString()}`;
    },
  },

  // Backups
  backups: {
    list: () => apiFetch<{ backups: BackupItem[] }>('/api/backups'),
    create: (data: { format: 'sql' | 'json' }) =>
      apiFetch<{ message: string; backup: BackupItem }>('/api/backups', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getDownloadUrl: (filename: string) => `/api/backups/${filename}/download`,
  },

  // File access URLs
  files: {
    vatBillUrl: (id: number) => `/api/files/vat-bills/${id}`,
    paymentSlipUrl: (id: number) => `/api/files/payment-slips/${id}`,
  },
};
