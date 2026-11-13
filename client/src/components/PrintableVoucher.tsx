import { Printer, X } from 'lucide-react';
import { Purchase, PurchaseItem, Payment, AppSettings } from '../api/client';
import { formatNpr } from '../utils/money';

export interface PrintableVoucherProps {
  purchase: Purchase;
  items?: PurchaseItem[];
  payments?: Payment[];
  company?: AppSettings | null;
  onClose?: () => void;
  showPrintButton?: boolean;
}

export function PrintableVoucher({
  purchase,
  items = [],
  payments = [],
  company,
  onClose,
  showPrintButton = true,
}: PrintableVoucherProps) {
  const handlePrint = () => {
    window.print();
  };

  const companyName = company?.company_name || 'Himalayan Trading Suppliers Pvt. Ltd.';
  const companyAddress = company?.company_address || 'Tripureshwor, Kathmandu, Nepal';
  const companyPan = company?.company_pan || '601234567';

  const outstanding = Math.max(0, purchase.total_amount - purchase.paid_amount);

  return (
    <div className="print-container w-full max-w-4xl mx-auto p-4 sm:p-6 bg-white">
      {/* Action Bar (Hidden in Print) */}
      <div className="no-print mb-6 flex items-center justify-between p-3.5 bg-slate-900 text-white rounded-xl shadow-md">
        <div className="flex items-center gap-2">
          <Printer className="w-5 h-5 text-emerald-400" />
          <span className="font-semibold text-sm">Purchase Voucher Document</span>
          <span className="text-xs text-slate-400 font-mono">({purchase.purchase_code})</span>
        </div>

        <div className="flex items-center gap-2">
          {showPrintButton && (
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-900 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors cursor-pointer shadow-xs"
            >
              <Printer className="w-4 h-4" />
              <span>Print A4 Voucher</span>
            </button>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              title="Close Voucher"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Printable Sheet */}
      <div className="printable-voucher bg-white p-6 sm:p-8 rounded-lg border border-slate-300 text-slate-900">
        {/* Company Letterhead */}
        <div className="border-b-2 border-slate-900 pb-4 mb-4 text-center">
          <h1 className="text-xl font-bold tracking-tight text-slate-950 uppercase">
            {companyName}
          </h1>
          <p className="text-xs text-slate-600 mt-0.5">{companyAddress}</p>
          <div className="flex items-center justify-center gap-4 text-xs font-semibold text-slate-800 mt-1">
            <span>PAN / VAT No: <strong className="font-mono">{companyPan}</strong></span>
          </div>

          <div className="mt-3 inline-block border-2 border-slate-800 px-4 py-1 rounded">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-900">
              PURCHASE & VAT EXPENSE VOUCHER / खरिद भौचर
            </span>
          </div>
        </div>

        {/* Voucher Meta Grid */}
        <div className="grid grid-cols-2 gap-4 text-xs mb-5 p-3 bg-slate-50 border border-slate-200 rounded">
          {/* Left: Vendor details */}
          <div className="space-y-1">
            <p>
              <span className="text-slate-500 font-medium">Vendor:</span>{' '}
              <strong className="text-slate-900">{purchase.vendor_name || 'N/A'}</strong>
            </p>
            <p>
              <span className="text-slate-500 font-medium">Vendor PAN/VAT:</span>{' '}
              <strong className="font-mono text-slate-900">
                {purchase.vendor_pan || purchase.vendor_vat || 'N/A'}
              </strong>
            </p>
            <p>
              <span className="text-slate-500 font-medium">Vendor Phone:</span>{' '}
              <span className="font-mono">{purchase.vendor_phone || 'N/A'}</span>
            </p>
            <p>
              <span className="text-slate-500 font-medium">Bill / Invoice No:</span>{' '}
              <strong className="font-mono text-slate-900">{purchase.bill_number || 'N/A'}</strong>
            </p>
          </div>

          {/* Right: Dates & Codes */}
          <div className="space-y-1 text-right sm:text-left">
            <p>
              <span className="text-slate-500 font-medium">Voucher Code:</span>{' '}
              <strong className="font-mono text-emerald-800 font-bold">
                {purchase.purchase_code}
              </strong>
            </p>
            <p>
              <span className="text-slate-500 font-medium">Fiscal Year:</span>{' '}
              <span className="font-mono font-semibold">{purchase.fiscal_year}</span>
            </p>
            <p className="tabular-nums">
              <span className="text-slate-500 font-medium">Purchase Date:</span>{' '}
              <strong>{purchase.purchase_date_bs} BS</strong> ({purchase.purchase_date_ad} AD)
            </p>
            <p className="tabular-nums">
              <span className="text-slate-500 font-medium">Entry Date:</span>{' '}
              {purchase.entry_date_bs} BS ({purchase.entry_time_npt || 'NPT'})
            </p>
          </div>
        </div>

        {/* Itemized Table or Summary */}
        <div className="mb-5 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-y border-slate-800 bg-slate-100 font-semibold text-slate-900">
                <th className="py-2 px-2 text-center w-10">S.N.</th>
                <th className="py-2 px-3">Item / Description</th>
                <th className="py-2 px-2">SKU</th>
                <th className="py-2 px-2 text-right">Qty</th>
                <th className="py-2 px-2 text-right">Rate</th>
                <th className="py-2 px-2 text-right">Taxable Amt</th>
                <th className="py-2 px-2 text-right">13% VAT</th>
                <th className="py-2 px-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {items && items.length > 0 ? (
                items.map((item, idx) => (
                  <tr key={item.id || idx} className="hover:bg-slate-50/50">
                    <td className="py-2 px-2 text-center font-mono text-slate-500">
                      {idx + 1}
                    </td>
                    <td className="py-2 px-3">
                      <span className="font-semibold text-slate-900">{item.product_name}</span>
                      {item.category && (
                        <span className="block text-[11px] text-slate-500">{item.category}</span>
                      )}
                    </td>
                    <td className="py-2 px-2 font-mono text-[11px] text-slate-600">
                      {item.sku || '—'}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums font-medium">
                      {item.quantity} {item.unit_of_measurement}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      {formatNpr(item.unit_price)}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      {formatNpr(item.line_subtotal)}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      {formatNpr(item.line_vat_amount)}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums font-semibold text-slate-950">
                      {formatNpr(item.line_total)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="py-3 px-2 text-center font-mono text-slate-500">1</td>
                  <td colSpan={2} className="py-3 px-3">
                    <span className="font-semibold text-slate-900">{purchase.product_summary}</span>
                    {purchase.description && (
                      <p className="text-[11px] text-slate-500 mt-0.5">{purchase.description}</p>
                    )}
                  </td>
                  <td className="py-3 px-2 text-right tabular-nums font-medium">1 lot</td>
                  <td className="py-3 px-2 text-right tabular-nums">
                    {formatNpr(purchase.purchase_amount)}
                  </td>
                  <td className="py-3 px-2 text-right tabular-nums">
                    {formatNpr(purchase.purchase_amount)}
                  </td>
                  <td className="py-3 px-2 text-right tabular-nums">
                    {formatNpr(purchase.vat_amount)}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums font-semibold text-slate-950">
                    {formatNpr(purchase.total_amount)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* VAT & Financial Summary Box */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs space-y-1">
            <p className="font-semibold text-slate-900 mb-1 border-b pb-1">
              Compliance & Verification
            </p>
            <p>
              <span className="text-slate-500">Tax Type:</span>{' '}
              <strong>{purchase.tax_type === 'NON_VAT' ? 'Non-VAT Exempt' : 'VAT 13%'}</strong>
            </p>
            <p>
              <span className="text-slate-500">Calculation Mode:</span>{' '}
              <span>{purchase.vat_calc_mode}</span>
            </p>
            <p>
              <span className="text-slate-500">VAT Bill Status:</span>{' '}
              <strong>{purchase.vat_bill_status}</strong>
            </p>
            <p>
              <span className="text-slate-500">Payment Status:</span>{' '}
              <strong>{purchase.payment_status}</strong>
            </p>
          </div>

          <div className="border border-slate-300 rounded overflow-hidden text-xs">
            <div className="flex justify-between px-3 py-1.5 border-b border-slate-200 tabular-nums">
              <span className="text-slate-600">Taxable / Base Amount:</span>
              <span className="font-medium">{formatNpr(purchase.purchase_amount)}</span>
            </div>
            <div className="flex justify-between px-3 py-1.5 border-b border-slate-200 tabular-nums">
              <span className="text-slate-600">VAT (13%):</span>
              <span className="font-medium">{formatNpr(purchase.vat_amount)}</span>
            </div>
            <div className="flex justify-between px-3 py-2 bg-slate-100 border-b border-slate-300 font-bold tabular-nums">
              <span>Grand Total Payable:</span>
              <span className="text-sm text-slate-950">{formatNpr(purchase.total_amount)}</span>
            </div>
            <div className="flex justify-between px-3 py-1.5 border-b border-slate-200 tabular-nums text-slate-600">
              <span>Paid to Date:</span>
              <span>{formatNpr(purchase.paid_amount)}</span>
            </div>
            <div className="flex justify-between px-3 py-1.5 font-semibold tabular-nums text-emerald-900 bg-emerald-50/50">
              <span>Outstanding Balance Due:</span>
              <span>{formatNpr(outstanding)}</span>
            </div>
          </div>
        </div>

        {/* Payments History if any */}
        {payments && payments.length > 0 && (
          <div className="mb-6 border border-slate-200 rounded p-3 text-xs">
            <h4 className="font-semibold text-slate-900 mb-2 border-b pb-1">
              Payment Settlements
            </h4>
            <div className="space-y-1.5">
              {payments.map((pm, idx) => (
                <div
                  key={pm.id || idx}
                  className="flex items-center justify-between text-[11px] tabular-nums"
                >
                  <span>
                    <strong>{pm.payment_date_bs} BS</strong> ({pm.payment_method}) -{' '}
                    {pm.transaction_ref ? `Ref: ${pm.transaction_ref}` : 'Settlement'}
                  </span>
                  <span className="font-semibold font-mono">{formatNpr(pm.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Signatures Block (Standard Nepal Financial Ledger Signatures) */}
        <div className="grid grid-cols-4 gap-4 pt-12 mt-6 text-center text-xs text-slate-700">
          <div>
            <div className="border-t border-slate-400 pt-1">
              <p className="font-semibold text-slate-900">
                {purchase.submitted_by_name || 'Store Staff'}
              </p>
              <p className="text-[11px] text-slate-500">Prepared By</p>
            </div>
          </div>

          <div>
            <div className="border-t border-slate-400 pt-1">
              <p className="font-semibold text-slate-900">Auditor / Accounts</p>
              <p className="text-[11px] text-slate-500">Verified By</p>
            </div>
          </div>

          <div>
            <div className="border-t border-slate-400 pt-1">
              <p className="font-semibold text-slate-900">Managing Director / Admin</p>
              <p className="text-[11px] text-slate-500">Approved By</p>
            </div>
          </div>

          <div>
            <div className="border-t border-slate-400 pt-1">
              <p className="font-semibold text-slate-900">Vendor / Bearer</p>
              <p className="text-[11px] text-slate-500">Received By & Stamp</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
