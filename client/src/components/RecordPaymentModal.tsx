import { useState, useEffect } from 'react';
import { X, CreditCard, AlertCircle, CheckCircle2, AlertTriangle } from 'lucide-react';
import { api } from '../api/client';
import { useToast } from '../context/ToastContext';
import { formatNPR } from '../utils/money';
import {
  PaymentFormFields,
  PaymentFormState,
  createInitialPaymentFormState,
  validateAndBuildPaymentFormData,
} from './PaymentFormFields';

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

  const [formState, setFormState] = useState<PaymentFormState>(() =>
    createInitialPaymentFormState(0)
  );
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && purchase) {
      const remaining =
        purchase.remaining_balance !== undefined
          ? purchase.remaining_balance
          : Math.max(0, purchase.total_amount - purchase.paid_amount);

      setFormState(createInitialPaymentFormState(remaining));
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

    const built = validateAndBuildPaymentFormData(formState, remainingBalance);
    if (built.error !== undefined) {
      setErrorMsg(built.error);
      return;
    }

    setIsSubmitting(true);
    try {
      await api.payments.recordPayment(purchase.id, built.formData);
      toastSuccess(
        `Payment of ${formatNPR(built.numAmount)} recorded for ${purchase.purchase_code}.`,
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

          <PaymentFormFields
            value={formState}
            onChange={setFormState}
            remainingBalance={remainingBalance}
            disabled={isSubmitting}
          />

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
              disabled={isSubmitting || Number(formState.amount) <= 0}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
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
