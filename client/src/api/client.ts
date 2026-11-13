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
  fullName: string;
  email: string;
  role: UserRole;
  phone?: string | null;
  isActive: boolean;
  created_at?: string;
  updated_at?: string;
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
  vendor_id: number;
  amount: number;
  payment_date_ad: string;
  payment_date_bs: string;
  paid_at: string;
  transaction_ref: string | null;
  company_bank_account: string | null;
  payment_method: string;
  remarks: string | null;
  is_void: boolean;
  void_reason?: string | null;
  voided_at?: string | null;
  voided_by?: number | null;
  slips?: PaymentSlip[];
}

export interface ActivityLog {
  id: number;
  entity_type: string;
  entity_id: number;
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
  movement_type: 'OPENING_STOCK' | 'STOCK_IN' | 'STOCK_OUT' | 'ADJUSTMENT_ADD' | 'ADJUSTMENT_SUB';
  reason: string;
  reference_label: string | null;
  qty_in: number;
  qty_out: number;
  balance_after: number;
  unit_cost: number;
  movement_date_ad: string;
  movement_date_bs: string;
  responsible_staff_name: string;
  created_at: string;
  product_name?: string;
  sku?: string;
  unit_of_measurement?: string;
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

// Dashboard Response
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
  charts?: {
    purchases_by_month: Array<{ month: string; amount: number; count: number }>;
    vat_collected_by_month: Array<{ month: string; vat_amount: number }>;
    stock_status_pie: Array<{ name: string; value: number }>;
  } | null;
  recent_entries: any[];
  pending_vat_bills: any[];
  low_stock_alerts: any[];
}

export interface BackupItem {
  filename: string;
  format: 'sql' | 'json';
  size: number;
  createdAt: string;
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
    create: (data: Partial<User> & { password: string }) =>
      apiFetch<{ user: User }>('/api/users', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: number, data: Partial<User> & { password?: string }) =>
      apiFetch<{ user: User }>(`/api/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
  },

  // Settings
  settings: {
    get: () => apiFetch<{ settings: AppSettings }>('/api/settings'),
    update: (data: Partial<AppSettings>) =>
      apiFetch<{ settings: AppSettings }>('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
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
          total_purchased_amount: number;
          total_vat_amount: number;
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
      apiFetch<{ message: string; vendor: Vendor }>(`/api/vendors/${id}`, {
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
      apiFetch<{ message: string; product: Product }>(`/api/products/${id}`, {
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
    getVatPending: (params?: { q?: string; vendorId?: number; minDays?: number; maxDays?: number }) => {
      const sp = new URLSearchParams();
      if (params?.q) sp.set('q', params.q);
      if (params?.vendorId) sp.set('vendorId', String(params.vendorId));
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
        message: string;
        purchase: Purchase;
        items?: PurchaseItem[];
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
    approve: (id: number, data?: { admin_remarks?: string }) =>
      apiFetch<{ message: string; purchase: Purchase }>(`/api/purchases/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify(data || {}),
      }),
    reject: (id: number, data: { admin_remarks?: string; reason?: string }) =>
      apiFetch<{ message: string; purchase: Purchase }>(`/api/purchases/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    uploadVatBill: (id: number, formData: FormData) =>
      apiFetch<{ message: string; vat_bill: VatBill; purchase: Purchase }>(`/api/purchases/${id}/vat-bill`, {
        method: 'POST',
        body: formData,
      }),
    receiveStock: (id: number, data?: { item_ids?: number[]; responsible_staff_name?: string }) =>
      apiFetch<{ message: string; movements: any[]; items: PurchaseItem[] }>(`/api/purchases/${id}/receive-stock`, {
        method: 'POST',
        body: JSON.stringify(data || {}),
      }),
  },

  // VAT Bills
  vatBills: {
    verify: (id: number, data?: { review_notes?: string }) =>
      apiFetch<{ message: string; vat_bill: VatBill; purchase?: Purchase }>(`/api/vat-bills/${id}/verify`, {
        method: 'POST',
        body: JSON.stringify(data || {}),
      }),
    reject: (id: number, data?: { review_notes?: string; reason?: string }) =>
      apiFetch<{ message: string; vat_bill: VatBill; purchase?: Purchase }>(`/api/vat-bills/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify(data || {}),
      }),
  },

  // Payments
  payments: {
    getVendorSummary: () =>
      apiFetch<{
        summary: {
          total_vendor_count: number;
          total_billed_amount: number;
          total_paid_amount: number;
          total_unpaid_amount: number;
        };
        vendors: any[];
      }>('/api/payments/vendor-summary'),
    recordPayment: (purchaseId: number, body: FormData | Record<string, any>) => {
      const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
      return apiFetch<{
        message: string;
        payment: Payment;
        purchase: Purchase;
        slip?: PaymentSlip | null;
      }>(`/api/payments/purchases/${purchaseId}`, {
        method: 'POST',
        body: isFormData ? body : JSON.stringify(body),
      });
    },
    voidPayment: (paymentId: number, data: { reason: string }) =>
      apiFetch<{ message: string; payment: Payment; purchase: Purchase }>(`/api/payments/${paymentId}/void`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  // Inventory
  inventory: {
    getDashboard: () =>
      apiFetch<{
        kpis: {
          total_products: number;
          total_valuation: number;
          low_stock_count: number;
          out_of_stock_count: number;
        };
        low_stock_products: any[];
        stock_table: any[];
        recent_in: any[];
        recent_out: any[];
      }>('/api/inventory/dashboard'),
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
      }>(`/api/inventory/movements?${sp.toString()}`);
    },
    stockOut: (data: {
      product_id: number;
      quantity: number;
      reason: string;
      reference_label?: string;
      movement_date_ad?: string;
      movement_date_bs?: string;
      responsible_staff_name: string;
    }) =>
      apiFetch<{ message: string; movement: InventoryMovement }>('/api/inventory/stock-out', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    adjustStock: (data: {
      product_id: number;
      quantity_delta: number;
      adjustment_type: 'ADJUSTMENT_ADD' | 'ADJUSTMENT_SUB';
      reason: string;
      reference_label?: string;
      movement_date_ad?: string;
      movement_date_bs?: string;
      responsible_staff_name: string;
    }) =>
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
