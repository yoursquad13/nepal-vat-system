import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Package,
  ArrowLeft,
  ArrowDownLeft,
  SlidersHorizontal,
  RefreshCw,
  ExternalLink,
  History,
  X,
} from 'lucide-react';
import {
  api,
  Product,
  InventoryMovement,
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

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const productId = Number(id);
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { success: toastSuccess, error: toastError } = useToast();

  const [loading, setLoading] = useState<boolean>(true);
  const [product, setProduct] = useState<Product | null>(null);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);

  // Filter movement types in table
  const [movementFilter, setMovementFilter] = useState<string>('ALL');

  // Stock Out Modal
  const [stockOutModalOpen, setStockOutModalOpen] = useState<boolean>(false);
  const [stockOutQty, setStockOutQty] = useState<string>('');
  const [stockOutReason, setStockOutReason] = useState<StockOutReason>('SOLD');
  const [stockOutDateBs, setStockOutDateBs] = useState<string>('');
  const [stockOutDateAd, setStockOutDateAd] = useState<string>('');
  const [stockOutRefNo, setStockOutRefNo] = useState<string>('');
  const [stockOutRemarks, setStockOutRemarks] = useState<string>('');
  const [stockOutNegativeOverride, setStockOutNegativeOverride] = useState<boolean>(false);
  const [isStockOutSubmitting, setIsStockOutSubmitting] = useState<boolean>(false);

  // Stock Adjustment Modal (Admin Only)
  const [adjModalOpen, setAdjModalOpen] = useState<boolean>(false);
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

  // Fetch Product Details
  const fetchProduct = useCallback(async () => {
    if (!productId || Number.isNaN(productId)) {
      navigate('/products');
      return;
    }

    setLoading(true);
    try {
      const res = await api.products.get(productId);
      setProduct(res.product);
      setMovements(res.inventory_movements || []);
    } catch (err: any) {
      toastError(err.message || 'Product not found', 'Error Loading Product');
      navigate('/products');
    } finally {
      setLoading(false);
    }
  }, [productId, navigate, toastError]);

  useEffect(() => {
    fetchProduct();
  }, [fetchProduct]);

  // Open Stock Out
  const handleOpenStockOut = () => {
    const now = getNowNpt();
    setStockOutQty('');
    setStockOutReason('SOLD');
    setStockOutDateBs(now.dateBs);
    setStockOutDateAd(now.dateAd);
    setStockOutRefNo('');
    setStockOutRemarks('');
    setStockOutNegativeOverride(false);
    setStockOutModalOpen(true);
  };

  // Open Adjustment
  const handleOpenAdjustment = () => {
    const now = getNowNpt();
    setAdjType('OPENING_STOCK');
    setAdjQty('');
    setAdjUnitCost(product ? String(product.avg_purchase_price || '') : '');
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
    if (!product || Number(stockOutQty) <= 0) {
      toastError('Please enter a valid positive quantity', 'Validation Error');
      return;
    }

    setIsStockOutSubmitting(true);
    try {
      const params: StockOutParams = {
        productId: product.id,
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
      fetchProduct();
    } catch (err: any) {
      toastError(err.message || 'Failed to issue stock out', 'Stock Out Failed');
    } finally {
      setIsStockOutSubmitting(false);
    }
  };

  // Submit Adjustment
  const handleSubmitAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product || Number(adjQty) <= 0) {
      toastError('Please enter a valid positive quantity', 'Validation Error');
      return;
    }

    setIsAdjSubmitting(true);
    try {
      const params: AdjustmentParams = {
        productId: product.id,
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
      fetchProduct();
    } catch (err: any) {
      toastError(err.message || 'Failed to adjust stock', 'Adjustment Failed');
    } finally {
      setIsAdjSubmitting(false);
    }
  };

  // Filter movements
  const filteredMovements = useMemo(() => {
    if (movementFilter === 'ALL') return movements;
    return movements.filter((m) => m.movement_type === movementFilter);
  }, [movements, movementFilter]);

  if (loading || !product) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto text-emerald-600 mb-3" />
        <span className="text-sm font-medium">Loading product ledger & movements...</span>
      </div>
    );
  }

  const stockValuation = product.current_stock * product.avg_purchase_price;

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Link
          to="/products"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Products Catalog</span>
        </Link>

        <div className="flex items-center gap-2">
          {/* Quick Action: Issue Stock Out */}
          <button
            type="button"
            onClick={handleOpenStockOut}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
          >
            <ArrowDownLeft className="w-4 h-4" />
            <span>Issue Stock Out</span>
          </button>

          {/* Quick Action: Stock Adjustment (Admin Only) */}
          {isAdmin && (
            <button
              type="button"
              onClick={handleOpenAdjustment}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>Adjust Stock</span>
            </button>
          )}
        </div>
      </div>

      {/* Product Summary Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center shrink-0">
              <Package className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold text-slate-900">{product.name}</h1>
                <StockStatusBadge
                  currentStock={product.current_stock}
                  minStockLevel={product.min_stock_level}
                  size="md"
                />
                {!product.is_active && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                    Inactive
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-500">
                <span className="font-mono bg-slate-100 px-2 py-0.5 rounded font-bold text-slate-800">
                  SKU: {product.sku}
                </span>
                {product.category && (
                  <span>
                    Category: <strong className="text-slate-700">{product.category}</strong>
                  </span>
                )}
                {product.brand && (
                  <span>
                    Brand: <strong className="text-slate-700">{product.brand}</strong>
                  </span>
                )}
                <span>
                  Unit: <strong className="text-slate-700 uppercase font-mono">{product.unit_of_measurement}</strong>
                </span>
              </div>

              {product.description && (
                <p className="mt-2 text-xs text-slate-600 max-w-2xl">{product.description}</p>
              )}
            </div>
          </div>
        </div>

        {/* 7 Product KPI Cards */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 pt-5 border-t border-slate-100 text-xs">
          {/* 1. Current Stock */}
          <div className="p-3 bg-slate-900 text-white rounded-xl">
            <span className="text-[11px] text-slate-400 uppercase font-bold block">Current Stock</span>
            <span className="text-base font-bold text-white tabular-nums">
              {product.current_stock} {product.unit_of_measurement}
            </span>
          </div>

          {/* 2. Min Stock Level */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-[11px] text-slate-400 uppercase font-bold block">Min Reorder Level</span>
            <span className="text-base font-bold text-slate-800 tabular-nums">
              {product.min_stock_level} {product.unit_of_measurement}
            </span>
          </div>

          {/* 3. Weighted Avg Cost */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-[11px] text-slate-400 uppercase font-bold block">Weighted Avg Cost</span>
            <span className="text-base font-bold text-slate-900 tabular-nums">
              {formatNPR(product.avg_purchase_price)}
            </span>
          </div>

          {/* 4. Latest Purchase Price */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-[11px] text-slate-400 uppercase font-bold block">Latest Price</span>
            <span className="text-base font-bold text-slate-900 tabular-nums">
              {formatNPR(product.latest_purchase_price)}
            </span>
          </div>

          {/* 5. Total Purchased Qty */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-[11px] text-slate-400 uppercase font-bold block">Total Received</span>
            <span className="text-base font-bold text-emerald-700 tabular-nums">
              +{product.total_purchased_qty}
            </span>
          </div>

          {/* 6. Total Issued Qty */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-[11px] text-slate-400 uppercase font-bold block">Total Issued</span>
            <span className="text-base font-bold text-rose-700 tabular-nums">
              -{product.total_issued_qty}
            </span>
          </div>

          {/* 7. Current Valuation */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-[11px] text-slate-400 uppercase font-bold block">Stock Valuation</span>
            <span className="text-base font-bold text-emerald-700 tabular-nums">
              {formatNPR(stockValuation)}
            </span>
          </div>
        </div>
      </div>

      {/* Full Stock Movement Ledger Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-700" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Inventory Movement Ledger ({movements.length})
            </h2>
          </div>

          {/* Movement Filter Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Filter Type:</span>
            <select
              value={movementFilter}
              onChange={(e) => setMovementFilter(e.target.value)}
              className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-emerald-600"
            >
              <option value="ALL">All Movements</option>
              <option value="STOCK_IN">Stock In</option>
              <option value="STOCK_OUT">Stock Out</option>
              <option value="OPENING_STOCK">Opening Stock</option>
              <option value="ADJUSTMENT_IN">Adjustment In</option>
              <option value="ADJUSTMENT_OUT">Adjustment Out</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 whitespace-nowrap">Date (BS & AD)</th>
                <th className="px-4 py-3 text-center whitespace-nowrap">Movement Type</th>
                <th className="px-4 py-3 text-right whitespace-nowrap text-emerald-700">Qty In</th>
                <th className="px-4 py-3 text-right whitespace-nowrap text-rose-700">Qty Out</th>
                <th className="px-4 py-3 text-right whitespace-nowrap font-bold text-slate-900">
                  Balance After
                </th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Unit Cost</th>
                <th className="px-4 py-3 whitespace-nowrap">Reference / Purchase</th>
                <th className="px-4 py-3 whitespace-nowrap">Staff / By</th>
                <th className="px-4 py-3 min-w-[160px]">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                    No movements found for this product.
                  </td>
                </tr>
              ) : (
                filteredMovements.map((m) => {
                  const isIn = m.qty_in > 0;

                  return (
                    <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Date BS + AD */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-slate-600">
                        <div className="font-semibold text-slate-800">{m.movement_date_bs} BS</div>
                        <div className="text-[11px] text-slate-400">{m.movement_date_ad} AD</div>
                      </td>

                      {/* Movement Type */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
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

                      {/* Qty In */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap tabular-nums text-emerald-700 font-semibold">
                        {m.qty_in > 0 ? `+${m.qty_in}` : '—'}
                      </td>

                      {/* Qty Out */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap tabular-nums text-rose-700 font-semibold">
                        {m.qty_out > 0 ? `-${m.qty_out}` : '—'}
                      </td>

                      {/* Balance After */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap tabular-nums font-bold text-slate-900 text-sm">
                        {m.balance_after}
                      </td>

                      {/* Unit Cost */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap tabular-nums text-slate-600">
                        {m.unit_cost !== null ? formatNPR(m.unit_cost) : '—'}
                      </td>

                      {/* Reference / Purchase Link */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {m.purchase_id ? (
                          <Link
                            to={`/purchases/${m.purchase_id}`}
                            className="text-indigo-600 hover:text-indigo-800 hover:underline font-semibold flex items-center gap-1"
                          >
                            <span>{m.purchase_code || `Purchase #${m.purchase_id}`}</span>
                            <ExternalLink className="w-3 h-3 text-indigo-400" />
                          </Link>
                        ) : (
                          <span className="text-slate-600">{m.reference_label || '—'}</span>
                        )}
                        {m.vendor_name && (
                          <span className="block text-[11px] text-slate-400">
                            Vendor: {m.vendor_name}
                          </span>
                        )}
                      </td>

                      {/* Staff */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-slate-500">
                        {m.responsible_staff_name || 'System'}
                      </td>

                      {/* Remarks */}
                      <td className="px-4 py-3.5 text-slate-500 text-[11px]">
                        {m.remarks || m.reason || '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

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
                <span>Issue Stock Out: {product.name}</span>
              </h3>
              <button
                type="button"
                onClick={() => setStockOutModalOpen(false)}
                className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 text-xs flex items-center justify-between">
              <span className="text-slate-500">Available Stock:</span>
              <span className="font-bold text-slate-900 tabular-nums">
                {product.current_stock} {product.unit_of_measurement}
              </span>
            </div>

            <form onSubmit={handleSubmitStockOut} className="p-6 space-y-4 overflow-y-auto flex-1">
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
                  Reference No. (DO / Sale #)
                </label>
                <input
                  type="text"
                  value={stockOutRefNo}
                  onChange={(e) => setStockOutRefNo(e.target.value)}
                  placeholder="e.g. DO-1029"
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
                  placeholder="Optional dispatch remarks..."
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-emerald-600"
                />
              </div>

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
      {/* Modal: Admin Stock Adjustment                                  */}
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
                <span>Adjust Stock: {product.name}</span>
              </h3>
              <button
                type="button"
                onClick={() => setAdjModalOpen(false)}
                className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 text-xs flex items-center justify-between">
              <span className="text-slate-500">Current Balance:</span>
              <span className="font-bold text-slate-900 tabular-nums">
                {product.current_stock} {product.unit_of_measurement} (Avg Cost: {formatNPR(product.avg_purchase_price)})
              </span>
            </div>

            <form onSubmit={handleSubmitAdjustment} className="p-6 space-y-4 overflow-y-auto flex-1">
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
                    <option value="ADJUSTMENT_IN">Adjustment In (Add)</option>
                    <option value="ADJUSTMENT_OUT">Adjustment Out (Deduct)</option>
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
                    placeholder="e.g. 50"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold tabular-nums text-slate-900 focus:outline-indigo-600"
                  />
                </div>
              </div>

              {/* Unit Cost */}
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
                    placeholder="e.g. 250.00"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs tabular-nums text-slate-800 focus:outline-indigo-600"
                  />
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
                  Remarks / Justification
                </label>
                <textarea
                  rows={2}
                  value={adjRemarks}
                  onChange={(e) => setAdjRemarks(e.target.value)}
                  placeholder="Audit reason..."
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-indigo-600"
                />
              </div>

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
