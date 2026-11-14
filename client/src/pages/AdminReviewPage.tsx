import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  Search,
  RefreshCw,
  Eye,
  CheckCircle2,
  XCircle,
  FileText,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Ban,
  X,
  FileCheck2,
} from 'lucide-react';
import {
  api,
  Purchase,
  VatBill,
  Payment,
} from '../api/client';
import { useToast } from '../context/ToastContext';
import { formatNPR } from '../utils/money';
import {
  ReviewStatusBadge,
  VatStatusBadge,
  PaymentStatusBadge,
} from '../components/StatusBadges';
import { FilePreviewModal } from '../components/FilePreviewModal';
import { RecordPaymentModal } from '../components/RecordPaymentModal';
import { ApprovePurchaseModal } from '../components/ApprovePurchaseModal';

export function AdminReviewPage() {
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();

  // Filters & State
  const [reviewTab, setReviewTab] = useState<'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'ALL'>('PENDING_REVIEW');
  const [vatStatusFilter, setVatStatusFilter] = useState<string>('ALL');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');

  // Pagination
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(20);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Modals & Slide-overs
  const [inspectPurchaseId, setInspectPurchaseId] = useState<number | null>(null);
  const [inspectData, setInspectData] = useState<{
    purchase: Purchase;
    items: any[];
    vat_bills: VatBill[];
    payments: Payment[];
  } | null>(null);
  const [inspectLoading, setInspectLoading] = useState<boolean>(false);

  // File Preview Modal
  const [previewOpen, setPreviewOpen] = useState<boolean>(false);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [previewTitle, setPreviewTitle] = useState<string>('');
  const [previewFilename, setPreviewFilename] = useState<string>('');

  // Approve / Reject Entry Modal
  const [entryModalOpen, setEntryModalOpen] = useState<boolean>(false);
  const [entryActionTarget, setEntryActionTarget] = useState<Purchase | null>(null);
  const [entryActionType, setEntryActionType] = useState<'APPROVE' | 'REJECT'>('APPROVE');

  // Verify / Reject VAT Bill Modal
  const [vatBillModalOpen, setVatBillModalOpen] = useState<boolean>(false);
  const [vatBillTarget, setVatBillTarget] = useState<{ billId: number; code: string } | null>(null);
  const [vatBillActionType, setVatBillActionType] = useState<'VERIFY' | 'REJECT'>('VERIFY');
  const [vatBillReviewNotes, setVatBillReviewNotes] = useState<string>('');
  const [vatBillSubmitting, setVatBillSubmitting] = useState<boolean>(false);

  // Payment Recording Modal
  const [recordPaymentPurchase, setRecordPaymentPurchase] = useState<Purchase | null>(null);

  // Void Payment Confirmation Modal
  const [voidPaymentModalOpen, setVoidPaymentModalOpen] = useState<boolean>(false);
  const [voidPaymentTarget, setVoidPaymentTarget] = useState<Payment | null>(null);
  const [voidReason, setVoidReason] = useState<string>('');
  const [voidSubmitting, setVoidSubmitting] = useState<boolean>(false);

  // Search debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch Review Queue
  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {
        page,
        limit,
      };

      if (reviewTab !== 'ALL') {
        params.review_status = reviewTab;
      }
      if (vatStatusFilter !== 'ALL') {
        params.vat_bill_status = vatStatusFilter;
      }
      if (paymentStatusFilter !== 'ALL') {
        params.payment_status = paymentStatusFilter;
      }
      if (debouncedSearch.trim()) {
        params.q = debouncedSearch.trim();
      }

      const res = await api.purchases.list(params);
      setPurchases(res.purchases || []);
      setTotalCount(res.total || 0);
      setTotalPages(res.totalPages || 1);
    } catch (err: any) {
      toastError(err.message || 'Failed to load purchase review queue.', 'Queue Error');
    } finally {
      setLoading(false);
    }
  }, [page, limit, reviewTab, vatStatusFilter, paymentStatusFilter, debouncedSearch, toastError]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  // Open detailed slide-over inspection
  const openInspect = async (purchaseId: number) => {
    setInspectPurchaseId(purchaseId);
    setInspectLoading(true);
    try {
      const res = await api.purchases.get(purchaseId);
      setInspectData({
        purchase: res.purchase,
        items: res.items || [],
        vat_bills: res.vat_bills || [],
        payments: res.payments || [],
      });
    } catch (err: any) {
      toastError(err.message || 'Failed to retrieve purchase details', 'Inspection Error');
      setInspectPurchaseId(null);
    } finally {
      setInspectLoading(false);
    }
  };

  const closeInspect = () => {
    setInspectPurchaseId(null);
    setInspectData(null);
  };

  // Quick VAT preview from queue row
  const handleQuickPreviewBill = async (p: Purchase) => {
    try {
      const res = await api.purchases.get(p.id);
      const bills = res.vat_bills || [];
      const currentBill = bills.find((b) => b.is_current) || bills[0];

      if (!currentBill) {
        toastInfo('No uploaded VAT bill file found for this entry.', 'No Attachment');
        return;
      }

      setPreviewUrl(api.files.vatBillUrl(currentBill.id));
      setPreviewFilename(currentBill.original_name || currentBill.file_name);
      setPreviewTitle(`VAT Bill #${currentBill.vat_bill_number || currentBill.id} (${p.purchase_code})`);
      setPreviewOpen(true);
    } catch (err: any) {
      toastError(err.message || 'Unable to open VAT bill preview', 'Preview Error');
    }
  };

  // Submit Verify / Reject VAT Bill
  const handleVatBillActionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vatBillTarget) return;

    setVatBillSubmitting(true);
    try {
      if (vatBillActionType === 'VERIFY') {
        await api.vatBills.verify(vatBillTarget.billId, {
          review_notes: vatBillReviewNotes.trim() || undefined,
        });
        toastSuccess(`VAT Bill verified for ${vatBillTarget.code}.`, 'VAT Bill Verified');
      } else {
        await api.vatBills.reject(vatBillTarget.billId, {
          review_notes: vatBillReviewNotes.trim() || undefined,
        });
        toastInfo(`VAT Bill rejected for ${vatBillTarget.code}.`, 'VAT Bill Rejected');
      }

      setVatBillModalOpen(false);
      setVatBillTarget(null);
      setVatBillReviewNotes('');
      fetchQueue();
      if (inspectPurchaseId) {
        openInspect(inspectPurchaseId);
      }
    } catch (err: any) {
      toastError(err.message || 'Failed to update VAT bill status', 'Action Failed');
    } finally {
      setVatBillSubmitting(false);
    }
  };

  // Submit Void Payment
  const handleVoidPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidPaymentTarget || !voidReason.trim()) {
      toastError('Void reason is strictly required.', 'Validation Error');
      return;
    }

    setVoidSubmitting(true);
    try {
      await api.payments.voidPayment(voidPaymentTarget.id, {
        void_reason: voidReason.trim(),
      });
      toastSuccess(`Payment #${voidPaymentTarget.id} voided successfully.`, 'Payment Voided');
      setVoidPaymentModalOpen(false);
      setVoidPaymentTarget(null);
      setVoidReason('');
      fetchQueue();
      if (inspectPurchaseId) {
        openInspect(inspectPurchaseId);
      }
    } catch (err: any) {
      toastError(err.message || 'Failed to void payment', 'Void Failed');
    } finally {
      setVoidSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Admin Review & Payments Queue
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Inspect staff-submitted purchases, verify tax invoices, authorize payments, and manage settlements.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchQueue()}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <Link
              to="/payments"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
            >
              <CreditCard className="w-4 h-4" />
              <span>Vendor Payments Ledger</span>
            </Link>
          </div>
        </div>

        {/* Status Tabs */}
        <div className="mt-6 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
          {(
            [
              { id: 'PENDING_REVIEW', label: 'Pending Review' },
              { id: 'APPROVED', label: 'Approved Entries' },
              { id: 'REJECTED', label: 'Rejected' },
              { id: 'ALL', label: 'All Purchases' },
            ] as const
          ).map((tab) => {
            const isActive = reviewTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setReviewTab(tab.id);
                  setPage(1);
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Filter Controls Bar */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search code, vendor, bill #..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-emerald-600"
            />
          </div>

          {/* VAT Bill Status Filter */}
          <div>
            <select
              value={vatStatusFilter}
              onChange={(e) => {
                setVatStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-700 focus:bg-white focus:outline-emerald-600"
            >
              <option value="ALL">All VAT Bill Statuses</option>
              <option value="VAT BILL RECEIVED">VAT Bill Received</option>
              <option value="VAT BILL PENDING">VAT Bill Pending</option>
              <option value="VAT BILL VERIFIED">VAT Bill Verified</option>
              <option value="VAT BILL REJECTED">VAT Bill Rejected</option>
              <option value="NOT APPLICABLE">Not Applicable (Non-VAT)</option>
            </select>
          </div>

          {/* Payment Status Filter */}
          <div>
            <select
              value={paymentStatusFilter}
              onChange={(e) => {
                setPaymentStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-700 focus:bg-white focus:outline-emerald-600"
            >
              <option value="ALL">All Payment Statuses</option>
              <option value="PAYMENT PENDING">Payment Pending</option>
              <option value="APPROVED">Approved for Payment</option>
              <option value="PARTIALLY PAID">Partially Paid</option>
              <option value="PAID">Paid</option>
            </select>
          </div>

          {/* Quick Clear */}
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              Total in Queue: <strong className="text-slate-800 tabular-nums">{totalCount}</strong>
            </span>
            {(searchQuery || vatStatusFilter !== 'ALL' || paymentStatusFilter !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setVatStatusFilter('ALL');
                  setPaymentStatusFilter('ALL');
                  setPage(1);
                }}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold underline cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Review Queue Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 whitespace-nowrap">Purchase Code</th>
                <th className="px-4 py-3 min-w-[160px]">Vendor Name</th>
                <th className="px-4 py-3 min-w-[180px]">Product / Items</th>
                <th className="px-4 py-3 whitespace-nowrap">Purchase Date</th>
                <th className="px-4 py-3 whitespace-nowrap">Entry Timestamp</th>
                <th className="px-4 py-3 whitespace-nowrap">Submitter</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Taxable Amt</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">13% VAT</th>
                <th className="px-4 py-3 text-right whitespace-nowrap font-bold text-slate-900">Total Amt</th>
                <th className="px-4 py-3 text-center whitespace-nowrap">Statuses</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={11} className="px-4 py-16 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-600 mb-2" />
                    <span>Loading queue items...</span>
                  </td>
                </tr>
              ) : purchases.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-16 text-center text-slate-400">
                    <FileCheck2 className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-slate-600">No purchase records found in this queue</p>
                    <p className="text-xs text-slate-400 mt-1">Try switching tabs or resetting your search filters.</p>
                  </td>
                </tr>
              ) : (
                purchases.map((p) => {
                  const remaining = Math.max(0, p.total_amount - p.paid_amount);
                  const isApproved = p.review_status === 'APPROVED';
                  const isPending = p.review_status === 'PENDING_REVIEW';
                  const hasBill = p.vat_bill_status !== 'NOT APPLICABLE' && p.vat_bill_status !== 'VAT BILL PENDING';

                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                      onClick={() => openInspect(p.id)}
                    >
                      {/* Purchase Code */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <Link
                          to={`/purchases/${p.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-bold text-indigo-700 hover:text-indigo-900 hover:underline flex items-center gap-1"
                        >
                          {p.purchase_code}
                          <ExternalLink className="w-3 h-3 text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Link>
                        {p.bill_number && (
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Bill: <span className="font-mono text-slate-600">{p.bill_number}</span>
                          </div>
                        )}
                      </td>

                      {/* Vendor */}
                      <td className="px-4 py-3.5">
                        <Link
                          to={`/vendors/${p.vendor_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-semibold text-slate-900 hover:text-emerald-700 hover:underline block truncate max-w-[200px]"
                        >
                          {p.vendor_name || `Vendor #${p.vendor_id}`}
                        </Link>
                        {p.vendor_pan && (
                          <span className="text-[11px] text-slate-400 font-mono">
                            PAN: {p.vendor_pan}
                          </span>
                        )}
                      </td>

                      {/* Product Summary */}
                      <td className="px-4 py-3.5">
                        <div className="line-clamp-2 text-slate-800 font-medium max-w-[240px]">
                          {p.product_summary}
                        </div>
                      </td>

                      {/* Purchase Date */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-slate-600">
                        <div className="font-semibold text-slate-800">{p.purchase_date_bs} BS</div>
                        <div className="text-[11px] text-slate-400">{p.purchase_date_ad} AD</div>
                      </td>

                      {/* Entry Date & Time (NPT) */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                        <div>{p.entry_date_bs} BS</div>
                        <div className="text-slate-400">{p.entry_time_npt || '—'} NPT</div>
                      </td>

                      {/* Submitter */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-slate-600">
                        <span className="font-medium">{p.submitted_by_name || 'Staff User'}</span>
                      </td>

                      {/* Taxable Amount */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap tabular-nums text-slate-600">
                        {formatNPR(p.purchase_amount)}
                      </td>

                      {/* VAT Amount */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap tabular-nums text-emerald-700 font-medium">
                        {formatNPR(p.vat_amount)}
                      </td>

                      {/* Total Amount */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap tabular-nums font-bold text-slate-900">
                        <div>{formatNPR(p.total_amount)}</div>
                        {remaining > 0 && isApproved && (
                          <div className="text-[10px] text-amber-700 font-semibold">
                            Bal: {formatNPR(remaining)}
                          </div>
                        )}
                      </td>

                      {/* Status Badges */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        <div className="flex flex-col items-center gap-1">
                          <ReviewStatusBadge status={p.review_status} size="sm" />
                          <VatStatusBadge status={p.vat_bill_status} size="sm" />
                          <PaymentStatusBadge status={p.payment_status} size="sm" />
                        </div>
                      </td>

                      {/* Row Actions */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Quick VAT Preview Button if file uploaded */}
                          {hasBill && (
                            <button
                              type="button"
                              onClick={() => handleQuickPreviewBill(p)}
                              title="Preview VAT Bill Document"
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Inspect Modal Trigger */}
                          <button
                            type="button"
                            onClick={() => openInspect(p.id)}
                            title="Inspect Particulars"
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Quick Approve button if pending */}
                          {isPending && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setEntryActionTarget(p);
                                  setEntryActionType('APPROVE');
                                  setEntryModalOpen(true);
                                }}
                                title="Approve Entry"
                                className="px-2 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-[11px] font-bold transition-colors inline-flex items-center gap-1"
                              >
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEntryActionTarget(p);
                                  setEntryActionType('REJECT');
                                  setEntryModalOpen(true);
                                }}
                                title="Reject Entry"
                                className="px-2 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-lg text-[11px] font-bold transition-colors inline-flex items-center gap-1"
                              >
                                <XCircle className="w-3 h-3 text-rose-600" />
                                Reject
                              </button>
                            </>
                          )}

                          {/* Quick Record Payment if approved & remaining balance > 0 */}
                          {isApproved && remaining > 0 && (
                            <button
                              type="button"
                              onClick={() => setRecordPaymentPurchase(p)}
                              title="Record Payment"
                              className="px-2 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded-lg text-[11px] font-bold transition-colors inline-flex items-center gap-1"
                            >
                              <CreditCard className="w-3 h-3 text-indigo-600" />
                              Pay
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <span>
              Showing page <strong className="text-slate-800">{page}</strong> of{' '}
              <strong className="text-slate-800">{totalPages}</strong> ({totalCount} total entries)
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                className="px-2.5 py-1 border border-slate-300 rounded-lg bg-white text-slate-700 disabled:opacity-40 hover:bg-slate-50 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                className="px-2.5 py-1 border border-slate-300 rounded-lg bg-white text-slate-700 disabled:opacity-40 hover:bg-slate-50 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* Slide-over Inspection Panel                                    */}
      {/* ============================================================== */}
      {inspectPurchaseId && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-xs flex justify-end animate-fade-in"
          onClick={closeInspect}
        >
          <div
            className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-slide-left border-l border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Slide-over Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Inspection: {inspectData?.purchase.purchase_code || `Purchase #${inspectPurchaseId}`}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Review line items, verify VAT bills, and manage disbursements
                </p>
              </div>
              <button
                type="button"
                onClick={closeInspect}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Slide-over Content */}
            {inspectLoading || !inspectData ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-400">
                <RefreshCw className="w-8 h-8 animate-spin text-indigo-600 mb-2" />
                <span>Loading purchase details...</span>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Status Badges & Quick Info */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ReviewStatusBadge status={inspectData.purchase.review_status} size="md" />
                      <VatStatusBadge status={inspectData.purchase.vat_bill_status} size="md" />
                      <PaymentStatusBadge status={inspectData.purchase.payment_status} size="md" />
                    </div>
                    <Link
                      to={`/purchases/${inspectData.purchase.id}`}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-bold underline inline-flex items-center gap-1"
                    >
                      Full Details <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs pt-2 border-t border-slate-200">
                    <div>
                      <span className="text-slate-400 block">Vendor:</span>
                      <Link
                        to={`/vendors/${inspectData.purchase.vendor_id}`}
                        className="font-semibold text-slate-800 hover:text-emerald-700 underline"
                      >
                        {inspectData.purchase.vendor_name || `Vendor #${inspectData.purchase.vendor_id}`}
                      </Link>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Purchase Date:</span>
                      <span className="font-semibold text-slate-800">
                        {inspectData.purchase.purchase_date_bs} BS
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Fiscal Year:</span>
                      <span className="font-semibold text-slate-800 font-mono">
                        {inspectData.purchase.fiscal_year}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Amount Summary Cards */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 bg-white border border-slate-200 rounded-xl">
                    <span className="text-[11px] text-slate-400 block uppercase font-bold">Taxable Base</span>
                    <span className="text-sm font-bold text-slate-800 tabular-nums">
                      {formatNPR(inspectData.purchase.purchase_amount)}
                    </span>
                  </div>
                  <div className="p-3 bg-white border border-slate-200 rounded-xl">
                    <span className="text-[11px] text-slate-400 block uppercase font-bold">13% VAT</span>
                    <span className="text-sm font-bold text-emerald-700 tabular-nums">
                      {formatNPR(inspectData.purchase.vat_amount)}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-900 text-white rounded-xl">
                    <span className="text-[11px] text-slate-400 block uppercase font-bold">Total Bill</span>
                    <span className="text-sm font-bold text-white tabular-nums">
                      {formatNPR(inspectData.purchase.total_amount)}
                    </span>
                  </div>
                </div>

                {/* Entry Approval / Rejection Box */}
                <div className="p-4 border border-slate-200 rounded-xl space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Entry Review Actions
                  </h4>
                  {inspectData.purchase.review_status === 'PENDING_REVIEW' ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEntryActionTarget(inspectData.purchase);
                          setEntryActionType('APPROVE');
                          setEntryModalOpen(true);
                        }}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1.5 shadow-xs"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Approve Entry
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEntryActionTarget(inspectData.purchase);
                          setEntryActionType('REJECT');
                          setEntryModalOpen(true);
                        }}
                        className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1.5 shadow-xs"
                      >
                        <XCircle className="w-4 h-4" />
                        Reject Entry
                      </button>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-600 flex items-center justify-between">
                      <span>
                        Current Status:{' '}
                        <strong className="text-slate-800">{inspectData.purchase.review_status}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEntryActionTarget(inspectData.purchase);
                          setEntryActionType(
                            inspectData.purchase.review_status === 'APPROVED' ? 'REJECT' : 'APPROVE'
                          );
                          setEntryModalOpen(true);
                        }}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold underline"
                      >
                        Change Status
                      </button>
                    </div>
                  )}
                  {inspectData.purchase.admin_remarks && (
                    <p className="text-xs text-slate-500 italic bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                      Admin Remarks: {inspectData.purchase.admin_remarks}
                    </p>
                  )}
                </div>

                {/* Line Items Table */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Line Items ({inspectData.items.length})
                  </h4>
                  <div className="border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2">Product Name</th>
                          <th className="px-3 py-2 text-right">Qty</th>
                          <th className="px-3 py-2 text-right">Unit Price</th>
                          <th className="px-3 py-2 text-right">Subtotal</th>
                          <th className="px-3 py-2 text-right">Line Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {inspectData.items.map((item) => (
                          <tr key={item.id}>
                            <td className="px-3 py-2 font-medium">
                              {item.product_name}
                              {item.sku && (
                                <span className="block text-[10px] text-slate-400 font-mono">
                                  {item.sku}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {item.quantity} {item.unit_of_measurement}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {formatNPR(item.unit_price)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {formatNPR(item.line_subtotal)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-bold text-slate-900">
                              {formatNPR(item.line_total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* VAT Bills Section */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      VAT Bill Attachments ({inspectData.vat_bills.length})
                    </h4>
                  </div>
                  {inspectData.vat_bills.length === 0 ? (
                    <div className="p-4 border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-400">
                      No physical VAT bills have been attached to this entry yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {inspectData.vat_bills.map((bill) => (
                        <div
                          key={bill.id}
                          className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-800 truncate">
                                {bill.original_name || bill.file_name}
                              </span>
                              {bill.is_current && (
                                <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] rounded font-semibold">
                                  Current
                                </span>
                              )}
                              <span
                                className={`px-1.5 py-0.5 text-[10px] rounded font-semibold ${
                                  bill.status === 'VERIFIED'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : bill.status === 'REJECTED'
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                                }`}
                              >
                                {bill.status}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              Bill Date: {bill.bill_date_bs || '—'} BS · No:{' '}
                              {bill.vat_bill_number || '—'} · Size: {(bill.file_size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setPreviewUrl(api.files.vatBillUrl(bill.id));
                                setPreviewFilename(bill.original_name || bill.file_name);
                                setPreviewTitle(`VAT Bill #${bill.vat_bill_number || bill.id}`);
                                setPreviewOpen(true);
                              }}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-semibold text-[11px] flex items-center gap-1"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              Preview
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setVatBillTarget({
                                  billId: bill.id,
                                  code: inspectData.purchase.purchase_code,
                                });
                                setVatBillActionType('VERIFY');
                                setVatBillReviewNotes('');
                                setVatBillModalOpen(true);
                              }}
                              className="px-2 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-md text-[11px] font-semibold"
                            >
                              Verify
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setVatBillTarget({
                                  billId: bill.id,
                                  code: inspectData.purchase.purchase_code,
                                });
                                setVatBillActionType('REJECT');
                                setVatBillReviewNotes('');
                                setVatBillModalOpen(true);
                              }}
                              className="px-2 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-md text-[11px] font-semibold"
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Payments Section with Void capability */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Payment History & Settlements ({inspectData.payments.length})
                    </h4>
                    {inspectData.purchase.review_status === 'APPROVED' &&
                      inspectData.purchase.total_amount > inspectData.purchase.paid_amount && (
                        <button
                          type="button"
                          onClick={() => setRecordPaymentPurchase(inspectData.purchase)}
                          className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          Record Payment
                        </button>
                      )}
                  </div>

                  {inspectData.payments.length === 0 ? (
                    <div className="p-4 border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-400">
                      No payments have been recorded for this purchase yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {inspectData.payments.map((pay) => (
                        <div
                          key={pay.id}
                          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                            pay.is_voided
                              ? 'bg-rose-50/50 border-rose-200 text-rose-900 opacity-75'
                              : 'bg-white border-slate-200 text-slate-800'
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold tabular-nums text-sm">
                                {formatNPR(pay.amount)}
                              </span>
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                                {pay.payment_method}
                              </span>
                              {pay.is_voided && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-600 text-white">
                                  VOIDED
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              Date: {pay.payment_date_bs} BS ({pay.payment_date_ad} AD)
                              {pay.company_bank_account ? ` · Account: ${pay.company_bank_account}` : ''}
                              {pay.transaction_ref ? ` · Ref: ${pay.transaction_ref}` : ''}
                            </p>
                            {pay.is_voided && pay.void_reason && (
                              <p className="text-[11px] text-rose-700 mt-1 italic">
                                Reason for void: {pay.void_reason}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {/* Payment slip preview if slip exists */}
                            {(pay.slip || (pay.slips && pay.slips.length > 0)) && (
                              <button
                                type="button"
                                onClick={() => {
                                  const slip = pay.slip || pay.slips?.[0];
                                  if (slip) {
                                    setPreviewUrl(api.files.paymentSlipUrl(slip.id));
                                    setPreviewFilename(slip.original_name || slip.file_name);
                                    setPreviewTitle(`Payment Slip #${slip.id}`);
                                    setPreviewOpen(true);
                                  }
                                }}
                                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-medium"
                              >
                                View Slip
                              </button>
                            )}

                            {/* Void button if active */}
                            {!pay.is_voided && (
                              <button
                                type="button"
                                onClick={() => {
                                  setVoidPaymentTarget(pay);
                                  setVoidReason('');
                                  setVoidPaymentModalOpen(true);
                                }}
                                className="px-2 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded text-[11px] font-semibold flex items-center gap-1"
                              >
                                <Ban className="w-3 h-3 text-rose-600" />
                                Void
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Approve / Reject Purchase Entry Modal (with optional Mark Paid) */}
      <ApprovePurchaseModal
        isOpen={entryModalOpen}
        actionType={entryActionType}
        purchase={entryActionTarget}
        onClose={() => {
          setEntryModalOpen(false);
          setEntryActionTarget(null);
        }}
        onSuccess={() => {
          fetchQueue();
          if (entryActionTarget && inspectPurchaseId === entryActionTarget.id) {
            openInspect(entryActionTarget.id);
          }
        }}
      />

      {/* ============================================================== */}
      {/* Verify / Reject VAT Bill Modal                                 */}
      {/* ============================================================== */}
      {vatBillModalOpen && vatBillTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in"
          role="dialog"
          aria-modal="true"
          onClick={() => setVatBillModalOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`px-6 py-4 text-white flex items-center justify-between ${
                vatBillActionType === 'VERIFY' ? 'bg-emerald-600' : 'bg-rose-600'
              }`}
            >
              <h3 className="text-base font-bold flex items-center gap-2">
                <FileCheck2 className="w-5 h-5" />
                <span>
                  {vatBillActionType === 'VERIFY' ? 'Verify VAT Bill' : 'Reject VAT Bill'} (
                  {vatBillTarget.code})
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setVatBillModalOpen(false)}
                className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleVatBillActionSubmit} className="p-6 space-y-4">
              <p className="text-xs text-slate-600">
                Update VAT bill inspection status for purchase{' '}
                <strong className="text-slate-900">{vatBillTarget.code}</strong>.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Review Notes / Comments (Optional)
                </label>
                <textarea
                  rows={3}
                  value={vatBillReviewNotes}
                  onChange={(e) => setVatBillReviewNotes(e.target.value)}
                  placeholder="e.g. Valid IRD QR stamp and vendor PAN verified against tax portal."
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-emerald-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setVatBillModalOpen(false)}
                  disabled={vatBillSubmitting}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={vatBillSubmitting}
                  className={`px-4 py-2 text-white rounded-lg text-xs font-bold transition-colors shadow-xs ${
                    vatBillActionType === 'VERIFY'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {vatBillSubmitting
                    ? 'Processing...'
                    : vatBillActionType === 'VERIFY'
                    ? 'Verify Bill'
                    : 'Reject Bill'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* Void Payment Modal (Admin-only with Required Reason)            */}
      {/* ============================================================== */}
      {voidPaymentModalOpen && voidPaymentTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in"
          role="dialog"
          aria-modal="true"
          onClick={() => setVoidPaymentModalOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 bg-rose-600 text-white flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Ban className="w-5 h-5" />
                <span>Void Payment #{voidPaymentTarget.id}</span>
              </h3>
              <button
                type="button"
                onClick={() => setVoidPaymentModalOpen(false)}
                className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleVoidPaymentSubmit} className="p-6 space-y-4">
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
                <p className="font-semibold">Destructive Action Confirmation</p>
                <p className="mt-1">
                  Voiding this payment of{' '}
                  <strong className="font-bold tabular-nums">
                    {formatNPR(voidPaymentTarget.amount)}
                  </strong>{' '}
                  will restore the purchase unpaid balance and revert the payment status. An immutable audit trail entry will be recorded.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Void Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="e.g. Duplicate cheque issued; bank transfer rejected due to invalid account number."
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-rose-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setVoidPaymentModalOpen(false)}
                  disabled={voidSubmitting}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={voidSubmitting || !voidReason.trim()}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
                >
                  {voidSubmitting ? 'Voiding...' : 'Confirm Void Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      <RecordPaymentModal
        isOpen={Boolean(recordPaymentPurchase)}
        onClose={() => setRecordPaymentPurchase(null)}
        onSuccess={() => {
          fetchQueue();
          if (inspectPurchaseId) {
            openInspect(inspectPurchaseId);
          }
        }}
        purchase={recordPaymentPurchase}
      />

      {/* VAT Bill Document Preview Modal */}
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
