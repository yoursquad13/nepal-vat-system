import { useState, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  X,
  CreditCard,
  AlertTriangle,
  AlertCircle,
} from 'lucide-react';
import { api } from '../api/client';
import { useToast } from '../context/ToastContext';
import { formatNPR } from '../utils/money';
import {
  PaymentFormFields,
  PaymentFormState,
  createInitialPaymentFormState,
  validateAndBuildPaymentFormData,
} from './PaymentFormFields';

export interface ApprovePurchaseModalProps {
  isOpen: boolean;
  actionType: 'APPROVE' | 'REJECT';
  purchase: {
    id: number;
    purchase_code: string;
    vendor_name?: string;
    total_amount: number;
    paid_amount: number;
    remaining_balance?: number;
    vat_bill_status?: string;
  } | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function ApprovePurchaseModal({
  isOpen,
  actionType,
  purchase,
  onClose,
  onSuccess,
}: ApprovePurchaseModalProps) {
  const { success: toastSuccess, info: toastInfo, error: toastError } = useToast();

  const [remarks, setRemarks] = useState<string>('');
  const [markAsPaid, setMarkAsPaid] = useState<boolean>(true);
  const [paymentState, setPaymentState] = useState<PaymentFormState>(() =>
    createInitialPaymentFormState(0)
  );
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const remainingBalance = purchase
    ? purchase.remaining_balance !== undefined
      ? purchase.remaining_balance
      : Math.max(0, Number(purchase.total_amount || 0) - Number(purchase.paid_amount || 0))
    : 0;

  useEffect(() => {
    if (isOpen && purchase) {
      const rem =
        purchase.remaining_balance !== undefined
          ? purchase.remaining_balance
          : Math.max(0, Number(purchase.total_amount || 0) - Number(purchase.paid_amount || 0));
      setRemarks('');
      setMarkAsPaid(actionType === 'APPROVE' && rem > 0);
      setPaymentState(createInitialPaymentFormState(rem));
      setErrorMsg(null);
    }
  }, [isOpen, actionType, purchase]);

  if (!isOpen || !purchase) return null;

  const isVatBillPending = purchase.vat_bill_status === 'VAT BILL PENDING';
  const willRecordPayment = actionType === 'APPROVE' && markAsPaid && remainingBalance > 0;
  const enteredAmount = Number(paymentState.amount || 0);
  const isFullSettlement =
    willRecordPayment && !Number.isNaN(enteredAmount) && enteredAmount >= remainingBalance - 0.001;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (actionType === 'REJECT' && !remarks.trim()) {
      setErrorMsg('Rejection reason is required.');
      return;
    }

    let builtPayment: ReturnType<typeof validateAndBuildPaymentFormData> | null = null;
    if (willRecordPayment) {
      builtPayment = validateAndBuildPaymentFormData(paymentState, remainingBalance);
      if (builtPayment.error !== undefined) {
        setErrorMsg(builtPayment.error);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (actionType === 'REJECT') {
        await api.purchases.reject(purchase.id, { reason: remarks.trim() });
        toastInfo(`Purchase ${purchase.purchase_code} has been rejected.`, 'Entry Rejected');
        onSuccess();
        onClose();
        return;
      }

      // 1. Approve purchase entry first
      await api.purchases.approve(purchase.id, {
        admin_remarks: remarks.trim() || undefined,
      });

      // 2. Optionally record payment & upload receipt right away
      if (willRecordPayment && builtPayment && builtPayment.formData) {
        try {
          await api.payments.recordPayment(purchase.id, builtPayment.formData);
          toastSuccess(
            `Purchase ${purchase.purchase_code} approved and payment of ${formatNPR(
              builtPayment.numAmount
            )} recorded.`,
            isFullSettlement ? 'Approved & Marked Paid' : 'Approved & Payment Recorded'
          );
          onSuccess();
          onClose();
        } catch (payErr: any) {
          // Approval already succeeded; refresh parent state and surface payment error clearly
          onSuccess();
          const msg =
            payErr?.message ||
            'Purchase was approved, but recording the payment failed. Use the Pay button to retry.';
          setErrorMsg(msg);
          toastError(msg, 'Approved — Payment Failed');
        }
      } else {
        toastSuccess(
          `Purchase ${purchase.purchase_code} approved for payment processing.`,
          'Entry Approved'
        );
        onSuccess();
        onClose();
      }
    } catch (err: any) {
      const msg = err?.message || 'Failed to update purchase entry status';
      setErrorMsg(msg);
      toastError(msg, 'Action Failed');
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
        className={`w-full ${
          willRecordPayment ? 'max-w-xl' : 'max-w-md'
        } bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] transition-all`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`px-6 py-4 text-white flex items-center justify-between shrink-0 ${
            actionType === 'APPROVE' ? 'bg-emerald-600' : 'bg-rose-600'
          }`}
        >
          <h3 className="text-base font-bold flex items-center gap-2">
            {actionType === 'APPROVE' ? (
              <>
                <CheckCircle2 className="w-5 h-5" />
                <span>Approve Purchase Entry</span>
              </>
            ) : (
              <>
                <XCircle className="w-5 h-5" />
                <span>Reject Purchase Entry</span>
              </>
            )}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Purchase Summary Banner */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 space-y-1">
            <p>
              You are about to {actionType.toLowerCase()} entry{' '}
              <strong className="text-slate-900">{purchase.purchase_code}</strong>
              {purchase.vendor_name ? (
                <>
                  {' '}
                  from <strong className="text-slate-900">{purchase.vendor_name}</strong>
                </>
              ) : null}
              .
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-1 text-[11px]">
              <span>
                Total:{' '}
                <strong className="text-slate-900 tabular-nums">
                  {formatNPR(purchase.total_amount)}
                </strong>
              </span>
              {purchase.paid_amount > 0 && (
                <span>
                  Paid:{' '}
                  <strong className="text-emerald-700 tabular-nums">
                    {formatNPR(purchase.paid_amount)}
                  </strong>
                </span>
              )}
              <span>
                Remaining:{' '}
                <strong className="text-amber-700 tabular-nums">
                  {formatNPR(remainingBalance)}
                </strong>
              </span>
            </div>
          </div>

          {/* Remarks / Rejection Reason */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {actionType === 'APPROVE'
                ? 'Admin Approval Remarks (Optional)'
                : 'Rejection Reason (Required)'}{' '}
              {actionType === 'REJECT' && <span className="text-rose-500">*</span>}
            </label>
            <textarea
              rows={2}
              required={actionType === 'REJECT'}
              disabled={isSubmitting}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder={
                actionType === 'APPROVE'
                  ? 'e.g. Rate and delivery verified; approved.'
                  : 'e.g. Mismatched bill totals; please update line item prices.'
              }
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-emerald-600 disabled:bg-slate-50"
            />
          </div>

          {/* Mark as Paid Toggle + Payment & Receipt Section (Approve only when balance > 0) */}
          {actionType === 'APPROVE' && remainingBalance > 0 && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 overflow-hidden">
              <label className="flex items-start gap-3 p-3.5 cursor-pointer select-none hover:bg-emerald-50/70 transition-colors">
                <input
                  type="checkbox"
                  checked={markAsPaid}
                  disabled={isSubmitting}
                  onChange={(e) => setMarkAsPaid(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-emerald-400 text-emerald-600 focus:ring-emerald-600 cursor-pointer"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                    <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Also mark vendor as Paid now & add receipt/payment details</span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Uncheck to approve only and record payment later from Vendor Payments.
                  </p>
                </div>
              </label>

              {markAsPaid && (
                <div className="p-4 bg-white border-t border-emerald-200 space-y-4">
                  {isVatBillPending && (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 text-[11px] text-amber-900">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <span>
                        <strong>VAT Bill Pending:</strong> Payment is still allowed and can be
                        recorded before the VAT bill arrives.
                      </span>
                    </div>
                  )}

                  <PaymentFormFields
                    value={paymentState}
                    onChange={setPaymentState}
                    remainingBalance={remainingBalance}
                    disabled={isSubmitting}
                  />
                </div>
              )}
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                isSubmitting ||
                (actionType === 'REJECT' && !remarks.trim()) ||
                (willRecordPayment && Number(paymentState.amount) <= 0)
              }
              className={`px-4 py-2 text-white rounded-lg text-xs font-bold transition-colors shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer ${
                actionType === 'APPROVE'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Processing...
                </>
              ) : actionType === 'REJECT' ? (
                'Confirm Rejection'
              ) : willRecordPayment ? (
                isFullSettlement ? (
                  'Approve & Mark Paid'
                ) : (
                  'Approve & Record Payment'
                )
              ) : (
                'Confirm Approval'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
