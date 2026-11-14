import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  FileCheck2,
  Phone,
  Upload,
  Search,
  RefreshCw,
  Building2,
  X,
  ExternalLink,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import { api, Purchase, Vendor } from '../api/client';
import { useToast } from '../context/ToastContext';
import { formatNpr } from '../utils/money';
import { VatStatusBadge } from '../components/StatusBadges';
import { BsAdDatePicker, BsAdDateValue } from '../components/BsAdDatePicker';

export function VatPendingPage() {
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();

  const [loading, setLoading] = useState<boolean>(true);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedVendorId, setSelectedVendorId] = useState<string>('');
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<string>('');
  const [selectedAgingBracket, setSelectedAgingBracket] = useState<string>('ALL');

  // Vendor master
  const [vendors, setVendors] = useState<Vendor[]>([]);

  // Quick Upload Modal
  const [uploadModalOpen, setUploadModalOpen] = useState<boolean>(false);
  const [uploadPurchase, setUploadPurchase] = useState<Purchase | null>(null);
  const [billFile, setBillFile] = useState<File | null>(null);
  const [billNumber, setBillNumber] = useState<string>('');
  const [billDateBs, setBillDateBs] = useState<string>('');
  const [billDateAd, setBillDateAd] = useState<string>('');
  const [uploading, setUploading] = useState<boolean>(false);

  // Load vendors
  useEffect(() => {
    let mounted = true;
    api.vendors.list({ is_active: true })
      .then((res) => {
        if (mounted) setVendors(res.vendors || []);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  // Fetch VAT Pending Purchases
  const fetchVatPending = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {};
      if (searchQuery.trim()) params.q = searchQuery.trim();
      if (selectedVendorId) params.vendorId = Number(selectedVendorId);
      if (selectedFiscalYear.trim()) params.fiscalYear = selectedFiscalYear.trim();

      const res = await api.purchases.getVatPending(params);
      setPurchases(res.purchases || []);
      setTotalCount(res.total || 0);
    } catch (err: any) {
      toastError(err.message || 'Failed to fetch pending VAT purchases list.', 'Error loading pending VAT bills');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, selectedVendorId, selectedFiscalYear, toastError]);

  useEffect(() => {
    fetchVatPending();
  }, [fetchVatPending]);

  // Aging Bracket Filter on client
  const filteredPurchases = useMemo(() => {
    if (selectedAgingBracket === 'ALL') return purchases;
    if (selectedAgingBracket === 'CRITICAL') {
      return purchases.filter((p) => (p.days_pending ?? 0) > 30);
    }
    if (selectedAgingBracket === 'WARNING') {
      return purchases.filter((p) => (p.days_pending ?? 0) >= 8 && (p.days_pending ?? 0) <= 30);
    }
    if (selectedAgingBracket === 'RECENT') {
      return purchases.filter((p) => (p.days_pending ?? 0) <= 7);
    }
    return purchases;
  }, [purchases, selectedAgingBracket]);

  // Summary Metrics
  const summaryMetrics = useMemo(() => {
    const totalPendingCount = totalCount || purchases.length;
    const totalPurchaseBase = purchases.reduce((acc, p) => acc + (p.purchase_amount || 0), 0);
    const totalVatAtRisk = purchases.reduce((acc, p) => acc + (p.vat_amount || 0), 0);
    const totalGross = purchases.reduce((acc, p) => acc + (p.total_amount || 0), 0);

    return {
      totalPendingCount,
      totalPurchaseBase,
      totalVatAtRisk,
      totalGross,
    };
  }, [purchases, totalCount]);

  // Open Upload Modal
  const handleOpenUploadModal = (pur: Purchase) => {
    setUploadPurchase(pur);
    setBillNumber(pur.bill_number || '');
    setBillDateBs(pur.purchase_date_bs);
    setBillDateAd(pur.purchase_date_ad);
    setBillFile(null);
    setUploadModalOpen(true);
  };

  // Submit Bill Upload
  const handleUploadBillSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadPurchase || !billFile) {
      toastInfo('Please select a bill image or PDF.', 'File Required');
      return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', billFile);
      if (billDateAd) fd.append('vat_bill_date_ad', billDateAd);
      if (billDateBs) fd.append('vat_bill_date_bs', billDateBs);
      if (billNumber.trim()) fd.append('bill_number', billNumber.trim());

      await api.purchases.uploadVatBill(uploadPurchase.id, fd);
      toastSuccess(`VAT bill attached to ${uploadPurchase.purchase_code}!`, 'VAT Bill Uploaded');
      setUploadModalOpen(false);
      setUploadPurchase(null);
      fetchVatPending();
    } catch (err: any) {
      toastError(err.message || 'Unable to upload VAT bill file.', 'Upload Failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200">
            <FileCheck2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              VAT Bill Pending & Aging Tracker
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Monitor purchases awaiting physical VAT invoices to protect against 13% tax claim disqualification.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchVatPending}
          disabled={loading}
          className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer self-start sm:self-auto"
          title="Refresh List"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
        </button>
      </div>

      {/* Summary KPI Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Pending Count */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Unreceived VAT Bills</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
            {summaryMetrics.totalPendingCount}
          </div>
          <p className="text-xs text-slate-500 mt-1">Transactions requiring physical VAT bills</p>
        </div>

        {/* 13% VAT at Risk */}
        <div className="bg-white p-5 rounded-xl border border-rose-200 bg-rose-50/10 shadow-xs">
          <div className="flex items-center justify-between text-rose-600 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">13% Input VAT at Risk</span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-rose-700 tabular-nums">
            {formatNpr(summaryMetrics.totalVatAtRisk)}
          </div>
          <p className="text-xs text-rose-600/80 mt-1">Disallowed input tax credit if bills not collected</p>
        </div>

        {/* Total Purchase Volume */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Pending Purchase Volume</span>
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
            {formatNpr(summaryMetrics.totalGross)}
          </div>
          <p className="text-xs text-slate-500 mt-1">Taxable Base: {formatNpr(summaryMetrics.totalPurchaseBase)}</p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Query */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search code, vendor, product, bill #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-emerald-600"
            />
          </div>

          {/* Vendor Filter */}
          <div>
            <select
              value={selectedVendorId}
              onChange={(e) => setSelectedVendorId(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-700 focus:bg-white focus:outline-emerald-600"
            >
              <option value="">All Vendors</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.company_name}
                </option>
              ))}
            </select>
          </div>

          {/* Aging Severity Filter */}
          <div>
            <select
              value={selectedAgingBracket}
              onChange={(e) => setSelectedAgingBracket(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-700 focus:bg-white focus:outline-emerald-600 font-semibold"
            >
              <option value="ALL">All Aging Durations</option>
              <option value="CRITICAL">Critical: &gt; 30 Days Overdue</option>
              <option value="WARNING">Warning: 8 to 30 Days</option>
              <option value="RECENT">Recent: &le; 7 Days</option>
            </select>
          </div>

          {/* Clear Filters */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Fiscal Year (e.g. 2083/84)"
              value={selectedFiscalYear}
              onChange={(e) => setSelectedFiscalYear(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-700 focus:bg-white focus:outline-emerald-600"
            />
            {(searchQuery || selectedVendorId || selectedFiscalYear || selectedAgingBracket !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedVendorId('');
                  setSelectedFiscalYear('');
                  setSelectedAgingBracket('ALL');
                }}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer shrink-0"
                title="Reset filters"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* VAT Pending Aging Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-3.5 py-3 whitespace-nowrap">Aging Severity</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Purchase Code</th>
                <th className="px-3.5 py-3 min-w-[180px]">Vendor Name & Contact</th>
                <th className="px-3.5 py-3 min-w-[180px]">Product / Particulars</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Purchase Date</th>
                <th className="px-3.5 py-3 text-right whitespace-nowrap">Purchase Amt</th>
                <th className="px-3.5 py-3 text-right whitespace-nowrap text-teal-700 font-bold">13% VAT</th>
                <th className="px-3.5 py-3 text-right whitespace-nowrap font-bold text-slate-900">Total Amt</th>
                <th className="px-3.5 py-3 text-center whitespace-nowrap">VAT Status</th>
                <th className="px-3.5 py-3 whitespace-nowrap">Staff</th>
                <th className="px-3.5 py-3 text-right whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-600 mb-2" />
                    <span>Loading VAT pending bills...</span>
                  </td>
                </tr>
              ) : filteredPurchases.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-slate-400">
                    No pending VAT bills match your criteria. All bills are up to date!
                  </td>
                </tr>
              ) : (
                filteredPurchases.map((pur) => {
                  const days = pur.days_pending ?? 0;
                  const severityClass =
                    days > 30
                      ? 'bg-rose-100 text-rose-800 border-rose-300'
                      : days >= 8
                      ? 'bg-amber-100 text-amber-800 border-amber-300'
                      : 'bg-emerald-100 text-emerald-800 border-emerald-300';

                  return (
                    <tr key={pur.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Days Pending Badge */}
                      <td className="px-3.5 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold font-mono border ${severityClass}`}
                        >
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          <span>{days} days</span>
                        </span>
                      </td>

                      {/* Purchase Code & Bill # */}
                      <td className="px-3.5 py-3 whitespace-nowrap font-mono">
                        <Link
                          to={`/purchases/${pur.id}`}
                          className="font-bold text-slate-900 hover:text-emerald-700 hover:underline"
                        >
                          {pur.purchase_code}
                        </Link>
                        {pur.bill_number && (
                          <div className="text-[11px] text-slate-500 font-mono">Bill: {pur.bill_number}</div>
                        )}
                      </td>

                      {/* Vendor & Clickable Call Button */}
                      <td className="px-3.5 py-3">
                        <div className="font-semibold text-slate-900">{pur.vendor_name}</div>
                        <div className="flex items-center gap-2 mt-1">
                          {pur.vendor_phone && (
                            <a
                              href={`tel:${pur.vendor_phone}`}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 transition-colors"
                            >
                              <Phone className="w-3 h-3 text-emerald-600" />
                              <span>{pur.vendor_phone}</span>
                            </a>
                          )}
                          {pur.vendor_pan && (
                            <span className="text-[10px] text-slate-500 font-mono">
                              PAN: {pur.vendor_pan}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Product Summary */}
                      <td className="px-3.5 py-3">
                        <div className="font-medium text-slate-800 line-clamp-1">{pur.product_summary}</div>
                      </td>

                      {/* Purchase Date */}
                      <td className="px-3.5 py-3 whitespace-nowrap font-mono">
                        <div className="font-bold text-slate-900">{pur.purchase_date_bs} BS</div>
                        <div className="text-[10px] text-slate-400">{pur.purchase_date_ad} AD</div>
                      </td>

                      {/* Purchase Amount */}
                      <td className="px-3.5 py-3 text-right font-mono tabular-nums text-slate-700">
                        {formatNpr(pur.purchase_amount)}
                      </td>

                      {/* 13% VAT Amount */}
                      <td className="px-3.5 py-3 text-right font-mono tabular-nums text-rose-700 font-bold">
                        {formatNpr(pur.vat_amount)}
                      </td>

                      {/* Total Amount */}
                      <td className="px-3.5 py-3 text-right font-mono tabular-nums font-bold text-slate-900">
                        {formatNpr(pur.total_amount)}
                      </td>

                      {/* VAT Status */}
                      <td className="px-3.5 py-3 text-center whitespace-nowrap">
                        <VatStatusBadge status={pur.vat_bill_status} />
                      </td>

                      {/* Staff */}
                      <td className="px-3.5 py-3 whitespace-nowrap text-slate-600 text-[11px]">
                        {pur.submitted_by_name || 'Staff'}
                      </td>

                      {/* Actions */}
                      <td className="px-3.5 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenUploadModal(pur)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-2xs transition-colors cursor-pointer"
                          >
                            <Upload className="w-3 h-3" />
                            <span>Upload Bill</span>
                          </button>
                          <Link
                            to={`/purchases/${pur.id}`}
                            className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                            title="View Purchase Details"
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

      {/* Quick Upload VAT Bill Modal */}
      {uploadModalOpen && uploadPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 animate-slide-up space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-sm">
                  Upload VAT Bill for {uploadPurchase.purchase_code}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setUploadModalOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUploadBillSubmit} className="space-y-4">
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                <p>
                  <span className="text-slate-500 font-medium">Vendor:</span>{' '}
                  <strong className="text-slate-900">{uploadPurchase.vendor_name}</strong>
                </p>
                <p>
                  <span className="text-slate-500 font-medium">Total Amount:</span>{' '}
                  <strong className="font-mono text-slate-900">{formatNpr(uploadPurchase.total_amount)}</strong>
                </p>
                <p>
                  <span className="text-slate-500 font-medium">13% VAT:</span>{' '}
                  <strong className="font-mono text-teal-700">{formatNpr(uploadPurchase.vat_amount)}</strong>
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  VAT Bill Image / PDF File <span className="text-rose-500">*</span>
                </label>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.pdf"
                  required
                  onChange={(e) => {
                    if (e.target.files?.[0]) setBillFile(e.target.files[0]);
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  VAT Invoice # (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. VAT-8941"
                  value={billNumber}
                  onChange={(e) => setBillNumber(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                />
              </div>

              <BsAdDatePicker
                label="Bill Date (Bikram Sambat)"
                valueBs={billDateBs}
                valueAd={billDateAd}
                onChange={(val: BsAdDateValue) => {
                  setBillDateBs(val.bs);
                  setBillDateAd(val.ad);
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
                  disabled={uploading}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                >
                  {uploading ? 'Uploading...' : 'Upload & Attach Bill'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
