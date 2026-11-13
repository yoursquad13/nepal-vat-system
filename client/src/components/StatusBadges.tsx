import {
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  MinusCircle,
  Check,
  CreditCard,
  PackageCheck,
  PackageX,
  Percent,
} from 'lucide-react';
import { VatBillStatus, PaymentStatus, ReviewStatus, TaxType, VatCalcMode } from '../api/client';

interface BadgeProps {
  className?: string;
  size?: 'sm' | 'md';
}

/**
 * VAT Bill Status Badge
 * Matches: 'VAT BILL RECEIVED' | 'VAT BILL PENDING' | 'VAT BILL VERIFIED' | 'VAT BILL REJECTED' | 'NOT APPLICABLE'
 */
export function VatStatusBadge({
  status,
  size = 'sm',
  className = '',
}: {
  status: VatBillStatus | string;
} & BadgeProps) {
  const normalized = (status || '').toUpperCase().trim();
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  if (normalized === 'VAT BILL VERIFIED' || normalized === 'VERIFIED') {
    return (
      <span
        className={`inline-flex items-center gap-1 font-semibold rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200 ${sizeClasses} ${className}`}
      >
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
        <span>VAT Verified</span>
      </span>
    );
  }

  if (normalized === 'VAT BILL RECEIVED' || normalized === 'RECEIVED') {
    return (
      <span
        className={`inline-flex items-center gap-1 font-semibold rounded-full border bg-sky-50 text-sky-700 border-sky-200 ${sizeClasses} ${className}`}
      >
        <FileText className="w-3.5 h-3.5 text-sky-600 shrink-0" />
        <span>VAT Bill Received</span>
      </span>
    );
  }

  if (normalized === 'VAT BILL PENDING' || normalized === 'PENDING') {
    return (
      <span
        className={`inline-flex items-center gap-1 font-semibold rounded-full border bg-amber-50 text-amber-800 border-amber-200 ${sizeClasses} ${className}`}
      >
        <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
        <span>VAT Bill Pending</span>
      </span>
    );
  }

  if (normalized === 'VAT BILL REJECTED' || normalized === 'REJECTED') {
    return (
      <span
        className={`inline-flex items-center gap-1 font-semibold rounded-full border bg-rose-50 text-rose-700 border-rose-200 ${sizeClasses} ${className}`}
      >
        <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
        <span>VAT Bill Rejected</span>
      </span>
    );
  }

  // NOT APPLICABLE / default
  return (
    <span
      className={`inline-flex items-center gap-1 font-medium rounded-full border bg-slate-100 text-slate-600 border-slate-200 ${sizeClasses} ${className}`}
    >
      <MinusCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      <span>Non-VAT / Exempt</span>
    </span>
  );
}

/**
 * Payment Status Badge
 * Matches: 'PAYMENT PENDING' | 'APPROVED' | 'PARTIALLY PAID' | 'PAID'
 */
export function PaymentStatusBadge({
  status,
  size = 'sm',
  className = '',
}: {
  status: PaymentStatus | string;
} & BadgeProps) {
  const normalized = (status || '').toUpperCase().trim();
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  if (normalized === 'PAID') {
    return (
      <span
        className={`inline-flex items-center gap-1 font-semibold rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200 ${sizeClasses} ${className}`}
      >
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
        <span>Paid</span>
      </span>
    );
  }

  if (normalized === 'PARTIALLY PAID') {
    return (
      <span
        className={`inline-flex items-center gap-1 font-semibold rounded-full border bg-purple-50 text-purple-700 border-purple-200 ${sizeClasses} ${className}`}
      >
        <CreditCard className="w-3.5 h-3.5 text-purple-600 shrink-0" />
        <span>Partially Paid</span>
      </span>
    );
  }

  if (normalized === 'APPROVED') {
    return (
      <span
        className={`inline-flex items-center gap-1 font-semibold rounded-full border bg-indigo-50 text-indigo-700 border-indigo-200 ${sizeClasses} ${className}`}
      >
        <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
        <span>Approved for Payment</span>
      </span>
    );
  }

  // PAYMENT PENDING
  return (
    <span
      className={`inline-flex items-center gap-1 font-semibold rounded-full border bg-amber-50 text-amber-800 border-amber-200 ${sizeClasses} ${className}`}
    >
      <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
      <span>Payment Pending</span>
    </span>
  );
}

/**
 * Review Status Badge
 * Matches: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED'
 */
export function ReviewStatusBadge({
  status,
  size = 'sm',
  className = '',
}: {
  status: ReviewStatus | string;
} & BadgeProps) {
  const normalized = (status || '').toUpperCase().trim();
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  if (normalized === 'APPROVED') {
    return (
      <span
        className={`inline-flex items-center gap-1 font-semibold rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200 ${sizeClasses} ${className}`}
      >
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
        <span>Approved</span>
      </span>
    );
  }

  if (normalized === 'REJECTED') {
    return (
      <span
        className={`inline-flex items-center gap-1 font-semibold rounded-full border bg-rose-50 text-rose-700 border-rose-200 ${sizeClasses} ${className}`}
      >
        <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
        <span>Rejected</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 font-semibold rounded-full border bg-amber-50 text-amber-800 border-amber-200 ${sizeClasses} ${className}`}
    >
      <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
      <span>Pending Review</span>
    </span>
  );
}

/**
 * Stock Health Status Badge
 */
export function StockStatusBadge({
  currentStock,
  minStockLevel,
  size = 'sm',
  className = '',
}: {
  currentStock: number;
  minStockLevel: number;
} & BadgeProps) {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  if (currentStock <= 0) {
    return (
      <span
        className={`inline-flex items-center gap-1 font-semibold rounded-full border bg-rose-50 text-rose-700 border-rose-200 ${sizeClasses} ${className}`}
      >
        <PackageX className="w-3.5 h-3.5 text-rose-600 shrink-0" />
        <span>Out of Stock</span>
      </span>
    );
  }

  if (currentStock <= minStockLevel) {
    return (
      <span
        className={`inline-flex items-center gap-1 font-semibold rounded-full border bg-amber-50 text-amber-800 border-amber-200 ${sizeClasses} ${className}`}
      >
        <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
        <span>Low Stock</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 font-semibold rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200 ${sizeClasses} ${className}`}
    >
      <PackageCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
      <span>In Stock</span>
    </span>
  );
}

/**
 * Tax Type & VAT Calculation Mode Badge
 */
export function TaxBadge({
  taxType,
  vatCalcMode,
  size = 'sm',
  className = '',
}: {
  taxType: TaxType | string;
  vatCalcMode?: VatCalcMode | string;
} & BadgeProps) {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  if (taxType === 'NON_VAT') {
    return (
      <span
        className={`inline-flex items-center gap-1 font-medium rounded-md border bg-slate-100 text-slate-700 border-slate-200 ${sizeClasses} ${className}`}
      >
        <MinusCircle className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        <span>Non-VAT</span>
      </span>
    );
  }

  const isExclusive = vatCalcMode === 'EXCLUSIVE';
  return (
    <span
      className={`inline-flex items-center gap-1 font-medium rounded-md border ${
        isExclusive
          ? 'bg-teal-50 text-teal-800 border-teal-200'
          : 'bg-emerald-50 text-emerald-800 border-emerald-200'
      } ${sizeClasses} ${className}`}
    >
      <Percent className="w-3.5 h-3.5 opacity-80 shrink-0" />
      <span>{isExclusive ? 'VAT 13% Exclusive' : 'VAT 13% Inclusive'}</span>
    </span>
  );
}
