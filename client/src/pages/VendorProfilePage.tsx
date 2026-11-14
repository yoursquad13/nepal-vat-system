import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Building2,
  ArrowLeft,
  PhoneCall,
  Mail,
  MapPin,
  Landmark,
  CreditCard,
  Edit,
  FileText,
  Receipt,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  X,
} from 'lucide-react';
import { api, Vendor, Purchase, Payment } from '../api/client';
import { useToast } from '../context/ToastContext';
import { formatNPR } from '../utils/money';
import {
  VatStatusBadge,
  PaymentStatusBadge,
} from '../components/StatusBadges';
import { FilePreviewModal } from '../components/FilePreviewModal';

export function VendorProfilePage() {
  const { id } = useParams<{ id: string }>();
  const vendorId = Number(id);
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();

  const [loading, setLoading] = useState<boolean>(true);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [summary, setSummary] = useState<{
    total_purchases_count: number;
    total_purchase_amount: number;
    total_vat_amount: number;
    total_amount: number;
    total_paid_amount: number;
    total_unpaid_amount: number;
    pending_vat_bills_count: number;
  } | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  // Tab State: 'purchases' | 'payments'
  const [activeTab, setActiveTab] = useState<'purchases' | 'payments'>('purchases');

  // Copied bank account state
  const [copiedBank, setCopiedBank] = useState<boolean>(false);

  // Edit Modal
  const [editModalOpen, setEditModalOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formCompanyName, setFormCompanyName] = useState<string>('');
  const [formPanNumber, setFormPanNumber] = useState<string>('');
  const [formVatNumber, setFormVatNumber] = useState<string>('');
  const [formContactPerson, setFormContactPerson] = useState<string>('');
  const [formContactNumber, setFormContactNumber] = useState<string>('');
  const [formAltContactNumber, setFormAltContactNumber] = useState<string>('');
  const [formAddress, setFormAddress] = useState<string>('');
  const [formBankName, setFormBankName] = useState<string>('');
  const [formBankBranch, setFormBankBranch] = useState<string>('');
  const [formBankAccountHolder, setFormBankAccountHolder] = useState<string>('');
  const [formBankAccountNumber, setFormBankAccountNumber] = useState<string>('');
  const [formAccountType, setFormAccountType] = useState<string>('Current');
  const [formEmail, setFormEmail] = useState<string>('');
  const [formNotes, setFormNotes] = useState<string>('');
  const [formIsActive, setFormIsActive] = useState<boolean>(true);

  // Preview Modal
  const [previewOpen, setPreviewOpen] = useState<boolean>(false);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [previewFilename, setPreviewFilename] = useState<string>('');
  const [previewTitle, setPreviewTitle] = useState<string>('');

  const fetchVendorDetails = useCallback(async () => {
    if (!vendorId || Number.isNaN(vendorId)) {
      navigate('/vendors');
      return;
    }

    setLoading(true);
    try {
      const res = await api.vendors.get(vendorId);
      setVendor(res.vendor);
      setSummary(res.summary);
      setPurchases(res.purchases || []);
      setPayments(res.payments || []);
    } catch (err: any) {
      toastError(err.message || 'Vendor not found', 'Error Loading Vendor');
      navigate('/vendors');
    } finally {
      setLoading(false);
    }
  }, [vendorId, navigate, toastError]);

  useEffect(() => {
    fetchVendorDetails();
  }, [fetchVendorDetails]);

  const copyBankToClipboard = () => {
    if (!vendor?.bank_account_number) return;
    navigator.clipboard.writeText(vendor.bank_account_number);
    setCopiedBank(true);
    toastSuccess('Bank account number copied to clipboard.', 'Copied');
    setTimeout(() => setCopiedBank(false), 2000);
  };

  const handleOpenEdit = () => {
    if (!vendor) return;
    setFormCompanyName(vendor.company_name || '');
    setFormPanNumber(vendor.pan_number || '');
    setFormVatNumber(vendor.vat_number || '');
    setFormContactPerson(vendor.contact_person || '');
    setFormContactNumber(vendor.contact_number || '');
    setFormAltContactNumber(vendor.alt_contact_number || '');
    setFormAddress(vendor.address || '');
    setFormBankName(vendor.bank_name || '');
    setFormBankBranch(vendor.bank_branch || '');
    setFormBankAccountHolder(vendor.bank_account_holder || '');
    setFormBankAccountNumber(vendor.bank_account_number || '');
    setFormAccountType(vendor.account_type || 'Current');
    setFormEmail(vendor.email || '');
    setFormNotes(vendor.notes || '');
    setFormIsActive(vendor.is_active ?? true);
    setEditModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendor) return;
    if (!formCompanyName.trim()) {
      toastError('Company name is required', 'Validation Error');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.vendors.update(vendor.id, {
        company_name: formCompanyName.trim(),
        pan_number: formPanNumber.trim() || null,
        vat_number: formVatNumber.trim() || null,
        contact_person: formContactPerson.trim() || null,
        contact_number: formContactNumber.trim() || null,
        alt_contact_number: formAltContactNumber.trim() || null,
        address: formAddress.trim() || null,
        bank_name: formBankName.trim() || null,
        bank_branch: formBankBranch.trim() || null,
        bank_account_holder: formBankAccountHolder.trim() || null,
        bank_account_number: formBankAccountNumber.trim() || null,
        account_type: formAccountType.trim() || null,
        email: formEmail.trim() || null,
        notes: formNotes.trim() || null,
        is_active: formIsActive,
      });

      toastSuccess('Vendor particulars updated successfully.', 'Vendor Updated');
      setEditModalOpen(false);
      fetchVendorDetails();
    } catch (err: any) {
      toastError(err.message || 'Failed to update vendor', 'Update Error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading || !vendor || !summary) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto text-emerald-600 mb-3" />
        <span className="text-sm font-medium">Loading vendor profile & ledgers...</span>
      </div>
    );
  }

  const hasPhone = Boolean(vendor.contact_number);

  return (
    <div className="space-y-6">
      {/* Top Navigation & Actions */}
      <div className="flex items-center justify-between">
        <Link
          to="/vendors"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Vendors Directory</span>
        </Link>
        <button
          type="button"
          onClick={handleOpenEdit}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
        >
          <Edit className="w-4 h-4" />
          <span>Edit Vendor Details</span>
        </button>
      </div>

      {/* Main Vendor Profile Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          {/* Identity & Contact */}
          <div className="space-y-3 flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center shrink-0">
                <Building2 className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-slate-900 truncate">
                    {vendor.company_name}
                  </h1>
                  {!vendor.is_active && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                      Inactive
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                  {vendor.pan_number && (
                    <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-800 font-semibold">
                      PAN: {vendor.pan_number}
                    </span>
                  )}
                  {vendor.vat_number && vendor.vat_number !== vendor.pan_number && (
                    <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-800 font-semibold">
                      VAT: {vendor.vat_number}
                    </span>
                  )}
                  {vendor.contact_person && (
                    <span>Contact: <strong className="text-slate-700">{vendor.contact_person}</strong></span>
                  )}
                </div>
              </div>
            </div>

            {/* Address & Direct Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600 pt-2">
              <div className="space-y-1.5">
                {vendor.address && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{vendor.address}</span>
                  </div>
                )}
                {vendor.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <a href={`mailto:${vendor.email}`} className="text-indigo-600 hover:underline">
                      {vendor.email}
                    </a>
                  </div>
                )}
                {vendor.notes && (
                  <p className="text-[11px] text-slate-500 italic bg-slate-50 p-2 rounded-lg border border-slate-100">
                    Notes: {vendor.notes}
                  </p>
                )}
              </div>

              {/* Call Button Box */}
              <div className="flex flex-col sm:items-end justify-center">
                {hasPhone ? (
                  <div className="space-y-1.5 text-right">
                    <a
                      href={`tel:${vendor.contact_number}`}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                      title={`Call ${vendor.contact_number}`}
                    >
                      <PhoneCall className="w-4 h-4" />
                      <span>CALL: {vendor.contact_number}</span>
                    </a>
                    {vendor.alt_contact_number && (
                      <p className="text-[11px] text-slate-400">
                        Alt: <a href={`tel:${vendor.alt_contact_number}`} className="underline hover:text-slate-700">{vendor.alt_contact_number}</a>
                      </p>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-slate-400 italic">No phone number on record</span>
                )}
              </div>
            </div>
          </div>

          {/* Complete Bank Account Card */}
          <div className="lg:w-80 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs shrink-0">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="font-bold text-slate-800 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                <Landmark className="w-3.5 h-3.5 text-slate-600" />
                Disbursement Bank
              </span>
              {vendor.bank_account_number && (
                <button
                  type="button"
                  onClick={copyBankToClipboard}
                  className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                >
                  {copiedBank ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedBank ? 'Copied' : 'Copy A/C'}</span>
                </button>
              )}
            </div>

            {vendor.bank_name ? (
              <div className="space-y-1.5 text-slate-700">
                <div className="font-semibold text-slate-900 text-sm">{vendor.bank_name}</div>
                {vendor.bank_branch && (
                  <div className="text-[11px] text-slate-500">Branch: {vendor.bank_branch}</div>
                )}
                <div>
                  <span className="text-[11px] text-slate-400 block">Account Number:</span>
                  <span className="font-mono font-bold text-sm text-slate-900 select-all tracking-wide">
                    {vendor.bank_account_number || '—'}
                  </span>
                </div>
                {vendor.bank_account_holder && (
                  <div>
                    <span className="text-[11px] text-slate-400 block">Account Holder:</span>
                    <span className="font-semibold text-slate-800">{vendor.bank_account_holder}</span>
                  </div>
                )}
                {vendor.account_type && (
                  <div className="text-[11px] text-slate-500">Type: {vendor.account_type}</div>
                )}
              </div>
            ) : (
              <div className="py-4 text-center text-slate-400 italic">
                No bank disbursement account registered
              </div>
            )}
          </div>
        </div>

        {/* The 6 Summary KPIs Strip */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-5 border-t border-slate-100">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-[11px] text-slate-400 uppercase font-bold block">Purchases Count</span>
            <span className="text-base font-bold text-slate-900 tabular-nums">
              {summary.total_purchases_count}
            </span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-[11px] text-slate-400 uppercase font-bold block">Purchase Amount</span>
            <span className="text-base font-bold text-slate-900 tabular-nums">
              {formatNPR(summary.total_purchase_amount)}
            </span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-[11px] text-slate-400 uppercase font-bold block">Total VAT (13%)</span>
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
            <span
              className={`text-base font-bold tabular-nums ${
                summary.total_unpaid_amount > 0 ? 'text-amber-700' : 'text-slate-900'
              }`}
            >
              {formatNPR(summary.total_unpaid_amount)}
            </span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-[11px] text-slate-400 uppercase font-bold block">Pending VAT Bills</span>
            <span
              className={`text-base font-bold tabular-nums ${
                summary.pending_vat_bills_count > 0 ? 'text-amber-700' : 'text-slate-900'
              }`}
            >
              {summary.pending_vat_bills_count}
            </span>
          </div>
        </div>
      </div>

      {/* Tabbed Section: Purchase Records vs Payment History */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Tab Headers */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('purchases')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-2 ${
                activeTab === 'purchases'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Purchase Records ({purchases.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('payments')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-2 ${
                activeTab === 'payments'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Payment History ({payments.length})</span>
            </button>
          </div>

          {activeTab === 'purchases' && (
            <Link
              to="/purchases/new"
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1"
            >
              <span>+ New Purchase</span>
            </Link>
          )}
        </div>

        {/* Tab Content: Purchases */}
        {activeTab === 'purchases' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">Code & Bill</th>
                  <th className="px-4 py-3 whitespace-nowrap">Purchase Date</th>
                  <th className="px-4 py-3 min-w-[200px]">Product / Items</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Taxable Amt</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">13% VAT</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap font-bold text-slate-900">Total Amt</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Paid Amt</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap">VAT Status</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap">Payment Status</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {purchases.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-slate-400">
                      No purchase entries recorded for this vendor yet.
                    </td>
                  </tr>
                ) : (
                  purchases.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap font-semibold">
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
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                        <div className="font-semibold text-slate-800">{p.purchase_date_bs} BS</div>
                        <div className="text-[11px] text-slate-400">{p.purchase_date_ad} AD</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="line-clamp-2 text-slate-800 font-medium max-w-[260px]">
                          {p.product_summary}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                        {formatNPR(p.purchase_amount)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-emerald-700 font-medium">
                        {formatNPR(p.vat_amount)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-900">
                        {formatNPR(p.total_amount)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-emerald-700">
                        {formatNPR(p.paid_amount)}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <VatStatusBadge status={p.vat_bill_status} size="sm" />
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <PaymentStatusBadge status={p.payment_status} size="sm" />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Link
                          to={`/purchases/${p.id}`}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-semibold text-[11px] transition-colors"
                        >
                          Inspect
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab Content: Payments */}
        {activeTab === 'payments' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">Payment ID</th>
                  <th className="px-4 py-3 whitespace-nowrap">Payment Date</th>
                  <th className="px-4 py-3 whitespace-nowrap">Purchase Code</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap font-bold text-slate-900">Amount</th>
                  <th className="px-4 py-3 whitespace-nowrap">Method</th>
                  <th className="px-4 py-3 whitespace-nowrap">Company Account</th>
                  <th className="px-4 py-3 whitespace-nowrap">Transaction Ref</th>
                  <th className="px-4 py-3 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Voucher Slip</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                      No disbursements or payments recorded for this vendor yet.
                    </td>
                  </tr>
                ) : (
                  payments.map((pay) => (
                    <tr
                      key={pay.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        pay.is_voided ? 'bg-rose-50/40 text-rose-900 line-through opacity-70' : ''
                      }`}
                    >
                      <td className="px-4 py-3 font-mono font-semibold text-slate-800">
                        #{pay.id}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                        <div className="font-semibold text-slate-800">{pay.payment_date_bs} BS</div>
                        <div className="text-[11px] text-slate-400">{pay.payment_date_ad} AD</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-semibold">
                        <Link
                          to={`/purchases/${pay.purchase_id}`}
                          className="text-indigo-600 hover:underline"
                        >
                          {pay.purchase_code || `Purchase #${pay.purchase_id}`}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap font-bold text-slate-900 tabular-nums">
                        {formatNPR(pay.amount)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-700">
                        {pay.payment_method}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600 font-mono text-[11px]">
                        {pay.company_bank_account || '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600 font-mono text-[11px]">
                        {pay.transaction_ref || '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {pay.is_voided ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-600 text-white">
                            VOIDED
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {pay.slip ? (
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewUrl(api.files.paymentSlipUrl(pay.slip!.id));
                              setPreviewFilename(pay.slip!.original_name || pay.slip!.file_name);
                              setPreviewTitle(`Payment Slip #${pay.slip!.id}`);
                              setPreviewOpen(true);
                            }}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-semibold flex items-center gap-1 ml-auto"
                          >
                            <FileText className="w-3 h-3" />
                            View Slip
                          </button>
                        ) : (
                          <span className="text-slate-300 italic text-[11px]">None</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* Edit Vendor Modal                                              */}
      {/* ============================================================== */}
      {editModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-xs animate-fade-in"
          role="dialog"
          aria-modal="true"
          onClick={() => setEditModalOpen(false)}
        >
          <div
            className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-teal-400" />
                <span>Edit Vendor: {vendor.company_name}</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Company Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formCompanyName}
                  onChange={(e) => setFormCompanyName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-emerald-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    PAN Number
                  </label>
                  <input
                    type="text"
                    value={formPanNumber}
                    onChange={(e) => setFormPanNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 focus:outline-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    VAT Number
                  </label>
                  <input
                    type="text"
                    value={formVatNumber}
                    onChange={(e) => setFormVatNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 focus:outline-emerald-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Contact Person
                  </label>
                  <input
                    type="text"
                    value={formContactPerson}
                    onChange={(e) => setFormContactPerson(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Primary Phone (CALL button)
                  </label>
                  <input
                    type="tel"
                    value={formContactNumber}
                    onChange={(e) => setFormContactNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 focus:outline-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Alt. Phone
                  </label>
                  <input
                    type="tel"
                    value={formAltContactNumber}
                    onChange={(e) => setFormAltContactNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 focus:outline-emerald-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Address
                  </label>
                  <input
                    type="text"
                    value={formAddress}
                    onChange={(e) => setFormAddress(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-emerald-600"
                  />
                </div>
              </div>

              {/* Bank Details */}
              <div className="pt-2 border-t border-slate-200">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                  Disbursement Bank Account
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Bank Name
                    </label>
                    <input
                      type="text"
                      value={formBankName}
                      onChange={(e) => setFormBankName(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Branch
                    </label>
                    <input
                      type="text"
                      value={formBankBranch}
                      onChange={(e) => setFormBankBranch(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-emerald-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Account Holder
                    </label>
                    <input
                      type="text"
                      value={formBankAccountHolder}
                      onChange={(e) => setFormBankAccountHolder(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Account Number
                    </label>
                    <input
                      type="text"
                      value={formBankAccountNumber}
                      onChange={(e) => setFormBankAccountNumber(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Account Type
                    </label>
                    <input
                      type="text"
                      value={formAccountType}
                      onChange={(e) => setFormAccountType(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-emerald-600"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Notes
                </label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-emerald-600"
                />
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-slate-700 select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                />
                <span className="font-semibold">Active Vendor</span>
              </label>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !formCompanyName.trim()}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
                >
                  {isSubmitting ? 'Saving...' : 'Update Vendor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Slip Document Preview Modal */}
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
