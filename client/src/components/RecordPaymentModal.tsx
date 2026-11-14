import { useState, useEffect } from 'react';
import {
  X,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { api } from '../api/client';
import { useToast } from '../context/ToastContext';
import { formatNPR } from '../utils/money';
import { BsAdDatePicker, BsAdDateValue } from './BsAdDatePicker';
import { getNowNpt } from '../utils/nepaliDate';

export interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  purchase: {
    id: number;
    purchase_code: string;
    vendor_name?: string;
    total_amount: number;
    paid_amount: number;
    remaining_balance?: number;
    vat_bill_status?: string;
    review_status?: string;
  } | null;
}

export function RecordPaymentModal({
  isOpen,
  onClose,
  onSuccess,
  purchase,
}: RecordPaymentModalProps) {
  const { success: toastSuccess, error: toastError } = useToast();

  const [amount, setAmount] = useState<string>('');
  const [paymentDateBs, setPaymentDateBs] = useState<string>('');
  const [paymentDateAd, setPaymentDateAd] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('BANK_TRANSFER');
  const [companyBankAccount, setCompanyBankAccount] = useState<string>('');
  const [transactionRef, setTransactionRef] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initialize or reset form on open
  useEffect(() => {
    if (isOpen && purchase) {
      const remaining =
        purchase.remaining_balance !== undefined
          ? purchase.remaining_balance
          : Math.max(0, purchase.total_amount - purchase.paid_amount);

      setAmount(remaining > 0 ? String(remaining) : '');
      const now = getNowNpt();
      setPaymentDateBs(now.dateBs);
      setPaymentDateAd(now.dateAd);
      setPaymentMethod('BANK_TRANSFER');
      setCompanyBankAccount('');
      setTransactionRef('');
      setRemarks('');
      setSlipFile(null);
      setErrorMsg(null);
    }
  }, [isOpen, purchase]);

  if (!isOpen || !purchase) return null;

  const remainingBalance =
    purchase.remaining_balance !== undefined
      ? purchase.remaining_balance
      : Math.max(0, purchase.total_amount - purchase.paid_amount);

  const isVatBillPending = purchase.vat_bill_status === 'VAT BILL PENDING';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const numAmount = Number(amount);
    if (Number.isNaN(numAmount) || numAmount <= 0) {
      setErrorMsg('Please enter a valid positive payment amount.');
      return;
    }

    if (numAmount > remainingBalance) {
      setErrorMsg(
        `Payment amount (Rs. ${numAmount}) exceeds the remaining balance of Rs. ${remainingBalance}.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('amount', String(numAmount));
      fd.append('payment_date_ad', paymentDateAd);
      fd.append('payment_date_bs', paymentDateBs);
      fd.append('payment_method', paymentMethod);

      if (companyBankAccount.trim()) {
        fd.append('company_bank_account', companyBankAccount.trim());
      }
      if (transactionRef.trim()) {
        fd.append('transaction_ref', transactionRef.trim());
      }
      if (remarks.trim()) {
        fd.append('remarks', remarks.trim());
      }
      if (slipFile) {
        fd.append('file', slipFile);
      }

      await api.payments.recordPayment(purchase.id, fd);
      toastSuccess(
        `Payment of ${formatNPR(numAmount)} recorded for ${purchase.purchase_code}.`,
        'Payment Recorded'
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to record payment');
      toastError(err.message || 'Failed to record payment', 'Payment Error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-xs animate-fade-in"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Record Vendor Payment</h3>
              <p className="text-xs text-slate-400">
                Purchase #{purchase.purchase_code}
                {purchase.vendor_name ? ` · ${purchase.vendor_name}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Balance Strip */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs shrink-0">
          <div>
            <span className="text-slate-500">Total Purchase:</span>{' '}
            <span className="font-semibold text-slate-800 tabular-nums">
              {formatNPR(purchase.total_amount)}
            </span>
          </div>
          <div>
            <span className="text-slate-500">Already Paid:</span>{' '}
            <span className="font-semibold text-emerald-700 tabular-nums">
              {formatNPR(purchase.paid_amount)}
            </span>
          </div>
          <div>
            <span className="text-slate-500">Remaining Balance:</span>{' '}
            <span className="font-bold text-amber-700 tabular-nums text-sm">
              {formatNPR(remainingBalance)}
            </span>
          </div>
        </div>

        {/* VAT Bill Informational Note (Never blocks payment) */}
        {isVatBillPending && (
          <div className="px-6 py-2.5 bg-amber-50 border-b border-amber-200 flex items-start gap-2.5 text-xs text-amber-900 shrink-0">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold">VAT Bill Pending:</strong> The physical VAT bill has not been received yet. Payment authorization is fully permitted; this reminder is for tracking purposes.
            </div>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Amount Input with Quick Fill */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Payment Amount (NPR) <span className="text-rose-500">*</span>
              </label>
              {remainingBalance > 0 && (
                <button
                  type="button"
                  onClick={() => setAmount(String(remainingBalance))}
                  className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 underline cursor-pointer"
                >
                  Pay Full Balance ({formatNPR(remainingBalance)})
                </button>
              )}
            </div>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs font-semibold text-slate-400">Rs.</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={remainingBalance}
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 font-semibold tabular-nums focus:outline-emerald-600 focus:border-emerald-600"
              />
            </div>
          </div>

          {/* Date Picker (BS + AD) */}
          <BsAdDatePicker
            label="Payment Date (BS & AD)"
            valueBs={paymentDateBs}
            valueAd={paymentDateAd}
            onChange={(val: BsAdDateValue) => {
              setPaymentDateBs(val.bs);
              setPaymentDateAd(val.ad);
            }}
            required
          />

          {/* Payment Method & Company Bank Account */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Payment Method <span className="text-rose-500">*</span>
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-emerald-600"
              >
                <option value="BANK_TRANSFER">Bank Transfer (IPS / RTGS / ConnectIPS)</option>
                <option value="CHEQUE">Bank Cheque</option>
                <option value="CASH">Cash Payment</option>
                <option value="ESEWA_KHALTI">Digital Wallet (eSewa / Khalti)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Company Bank Account / Source
              </label>
              <input
                type="text"
                value={companyBankAccount}
                onChange={(e) => setCompanyBankAccount(e.target.value)}
                placeholder="e.g. Nabil Bank Current A/C"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-emerald-600"
              />
            </div>
          </div>

          {/* Transaction Ref / Cheque No */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Transaction Ref / Cheque Number
            </label>
            <input
              type="text"
              value={transactionRef}
              onChange={(e) => setTransactionRef(e.target.value)}
              placeholder="e.g. TXN-1092837 or Cheque # 001928"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-emerald-600"
            />
          </div>

          {/* Optional Bank Slip Upload */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Payment Voucher / Slip Attachment (Optional)
            </label>
            <div className="border border-dashed border-slate-300 rounded-xl p-3 bg-slate-50 hover:bg-slate-100/80 transition-colors">
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setSlipFile(e.target.files[0]);
                  }
                }}
                className="block w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-emerald-600 file:text-white hover:file:bg-emerald-700 cursor-pointer"
              />
              {slipFile && (
                <p className="mt-1.5 text-[11px] text-emerald-700 font-medium">
                  Selected: {slipFile.name} ({(slipFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>
          </div>

          {/* Remarks */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Payment Remarks / Notes
            </label>
            <textarea
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Optional payment notes or payee details..."
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-emerald-600"
            />
          </div>

          {/* Modal Actions */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || Number(amount) <= 0}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Recording...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Confirm & Record Payment
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
