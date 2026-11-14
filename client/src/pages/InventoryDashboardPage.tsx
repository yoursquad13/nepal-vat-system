import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Boxes,
  Package,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownLeft,
  SlidersHorizontal,
  RefreshCw,
  Search,
  ExternalLink,
  X,
  History,
} from 'lucide-react';
import {
  api,
  InventoryDashboardResponse,
  InventoryMovement,
  Product,
  StockOutParams,
  AdjustmentParams,
  StockOutReason,
  AdjustmentType,
} from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatNPR } from '../utils/money';
import { getNowNpt } from '../utils/nepaliDate';
import { StockStatusBadge } from '../components/StatusBadges';
import { BsAdDatePicker, BsAdDateValue } from '../components/BsAdDatePicker';

export function InventoryDashboardPage() {
  const { isAdmin } = useAuth();
  const { success: toastSuccess, error: toastError } = useToast();

  const [loading, setLoading] = useState<boolean>(true);
  const [dashboard, setDashboard] = useState<InventoryDashboardResponse | null>(null);
  const [productsList, setProductsList] = useState<Product[]>([]);

  // Search in Stock Table
  const [stockSearchQuery, setStockSearchQuery] = useState<string>('');

  // Tab State: 'overview' | 'movements'
  const [activeTab, setActiveTab] = useState<'overview' | 'movements'>('overview');

  // Movements Ledger Tab State
  const [movementsList, setMovementsList] = useState<InventoryMovement[]>([]);
  const [movementsLoading, setMovementsLoading] = useState<boolean>(false);
  const [movementTypeFilter, setMovementTypeFilter] = useState<string>('');
  const [movementPage, setMovementPage] = useState<number>(1);
  const [movementTotalPages, setMovementTotalPages] = useState<number>(1);

  // Stock Out Modal State
  const [stockOutModalOpen, setStockOutModalOpen] = useState<boolean>(false);
  const [stockOutProductId, setStockOutProductId] = useState<number | ''>('');
  const [stockOutQty, setStockOutQty] = useState<string>('');
  const [stockOutReason, setStockOutReason] = useState<StockOutReason>('SOLD');
  const [stockOutDateBs, setStockOutDateBs] = useState<string>('');
  const [stockOutDateAd, setStockOutDateAd] = useState<string>('');
  const [stockOutRefNo, setStockOutRefNo] = useState<string>('');
  const [stockOutRemarks, setStockOutRemarks] = useState<string>('');
  const [stockOutNegativeOverride, setStockOutNegativeOverride] = useState<boolean>(false);
  const [isStockOutSubmitting, setIsStockOutSubmitting] = useState<boolean>(false);

  // Stock Adjustment Modal State (Admin Only)
  const [adjModalOpen, setAdjModalOpen] = useState<boolean>(false);
  const [adjProductId, setAdjProductId] = useState<number | ''>('');
  const [adjType, setAdjType] = useState<AdjustmentType>('OPENING_STOCK');
  const [adjQty, setAdjQty] = useState<string>('');
  const [adjUnitCost, setAdjUnitCost] = useState<string>('');
  const [adjReason, setAdjReason] = useState<string>('Physical Inventory Count Reconciliation');
  const [adjDateBs, setAdjDateBs] = useState<string>('');
  const [adjDateAd, setAdjDateAd] = useState<string>('');
  const [adjRefNo, setAdjRefNo] = useState<string>('');
  const [adjRemarks, setAdjRemarks] = useState<string>('');
  const [adjNegativeOverride, setAdjNegativeOverride] = useState<boolean>(false);
  const [isAdjSubmitting, setIsAdjSubmitting] = useState<boolean>(false);

  // Fetch Dashboard data
  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, prodsRes] = await Promise.all([
        api.inventory.getDashboard(),
        api.products.list({ is_active: true }),
      ]);
      setDashboard(dashRes);
      setProductsList(prodsRes.products || []);
    } catch (err: any) {
      toastError(err.message || 'Failed to load inventory dashboard', 'Inventory Error');
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Fetch Movements Ledger on tab change or filter
  const fetchMovements = useCallback(async () => {
    setMovementsLoading(true);
    try {
      const res = await api.inventory.getMovements({
        movementType: movementTypeFilter || undefined,
        page: movementPage,
        limit: 25,
      });
      setMovementsList(res.movements || []);
      setMovementTotalPages(res.total_pages || res.totalPages || 1);
    } catch (err: any) {
      toastError(err.message || 'Failed to load stock movements', 'Movements Error');
    } finally {
      setMovementsLoading(false);
    }
  }, [movementTypeFilter, movementPage, toastError]);

  useEffect(() => {
    if (activeTab === 'movements') {
      fetchMovements();
    }
  }, [activeTab, fetchMovements]);

  // Open Stock Out Modal
  const handleOpenStockOut = (preselectedProductId?: number) => {
    const now = getNowNpt();
    setStockOutProductId(preselectedProductId ?? (productsList[0]?.id ?? ''));
    setStockOutQty('');
    setStockOutReason('SOLD');
    setStockOutDateBs(now.dateBs);
    setStockOutDateAd(now.dateAd);
    setStockOutRefNo('');
    setStockOutRemarks('');
    setStockOutNegativeOverride(false);
    setStockOutModalOpen(true);
  };

  // Open Adjustment Modal (Admin Only)
  const handleOpenAdjustment = (preselectedProductId?: number) => {
    const now = getNowNpt();
    setAdjProductId(preselectedProductId ?? (productsList[0]?.id ?? ''));
    setAdjType('OPENING_STOCK');
    setAdjQty('');
    setAdjUnitCost('');
    setAdjReason('Physical Inventory Count Reconciliation');
    setAdjDateBs(now.dateBs);
    setAdjDateAd(now.dateAd);
    setAdjRefNo('');
    setAdjRemarks('');
    setAdjNegativeOverride(false);
    setAdjModalOpen(true);
  };

  // Submit Stock Out
  const handleSubmitStockOut = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockOutProductId || Number(stockOutQty) <= 0) {
      toastError('Please select a product and enter a positive quantity.', 'Validation Error');
      return;
    }

    setIsStockOutSubmitting(true);
    try {
      const params: StockOutParams = {
        productId: Number(stockOutProductId),
        quantity: Number(stockOutQty),
        reason: stockOutReason,
        movementDateAd: stockOutDateAd || undefined,
        movementDateBs: stockOutDateBs || undefined,
        referenceNo: stockOutRefNo.trim() || null,
        remarks: stockOutRemarks.trim() || null,
        allowNegativeOverride: isAdmin ? stockOutNegativeOverride : false,
      };

      const res = await api.inventory.stockOut(params);
      toastSuccess(res.message || 'Stock issued out successfully.', 'Stock Issued');
      setStockOutModalOpen(false);
      fetchDashboardData();
      if (activeTab === 'movements') fetchMovements();
    } catch (err: any) {
      toastError(err.message || 'Failed to record stock out', 'Stock Out Failed');
    } finally {
      setIsStockOutSubmitting(false);
    }
  };

  // Submit Stock Adjustment
  const handleSubmitAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjProductId || Number(adjQty) <= 0) {
      toastError('Please select a product and enter a valid quantity.', 'Validation Error');
      return;
    }

    setIsAdjSubmitting(true);
    try {
      const params: AdjustmentParams = {
        productId: Number(adjProductId),
        type: adjType,
        quantity: Number(adjQty),
        unitCost: adjUnitCost ? Number(adjUnitCost) : null,
        reason: adjReason.trim() || undefined,
        movementDateAd: adjDateAd || undefined,
        movementDateBs: adjDateBs || undefined,
        referenceNo: adjRefNo.trim() || null,
        remarks: adjRemarks.trim() || null,
        allowNegativeOverride: adjNegativeOverride,
      };

      const res = await api.inventory.adjustStock(params);
      toastSuccess(res.message || 'Stock adjusted successfully.', 'Stock Adjusted');
      setAdjModalOpen(false);
      fetchDashboardData();
      if (activeTab === 'movements') fetchMovements();
    } catch (err: any) {
      toastError(err.message || 'Failed to adjust stock', 'Adjustment Failed');
    } finally {
      setIsAdjSubmitting(false);
    }
  };

  const kpis = dashboard?.kpis;
  const lowStockProducts = dashboard?.low_stock_products || [];
  const stockTable = dashboard?.stock_table || [];
  const recentIn = dashboard?.recent_in || [];
  const recentOut = dashboard?.recent_out || [];

  // Filtered Stock Table
  const filteredStockTable = stockTable.filter((item: any) => {
    if (!stockSearchQuery.trim()) return true;
    const q = stockSearchQuery.toLowerCase();
    return (
      (item.name && item.name.toLowerCase().includes(q)) ||
      (item.sku && item.sku.toLowerCase().includes(q)) ||
      (item.category && item.category.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center shrink-0">
              <Boxes className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Inventory & Stock Management
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Real-time stock valuation, reorder thresholds, physical issue vouchers, and opening balance adjustments.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fetchDashboardData()}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            {/* Issue Stock Out (Both Admin & Staff) */}
            <button
              type="button"
              onClick={() => handleOpenStockOut()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
            >
              <ArrowDownLeft className="w-4 h-4" />
              <span>Issue Stock Out</span>
            </button>

            {/* Stock Adjustment (Admin Only) */}
            {isAdmin && (
              <button
                type="button"
                onClick={() => handleOpenAdjustment()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span>Adjust Stock / Opening</span>
              </button>
            )}

            <Link
              to="/products"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
            >
              <Package className="w-4 h-4" />
              <span>Products Master</span>
            </Link>
          </div>
        </div>

        {/* Top Inventory KPI Cards */}
        {kpis && (
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-5 gap-3 pt-5 border-t border-slate-100 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[11px] text-slate-400 uppercase font-bold block">Total Products</span>
              <span className="text-base font-bold text-slate-900 tabular-nums">
                {kpis.total_products}
              </span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[11px] text-slate-400 uppercase font-bold block">Total Stock Qty</span>
              <span className="text-base font-bold text-slate-900 tabular-nums">
                {kpis.total_stock_quantity}
              </span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[11px] text-slate-400 uppercase font-bold block">Inventory Valuation</span>
              <span className="text-base font-bold text-emerald-700 tabular-nums">
                {formatNPR(kpis.total_inventory_valuation)}
              </span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[11px] text-slate-400 uppercase font-bold block">Low Stock Alerts</span>
              <span
                className={`text-base font-bold tabular-nums ${
                  kpis.low_stock_count > 0 ? 'text-amber-700' : 'text-slate-900'
                }`}
              >
                {kpis.low_stock_count}
              </span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[11px] text-slate-400 uppercase font-bold block">Out of Stock</span>
              <span
                className={`text-base font-bold tabular-nums ${
                  kpis.out_of_stock_count > 0 ? 'text-rose-700' : 'text-slate-900'
                }`}
              >
                {kpis.out_of_stock_count}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Prominent Low / Out-of-Stock Alert Banner */}
      {lowStockProducts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 shadow-xs animate-fade-in">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-amber-950">
                  Critical Stock Warning: {lowStockProducts.length} Product(s) Below Minimum Reorder Level
                </h3>
                <span className="text-xs font-semibold text-amber-800 hidden sm:inline">
                  Action Required
                </span>
              </div>
              <p className="text-xs text-amber-800/90 mt-1">
                The following products have depleted stock below safety thresholds. Replenish catalog inventory immediately to avoid stockouts.
              </p>

              {/* Badges list */}
              <div className="mt-3 flex flex-wrap gap-2">
                {lowStockProducts.slice(0, 8).map((p: any) => (
                  <Link
                    key={p.id}
                    to={`/products/${p.id}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-amber-300 rounded-lg text-xs font-semibold text-amber-950 hover:bg-amber-100 transition-colors shadow-2xs"
                  >
                    <span>{p.name}</span>
                    <span className="font-mono text-amber-700 font-bold tabular-nums">
                      ({p.current_stock} / min {p.min_stock_level} {p.unit_of_measurement})
                    </span>
                  </Link>
                ))}
                {lowStockProducts.length > 8 && (
                  <span className="text-xs font-medium text-amber-800 self-center">
                    +{lowStockProducts.length - 8} more...
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tabs (Stock Table Overview vs Full Movements Ledger) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-2 ${
                activeTab === 'overview'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>Current Stock Status ({stockTable.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('movements')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-2 ${
                activeTab === 'movements'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Stock Movements Ledger</span>
            </button>
          </div>

          {activeTab === 'overview' && (
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-2 text-slate-400" />
              <input
                type="text"
                value={stockSearchQuery}
                onChange={(e) => setStockSearchQuery(e.target.value)}
                placeholder="Search stock table..."
                className="w-full pl-9 pr-3 py-1 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-emerald-600"
              />
            </div>
          )}
        </div>

        {/* Tab 1: Current Stock Status Table */}
        {activeTab === 'overview' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Product Name & SKU</th>
                  <th className="px-4 py-3 whitespace-nowrap">Category</th>
                  <th className="px-4 py-3 whitespace-nowrap">Unit</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap font-bold text-slate-900">
                    Current Stock
                  </th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Min Level</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Avg Cost (VAT-excl.)</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap font-bold text-slate-900">
                    Stock Valuation
                  </th>
                  <th className="px-4 py-3 text-center whitespace-nowrap">Stock Status</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredStockTable.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                      No products match your search query.
                    </td>
                  </tr>
                ) : (
                  filteredStockTable.map((p: any) => (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Name & SKU */}
                      <td className="px-4 py-3.5">
                        <Link
                          to={`/products/${p.id}`}
                          className="font-bold text-slate-900 hover:text-indigo-700 hover:underline block"
                        >
                          {p.name}
                        </Link>
                        {p.sku && (
                          <span className="text-[11px] font-mono text-slate-400">
                            SKU: {p.sku}
                          </span>
                        )}
                      </td>

                      {/* Category */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-slate-600">
                        {p.category || '—'}
                      </td>

                      {/* Unit */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-slate-600 uppercase font-mono">
                        {p.unit_of_measurement}
                      </td>

                      {/* Current Stock */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap font-bold tabular-nums text-slate-900 text-sm">
                        {p.current_stock}
                      </td>

                      {/* Min Level */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap tabular-nums text-slate-500">
                        {p.min_stock_level}
                      </td>

                      {/* Avg Cost */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap tabular-nums text-slate-600">
                        {formatNPR(p.avg_purchase_price)}
                      </td>

                      {/* Valuation */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap tabular-nums font-bold text-emerald-700">
                        {formatNPR(p.valuation || p.current_stock * p.avg_purchase_price)}
                      </td>

                      {/* Status Badge */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        <StockStatusBadge
                          currentStock={p.current_stock}
                          minStockLevel={p.min_stock_level}
                          size="sm"
                        />
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenStockOut(p.id)}
                            className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-[11px] font-semibold"
                            title="Issue Stock Out"
                          >
                            Stock Out
                          </button>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => handleOpenAdjustment(p.id)}
                              className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded text-[11px] font-semibold"
                              title="Adjust Stock"
                            >
                              Adjust
                            </button>
                          )}
                          <Link
                            to={`/products/${p.id}`}
                            className="p-1 rounded-md border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                            title="View Product History"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2: Full Movements Ledger */}
        {activeTab === 'movements' && (
          <div>
            {/* Filter Sub-bar */}
            <div className="px-6 py-3 bg-slate-50/50 border-b border-slate-200 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-semibold">Filter Movement:</span>
                <select
                  value={movementTypeFilter}
                  onChange={(e) => {
                    setMovementTypeFilter(e.target.value);
                    setMovementPage(1);
                  }}
                  className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs text-slate-700"
                >
                  <option value="">All Movement Types</option>
                  <option value="STOCK_IN">Stock In (Purchases)</option>
                  <option value="STOCK_OUT">Stock Out (Issues)</option>
                  <option value="OPENING_STOCK">Opening Stock</option>
                  <option value="ADJUSTMENT_IN">Adjustment In</option>
                  <option value="ADJUSTMENT_OUT">Adjustment Out</option>
                </select>
              </div>

              <button
                type="button"
                onClick={() => fetchMovements()}
                className="text-xs text-indigo-600 hover:underline font-semibold"
              >
                Refresh Movements
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 whitespace-nowrap">Date (BS & AD)</th>
                    <th className="px-4 py-3 whitespace-nowrap">Product</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">Type</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap text-emerald-700">Qty In</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap text-rose-700">Qty Out</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap font-bold text-slate-900">
                      Balance After
                    </th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">Unit Cost</th>
                    <th className="px-4 py-3 whitespace-nowrap">Reference / Purchase</th>
                    <th className="px-4 py-3 whitespace-nowrap">Staff</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {movementsLoading ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-600 mb-2" />
                        <span>Loading movements ledger...</span>
                      </td>
                    </tr>
                  ) : movementsList.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                        No inventory movements found.
                      </td>
                    </tr>
                  ) : (
                    movementsList.map((m) => {
                      const isIn = m.qty_in > 0;

                      return (
                        <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                            <div className="font-semibold text-slate-800">{m.movement_date_bs} BS</div>
                            <div className="text-[11px] text-slate-400">{m.movement_date_ad} AD</div>
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            {m.product_name || `Product #${m.product_id}`}
                            {m.sku && (
                              <span className="block text-[10px] text-slate-400 font-mono">
                                {m.sku}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                isIn
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              {m.movement_type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums text-emerald-700 font-semibold">
                            {m.qty_in > 0 ? `+${m.qty_in}` : '—'}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums text-rose-700 font-semibold">
                            {m.qty_out > 0 ? `-${m.qty_out}` : '—'}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums font-bold text-slate-900">
                            {m.balance_after}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums text-slate-600">
                            {m.unit_cost !== null ? formatNPR(m.unit_cost) : '—'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {m.purchase_id ? (
                              <Link
                                to={`/purchases/${m.purchase_id}`}
                                className="text-indigo-600 hover:underline font-semibold"
                              >
                                {m.reference_label || `Purchase #${m.purchase_id}`}
                              </Link>
                            ) : (
                              <span className="text-slate-600">{m.reference_label || '—'}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                            {m.responsible_staff_name || 'System'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination for movements */}
            {movementTotalPages > 1 && (
              <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
                <span>
                  Page <strong className="text-slate-800">{movementPage}</strong> of{' '}
                  <strong className="text-slate-800">{movementTotalPages}</strong>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={movementPage <= 1}
                    onClick={() => setMovementPage((p) => Math.max(p - 1, 1))}
                    className="px-3 py-1 border border-slate-300 rounded-lg bg-white disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={movementPage >= movementTotalPages}
                    onClick={() => setMovementPage((p) => Math.min(p + 1, movementTotalPages))}
                    className="px-3 py-1 border border-slate-300 rounded-lg bg-white disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dual Feeds: Recent Stock In vs Recent Stock Out */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Stock In Feed */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                <span>Recent Stock In (Purchases & Receipts)</span>
              </h3>
            </div>
            {recentIn.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center italic">
                No recent stock receipts recorded.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {recentIn.map((mov) => (
                  <div key={mov.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 truncate">
                        {mov.product_name}
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {mov.movement_date_bs} BS · {mov.reference_label || 'Purchase Receipt'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-bold text-emerald-700 text-sm tabular-nums">
                        +{mov.qty_in} {mov.unit_of_measurement || 'pcs'}
                      </span>
                      <span className="block text-[10px] text-slate-400">
                        Bal: {mov.balance_after}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Stock Out Feed */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <ArrowDownLeft className="w-4 h-4 text-rose-600" />
                <span>Recent Stock Out (Issues & Dispatches)</span>
              </h3>
            </div>
            {recentOut.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center italic">
                No recent stock issues recorded.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {recentOut.map((mov) => (
                  <div key={mov.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 truncate">
                        {mov.product_name}
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {mov.movement_date_bs} BS · Reason: {mov.reason || 'Sold'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-bold text-rose-700 text-sm tabular-nums">
                        -{mov.qty_out} {mov.unit_of_measurement || 'pcs'}
                      </span>
                      <span className="block text-[10px] text-slate-400">
                        Bal: {mov.balance_after}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* Modal: Issue Stock Out                                         */}
      {/* ============================================================== */}
      {stockOutModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-xs animate-fade-in"
          role="dialog"
          aria-modal="true"
          onClick={() => setStockOutModalOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 bg-rose-600 text-white flex items-center justify-between shrink-0">
              <h3 className="text-base font-bold flex items-center gap-2">
                <ArrowDownLeft className="w-5 h-5" />
                <span>Issue Stock Out (Inventory Dispatch)</span>
              </h3>
              <button
                type="button"
                onClick={() => setStockOutModalOpen(false)}
                className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitStockOut} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Product <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={stockOutProductId}
                  onChange={(e) => setStockOutProductId(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-emerald-600"
                >
                  <option value="">-- Select Product --</option>
                  {productsList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku}) — Stock: {p.current_stock} {p.unit_of_measurement}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Quantity to Issue <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={stockOutQty}
                    onChange={(e) => setStockOutQty(e.target.value)}
                    placeholder="e.g. 5"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold tabular-nums text-slate-900 focus:outline-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Issue Reason <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={stockOutReason}
                    onChange={(e) => setStockOutReason(e.target.value as StockOutReason)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-emerald-600"
                  >
                    <option value="SOLD">Goods Sold to Customer</option>
                    <option value="INTERNAL_ISSUE">Internal Department Consumption</option>
                    <option value="DAMAGED_EXPIRED">Damaged / Expired Goods</option>
                    <option value="OTHER">Other Reason</option>
                  </select>
                </div>
              </div>

              {/* Date */}
              <BsAdDatePicker
                label="Movement Date (BS & AD)"
                valueBs={stockOutDateBs}
                valueAd={stockOutDateAd}
                onChange={(val: BsAdDateValue) => {
                  setStockOutDateBs(val.bs);
                  setStockOutDateAd(val.ad);
                }}
                required
              />

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reference No. (Invoice / Delivery Order #)
                </label>
                <input
                  type="text"
                  value={stockOutRefNo}
                  onChange={(e) => setStockOutRefNo(e.target.value)}
                  placeholder="e.g. DO-9021 or Sale # 410"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Remarks / Notes
                </label>
                <textarea
                  rows={2}
                  value={stockOutRemarks}
                  onChange={(e) => setStockOutRemarks(e.target.value)}
                  placeholder="Additional issue details..."
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-emerald-600"
                />
              </div>

              {/* Admin-only Negative Override */}
              {isAdmin && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-1">
                  <label className="inline-flex items-center gap-2 text-xs font-bold text-rose-800 select-none cursor-pointer">
                    <input
                      type="checkbox"
                      checked={stockOutNegativeOverride}
                      onChange={(e) => setStockOutNegativeOverride(e.target.checked)}
                      className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-rose-300"
                    />
                    <span>Allow Negative Stock (Admin Override)</span>
                  </label>
                  <p className="text-[11px] text-rose-600 pl-6">
                    Warning: Staff cannot issue stock when balance is insufficient. Admins may override only with explicit remarks.
                  </p>
                </div>
              )}

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setStockOutModalOpen(false)}
                  disabled={isStockOutSubmitting}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isStockOutSubmitting}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
                >
                  {isStockOutSubmitting ? 'Issuing...' : 'Confirm Stock Out'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* Modal: Admin Stock Adjustment / Opening Stock                  */}
      {/* ============================================================== */}
      {adjModalOpen && isAdmin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-xs animate-fade-in"
          role="dialog"
          aria-modal="true"
          onClick={() => setAdjModalOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 bg-indigo-600 text-white flex items-center justify-between shrink-0">
              <h3 className="text-base font-bold flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5" />
                <span>Stock Adjustment / Opening Balance</span>
              </h3>
              <button
                type="button"
                onClick={() => setAdjModalOpen(false)}
                className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitAdjustment} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Product <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={adjProductId}
                  onChange={(e) => setAdjProductId(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-indigo-600"
                >
                  <option value="">-- Select Product --</option>
                  {productsList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku}) — Current Stock: {p.current_stock}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Adjustment Type <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={adjType}
                    onChange={(e) => setAdjType(e.target.value as AdjustmentType)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:outline-indigo-600"
                  >
                    <option value="OPENING_STOCK">Opening Stock</option>
                    <option value="ADJUSTMENT_IN">Adjustment In (Add Stock)</option>
                    <option value="ADJUSTMENT_OUT">Adjustment Out (Deduct Stock)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Quantity <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={adjQty}
                    onChange={(e) => setAdjQty(e.target.value)}
                    placeholder="e.g. 100"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold tabular-nums text-slate-900 focus:outline-indigo-600"
                  />
                </div>
              </div>

              {/* Unit Cost for Opening / Add */}
              {(adjType === 'OPENING_STOCK' || adjType === 'ADJUSTMENT_IN') && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Unit Cost (VAT-exclusive Rs.)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={adjUnitCost}
                    onChange={(e) => setAdjUnitCost(e.target.value)}
                    placeholder="e.g. 250.00 (optional)"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs tabular-nums text-slate-800 focus:outline-indigo-600"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Specifying cost will recalculate the product's weighted average cost.
                  </p>
                </div>
              )}

              {/* Date */}
              <BsAdDatePicker
                label="Adjustment Date (BS & AD)"
                valueBs={adjDateBs}
                valueAd={adjDateAd}
                onChange={(val: BsAdDateValue) => {
                  setAdjDateBs(val.bs);
                  setAdjDateAd(val.ad);
                }}
                required
              />

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reason
                </label>
                <input
                  type="text"
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  placeholder="e.g. Physical stock count reconciliation"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Remarks / Audit Justification
                </label>
                <textarea
                  rows={2}
                  value={adjRemarks}
                  onChange={(e) => setAdjRemarks(e.target.value)}
                  placeholder="Explain reason for adjustment..."
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-indigo-600"
                />
              </div>

              {/* Negative Override */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
                <label className="inline-flex items-center gap-2 text-xs font-bold text-amber-900 select-none cursor-pointer">
                  <input
                    type="checkbox"
                    checked={adjNegativeOverride}
                    onChange={(e) => setAdjNegativeOverride(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-amber-300"
                  />
                  <span>Allow Negative Stock if Deduction Exceeds On-Hand</span>
                </label>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setAdjModalOpen(false)}
                  disabled={isAdjSubmitting}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAdjSubmitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
                >
                  {isAdjSubmitting ? 'Adjusting...' : 'Confirm Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
