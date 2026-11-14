import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Receipt,
  PlusCircle,
  Search,
  RefreshCw,
  Eye,
  Edit,
  FileText,
  ChevronLeft,
  ChevronRight,
  X,
  Calendar,
} from 'lucide-react';
import { api, Purchase, Vendor, User } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatNpr } from '../utils/money';
import {
  VatStatusBadge,
  PaymentStatusBadge,
  ReviewStatusBadge,
  TaxBadge,
} from '../components/StatusBadges';
import { FilePreviewModal } from '../components/FilePreviewModal';
import { BsAdDatePicker, BsAdDateValue } from '../components/BsAdDatePicker';

type PresetType = 'all' | 'today' | 'yesterday' | 'this_week' | 'this_month_bs' | 'fiscal_year' | 'custom';

export function PurchasesPage() {
  const { user } = useAuth();
  const { error: toastError, info: toastInfo } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // Filter States
  const [preset, setPreset] = useState<PresetType>(
    (searchParams.get('preset') as PresetType) || 'all'
  );
  const [searchQuery, setSearchQuery] = useState<string>(searchParams.get('q') || '');
  const [selectedVendorId, setSelectedVendorId] = useState<string>(searchParams.get('vendorId') || '');
  const [selectedStaffId, setSelectedStaffId] = useState<string>(searchParams.get('staffId') || '');
  const [selectedVatStatus, setSelectedVatStatus] = useState<string>(searchParams.get('vatStatus') || '');
  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState<string>(searchParams.get('paymentStatus') || '');
  const [selectedTaxType, setSelectedTaxType] = useState<string>(searchParams.get('taxType') || '');

  // Custom BS/AD Date Range
  const [customFromBs, setCustomFromBs] = useState<string>('');
  const [customToBs, setCustomToBs] = useState<string>('');
  const [customFromAd, setCustomFromAd] = useState<string>('');
  const [customToAd, setCustomToAd] = useState<string>('');
  const [showCustomRange, setShowCustomRange] = useState<boolean>(preset === 'custom');

  // Pagination & Data
  const [page, setPage] = useState<number>(Number(searchParams.get('page')) || 1);
  const [limit, setLimit] = useState<number>(25);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Dropdown masters
  const [vendorsList, setVendorsList] = useState<Vendor[]>([]);
  const [staffList, setStaffList] = useState<User[]>([]);

  // Preview Modal
  const [previewOpen, setPreviewOpen] = useState<boolean>(false);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [previewTitle, setPreviewTitle] = useState<string>('');
  const [previewFilename, setPreviewFilename] = useState<string>('');

  // Fetch Vendors & Staff for dropdown filters
  useEffect(() => {
    let mounted = true;
    api.vendors.list({ is_active: true })
      .then((res) => {
        if (mounted) setVendorsList(res.vendors || []);
      })
      .catch(() => {});

    if (user?.role === 'ADMIN') {
      api.users.list()
        .then((res) => {
          if (mounted) setStaffList(res.users || []);
        })
        .catch(() => {});
    }
    return () => {
      mounted = false;
    };
  }, [user]);

  // Main Fetcher
  const fetchPurchases = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {
        page,
        limit,
      };

      if (preset && preset !== 'all' && preset !== 'custom') {
        params.preset = preset;
      }
      if (preset === 'custom') {
        if (customFromAd) params.fromAd = customFromAd;
        if (customToAd) params.toAd = customToAd;
      }

      if (searchQuery.trim()) params.q = searchQuery.trim();
      if (selectedVendorId) params.vendorId = selectedVendorId;
      if (selectedStaffId) params.staffId = selectedStaffId;
      if (selectedVatStatus) params.vatStatus = selectedVatStatus;
      if (selectedPaymentStatus) params.paymentStatus = selectedPaymentStatus;
      if (selectedTaxType) params.taxType = selectedTaxType;

      const res = await api.purchases.list(params);
      setPurchases(res.purchases || []);
      setTotalCount(res.total || 0);
      setTotalPages(res.totalPages || 1);
    } catch (err: any) {
      toastError(err.message || 'Failed to fetch purchases records.', 'Error Loading Purchases');
    } finally {
      setLoading(false);
    }
  }, [
    page,
    limit,
    preset,
    customFromAd,
    customToAd,
    searchQuery,
    selectedVendorId,
    selectedStaffId,
    selectedVatStatus,
    selectedPaymentStatus,
    selectedTaxType,
    toastError,
  ]);

  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

  const handleResetFilters = () => {
    setPreset('all');
    setSearchQuery('');
    setSelectedVendorId('');
    setSelectedStaffId('');
    setSelectedVatStatus('');
    setSelectedPaymentStatus('');
    setSelectedTaxType('');
    setCustomFromAd('');
    setCustomToAd('');
    setCustomFromBs('');
    setCustomToBs('');
    setShowCustomRange(false);
    setPage(1);
    setSearchParams({});
  };

  const handlePreviewBill = async (purchaseId: number, purchaseCode: string) => {
    try {
      const details = await api.purchases.get(purchaseId);
      const bills = details.vat_bills || [];
      const currentBill = bills.find((b) => b.is_current) || bills[0];
      if (currentBill) {
        setPreviewUrl(api.files.vatBillUrl(currentBill.id));
        setPreviewFilename(currentBill.original_name || currentBill.file_name);
        setPreviewTitle(`VAT Bill: ${purchaseCode}`);
        setPreviewOpen(true);
      } else {
        toastInfo(`Purchase ${purchaseCode} has no VAT bill uploaded yet.`, 'No Bill Attached');
      }
    } catch (err: any) {
      toastError(err.message || 'Unable to open VAT bill file.', 'Preview Error');
    }
  };

  const isAdmin = user?.role === 'ADMIN';

  return (
    <div className="space-y-6">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Purchases & VAT Ledger
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Comprehensive records of supplier bills, 13% VAT, stock receipt, and payment statuses.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={fetchPurchases}
            disabled={loading}
            className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
            title="Refresh Ledger"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
          </button>
          <Link
            to="/purchases/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>+ New Purchase Entry</span>
          </Link>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
        {/* Preset Chips */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold uppercase">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>Date Presets:</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'all', label: 'All' },
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: 'this_week', label: 'This Week' },
              { id: 'this_month_bs', label: 'This Month (BS)' },
              { id: 'fiscal_year', label: 'Fiscal Year' },
              { id: 'custom', label: 'Custom Range' },
            ].map((p) => {
              const active = preset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setPreset(p.id as PresetType);
                    setShowCustomRange(p.id === 'custom');
                    setPage(1);
                  }}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    active
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Range Selector */}
        {showCustomRange && (
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
            <BsAdDatePicker
              label="From Date (BS / AD)"
              valueBs={customFromBs}
              valueAd={customFromAd}
              onChange={(val: BsAdDateValue) => {
                setCustomFromBs(val.bs);
                setCustomFromAd(val.ad);
                setPage(1);
              }}
            />
            <BsAdDatePicker
              label="To Date (BS / AD)"
              valueBs={customToBs}
              valueAd={customToAd}
              onChange={(val: BsAdDateValue) => {
                setCustomToBs(val.bs);
                setCustomToAd(val.ad);
                setPage(1);
              }}
            />
          </div>
        )}

        {/* Multi-field search & dropdown filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {/* Search Box */}
          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search code, bill #, vendor, PAN, product..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-emerald-600"
            />
          </div>

          {/* Vendor Filter */}
          <div>
            <select
              value={selectedVendorId}
              onChange={(e) => {
                setSelectedVendorId(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-700 focus:bg-white focus:outline-emerald-600"
            >
              <option value="">All Vendors</option>
              {vendorsList.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.company_name}
                </option>
              ))}
            </select>
          </div>

          {/* VAT Status Filter */}
          <div>
            <select
              value={selectedVatStatus}
              onChange={(e) => {
                setSelectedVatStatus(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-700 focus:bg-white focus:outline-emerald-600"
            >
              <option value="">All VAT Statuses</option>
              <option value="VAT BILL RECEIVED">VAT Bill Received</option>
              <option value="VAT BILL PENDING">VAT Bill Pending</option>
              <option value="VAT BILL VERIFIED">VAT Bill Verified</option>
              <option value="VAT BILL REJECTED">VAT Bill Rejected</option>
              <option value="NOT APPLICABLE">Non-VAT / Exempt</option>
            </select>
          </div>

          {/* Payment Status Filter */}
          <div>
            <select
              value={selectedPaymentStatus}
              onChange={(e) => {
                setSelectedPaymentStatus(e.target.value);
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-700 focus:bg-white focus:outline-emerald-600"
            >
              <option value="">All Payment Statuses</option>
              <option value="PAYMENT PENDING">Payment Pending</option>
              <option value="APPROVED">Approved for Payment</option>
              <option value="PARTIALLY PAID">Partially Paid</option>
              <option value="PAID">Paid</option>
            </select>
          </div>

          {/* Staff Filter (if Admin) */}
          {isAdmin && staffList.length > 0 && (
            <div>
              <select
                value={selectedStaffId}
                onChange={(e) => {
                  setSelectedStaffId(e.target.value);
                  setPage(1);
                }}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-700 focus:bg-white focus:outline-emerald-600"
              >
                <option value="">All Staff</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name || s.fullName || s.username}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Tax Type / Staff / Reset */}
          <div className="flex items-center gap-2">
            <select
              value={selectedTaxType}
              onChange={(e) => {
                setSelectedTaxType(e.target.value);
                setPage(1);
              }}
              className="w-full px-2 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-700 focus:bg-white focus:outline-emerald-600"
            >
              <option value="">All Tax Types</option>
              <option value="VAT_13">13% VAT</option>
              <option value="NON_VAT">Non-VAT (0%)</option>
            </select>

            <button
              type="button"
              onClick={handleResetFilters}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer shrink-0"
              title="Reset all filters"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Ledger Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-3.5 py-3 whitespace-nowrap">Entry Timestamp</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Purchase Date</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Bill # & Code</th>
                <th className="px-3.5 py-3 min-w-[150px]">Vendor Name</th>
                <th className="px-3.5 py-3 min-w-[160px]">Product / Items</th>
                <th className="px-3.5 py-3 text-right whitespace-nowrap">Taxable Amt</th>
                <th className="px-3.5 py-3 text-right whitespace-nowrap">13% VAT</th>
                <th className="px-3.5 py-3 text-right whitespace-nowrap font-bold text-slate-900">Total Amt</th>
                <th className="px-3.5 py-3 text-center whitespace-nowrap">VAT Bill</th>
                <th className="px-3.5 py-3 text-center whitespace-nowrap">Review & Pay</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Staff</th>
                <th className="px-3.5 py-3 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={12} className="px-4 py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-600 mb-2" />
                    <span>Loading purchase transactions...</span>
                  </td>
                </tr>
              ) : purchases.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-12 text-center text-slate-400">
                    No purchase records match the selected filters.
                  </td>
                </tr>
              ) : (
                purchases.map((p) => {
                  const hasBill = p.vat_bill_status !== 'VAT BILL PENDING' && p.vat_bill_status !== 'NOT APPLICABLE';
                  const isEditable = !isAdmin ? p.review_status === 'PENDING_REVIEW' : true;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Entry Timestamp (Immutable NPT Time) */}
                      <td className="px-3.5 py-3 whitespace-nowrap font-mono text-slate-600">
                        <div className="font-semibold text-slate-800">{p.entry_time_npt || 'N/A'}</div>
                        <div className="text-[10px] text-slate-400">{p.entry_date_bs} BS</div>
                      </td>

                      {/* Purchase Date (BS + AD) */}
                      <td className="px-3.5 py-3 whitespace-nowrap">
                        <div className="font-mono font-bold text-slate-900">{p.purchase_date_bs} BS</div>
                        <div className="text-[10px] text-slate-400 font-mono">{p.purchase_date_ad} AD</div>
                      </td>

                      {/* Code & Bill # */}
                      <td className="px-3.5 py-3 whitespace-nowrap font-mono">
                        <div className="font-bold text-slate-900">{p.purchase_code}</div>
                        {p.bill_number ? (
                          <div className="text-[11px] text-emerald-700 font-semibold">Bill: {p.bill_number}</div>
                        ) : (
                          <div className="text-[10px] text-slate-400 italic">No bill #</div>
                        )}
                      </td>

                      {/* Vendor */}
                      <td className="px-3.5 py-3">
                        <div className="font-semibold text-slate-900 line-clamp-1">{p.vendor_name}</div>
                        {p.vendor_pan && (
                          <div className="text-[10px] text-slate-500 font-mono">PAN: {p.vendor_pan}</div>
                        )}
                      </td>

                      {/* Product Summary & Tax badge */}
                      <td className="px-3.5 py-3">
                        <div className="font-medium text-slate-800 line-clamp-1">{p.product_summary}</div>
                        <div className="mt-0.5">
                          <TaxBadge taxType={p.tax_type} vatCalcMode={p.vat_calc_mode} size="sm" />
                        </div>
                      </td>

                      {/* Taxable Base */}
                      <td className="px-3.5 py-3 text-right font-mono tabular-nums text-slate-700">
                        {formatNpr(p.purchase_amount)}
                      </td>

                      {/* 13% VAT */}
                      <td className="px-3.5 py-3 text-right font-mono tabular-nums text-teal-700 font-semibold">
                        {p.tax_type === 'NON_VAT' ? 'Rs. 0.00' : formatNpr(p.vat_amount)}
                      </td>

                      {/* Total Amount */}
                      <td className="px-3.5 py-3 text-right font-mono tabular-nums font-bold text-slate-900">
                        {formatNpr(p.total_amount)}
                      </td>

                      {/* VAT Status */}
                      <td className="px-3.5 py-3 text-center whitespace-nowrap">
                        <VatStatusBadge status={p.vat_bill_status} />
                      </td>

                      {/* Review & Payment Status */}
                      <td className="px-3.5 py-3 text-center whitespace-nowrap space-y-1">
                        <div><ReviewStatusBadge status={p.review_status} /></div>
                        <div><PaymentStatusBadge status={p.payment_status} /></div>
                      </td>

                      {/* Staff */}
                      <td className="px-3.5 py-3 whitespace-nowrap text-slate-600 text-[11px]">
                        {p.submitted_by_name || 'System'}
                      </td>

                      {/* Actions */}
                      <td className="px-3.5 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {/* Preview Bill (if bill exists) */}
                          {hasBill && (
                            <button
                              type="button"
                              onClick={() => handlePreviewBill(p.id, p.purchase_code)}
                              className="p-1 rounded hover:bg-slate-200 text-sky-700 transition-colors cursor-pointer"
                              title="Preview VAT Bill"
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Edit (if editable) */}
                          {isEditable && (
                            <Link
                              to={`/purchases/${p.id}/edit`}
                              className="p-1 rounded hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors"
                              title="Edit Purchase"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </Link>
                          )}

                          {/* View Detail */}
                          <Link
                            to={`/purchases/${p.id}`}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs transition-colors"
                          >
                            <Eye className="w-3 h-3 text-slate-500" />
                            <span>View</span>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination & Summary Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div>
            Showing <strong className="text-slate-900">{purchases.length}</strong> of{' '}
            <strong className="text-slate-900">{totalCount}</strong> purchases
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span>Per page:</span>
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="px-2 py-1 bg-white border border-slate-300 rounded text-xs text-slate-700"
              >
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                disabled={page <= 1}
                className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-mono font-semibold text-slate-800">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={page >= totalPages}
                className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* File Preview Modal */}
      <FilePreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        fileUrl={previewUrl}
        fileName={previewFilename}
        title={previewTitle}
      />
    </div>
  );
}
