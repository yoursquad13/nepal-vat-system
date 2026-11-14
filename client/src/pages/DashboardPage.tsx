import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp,
  Receipt,
  FileCheck2,
  Clock,
  Building2,
  Package,
  AlertTriangle,
  CreditCard,
  PlusCircle,
  RefreshCw,
  Calendar,
  ArrowUpRight,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { api, DashboardResponse } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatNpr } from '../utils/money';
import { VatStatusBadge, PaymentStatusBadge, ReviewStatusBadge, StockStatusBadge } from '../components/StatusBadges';
import { BsAdDatePicker, BsAdDateValue } from '../components/BsAdDatePicker';

type PresetType = 'today' | 'yesterday' | 'this_week' | 'this_month_bs' | 'fiscal_year' | 'all' | 'custom';

const PRESETS: Array<{ id: PresetType; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'this_week', label: 'This Week' },
  { id: 'this_month_bs', label: 'This Month (BS)' },
  { id: 'fiscal_year', label: 'Fiscal Year' },
  { id: 'all', label: 'All Time' },
  { id: 'custom', label: 'Custom Range' },
];

const PIE_COLORS = ['#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#64748b'];

export function DashboardPage() {
  const { user } = useAuth();
  const { error: toastError, info: toastInfo } = useToast();

  const [preset, setPreset] = useState<PresetType>('this_month_bs');
  const [customFromBs, setCustomFromBs] = useState<string>('');
  const [customToBs, setCustomToBs] = useState<string>('');
  const [customFromAd, setCustomFromAd] = useState<string>('');
  const [customToAd, setCustomToAd] = useState<string>('');
  const [showCustomPicker, setShowCustomPicker] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(true);
  const [dashboardData, setDashboardData] = useState<DashboardResponse | null>(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (preset !== 'custom') {
        params.preset = preset;
      } else {
        if (customFromAd) params.fromDate = customFromAd;
        if (customToAd) params.toDate = customToAd;
      }

      const res = await api.dashboard.get(params);
      setDashboardData(res);
    } catch (err: any) {
      toastError(err.message || 'Failed to fetch dashboard data', 'Dashboard Error');
    } finally {
      setLoading(false);
    }
  }, [preset, customFromAd, customToAd, toastError]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const handlePresetChange = (newPreset: PresetType) => {
    setPreset(newPreset);
    if (newPreset === 'custom') {
      setShowCustomPicker(true);
    } else {
      setShowCustomPicker(false);
    }
  };

  const handleApplyCustomDates = () => {
    if (!customFromAd || !customToAd) {
      toastInfo('Please select both start and end dates.', 'Incomplete Range');
      return;
    }
    fetchDashboard();
  };

  const isAdmin = user?.role === 'ADMIN' || dashboardData?.is_admin;
  const kpis = dashboardData?.kpis;
  const charts = dashboardData?.charts;
  const recentEntries = dashboardData?.recent_entries || [];
  const lowStockAlerts = dashboardData?.low_stock_alerts || [];
  const pendingVatQueue = dashboardData?.pending_vat_bills || [];

  return (
    <div className="space-y-6">
      {/* Top Header & Date Presets */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              {isAdmin ? 'Executive Financial Dashboard' : 'Operational Workspace'}
            </h1>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                isAdmin
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-sky-100 text-sky-800 border border-sky-300'
              }`}
            >
              {isAdmin ? 'Admin View' : 'Staff View'}
            </span>
          </div>

          {dashboardData?.today_npt && (
            <p className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>Today:</span>
              <strong className="text-slate-700 font-mono">{dashboardData.today_npt.dateBs} BS</strong>
              <span>({dashboardData.today_npt.dateAd} AD)</span>
              <span>•</span>
              <span>Time: <strong className="font-mono text-slate-700">{dashboardData.today_npt.timeNpt} NPT</strong></span>
              <span>•</span>
              <span>Fiscal Year: <strong className="font-mono text-emerald-700">{dashboardData.today_npt.fiscalYear}</strong></span>
            </p>
          )}
        </div>

        {/* Preset Selector */}
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map((p) => {
            const active = preset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePresetChange(p.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  active
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                {p.label}
              </button>
            );
          })}

          <button
            type="button"
            onClick={fetchDashboard}
            disabled={loading}
            className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-colors ml-1 cursor-pointer"
            title="Refresh dashboard"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Custom Date Range Picker Accordion */}
      {showCustomPicker && (
        <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3 animate-fade-in">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Calendar className="w-4 h-4 text-emerald-600" />
            <span>Select Custom Nepali (BS) / Gregorian (AD) Date Range</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <BsAdDatePicker
              label="From Date (BS / AD)"
              valueBs={customFromBs}
              valueAd={customFromAd}
              onChange={(val: BsAdDateValue) => {
                setCustomFromBs(val.bs);
                setCustomFromAd(val.ad);
              }}
            />
            <BsAdDatePicker
              label="To Date (BS / AD)"
              valueBs={customToBs}
              valueAd={customToAd}
              onChange={(val: BsAdDateValue) => {
                setCustomToBs(val.bs);
                setCustomToAd(val.ad);
              }}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleApplyCustomDates}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer transition-colors"
            >
              Apply Custom Range
            </button>
          </div>
        </div>
      )}

      {/* ADMIN VIEW: Executive KPI Cards */}
      {isAdmin && kpis && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Purchases */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs relative overflow-hidden">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Purchases</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Receipt className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-slate-900 tabular-nums">
              {formatNpr(kpis.total_purchase_amount ?? 0)}
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 mt-2">
              <span>{kpis.total_purchases_count} entries recorded</span>
              <span className="font-medium text-slate-700">Taxable Base</span>
            </div>
          </div>

          {/* 13% VAT Amount */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs relative overflow-hidden">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Total 13% VAT</span>
              <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-teal-700 tabular-nums">
              {formatNpr(kpis.total_vat_amount ?? 0)}
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 mt-2">
              <span>Grand Total:</span>
              <span className="font-bold text-slate-800 font-mono tabular-nums">
                {formatNpr(kpis.total_amount_inc_vat ?? 0)}
              </span>
            </div>
          </div>

          {/* Payments Made */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs relative overflow-hidden">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Payments Made</span>
              <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
                <CreditCard className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-sky-700 tabular-nums">
              {formatNpr(kpis.total_paid_amount ?? 0)}
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 mt-2">
              <span>Settled payables</span>
              <Link to="/payments" className="text-emerald-700 font-semibold hover:underline flex items-center gap-0.5">
                <span>Manage</span>
                <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
          </div>

          {/* Outstanding Payables */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs relative overflow-hidden">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Outstanding Payables</span>
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-amber-700 tabular-nums">
              {formatNpr(kpis.total_outstanding_amount ?? 0)}
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 mt-2">
              <span>Unpaid balance</span>
              <span className="text-xs text-amber-600 font-medium">To Vendors</span>
            </div>
          </div>

          {/* Pending VAT Bills Count */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">VAT Bills Pending</span>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${kpis.pending_vat_bills_count > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-50 text-emerald-600'}`}>
                <FileCheck2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums flex items-baseline gap-2">
              <span>{kpis.pending_vat_bills_count}</span>
              <span className="text-xs text-slate-500 font-sans font-normal">awaiting physical bill</span>
            </div>
            <div className="mt-2 text-xs">
              <Link to="/vat-pending" className="text-amber-700 font-semibold hover:underline flex items-center gap-1">
                <span>Open Aging Tracker</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Total Active Vendors */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Active Vendors</span>
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Building2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
              {kpis.total_vendors_count}
            </div>
            <div className="mt-2 text-xs">
              <Link to="/vendors" className="text-indigo-600 font-semibold hover:underline flex items-center gap-1">
                <span>View Supplier Directory</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* This Month BS Purchases */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">This Month (BS)</span>
              <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                <Calendar className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl font-bold font-mono text-slate-900 tabular-nums">
              {formatNpr(kpis.purchases_this_month_amount ?? 0)}
            </div>
            <div className="mt-2 text-xs text-slate-500">
              <span>{kpis.purchases_this_month_count} entries this BS month</span>
            </div>
          </div>

          {/* Inventory Valuation & Health */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Inventory Value</span>
              <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                <Package className="w-4 h-4" />
              </div>
            </div>
            <div className="text-xl font-bold font-mono text-slate-900 tabular-nums">
              {formatNpr(kpis.total_inventory_valuation ?? 0)}
            </div>
            <div className="mt-2 text-xs flex items-center gap-2">
              <span className="text-slate-600 font-medium">{kpis.total_products} items</span>
              {(kpis.low_stock_count > 0 || kpis.out_of_stock_count > 0) && (
                <span className="text-rose-600 font-semibold flex items-center gap-0.5">
                  <AlertTriangle className="w-3 h-3" />
                  {kpis.low_stock_count + kpis.out_of_stock_count} alerts
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* STAFF VIEW: Operational Workspace */}
      {!isAdmin && kpis && (
        <div className="space-y-4">
          {/* Quick Action Banner */}
          <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white p-5 rounded-2xl shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">Purchase & Stock Operations</h2>
              <p className="text-xs text-emerald-100 mt-1">
                Enter vendor bills with live 13% VAT calculations, upload pending receipts, or review catalog stock.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link
                to="/purchases/new"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-white text-emerald-800 rounded-lg text-xs font-bold shadow-xs hover:bg-emerald-50 transition-colors"
              >
                <PlusCircle className="w-4 h-4" />
                <span>+ New Purchase Entry</span>
              </Link>
              <Link
                to="/vat-pending"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-800/60 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold border border-emerald-400/30 transition-colors"
              >
                <FileCheck2 className="w-4 h-4" />
                <span>Pending VAT Queue</span>
              </Link>
            </div>
          </div>

          {/* Operational Count Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-semibold text-slate-500 uppercase">My Entries Submitted</span>
              <div className="text-2xl font-bold font-mono text-slate-900 mt-1 tabular-nums">
                {kpis.my_purchases_count ?? 0}
              </div>
              <p className="text-xs text-slate-500 mt-1">Total purchases entered by you</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-semibold text-slate-500 uppercase">My Pending VAT Bills</span>
              <div className="text-2xl font-bold font-mono text-amber-700 mt-1 tabular-nums">
                {kpis.my_pending_vat_count ?? 0}
              </div>
              <p className="text-xs text-slate-500 mt-1">Require physical VAT receipt upload</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-semibold text-slate-500 uppercase">Total Active Vendors</span>
              <div className="text-2xl font-bold font-mono text-slate-900 mt-1 tabular-nums">
                {kpis.total_vendors_count}
              </div>
              <p className="text-xs text-slate-500 mt-1">Available for purchase orders</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-semibold text-slate-500 uppercase">Low Stock Alerts</span>
              <div className="text-2xl font-bold font-mono text-rose-700 mt-1 tabular-nums">
                {kpis.low_stock_count + kpis.out_of_stock_count}
              </div>
              <p className="text-xs text-slate-500 mt-1">Items at or below reorder level</p>
            </div>
          </div>

          {/* Staff Pending VAT Bills Action Queue */}
          {pendingVatQueue.length > 0 && (
            <div className="bg-white rounded-xl border border-amber-200 shadow-xs overflow-hidden">
              <div className="p-4 bg-amber-50/50 border-b border-amber-200 flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-900">
                  <ShieldAlert className="w-5 h-5 text-amber-600" />
                  <span className="font-bold text-sm">Actionable: Unreceived VAT Bills</span>
                  <span className="text-xs bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full font-semibold">
                    {pendingVatQueue.length} Pending
                  </span>
                </div>
                <Link to="/vat-pending" className="text-xs font-semibold text-amber-800 hover:underline">
                  View Full Aging Tracker →
                </Link>
              </div>

              <div className="divide-y divide-slate-100">
                {pendingVatQueue.slice(0, 5).map((bill) => (
                  <div key={bill.id} className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 transition-colors">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900 font-mono">{bill.purchase_code}</span>
                        {bill.bill_number && (
                          <span className="text-xs text-slate-500 font-mono">Bill #{bill.bill_number}</span>
                        )}
                        <VatStatusBadge status={bill.vat_bill_status} />
                      </div>
                      <p className="text-xs text-slate-600 mt-1 font-medium">{bill.vendor_name} — {bill.product_summary}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Purchase Date: <span className="font-mono">{bill.purchase_date_bs} BS</span> ({bill.purchase_date_ad} AD)
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded bg-amber-100 text-amber-800 font-mono">
                          {bill.days_pending} days pending
                        </span>
                      </div>
                      <Link
                        to={`/purchases/${bill.id}`}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                      >
                        Upload Bill
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ADMIN INTERACTIVE CHARTS */}
      {isAdmin && charts && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart 1: Monthly Purchase Expenses vs Paid */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Monthly Purchase Expenses vs Payments</h3>
                <p className="text-xs text-slate-500">Gross purchases vs actual settlements by BS month</p>
              </div>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={charts.monthly_series} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickFormatter={(val) => `Rs. ${(val / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(val: any) => [formatNpr(Number(val) || 0), '']}
                    contentStyle={{ borderRadius: '8px', fontSize: '12px', border: '1px solid #e2e8f0' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                  <Bar dataKey="total_amount" name="Gross Purchases (Inc. VAT)" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="paid_amount" name="Payments Settled" fill="#0284c7" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Monthly 13% VAT Trend */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Monthly 13% VAT Trend</h3>
                <p className="text-xs text-slate-500">Total input VAT recorded per Bikram Sambat month</p>
              </div>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={charts.monthly_series} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="vatGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickFormatter={(val) => `Rs. ${(val / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(val: any) => [formatNpr(Number(val) || 0), '13% VAT']}
                    contentStyle={{ borderRadius: '8px', fontSize: '12px', border: '1px solid #e2e8f0' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                  <Area
                    type="monotone"
                    dataKey="vat_amount"
                    name="13% VAT Amount"
                    stroke="#0d9488"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#vatGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 3: Top Vendors by Purchase Volume */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Top Vendors by Purchase Volume</h3>
                <p className="text-xs text-slate-500">Top 10 suppliers by total transaction value & outstanding</p>
              </div>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={charts.vendor_wise_purchases}
                  layout="vertical"
                  margin={{ top: 5, right: 15, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                  />
                  <YAxis
                    dataKey="vendor_name"
                    type="category"
                    tick={{ fontSize: 10, fill: '#334155' }}
                    width={110}
                  />
                  <Tooltip
                    formatter={(val: any) => [formatNpr(Number(val) || 0), '']}
                    contentStyle={{ borderRadius: '8px', fontSize: '12px', border: '1px solid #e2e8f0' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '5px' }} />
                  <Bar dataKey="total_amount" name="Total Volume" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="outstanding_amount" name="Outstanding Balance" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 4: Paid vs Unpaid & VAT Status Split */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Payment & VAT Status Breakdown</h3>
                <p className="text-xs text-slate-500">Current liability and bill compliance distribution</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 h-72">
              {/* Payment Split */}
              <div className="h-full flex flex-col items-center">
                <span className="text-xs font-semibold text-slate-600 mb-1">Paid vs Unpaid Liability</span>
                <ResponsiveContainer width="100%" height="85%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Paid', value: charts.paid_vs_unpaid.paid_amount },
                        { name: 'Unpaid / Pending', value: charts.paid_vs_unpaid.unpaid_amount },
                      ]}
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      <Cell fill="#10b981" />
                      <Cell fill="#f59e0b" />
                    </Pie>
                    <Tooltip formatter={(val: any) => formatNpr(Number(val) || 0)} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* VAT Bill Status Split */}
              <div className="h-full flex flex-col items-center">
                <span className="text-xs font-semibold text-slate-600 mb-1">VAT Bill Compliance</span>
                <ResponsiveContainer width="100%" height="85%">
                  <PieChart>
                    <Pie
                      data={charts.vat_status_breakdown.map((item) => ({
                        name: item.status,
                        value: item.count,
                      }))}
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {charts.vat_status_breakdown.map((_, idx) => (
                        <Cell key={`cell-${idx}`} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val: any) => [`${val} Purchases`, 'Count']} />
                    <Legend wrapperStyle={{ fontSize: '10px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SHARED FEEDS: Recent Purchases & Low Stock Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Purchases (2 Cols on lg) */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-slate-600" />
              <h3 className="font-bold text-slate-900 text-sm">Recent Purchase Transactions</h3>
            </div>
            <Link to="/purchases" className="text-xs text-emerald-700 font-semibold hover:underline flex items-center gap-1">
              <span>View All Purchases</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Code / Bill #</th>
                  <th className="px-4 py-3">Vendor / Summary</th>
                  <th className="px-4 py-3">Purchase Date</th>
                  <th className="px-4 py-3">Entry NPT</th>
                  {isAdmin && <th className="px-4 py-3 text-right">Total Amount</th>}
                  <th className="px-4 py-3 text-center">VAT Bill</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-normal text-slate-700">
                {recentEntries.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 8 : 7} className="px-4 py-8 text-center text-slate-400">
                      No purchases found in the selected range.
                    </td>
                  </tr>
                ) : (
                  recentEntries.map((pur) => (
                    <tr key={pur.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-bold font-mono text-slate-900">{pur.purchase_code}</span>
                        {pur.bill_number && (
                          <div className="text-[11px] text-slate-500 font-mono">Bill: {pur.bill_number}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <div className="font-semibold text-slate-900 truncate">{pur.vendor_name}</div>
                        <div className="text-slate-500 truncate text-[11px]">{pur.product_summary}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-mono text-slate-800 font-medium">{pur.purchase_date_bs} BS</div>
                        <div className="text-[10px] text-slate-400">{pur.purchase_date_ad} AD</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                        <div>{pur.entry_time_npt || 'N/A'}</div>
                        <div className="text-[10px] text-slate-400">{pur.entry_date_bs}</div>
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 whitespace-nowrap text-right font-mono font-bold text-slate-900 tabular-nums">
                          {formatNpr(pur.total_amount)}
                        </td>
                      )}
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <VatStatusBadge status={pur.vat_bill_status} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center space-y-1">
                        <div><ReviewStatusBadge status={pur.review_status} /></div>
                        <div><PaymentStatusBadge status={pur.payment_status} /></div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <Link
                          to={`/purchases/${pur.id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors"
                        >
                          <span>View</span>
                          <ExternalLink className="w-3 h-3 text-slate-500" />
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Low Stock & Reorder Alerts (1 Col on lg) */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-amber-600" />
              <h3 className="font-bold text-slate-900 text-sm">Low Stock Alerts</h3>
            </div>
            <Link to="/inventory" className="text-xs text-emerald-700 font-semibold hover:underline flex items-center gap-1">
              <span>Inventory</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="p-3 divide-y divide-slate-100 flex-1 overflow-y-auto max-h-[420px]">
            {lowStockAlerts.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                All inventory items are currently above their reorder points.
              </div>
            ) : (
              lowStockAlerts.map((item) => (
                <div key={item.id} className="py-2.5 px-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate text-xs">{item.name}</p>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                      SKU: {item.sku} {item.category && `• ${item.category}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <StockStatusBadge currentStock={item.current_stock} minStockLevel={item.min_stock_level} />
                    <div className="text-[11px] text-slate-500 font-mono mt-1">
                      {item.current_stock} / {item.min_stock_level} {item.unit_of_measurement}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
