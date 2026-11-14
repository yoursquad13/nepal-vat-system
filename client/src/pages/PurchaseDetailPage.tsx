import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Receipt,
  ArrowLeft,
  Printer,
  Edit,
  Phone,
  Building2,
  Clock,
  FileCheck2,
  CreditCard,
  PackageCheck,
  Upload,
  CheckCircle2,
  AlertTriangle,
  History,
  Eye,
  X,
  ExternalLink,
} from 'lucide-react';
import {
  api,
  Purchase,
  PurchaseItem,
  VatBill,
  Payment,
  ActivityLog,
  AppSettings,
} from '../api/client';
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
import { PrintableVoucher } from '../components/PrintableVoucher';
import { BsAdDatePicker, BsAdDateValue } from '../components/BsAdDatePicker';
import { ApprovePurchaseModal } from '../components/ApprovePurchaseModal';

export function PurchaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const purchaseId = Number(id);
  const navigate = useNavigate();

  const { user } = useAuth();
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();

  const [loading, setLoading] = useState<boolean>(true);
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [vatBills, setVatBills] = useState<VatBill[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [companySettings, setCompanySettings] = useState<AppSettings | null>(null);

  // Modals & Panels
  const [showVoucher, setShowVoucher] = useState<boolean>(false);
  const [previewOpen, setPreviewOpen] = useState<boolean>(false);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [previewFilename, setPreviewFilename] = useState<string>('');
  const [previewTitle, setPreviewTitle] = useState<string>('');

  // Upload VAT Bill Modal
  const [uploadModalOpen, setUploadModalOpen] = useState<boolean>(false);
  const [billUploadFile, setBillUploadFile] = useState<File | null>(null);
  const [billUploadDateBs, setBillUploadDateBs] = useState<string>('');
  const [billUploadDateAd, setBillUploadDateAd] = useState<string>('');
  const [billUploadNumber, setBillUploadNumber] = useState<string>('');
  const [uploadingBill, setUploadingBill] = useState<boolean>(false);

  // Admin Review Modal (Approve / Reject)
  const [adminActionModalOpen, setAdminActionModalOpen] = useState<boolean>(false);
  const [adminActionType, setAdminActionType] = useState<'APPROVE' | 'REJECT' | null>(null);

  // VAT Bill Verify / Reject Modal
  const [vatVerifyModalOpen, setVatVerifyModalOpen] = useState<boolean>(false);
  const [vatVerifyBillId, setVatVerifyBillId] = useState<number | null>(null);
  const [vatVerifyType, setVatVerifyType] = useState<'VERIFY' | 'REJECT' | null>(null);
  const [vatVerifyNotes, setVatVerifyNotes] = useState<string>('');
  const [processingVatVerify, setProcessingVatVerify] = useState<boolean>(false);

  // Stock Receipt
  const [receivingStock, setReceivingStock] = useState<boolean>(false);

  // Fetch Purchase Data
  const fetchPurchaseDetails = useCallback(async () => {
    if (!purchaseId || Number.isNaN(purchaseId)) {
      navigate('/purchases');
      return;
    }

    setLoading(true);
    try {
      const [res, settingsRes] = await Promise.all([
        api.purchases.get(purchaseId),
        api.settings.get().catch(() => ({ settings: null })),
      ]);

      setPurchase(res.purchase);
      setItems(res.items || []);
      setVatBills(res.vat_bills || []);
      setPayments(res.payments || []);
      setActivityLogs(res.activity_logs || []);
      if (settingsRes?.settings) setCompanySettings(settingsRes.settings);
    } catch (err: any) {
      toastError(err.message || 'Unable to retrieve purchase particulars.', 'Error loading purchase');
      navigate('/purchases');
    } finally {
      setLoading(false);
    }
  }, [purchaseId, navigate, toastError]);

  useEffect(() => {
    fetchPurchaseDetails();
  }, [fetchPurchaseDetails]);

  // Open Preview Modal
  const handleOpenPreview = (url: string, filename: string, title: string) => {
    setPreviewUrl(url);
    setPreviewFilename(filename);
    setPreviewTitle(title);
    setPreviewOpen(true);
  };

  // Upload VAT Bill Handler
  const handleUploadVatBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billUploadFile) {
      toastInfo('Please select a bill image or PDF.', 'File Required');
      return;
    }

    setUploadingBill(true);
    try {
      const fd = new FormData();
      fd.append('file', billUploadFile);
      if (billUploadDateAd) {
        fd.append('bill_date_ad', billUploadDateAd);
        fd.append('vat_bill_date_ad', billUploadDateAd);
      }
      if (billUploadDateBs) {
        fd.append('bill_date_bs', billUploadDateBs);
        fd.append('vat_bill_date_bs', billUploadDateBs);
      }
      if (billUploadNumber.trim()) {
        fd.append('vat_bill_number', billUploadNumber.trim());
        fd.append('bill_number', billUploadNumber.trim());
      }

      await api.purchases.uploadVatBill(purchaseId, fd);
      toastSuccess('VAT bill was successfully attached to this purchase.', 'VAT Bill Uploaded');
      setUploadModalOpen(false);
      setBillUploadFile(null);
      fetchPurchaseDetails();
    } catch (err: any) {
      toastError(err.message || 'Failed to upload VAT bill file.', 'Upload Failed');
    } finally {
      setUploadingBill(false);
    }
  };

  // Receive Physical Stock Handler
  const handleReceiveStock = async () => {
    if (!purchaseId) return;
    setReceivingStock(true);
    try {
      const res = await api.purchases.receiveStock(purchaseId, {
        responsible_staff_name: user?.fullName || 'Authorized Staff',
      });
      toastSuccess(res.message || 'Catalog product inventory updated successfully.', 'Stock Received');
      fetchPurchaseDetails();
    } catch (err: any) {
      toastError(err.message || 'Failed to receive stock into inventory.', 'Stock Receipt Error');
    } finally {
      setReceivingStock(false);
    }
  };

  // Admin Verify / Reject VAT Bill Handler
  const handleVatBillReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vatVerifyBillId || !vatVerifyType) return;

    setProcessingVatVerify(true);
    try {
      if (vatVerifyType === 'VERIFY') {
        await api.vatBills.verify(vatVerifyBillId, { review_notes: vatVerifyNotes });
        toastSuccess('Physical VAT bill has been verified and confirmed.', 'VAT Bill Verified');
      } else {
        await api.vatBills.reject(vatVerifyBillId, { reason: vatVerifyNotes });
        toastInfo('VAT bill was rejected. Staff may upload a corrected bill.', 'VAT Bill Rejected');
      }
      setVatVerifyModalOpen(false);
      setVatVerifyNotes('');
      fetchPurchaseDetails();
    } catch (err: any) {
      toastError(err.message || 'Failed to update VAT bill status.', 'VAT Verification Failed');
    } finally {
      setProcessingVatVerify(false);
    }
  };

  if (loading || !purchase) {
    return (
      <div className="bg-white p-12 rounded-xl border border-slate-200 text-center text-slate-500">
        <Receipt className="w-8 h-8 animate-spin mx-auto text-emerald-600 mb-3" />
        <p className="text-sm font-semibold">Loading purchase details...</p>
      </div>
    );
  }

  const isAdmin = user?.role === 'ADMIN';
  const outstanding = Math.max(0, purchase.total_amount - purchase.paid_amount);
  const unreceivedCatalogItems = items.filter((it) => it.product_id && !it.stock_received);
  const canReceiveStock = purchase.review_status === 'APPROVED' && unreceivedCatalogItems.length > 0;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Breadcrumb & Action Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <Link
            to="/purchases"
            className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-slate-900">
                {purchase.purchase_code}
              </h1>
              {purchase.bill_number && (
                <span className="px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono text-xs font-semibold">
                  Bill #{purchase.bill_number}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Fiscal Year: <strong className="font-mono text-emerald-700">{purchase.fiscal_year}</strong> • Entered by{' '}
              <strong className="text-slate-700">{purchase.submitted_by_name || 'Staff'}</strong>
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Printable Voucher Button */}
          <button
            type="button"
            onClick={() => setShowVoucher(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4 text-emerald-400" />
            <span>Print Voucher</span>
          </button>

          {/* Edit Purchase (if editable) */}
          {(isAdmin || purchase.review_status === 'PENDING_REVIEW') && (
            <Link
              to={`/purchases/${purchase.id}/edit`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold shadow-xs transition-colors"
            >
              <Edit className="w-4 h-4" />
              <span>Edit Particulars</span>
            </Link>
          )}

          {/* Admin Review Trigger (if pending) */}
          {isAdmin && purchase.review_status === 'PENDING_REVIEW' && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setAdminActionType('APPROVE');
                  setAdminActionModalOpen(true);
                }}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer"
              >
                Approve Purchase
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdminActionType('REJECT');
                  setAdminActionModalOpen(true);
                }}
                className="px-3.5 py-2 bg-rose-50 border border-rose-300 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                Reject
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Primary Badges & Key Metadata Banner */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <ReviewStatusBadge status={purchase.review_status} size="md" />
            <VatStatusBadge status={purchase.vat_bill_status} size="md" />
            <PaymentStatusBadge status={purchase.payment_status} size="md" />
            <TaxBadge taxType={purchase.tax_type} vatCalcMode={purchase.vat_calc_mode} size="md" />
          </div>

          <div className="text-xs text-slate-500 font-mono">
            <span>Entry Stamped: </span>
            <strong className="text-slate-900 font-semibold">{purchase.entry_time_npt || 'N/A'} NPT</strong>
            <span> ({purchase.entry_date_bs} BS)</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1 font-mono">
          <div>
            <span className="text-xs text-slate-500 uppercase font-sans">Taxable Base</span>
            <p className="text-lg font-bold text-slate-900 tabular-nums mt-0.5">
              {formatNpr(purchase.purchase_amount)}
            </p>
          </div>

          <div>
            <span className="text-xs text-teal-600 uppercase font-sans">13% Input VAT</span>
            <p className="text-lg font-bold text-teal-700 tabular-nums mt-0.5">
              {purchase.tax_type === 'NON_VAT' ? 'Rs. 0.00' : formatNpr(purchase.vat_amount)}
            </p>
          </div>

          <div>
            <span className="text-xs text-slate-900 uppercase font-sans font-bold">Total Gross Amount</span>
            <p className="text-xl font-bold text-slate-900 tabular-nums mt-0.5">
              {formatNpr(purchase.total_amount)}
            </p>
          </div>

          <div>
            <span className="text-xs text-amber-700 uppercase font-sans font-bold">Outstanding Payable</span>
            <p className="text-xl font-bold text-amber-700 tabular-nums mt-0.5">
              {formatNpr(outstanding)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Products, Stock Receipt, Payments, Audit Trail */}
        <div className="lg:col-span-2 space-y-6">
          {/* Purchase Particulars & Line Items Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Purchase Summary & Items</h3>
                <p className="text-xs text-slate-500">{purchase.product_summary}</p>
              </div>

              {/* Receive Physical Stock Trigger */}
              {canReceiveStock && (
                <button
                  type="button"
                  onClick={handleReceiveStock}
                  disabled={receivingStock}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  <PackageCheck className="w-4 h-4" />
                  <span>{receivingStock ? 'Receiving Stock...' : 'Receive Physical Stock'}</span>
                </button>
              )}
            </div>

            {purchase.description && (
              <div className="p-4 bg-slate-50 border-b border-slate-100 text-xs text-slate-700">
                <span className="font-semibold text-slate-900">Notes / Scope: </span>
                <span>{purchase.description}</span>
              </div>
            )}

            {/* Line Items Table */}
            {items.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5">Item Name / SKU</th>
                      <th className="px-3 py-2.5 text-center">Qty</th>
                      <th className="px-3 py-2.5 text-right">Unit Price</th>
                      <th className="px-3 py-2.5 text-right">Subtotal</th>
                      <th className="px-3 py-2.5 text-right">13% VAT</th>
                      <th className="px-3 py-2.5 text-right font-bold">Total</th>
                      <th className="px-3 py-2.5 text-center">Stock In</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {items.map((it) => (
                      <tr key={it.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{it.product_name}</div>
                          {it.sku && <div className="text-[11px] text-slate-500 font-mono">SKU: {it.sku}</div>}
                        </td>
                        <td className="px-3 py-3 text-center font-mono">
                          {it.quantity} {it.unit_of_measurement}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums">
                          {formatNpr(it.unit_price)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums">
                          {formatNpr(it.line_subtotal)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums text-teal-700">
                          {formatNpr(it.line_vat_amount)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums font-bold text-slate-900">
                          {formatNpr(it.line_total)}
                        </td>
                        <td className="px-3 py-3 text-center whitespace-nowrap">
                          {it.stock_received ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Received</span>
                            </span>
                          ) : it.product_id ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                              <Clock className="w-3 h-3 text-amber-600" />
                              <span>Pending</span>
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">Non-catalog</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-slate-500">
                Quick Single-Amount Entry recorded without individual product line items.
              </div>
            )}
          </div>

          {/* Payment History & Settlement Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-sm">Payment History & Settlements</h3>
              </div>
              {isAdmin && outstanding > 0 && purchase.review_status === 'APPROVED' && (
                <Link
                  to={`/payments?vendorId=${purchase.vendor_id}`}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
                >
                  Record Payment
                </Link>
              )}
            </div>

            {payments.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                No payment settlements have been recorded yet for this purchase.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5">Date (BS / AD)</th>
                      <th className="px-3 py-2.5">Method</th>
                      <th className="px-3 py-2.5">Ref / Cheque #</th>
                      <th className="px-3 py-2.5 text-right">Amount Paid</th>
                      <th className="px-3 py-2.5 text-center">Bank Slip</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {payments.map((p) => {
                      const slip = p.slips?.[0] || p.slip;
                      return (
                        <tr key={p.id} className={p.is_void || p.is_voided ? 'opacity-50 line-through bg-rose-50/20' : ''}>
                          <td className="px-4 py-3 font-mono">
                            <div className="font-bold text-slate-900">{p.payment_date_bs} BS</div>
                            <div className="text-[10px] text-slate-400">{p.payment_date_ad} AD</div>
                          </td>
                          <td className="px-3 py-3 font-semibold text-slate-800">{p.payment_method}</td>
                          <td className="px-3 py-3 font-mono text-slate-600">{p.transaction_ref || '—'}</td>
                          <td className="px-3 py-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                            {formatNpr(p.amount)}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {slip ? (
                              <button
                                type="button"
                                onClick={() =>
                                  handleOpenPreview(
                                    api.files.paymentSlipUrl(slip.id),
                                    slip.original_name || slip.file_name,
                                    `Payment Slip #${p.id}`
                                  )
                                }
                                className="inline-flex items-center gap-1 text-xs text-sky-700 hover:underline font-semibold"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Preview</span>
                              </button>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Activity Logs & Audit History Timeline */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <History className="w-4 h-4 text-slate-600" />
              <h3 className="font-bold text-slate-900 text-sm">Audit Trail & Change History</h3>
            </div>

            <div className="space-y-4">
              {activityLogs.length === 0 ? (
                <p className="text-xs text-slate-400">No activity logged yet.</p>
              ) : (
                activityLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 text-xs border-l-2 border-emerald-500 pl-3 py-1">
                    <div className="flex-1">
                      <p className="font-semibold text-slate-800">{log.summary}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        By <strong className="text-slate-700">{log.performed_by_name}</strong> •{' '}
                        <span className="font-mono">{new Date(log.performed_at).toLocaleString()}</span>
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column (1 Col): Vendor Profile & VAT Bill Files */}
        <div className="space-y-6">
          {/* Vendor Details Card */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Building2 className="w-4 h-4 text-emerald-600" />
                <span>Supplier Profile</span>
              </div>
              <Link
                to={`/vendors/${purchase.vendor_id}`}
                className="text-xs font-semibold text-emerald-700 hover:underline flex items-center gap-0.5"
              >
                <span>Profile</span>
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>

            <div className="space-y-2.5 text-xs text-slate-700">
              <p className="text-base font-bold text-slate-900">{purchase.vendor_name}</p>

              {purchase.vendor_phone && (
                <div className="pt-1">
                  <a
                    href={`tel:${purchase.vendor_phone}`}
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg font-bold font-mono text-xs transition-colors cursor-pointer shadow-2xs"
                  >
                    <Phone className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Call: {purchase.vendor_phone}</span>
                  </a>
                </div>
              )}

              <div className="pt-2 border-t border-slate-100 space-y-1.5">
                <div className="flex justify-between font-mono">
                  <span className="text-slate-500">PAN / VAT:</span>
                  <strong className="text-slate-900">{purchase.vendor_pan || purchase.vendor_vat || 'N/A'}</strong>
                </div>
                {(purchase as any).vendor_address && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Address:</span>
                    <span className="text-slate-800 text-right">{(purchase as any).vendor_address}</span>
                  </div>
                )}
                {(purchase as any).vendor_bank_name && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Bank:</span>
                    <span className="text-slate-800 font-mono">{(purchase as any).vendor_bank_name}</span>
                  </div>
                )}
                {(purchase as any).vendor_bank_account_number && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Account:</span>
                    <span className="text-slate-800 font-mono">{(purchase as any).vendor_bank_account_number}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Attached VAT Bills Gallery & Delayed Upload */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <FileCheck2 className="w-4 h-4 text-emerald-600" />
                <span>Physical VAT Bill</span>
              </div>

              {/* Upload VAT Bill Button */}
              <button
                type="button"
                onClick={() => setUploadModalOpen(true)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Bill</span>
              </button>
            </div>

            {vatBills.length === 0 ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-center space-y-2">
                <AlertTriangle className="w-6 h-6 text-amber-600 mx-auto" />
                <p className="text-xs font-bold text-amber-900">VAT Bill Pending</p>
                <p className="text-[11px] text-amber-700">
                  No physical bill attached yet. You can upload the bill image or PDF at any time.
                </p>
                <button
                  type="button"
                  onClick={() => setUploadModalOpen(true)}
                  className="mt-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  Attach VAT Bill Now
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {vatBills.map((b) => (
                  <div key={b.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-xs text-slate-900 truncate">{b.original_name || b.file_name}</p>
                        <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                          {(b.file_size / 1024).toFixed(1)} KB • {b.bill_date_bs ? `${b.bill_date_bs} BS` : 'No BS Date'}
                        </p>
                      </div>
                      <VatStatusBadge status={b.status} />
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                      <button
                        type="button"
                        onClick={() =>
                          handleOpenPreview(
                            api.files.vatBillUrl(b.id),
                            b.original_name || b.file_name,
                            `VAT Bill for ${purchase.purchase_code}`
                          )
                        }
                        className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:underline cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Preview File</span>
                      </button>

                      {/* Admin Verify/Reject inline options */}
                      {isAdmin && b.status === 'RECEIVED' && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setVatVerifyBillId(b.id);
                              setVatVerifyType('VERIFY');
                              setVatVerifyModalOpen(true);
                            }}
                            className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
                          >
                            Verify
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setVatVerifyBillId(b.id);
                              setVatVerifyType('REJECT');
                              setVatVerifyModalOpen(true);
                            }}
                            className="text-xs font-semibold text-rose-600 hover:underline cursor-pointer"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Printable Voucher Modal Viewer */}
      {showVoucher && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl p-4 sm:p-6 overflow-hidden my-8">
            <PrintableVoucher
              purchase={purchase}
              items={items}
              payments={payments}
              company={companySettings}
              onClose={() => setShowVoucher(false)}
            />
          </div>
        </div>
      )}

      {/* Delayed Upload VAT Bill Modal */}
      {uploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 animate-slide-up space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-sm">Upload VAT Bill</h3>
              </div>
              <button
                type="button"
                onClick={() => setUploadModalOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUploadVatBill} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  VAT Bill Image / PDF File <span className="text-rose-500">*</span>
                </label>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.pdf"
                  required
                  onChange={(e) => {
                    if (e.target.files?.[0]) setBillUploadFile(e.target.files[0]);
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  VAT Bill Invoice # (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. VAT-8941"
                  value={billUploadNumber}
                  onChange={(e) => setBillUploadNumber(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                />
              </div>

              <BsAdDatePicker
                label="Bill Date (Bikram Sambat)"
                valueBs={billUploadDateBs || purchase.purchase_date_bs}
                valueAd={billUploadDateAd || purchase.purchase_date_ad}
                onChange={(val: BsAdDateValue) => {
                  setBillUploadDateBs(val.bs);
                  setBillUploadDateAd(val.ad);
                }}
              />

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setUploadModalOpen(false)}
                  className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploadingBill}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold"
                >
                  {uploadingBill ? 'Uploading...' : 'Upload & Attach Bill'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Review Decision Modal (Approve + Optional Mark Paid / Reject) */}
      <ApprovePurchaseModal
        isOpen={adminActionModalOpen && Boolean(adminActionType)}
        actionType={adminActionType || 'APPROVE'}
        purchase={purchase}
        onClose={() => setAdminActionModalOpen(false)}
        onSuccess={fetchPurchaseDetails}
      />

      {/* VAT Bill Verify / Reject Modal */}
      {vatVerifyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 animate-slide-up space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">
                {vatVerifyType === 'VERIFY' ? 'Verify Physical VAT Bill' : 'Reject VAT Bill Attachment'}
              </h3>
              <button
                type="button"
                onClick={() => setVatVerifyModalOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleVatBillReview} className="space-y-4">
              <p className="text-xs text-slate-600">
                {vatVerifyType === 'VERIFY'
                  ? 'Confirm that the uploaded document is a valid physical VAT bill matching the vendor and amount.'
                  : 'Rejecting this bill will flag the purchase for staff to upload a legible or correct bill.'}
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Verification Notes / Reason
                </label>
                <textarea
                  rows={3}
                  placeholder="Notes..."
                  value={vatVerifyNotes}
                  onChange={(e) => setVatVerifyNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setVatVerifyModalOpen(false)}
                  className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={processingVatVerify}
                  className={`px-4 py-1.5 text-white rounded-lg text-xs font-bold ${
                    vatVerifyType === 'VERIFY'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {processingVatVerify ? 'Updating...' : vatVerifyType === 'VERIFY' ? 'Verify VAT Bill' : 'Reject Bill'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* File Lightbox / Preview Modal */}
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
