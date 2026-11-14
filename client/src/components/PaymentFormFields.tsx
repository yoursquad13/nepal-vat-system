import { X, Receipt } from 'lucide-react';
import { formatNPR } from '../utils/money';
import { BsAdDatePicker, BsAdDateValue } from './BsAdDatePicker';
import { getNowNpt } from '../utils/nepaliDate';

export interface PaymentFormState {
  amount: string;
  paymentDateBs: string;
  paymentDateAd: string;
  paymentMethod: string;
  companyBankAccount: string;
  transactionRef: string;
  remarks: string;
  slipFile: File | null;
}

export function createInitialPaymentFormState(remainingBalance: number): PaymentFormState {
  const now = getNowNpt();
  return {
    amount: remainingBalance > 0 ? String(remainingBalance) : '',
    paymentDateBs: now.dateBs,
    paymentDateAd: now.dateAd,
    paymentMethod: 'BANK_TRANSFER',
    companyBankAccount: '',
    transactionRef: '',
    remarks: '',
    slipFile: null,
  };
}

export function validateAndBuildPaymentFormData(
  state: PaymentFormState,
  remainingBalance: number
): { formData: FormData; numAmount: number; error?: never } | { error: string; formData?: never; numAmount?: never } {
  const numAmount = Number(state.amount);
  if (Number.isNaN(numAmount) || numAmount <= 0) {
    return { error: 'Please enter a valid positive payment amount.' };
  }

  if (numAmount > remainingBalance) {
    return {
      error: `Payment amount (Rs. ${numAmount}) exceeds the remaining balance of Rs. ${remainingBalance}.`,
    };
  }

  const fd = new FormData();
  fd.append('amount', String(numAmount));
  fd.append('payment_date_ad', state.paymentDateAd);
  fd.append('payment_date_bs', state.paymentDateBs);
  fd.append('payment_method', state.paymentMethod);

  if (state.companyBankAccount.trim()) {
    fd.append('company_bank_account', state.companyBankAccount.trim());
  }
  if (state.transactionRef.trim()) {
    fd.append('transaction_ref', state.transactionRef.trim());
  }
  if (state.remarks.trim()) {
    fd.append('remarks', state.remarks.trim());
  }
  if (state.slipFile) {
    fd.append('file', state.slipFile);
  }

  return { formData: fd, numAmount };
}

interface PaymentFormFieldsProps {
  value: PaymentFormState;
  onChange: (next: PaymentFormState) => void;
  remainingBalance: number;
  disabled?: boolean;
}

/**
 * Shared payment input fields reused across RecordPaymentModal and ApprovePurchaseModal.
 */
export function PaymentFormFields({
  value,
  onChange,
  remainingBalance,
  disabled = false,
}: PaymentFormFieldsProps) {
  const update = <K extends keyof PaymentFormState>(key: K, fieldVal: PaymentFormState[K]) => {
    onChange({ ...value, [key]: fieldVal });
  };

  return (
    <div className="space-y-4">
      {/* Amount Input with Quick Fill */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-semibold text-slate-700">
            Payment Amount (NPR) <span className="text-rose-500">*</span>
          </label>
          {remainingBalance > 0 && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => update('amount', String(remainingBalance))}
              className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 underline cursor-pointer disabled:opacity-50"
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
            disabled={disabled}
            value={value.amount}
            onChange={(e) => update('amount', e.target.value)}
            placeholder="0.00"
            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 font-semibold tabular-nums focus:outline-emerald-600 focus:border-emerald-600 disabled:bg-slate-50"
          />
        </div>
      </div>

      {/* Date Picker (BS + AD) */}
      <BsAdDatePicker
        label="Payment Date (BS & AD)"
        valueBs={value.paymentDateBs}
        valueAd={value.paymentDateAd}
        onChange={(val: BsAdDateValue) => {
          onChange({ ...value, paymentDateBs: val.bs, paymentDateAd: val.ad });
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
            disabled={disabled}
            value={value.paymentMethod}
            onChange={(e) => update('paymentMethod', e.target.value)}
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-emerald-600 disabled:bg-slate-50"
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
            disabled={disabled}
            value={value.companyBankAccount}
            onChange={(e) => update('companyBankAccount', e.target.value)}
            placeholder="e.g. Nabil Bank Current A/C"
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-emerald-600 disabled:bg-slate-50"
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
          disabled={disabled}
          value={value.transactionRef}
          onChange={(e) => update('transactionRef', e.target.value)}
          placeholder="e.g. TXN-1092837 or Cheque # 001928"
          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-emerald-600 disabled:bg-slate-50"
        />
      </div>

      {/* Optional Bank Slip / Receipt Upload */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
          Payment Receipt / Bank Slip Attachment (Optional)
        </label>
        <div className="border border-dashed border-slate-300 rounded-xl p-3 bg-slate-50 hover:bg-slate-100/80 transition-colors">
          <input
            type="file"
            accept="image/*,.pdf"
            disabled={disabled}
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                update('slipFile', e.target.files[0]);
              }
            }}
            className="block w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-emerald-600 file:text-white hover:file:bg-emerald-700 cursor-pointer"
          />
          {value.slipFile && (
            <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-emerald-700 font-medium bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
              <span className="flex items-center gap-1.5 truncate">
                <Receipt className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  {value.slipFile.name} ({(value.slipFile.size / 1024).toFixed(1)} KB)
                </span>
              </span>
              <button
                type="button"
                onClick={() => update('slipFile', null)}
                className="p-0.5 rounded hover:bg-emerald-200/60 text-emerald-800 cursor-pointer"
                title="Remove attachment"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Payment Remarks */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
          Payment Remarks / Notes
        </label>
        <textarea
          rows={2}
          disabled={disabled}
          value={value.remarks}
          onChange={(e) => update('remarks', e.target.value)}
          placeholder="Optional payment notes or payee details..."
          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-emerald-600 disabled:bg-slate-50"
        />
      </div>
    </div>
  );
}
