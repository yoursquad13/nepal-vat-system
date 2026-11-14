import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  FileBarChart,
  FileSpreadsheet,
  FileText,
  Printer,
  RefreshCw,
  Filter,
  Building2,
  Search,
  X,
  SlidersHorizontal,
  ChevronRight,
  TrendingUp,
  AlertTriangle,
  Receipt,
  Boxes,
  Package,
  Layers,
  Clock,
  CheckCircle2,
  DollarSign,
  Download,
} from 'lucide-react';
import { api, Vendor } from '../api/client';
import { useToast } from '../context/ToastContext';
import { formatNPR } from '../utils/money';
import { getNowNpt, adToBs, bsToAd } from '../utils/nepaliDate';
import { VatStatusBadge, PaymentStatusBadge, StockStatusBadge } from '../components/StatusBadges';

export type ReportCategory = 'purchases' | 'inventory';

export interface ReportDefinition {
  slug: string;
  category: ReportCategory;
  name: string;
  description: string;
  icon: React.ElementType;
  badge?: string;
}

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  // Category 1: Purchase & VAT Reports (7)
  {
    slug: 'daily-purchases',
    category: 'purchases',
    name: 'Daily Purchase Report',
    description: 'Chronological daily purchase vouchers with taxable, VAT, and balance due breakdown.',
    icon: Receipt,
  },
  {
    slug: 'monthly-purchases',
    category: 'purchases',
    name: 'Monthly Purchase Report',
    description: 'Aggregated monthly purchase volume, VAT totals, and payment status trends.',
    icon: TrendingUp,
  },
  {
    slug: 'vendor-purchases',
    category: 'purchases',
    name: 'Vendor-Wise Purchase Report',
    description: 'Purchases grouped by vendor with pending balances and bill counts.',
    icon: Building2,
  },
  {
    slug: 'vat-pending',
    category: 'purchases',
    name: 'VAT Bill Pending Report',
    description: 'Active purchases awaiting original tax invoice upload with aging days tracking.',
    icon: Clock,
    badge: 'Aging',
  },
  {
    slug: 'payment-pending',
    category: 'purchases',
    name: 'Payment Pending Report',
    description: 'Outstanding approved purchases requiring full or partial vendor payment.',
    icon: DollarSign,
    badge: 'Due',
  },
  {
    slug: 'paid-bills',
    category: 'purchases',
    name: 'Paid Bills Report',
    description: 'Historical register of fully settled purchase transactions and payment references.',
    icon: CheckCircle2,
  },
  {
    slug: 'vat-summary',
    category: 'purchases',
    name: 'VAT Collection & Register Summary',
    description: 'Official 13% input VAT collection register with verified vs pending audit status.',
    icon: FileBarChart,
    badge: 'IRD Audit',
  },

  // Category 2: Inventory Reports (8)
  {
    slug: 'product-stock',
    category: 'inventory',
    name: 'Product Current Stock Report',
    description: 'Comprehensive product catalog inventory balances, average purchase cost, and stock valuation.',
    icon: Package,
  },
  {
    slug: 'stock-in',
    category: 'inventory',
    name: 'Stock In / Received Purchases',
    description: 'Itemized inward stock movements from verified vendor purchases and adjustments.',
    icon: Boxes,
  },
  {
    slug: 'stock-out',
    category: 'inventory',
    name: 'Stock Out / Issued Report',
    description: 'Outward movements categorized by sales, internal issue, and damaged write-offs.',
    icon: Layers,
  },
  {
    slug: 'vendor-products',
    category: 'inventory',
    name: 'Vendor-Wise Product Supply Report',
    description: 'Product procurement matrix mapping which vendors supply which inventory items.',
    icon: Building2,
  },
  {
    slug: 'monthly-inventory',
    category: 'inventory',
    name: 'Monthly Inventory Summary',
    description: 'Monthly stock inward vs outward movements with aggregate valuation metrics.',
    icon: TrendingUp,
  },
  {
    slug: 'stock-valuation',
    category: 'inventory',
    name: 'Stock Valuation Report',
    description: 'Inventory asset valuation comparing weighted average cost vs latest replacement price.',
    icon: DollarSign,
    badge: 'Valuation',
  },
  {
    slug: 'low-stock',
    category: 'inventory',
    name: 'Low & Out-of-Stock Alert Report',
    description: 'Actionable procurement list of items below reorder threshold or zero stock.',
    icon: AlertTriangle,
    badge: 'Alert',
  },
  {
    slug: 'stock-adjustments',
    category: 'inventory',
    name: 'Stock Adjustments & Opening Stock',
    description: 'Audit log of opening stock entries, manual quantity corrections, and reconciliations.',
    icon: SlidersHorizontal,
  },
];

const PRESETS = [
  { value: '', label: 'Custom Date Range / All' },
  { value: 'today', label: 'Today (NPT)' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month_bs', label: 'This Month (BS)' },
  { value: 'fiscal_year', label: 'This Fiscal Year' },
];

const FISCAL_YEARS = [
  { value: '', label: 'All Fiscal Years' },
  { value: '2083/84', label: 'FY 2083/84' },
  { value: '2082/83', label: 'FY 2082/83' },
  { value: '2081/82', label: 'FY 2081/82' },
  { value: '2080/81', label: 'FY 2080/81' },
];

export function ReportsPage() {
  const toast = useToast();
  const todayNpt = useMemo(() => getNowNpt(), []);

  // Category and selected report
  const [activeCategory, setActiveCategory] = useState<ReportCategory>('purchases');
  const [selectedSlug, setSelectedSlug] = useState<string>('daily-purchases');

  // Filter states
  const [preset, setPreset] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [fromBs, setFromBs] = useState<string>('');
  const [toBs, setToBs] = useState<string>('');
  const [fiscalYear, setFiscalYear] = useState<string>('');
  const [vendorId, setVendorId] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Dropdown data
  const [vendorsList, setVendorsList] = useState<Vendor[]>([]);

  // Report data state
  const [loading, setLoading] = useState<boolean>(true);
  const [reportTitle, setReportTitle] = useState<string>('');
  const [columns, setColumns] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<Record<string, any>>({});
  const [error, setError] = useState<string | null>(null);

  // Export states
  const [exportingFormat, setExportingFormat] = useState<string | null>(null);

  // Load vendors list for filter dropdown once
  useEffect(() => {
    let mounted = true;
    api.vendors
      .list({ is_active: true })
      .then((res) => {
        if (mounted && res.vendors) {
          setVendorsList(res.vendors);
        }
      })
      .catch((err) => {
        console.error('Failed to load vendors for reports filter:', err);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Sync AD and BS dates when changed
  const handleFromDateChange = (adDateStr: string) => {
    setFromDate(adDateStr);
    if (!adDateStr) {
      setFromBs('');
      return;
    }
    try {
      setFromBs(adToBs(adDateStr));
    } catch {
      // ignore
    }
  };

  const handleToDateChange = (adDateStr: string) => {
    setToDate(adDateStr);
    if (!adDateStr) {
      setToBs('');
      return;
    }
    try {
      setToBs(adToBs(adDateStr));
    } catch {
      // ignore
    }
  };

  const handleFromBsChange = (bsDateStr: string) => {
    setFromBs(bsDateStr);
    if (!bsDateStr || bsDateStr.length !== 10) return;
    try {
      setFromDate(bsToAd(bsDateStr));
    } catch {
      // ignore
    }
  };

  const handleToBsChange = (bsDateStr: string) => {
    setToBs(bsDateStr);
    if (!bsDateStr || bsDateStr.length !== 10) return;
    try {
      setToDate(bsToAd(bsDateStr));
    } catch {
      // ignore
    }
  };

  // Compile active filters object
  const getFilterParams = useCallback(() => {
    const params: Record<string, any> = {};
    if (preset) {
      params.preset = preset;
    } else {
      if (fromDate) params.fromDate = fromDate;
      if (toDate) params.toDate = toDate;
      if (fromBs) params.fromBs = fromBs;
      if (toBs) params.toBs = toBs;
    }
    if (fiscalYear) params.fiscalYear = fiscalYear;
    if (vendorId) params.vendorId = vendorId;
    if (category) params.category = category;
    if (status) params.status = status;
    if (searchQuery.trim()) params.q = searchQuery.trim();
    return params;
  }, [preset, fromDate, toDate, fromBs, toBs, fiscalYear, vendorId, category, status, searchQuery]);

  // Fetch report data
  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = getFilterParams();
      const res = await api.reports.get(selectedSlug, params);
      setReportTitle(res.title || 'Report');
      setColumns(res.columns || []);
      setRows(res.rows || []);
      setSummary(res.summary || {});
    } catch (err: any) {
      const msg = err.message || 'Failed to load report data';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [selectedSlug, getFilterParams, toast]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // When switching category tab, select the first report of that category
  const handleCategorySelect = (cat: ReportCategory) => {
    setActiveCategory(cat);
    const firstOfCategory = REPORT_DEFINITIONS.find((r) => r.category === cat);
    if (firstOfCategory) {
      setSelectedSlug(firstOfCategory.slug);
    }
  };

  // Reset all filters
  const handleResetFilters = () => {
    setPreset('');
    setFromDate('');
    setToDate('');
    setFromBs('');
    setToBs('');
    setFiscalYear('');
    setVendorId('');
    setCategory('');
    setStatus('');
    setSearchQuery('');
  };

  // Export report handler
  const handleExport = async (format: 'xlsx' | 'csv' | 'pdf') => {
    setExportingFormat(format);
    try {
      const params = getFilterParams();
      const exportUrl = api.reports.getExportUrl(selectedSlug, format, params);

      const res = await fetch(exportUrl, {
        credentials: 'include',
      });

      if (!res.ok) {
        let errorMsg = `Export failed with status ${res.status}`;
        try {
          const errData = await res.json();
          errorMsg = errData.message || errData.error || errorMsg;
        } catch {
          // ignore non-json
        }
        throw new Error(errorMsg);
      }

      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition');
      let filename = `${selectedSlug}-${todayNpt.dateBs}.${format}`;
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="?([^";]+)"?/);
        if (match?.[1]) filename = match[1];
      }

      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      toast.success(`Exported ${format.toUpperCase()} successfully!`, filename);
    } catch (err: any) {
      toast.error(err.message || `Failed to export ${format.toUpperCase()}`);
    } finally {
      setExportingFormat(null);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const currentDef = REPORT_DEFINITIONS.find((r) => r.slug === selectedSlug);
  const purchaseReports = REPORT_DEFINITIONS.filter((r) => r.category === 'purchases');
  const inventoryReports = REPORT_DEFINITIONS.filter((r) => r.category === 'inventory');

  // Summary formatter
  const formatSummaryMetric = (key: string, val: any) => {
    if (typeof val !== 'number') return String(val ?? '-');
    const lower = key.toLowerCase();
    if (
      lower.includes('amount') ||
      lower.includes('val') ||
      lower.includes('spend') ||
      lower.includes('cost') ||
      lower.includes('due') ||
      lower.includes('balance') ||
      lower.includes('price')
    ) {
      return formatNPR(val);
    }
    return val.toLocaleString();
  };

  const formatSummaryLabel = (key: string) => {
    return key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .replace('Vat', 'VAT')
      .replace('Bs', 'BS')
      .replace('Ad', 'AD')
      .replace('Qty', 'Quantity');
  };

  // Render cell contents
  const renderCellContent = (row: any, col: any) => {
    const val = row[col.key];

    if (val === null || val === undefined || val === '') {
      return <span className="text-slate-400 font-mono text-xs">-</span>;
    }

    if (col.key === 'vat_bill_status') {
      return <VatStatusBadge status={val} size="sm" />;
    }

    if (col.key === 'payment_status') {
      return <PaymentStatusBadge status={val} size="sm" />;
    }

    if (col.key === 'stock_status' || col.key === 'stockStatus') {
      if (row.current_stock !== undefined) {
        return (
          <StockStatusBadge
            currentStock={Number(row.current_stock)}
            minStockLevel={Number(row.min_stock_level ?? 0)}
            size="sm"
          />
        );
      }
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
          {String(val)}
        </span>
      );
    }

    if (col.format === 'currency') {
      return (
        <span className="font-mono tabular-nums font-semibold text-slate-800">
          {formatNPR(val)}
        </span>
      );
    }

    if (col.format === 'number' || (typeof val === 'number' && col.align === 'right')) {
      return (
        <span className="font-mono tabular-nums text-slate-800">
          {val.toLocaleString()}
        </span>
      );
    }

    if (typeof val === 'boolean') {
      return (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold ${
            val ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {val ? 'Yes' : 'No'}
        </span>
      );
    }

    // Purchase Voucher / Code linking
    if (col.key === 'purchase_code' && row.purchase_id) {
      return (
        <Link
          to={`/purchases/${row.purchase_id}`}
          className="font-mono font-semibold text-emerald-600 hover:text-emerald-700 hover:underline"
        >
          {val}
        </Link>
      );
    }

    // SKU / Product link
    if (col.key === 'sku' && row.product_id) {
      return (
        <Link
          to={`/products/${row.product_id}`}
          className="font-mono font-semibold text-indigo-600 hover:text-indigo-700 hover:underline"
        >
          {val}
        </Link>
      );
    }

    // Vendor link
    if (col.key === 'vendor_name' && row.vendor_id) {
      return (
        <Link
          to={`/vendors/${row.vendor_id}`}
          className="font-medium text-slate-900 hover:text-emerald-600 hover:underline"
        >
          {val}
        </Link>
      );
    }

    return <span className="text-slate-700">{String(val)}</span>;
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header (Hidden on Print) */}
      <div className="print:hidden flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center">
              <FileBarChart className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
                Financial Reports & Exports
              </h1>
              <p className="text-xs md:text-sm text-slate-500">
                Official Nepal VAT registers, purchase ledgers, and inventory valuation reports
              </p>
            </div>
          </div>
        </div>

        {/* Global Export & Print Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleExport('xlsx')}
            disabled={loading || exportingFormat !== null || rows.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-xs"
            title="Download Excel spreadsheet"
          >
            {exportingFormat === 'xlsx' ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-3.5 h-3.5" />
            )}
            <span>Excel (.xlsx)</span>
          </button>

          <button
            type="button"
            onClick={() => handleExport('csv')}
            disabled={loading || exportingFormat !== null || rows.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-50 transition-colors shadow-xs"
            title="Download CSV spreadsheet"
          >
            {exportingFormat === 'csv' ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileText className="w-3.5 h-3.5" />
            )}
            <span>CSV (.csv)</span>
          </button>

          <button
            type="button"
            onClick={() => handleExport('pdf')}
            disabled={loading || exportingFormat !== null || rows.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 transition-colors shadow-xs"
            title="Download PDF report"
          >
            {exportingFormat === 'pdf' ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span>PDF (.pdf)</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            disabled={loading || rows.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-xs"
            title="Open printable view"
          >
            <Printer className="w-3.5 h-3.5 text-slate-600" />
            <span>Print</span>
          </button>

          <button
            type="button"
            onClick={fetchReport}
            disabled={loading}
            className="p-2 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-xs"
            title="Refresh current report"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Category Tabs (Print: hidden) */}
      <div className="print:hidden flex items-center gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => handleCategorySelect('purchases')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeCategory === 'purchases'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>Purchase & VAT Reports</span>
          <span
            className={`ml-1 px-1.5 py-0.5 rounded-full text-xs font-mono ${
              activeCategory === 'purchases'
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {purchaseReports.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleCategorySelect('inventory')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeCategory === 'inventory'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Boxes className="w-4 h-4" />
          <span>Inventory & Stock Reports</span>
          <span
            className={`ml-1 px-1.5 py-0.5 rounded-full text-xs font-mono ${
              activeCategory === 'inventory'
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {inventoryReports.length}
          </span>
        </button>
      </div>

      {/* Report Slugs Pill Grid (Print: hidden) */}
      <div className="print:hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {(activeCategory === 'purchases' ? purchaseReports : inventoryReports).map((def) => {
            const Icon = def.icon;
            const isSelected = selectedSlug === def.slug;
            return (
              <button
                key={def.slug}
                type="button"
                onClick={() => setSelectedSlug(def.slug)}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                  isSelected
                    ? 'border-emerald-600 bg-emerald-50/60 shadow-xs ring-1 ring-emerald-500'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        isSelected
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    {def.badge && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase bg-amber-100 text-amber-800 border border-amber-200">
                        {def.badge}
                      </span>
                    )}
                  </div>
                  <h3
                    className={`text-xs font-bold ${
                      isSelected ? 'text-emerald-950' : 'text-slate-900'
                    }`}
                  >
                    {def.name}
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                    {def.description}
                  </p>
                </div>
                {isSelected && (
                  <div className="mt-2 pt-2 border-t border-emerald-200/60 flex items-center justify-between text-[11px] font-medium text-emerald-700">
                    <span>Active Preview</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter Bar (Print: hidden) */}
      <div className="print:hidden bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 uppercase tracking-wider">
            <Filter className="w-3.5 h-3.5 text-emerald-600" />
            <span>Filter Parameters</span>
          </div>
          <button
            type="button"
            onClick={handleResetFilters}
            className="text-xs text-slate-500 hover:text-slate-800 font-medium inline-flex items-center gap-1"
          >
            <X className="w-3 h-3" />
            <span>Reset Filters</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 text-xs">
          {/* Preset */}
          <div>
            <label className="block text-slate-600 font-medium mb-1">Date Preset</label>
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-medium focus:outline-hidden focus:border-emerald-500"
            >
              {PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range: From BS / AD */}
          {!preset && (
            <>
              <div>
                <label className="block text-slate-600 font-medium mb-1">From Date (BS / AD)</label>
                <div className="grid grid-cols-2 gap-1">
                  <input
                    type="text"
                    placeholder="YYYY-MM-DD (BS)"
                    value={fromBs}
                    onChange={(e) => handleFromBsChange(e.target.value)}
                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono text-[11px] focus:outline-hidden focus:border-emerald-500"
                  />
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => handleFromDateChange(e.target.value)}
                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono text-[11px] focus:outline-hidden focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">To Date (BS / AD)</label>
                <div className="grid grid-cols-2 gap-1">
                  <input
                    type="text"
                    placeholder="YYYY-MM-DD (BS)"
                    value={toBs}
                    onChange={(e) => handleToBsChange(e.target.value)}
                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono text-[11px] focus:outline-hidden focus:border-emerald-500"
                  />
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => handleToDateChange(e.target.value)}
                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono text-[11px] focus:outline-hidden focus:border-emerald-500"
                  />
                </div>
              </div>
            </>
          )}

          {/* Fiscal Year */}
          <div>
            <label className="block text-slate-600 font-medium mb-1">Fiscal Year</label>
            <select
              value={fiscalYear}
              onChange={(e) => setFiscalYear(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-medium focus:outline-hidden focus:border-emerald-500"
            >
              {FISCAL_YEARS.map((fy) => (
                <option key={fy.value} value={fy.value}>
                  {fy.label}
                </option>
              ))}
            </select>
          </div>

          {/* Vendor Filter */}
          <div>
            <label className="block text-slate-600 font-medium mb-1">Vendor</label>
            <select
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-medium focus:outline-hidden focus:border-emerald-500"
            >
              <option value="">All Vendors</option>
              {vendorsList.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.company_name} {v.pan_number ? `(PAN: ${v.pan_number})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Category Filter */}
          <div>
            <label className="block text-slate-600 font-medium mb-1">Category / Group</label>
            <input
              type="text"
              placeholder="e.g. IT Equipment, Office..."
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-medium focus:outline-hidden focus:border-emerald-500"
            />
          </div>

          {/* Search Query Filter */}
          <div>
            <label className="block text-slate-600 font-medium mb-1">Keyword Search</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
              <input
                type="text"
                placeholder="Voucher, bill no, product..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-medium focus:outline-hidden focus:border-emerald-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Print-Only Header Banner */}
      <div className="hidden print:block border-b-2 border-slate-900 pb-3 mb-4">
        <h1 className="text-xl font-bold text-slate-900">{reportTitle}</h1>
        <div className="flex justify-between items-center text-xs text-slate-600 mt-1">
          <span>Himalayan Trading Suppliers Pvt. Ltd. | VAT/PAN: 601234567</span>
          <span>Generated: {todayNpt.dateBs} BS ({todayNpt.dateAd} AD)</span>
        </div>
      </div>

      {/* Summary KPI Strip */}
      {summary && Object.keys(summary).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Object.entries(summary).map(([key, val]) => (
            <div
              key={key}
              className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs"
            >
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate">
                {formatSummaryLabel(key)}
              </p>
              <p className="text-sm lg:text-base font-bold text-slate-900 font-mono tabular-nums mt-0.5 truncate">
                {formatSummaryMetric(key, val)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Report Data Preview Table Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Table Title Bar */}
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">
                {reportTitle || currentDef?.name}
              </h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-slate-100 text-slate-700">
                {rows.length} {rows.length === 1 ? 'record' : 'records'}
              </span>
            </div>
            {currentDef && (
              <p className="text-xs text-slate-500 mt-0.5">{currentDef.description}</p>
            )}
          </div>
        </div>

        {/* Loading / Error / Table Content */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-500 gap-3">
            <RefreshCw className="w-7 h-7 animate-spin text-emerald-600" />
            <p className="text-sm font-medium">Generating report dataset...</p>
          </div>
        ) : error ? (
          <div className="py-16 px-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Failed to load report</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">{error}</p>
            <button
              type="button"
              onClick={fetchReport}
              className="mt-4 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800"
            >
              Retry
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="py-20 px-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <FileBarChart className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">No records found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              There are no transactions matching the selected filters for this report period.
            </p>
            <button
              type="button"
              onClick={handleResetFilters}
              className="mt-4 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 uppercase font-bold tracking-wider text-[11px]">
                  <th className="py-3 px-3.5 w-10 text-center font-mono text-slate-400">#</th>
                  {columns.map((col) => {
                    const alignClass =
                      col.align === 'right'
                        ? 'text-right'
                        : col.align === 'center'
                        ? 'text-center'
                        : 'text-left';
                    return (
                      <th
                        key={col.key}
                        className={`py-3 px-3.5 whitespace-nowrap ${alignClass}`}
                      >
                        {col.label}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, idx) => (
                  <tr
                    key={row.id || `${row.purchase_code || row.sku || idx}-${idx}`}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="py-2.5 px-3.5 text-center font-mono text-slate-400 text-[11px]">
                      {idx + 1}
                    </td>
                    {columns.map((col) => {
                      const alignClass =
                        col.align === 'right'
                          ? 'text-right'
                          : col.align === 'center'
                          ? 'text-center'
                          : 'text-left';
                      return (
                        <td
                          key={col.key}
                          className={`py-2.5 px-3.5 whitespace-nowrap ${alignClass}`}
                        >
                          {renderCellContent(row, col)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
export default ReportsPage;
