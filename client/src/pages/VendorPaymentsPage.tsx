import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  CreditCard,
  Building2,
  Search,
  PhoneCall,
  RefreshCw,
  Receipt,
  FileCheck2,
  Calendar,
  ExternalLink,
  CheckCircle2,
} from 'lucide-react';
import {
  api,
  VendorPaymentSummaryResponse,
  UnpaidPurchaseItem,
} from '../api/client';
import { useToast } from '../context/ToastContext';
import { formatNPR } from '../utils/money';
import {
  VatStatusBadge,
  PaymentStatusBadge,
} from '../components/StatusBadges';
import { BsAdDatePicker, BsAdDateValue } from '../components/BsAdDatePicker';
import { RecordPaymentModal } from '../components/RecordPaymentModal';

export function VendorPaymentsPage() {
  const { error: toastError } = useToast();

  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<VendorPaymentSummaryResponse | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedVendorFilter, setSelectedVendorFilter] = useState<string>('');
  const [fiscalYearFilter, setFiscalYearFilter] = useState<string>('');
  const [fromDateBs, setFromDateBs] = useState<string>('');
  const [toDateBs, setToDateBs] = useState<string>('');
  const [fromDateAd, setFromDateAd] = useState<string>('');
  const [toDateAd, setToDateAd] = useState<string>('');
  const [showDateFilter, setShowDateFilter] = useState<boolean>(false);

  // Drilldown Selected Vendor (null = all unpaid purchases)
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null);

  // Payment Recording Modal
  const [payingPurchase, setPayingPurchase] = useState<UnpaidPurchaseItem | null>(null);

  // Fetch Vendor Payments Summary
  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const params: {
        vendorId?: number;
        fromAd?: string;
        toAd?: string;
        fiscalYear?: string;
      } = {};

      if (selectedVendorFilter) {
        params.vendorId = Number(selectedVendorFilter);
      }
      if (fromDateAd) {
        params.fromAd = fromDateAd;
      }
      if (toDateAd) {
        params.toAd = toDateAd;
      }
      if (fiscalYearFilter) {
        params.fiscalYear = fiscalYearFilter;
      }

      const res = await api.payments.getVendorSummary(params);
      setData(res);
    } catch (err: any) {
      toastError(err.message || 'Failed to retrieve vendor payments data', 'Payments Error');
    } finally {
      setLoading(false);
    }
  }, [selectedVendorFilter, fromDateAd, toDateAd, fiscalYearFilter, toastError]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedVendorFilter('');
    setFiscalYearFilter('');
    setFromDateBs('');
    setToDateBs('');
    setFromDateAd('');
    setToDateAd('');
    setShowDateFilter(false);
    setSelectedVendorId(null);
  };

  const summary = data?.summary;
  const vendors = data?.vendors || [];
  const unpaidPurchases = data?.unpaid_purchases || [];

  // Filtered vendors list by search query
  const filteredVendors = vendors.filter((v) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      v.company_name.toLowerCase().includes(q) ||
      (v.pan_number && v.pan_number.toLowerCase().includes(q)) ||
      (v.contact_number && v.contact_number.includes(q))
    );
  });

  // Filtered unpaid purchases based on selectedVendorId drilldown and search
  const filteredUnpaid = unpaidPurchases.filter((p) => {
    if (selectedVendorId !== null && p.vendor_id !== selectedVendorId) {
      return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.purchase_code.toLowerCase().includes(q) ||
      (p.bill_number && p.bill_number.toLowerCase().includes(q)) ||
      p.vendor_name.toLowerCase().includes(q) ||
      p.product_summary.toLowerCase().includes(q)
    );
  });

  const selectedVendorObject = vendors.find((v) => v.vendor_id === selectedVendorId);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
              <CreditCard className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Vendor Payments & Disbursements
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Monitor payables, settle approved bills with bank slip attachments, and drill into outstanding obligations.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchSummary()}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <Link
              to="/admin/review"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
            >
              <span>Admin Review Queue</span>
            </Link>
          </div>
        </div>

        {/* Top KPI Cards (Exact fields from VendorPaymentSummaryResponse) */}
        {summary && (
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 pt-5 border-t border-slate-100 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[11px] text-slate-400 uppercase font-bold block">Purchases</span>
              <span className="text-base font-bold text-slate-900 tabular-nums">
                {summary.total_purchases}
              </span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[11px] text-slate-400 uppercase font-bold block">Taxable Base</span>
              <span className="text-base font-bold text-slate-900 tabular-nums">
                {formatNPR(summary.total_purchase_amount)}
              </span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[11px] text-slate-400 uppercase font-bold block">VAT Amount</span>
              <span className="text-base font-bold text-emerald-700 tabular-nums">
                {formatNPR(summary.total_vat_amount)}
              </span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[11px] text-slate-400 uppercase font-bold block">Total Paid</span>
              <span className="text-base font-bold text-emerald-700 tabular-nums">
                {formatNPR(summary.total_paid_amount)}
              </span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[11px] text-slate-400 uppercase font-bold block">Total Unpaid</span>
              <span className="text-base font-bold text-amber-700 tabular-nums">
                {formatNPR(summary.total_unpaid_amount)}
              </span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[11px] text-slate-400 uppercase font-bold block">Pending Payments</span>
              <span className="text-base font-bold text-amber-700 tabular-nums">
                {summary.pending_payments_count}
              </span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[11px] text-slate-400 uppercase font-bold block">Pending VAT Bills</span>
              <span className="text-base font-bold text-slate-900 tabular-nums">
                {summary.pending_vat_bills_count}
              </span>
            </div>
          </div>
        )}

        {/* Filter Controls Bar */}
        <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by vendor name, PAN, bill or code..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-emerald-600"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowDateFilter((prev) => !prev)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                showDateFilter || fromDateAd || toDateAd
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Date Filters</span>
            </button>

            {(searchQuery || fromDateAd || toDateAd || fiscalYearFilter || selectedVendorId !== null) && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-2.5 py-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg text-xs font-semibold transition-colors"
                title="Reset all filters"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Expandable Date Range Filters */}
        {showDateFilter && (
          <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-4">
            <BsAdDatePicker
              label="From Date (BS / AD)"
              valueBs={fromDateBs}
              valueAd={fromDateAd}
              onChange={(val: BsAdDateValue) => {
                setFromDateBs(val.bs);
                setFromDateAd(val.ad);
              }}
            />
            <BsAdDatePicker
              label="To Date (BS / AD)"
              valueBs={toDateBs}
              valueAd={toDateAd}
              onChange={(val: BsAdDateValue) => {
                setToDateBs(val.bs);
                setToDateAd(val.ad);
              }}
            />
          </div>
        )}
      </div>

      {/* Vendor-Wise Payment Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-700" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Vendor-Wise Payables Table
            </h2>
            <span className="text-[11px] text-slate-400">
              (Click any vendor row to drill down into their unpaid purchases)
            </span>
          </div>
          {selectedVendorId !== null && (
            <button
              type="button"
              onClick={() => setSelectedVendorId(null)}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold underline cursor-pointer"
            >
              Clear Vendor Filter (Show All)
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Vendor</th>
                <th className="px-4 py-3 text-right">Purchase Amount</th>
                <th className="px-4 py-3 text-right">VAT Amount</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-800">Total Bill</th>
                <th className="px-4 py-3 text-right text-emerald-700 font-semibold">Paid</th>
                <th className="px-4 py-3 text-right text-amber-700 font-bold">Unpaid</th>
                <th className="px-4 py-3 text-center">VAT Status</th>
                <th className="px-4 py-3 text-right">Calls / Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-600 mb-2" />
                    <span>Loading vendor payables...</span>
                  </td>
                </tr>
              ) : filteredVendors.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                    No vendor summaries found matching your filter criteria.
                  </td>
                </tr>
              ) : (
                filteredVendors.map((v) => {
                  const isSelected = selectedVendorId === v.vendor_id;

                  return (
                    <tr
                      key={v.vendor_id}
                      onClick={() =>
                        setSelectedVendorId(isSelected ? null : v.vendor_id)
                      }
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-emerald-50/70 border-l-4 border-l-emerald-600 font-medium'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      {/* Vendor Column */}
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{v.company_name}</span>
                          {isSelected && (
                            <span className="text-[10px] font-bold uppercase px-1.5 py-0.2 bg-emerald-600 text-white rounded">
                              Selected
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                          {v.pan_number && <span>PAN: {v.pan_number}</span>}
                          <span>· {v.purchases_count} Purchases</span>
                        </div>
                      </td>

                      {/* Purchase Amount */}
                      <td className="px-4 py-3.5 text-right tabular-nums text-slate-600">
                        {formatNPR(v.purchase_amount)}
                      </td>

                      {/* VAT Amount */}
                      <td className="px-4 py-3.5 text-right tabular-nums text-emerald-700">
                        {formatNPR(v.vat_amount)}
                      </td>

                      {/* Total Amount */}
                      <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-slate-900">
                        {formatNPR(v.total_amount)}
                      </td>

                      {/* Paid */}
                      <td className="px-4 py-3.5 text-right tabular-nums text-emerald-700 font-semibold">
                        {formatNPR(v.paid_amount)}
                      </td>

                      {/* Unpaid */}
                      <td className="px-4 py-3.5 text-right tabular-nums text-amber-700 font-bold">
                        {formatNPR(v.unpaid_amount)}
                      </td>

                      {/* VAT Status Overview */}
                      <td className="px-4 py-3.5 text-center">
                        {v.pending_vat_bills_count > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            {v.pending_vat_bills_count} Bill(s) Pending
                          </span>
                        ) : v.verified_vat_bills_count > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Verified
                          </span>
                        ) : v.received_vat_bills_count > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                            {v.received_vat_bills_count} Received
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">No Bills</span>
                        )}
                      </td>

                      {/* Calls & Actions */}
                      <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          {v.contact_number ? (
                            <a
                              href={`tel:${v.contact_number}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-[11px] font-bold transition-colors shadow-xs"
                              title={`Call ${v.contact_number}`}
                            >
                              <PhoneCall className="w-3 h-3" />
                              <span>CALL</span>
                            </a>
                          ) : (
                            <span className="text-slate-300 italic text-[11px]">No phone</span>
                          )}
                          <Link
                            to={`/vendors/${v.vendor_id}`}
                            className="p-1 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                            title="View Vendor Profile"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
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
      </div>

      {/* ============================================================== */}
      {/* Unpaid & Partially Paid Purchases Drilldown Table              */}
      {/* ============================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold flex items-center gap-2">
              <Receipt className="w-4 h-4 text-amber-400" />
              <span>
                {selectedVendorObject
                  ? `Unpaid Bills: ${selectedVendorObject.company_name} (${filteredUnpaid.length})`
                  : `All Outstanding Payables Drilldown (${filteredUnpaid.length} Unpaid Purchases)`}
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Select any bill below to record immediate partial or full payment with bank transfer slip.
            </p>
          </div>
          {selectedVendorId !== null && (
            <button
              type="button"
              onClick={() => setSelectedVendorId(null)}
              className="text-xs text-amber-400 hover:text-amber-300 font-semibold underline self-start sm:self-auto"
            >
              Show All Vendors' Unpaid Bills
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 whitespace-nowrap">Code & Bill</th>
                <th className="px-4 py-3 min-w-[150px]">Vendor Name</th>
                <th className="px-4 py-3 whitespace-nowrap">Purchase Date</th>
                <th className="px-4 py-3 min-w-[180px]">Product / Items</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Total Bill</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Already Paid</th>
                <th className="px-4 py-3 text-right whitespace-nowrap font-bold text-amber-800">
                  Remaining Balance
                </th>
                <th className="px-4 py-3 text-center whitespace-nowrap">VAT Status</th>
                <th className="px-4 py-3 text-center whitespace-nowrap">Payment Status</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredUnpaid.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-slate-400">
                    <FileCheck2 className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
                    <p className="font-semibold text-slate-700">All clear! No unpaid purchases in this scope.</p>
                  </td>
                </tr>
              ) : (
                filteredUnpaid.map((p) => {
                  const isApproved = p.review_status === 'APPROVED';

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Code */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <Link
                          to={`/purchases/${p.id}`}
                          className="font-bold text-indigo-700 hover:underline flex items-center gap-1"
                        >
                          {p.purchase_code}
                          <ExternalLink className="w-3 h-3 text-indigo-400" />
                        </Link>
                        {p.bill_number && (
                          <div className="text-[11px] text-slate-400 font-mono">
                            Bill #{p.bill_number}
                          </div>
                        )}
                      </td>

                      {/* Vendor with Call Button */}
                      <td className="px-4 py-3.5">
                        <Link
                          to={`/vendors/${p.vendor_id}`}
                          className="font-semibold text-slate-900 hover:text-emerald-700 hover:underline block truncate max-w-[180px]"
                        >
                          {p.vendor_name}
                        </Link>
                        {p.contact_number && (
                          <a
                            href={`tel:${p.contact_number}`}
                            className="text-[11px] text-emerald-700 hover:underline inline-flex items-center gap-1 mt-0.5"
                          >
                            <PhoneCall className="w-2.5 h-2.5" />
                            <span>{p.contact_number}</span>
                          </a>
                        )}
                      </td>

                      {/* Purchase Date */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-slate-600">
                        <div className="font-semibold text-slate-800">{p.purchase_date_bs} BS</div>
                        <div className="text-[11px] text-slate-400">{p.purchase_date_ad} AD</div>
                      </td>

                      {/* Product Summary */}
                      <td className="px-4 py-3.5">
                        <div className="line-clamp-2 text-slate-800 font-medium max-w-[220px]">
                          {p.product_summary}
                        </div>
                      </td>

                      {/* Total */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap tabular-nums font-semibold text-slate-900">
                        {formatNPR(p.total_amount)}
                      </td>

                      {/* Paid */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap tabular-nums text-emerald-700">
                        {formatNPR(p.paid_amount)}
                      </td>

                      {/* Remaining Balance */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap tabular-nums font-bold text-amber-700 text-sm">
                        {formatNPR(p.remaining_balance)}
                      </td>

                      {/* VAT Status */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        <VatStatusBadge status={p.vat_bill_status} size="sm" />
                      </td>

                      {/* Payment Status */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        <PaymentStatusBadge status={p.payment_status} size="sm" />
                      </td>

                      {/* Inline Record Payment Button */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        {isApproved ? (
                          <button
                            type="button"
                            onClick={() => setPayingPurchase(p)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            <span>Pay</span>
                          </button>
                        ) : (
                          <span
                            className="text-[11px] text-slate-400 italic"
                            title="Purchase must be APPROVED in Admin Review before payment can be recorded"
                          >
                            Pending Review
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Payment Modal */}
      <RecordPaymentModal
        isOpen={Boolean(payingPurchase)}
        onClose={() => setPayingPurchase(null)}
        onSuccess={() => {
          fetchSummary();
        }}
        purchase={payingPurchase}
      />
    </div>
  );
}
