import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Package,
  PlusCircle,
  Search,
  RefreshCw,
  Edit,
  Trash2,
  ExternalLink,
  X,
} from 'lucide-react';
import { api, Product } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatNPR } from '../utils/money';
import { StockStatusBadge } from '../components/StatusBadges';

const COMMON_UNITS = [
  'PCS',
  'BAG',
  'KG',
  'LITER',
  'BOX',
  'METER',
  'TON',
  'BUNDLE',
  'PACKET',
  'SET',
];

export function ProductsPage() {
  const { isAdmin } = useAuth();
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [stockStatusFilter, setStockStatusFilter] = useState<string>('all');
  const [showInactive, setShowInactive] = useState<boolean>(false);

  // Add / Edit Modal
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Form Fields
  const [name, setName] = useState<string>('');
  const [sku, setSku] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [brand, setBrand] = useState<string>('');
  const [unitOfMeasurement, setUnitOfMeasurement] = useState<string>('PCS');
  const [minStockLevel, setMinStockLevel] = useState<string>('5');
  const [description, setDescription] = useState<string>('');
  const [isActive, setIsActive] = useState<boolean>(true);

  // Deactivate Modal
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Search debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch Products
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.products.list({
        q: debouncedSearch.trim() || undefined,
        category: selectedCategory || undefined,
        is_active: showInactive ? undefined : true,
      });
      setProducts(res.products || []);
    } catch (err: any) {
      toastError(err.message || 'Failed to load products', 'Error Loading Products');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, selectedCategory, showInactive, toastError]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Unique categories for dropdown filter
  const categoryOptions = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p) => {
      if (p.category) cats.add(p.category);
    });
    return Array.from(cats).sort();
  }, [products]);

  // Filtered by Stock Status
  const filteredProducts = products.filter((p) => {
    if (stockStatusFilter === 'all') return true;
    if (stockStatusFilter === 'out') return p.current_stock <= 0;
    if (stockStatusFilter === 'low') return p.current_stock > 0 && p.current_stock <= p.min_stock_level;
    if (stockStatusFilter === 'available') return p.current_stock > p.min_stock_level;
    return true;
  });

  // Summary Metrics
  const summary = useMemo(() => {
    let totalItems = products.length;
    let totalValuation = 0;
    let lowStock = 0;
    let outOfStock = 0;

    products.forEach((p) => {
      totalValuation += p.current_stock * p.avg_purchase_price;
      if (p.current_stock <= 0) outOfStock++;
      else if (p.current_stock <= p.min_stock_level) lowStock++;
    });

    return { totalItems, totalValuation, lowStock, outOfStock };
  }, [products]);

  // Open Modal for Add
  const handleOpenAdd = () => {
    setEditingProduct(null);
    setName('');
    setSku('');
    setCategory('');
    setBrand('');
    setUnitOfMeasurement('PCS');
    setMinStockLevel('5');
    setDescription('');
    setIsActive(true);
    setModalOpen(true);
  };

  // Open Modal for Edit
  const handleOpenEdit = (p: Product) => {
    setEditingProduct(p);
    setName(p.name || '');
    setSku(p.sku || '');
    setCategory(p.category || '');
    setBrand(p.brand || '');
    setUnitOfMeasurement(p.unit_of_measurement || 'PCS');
    setMinStockLevel(String(p.min_stock_level ?? 0));
    setDescription(p.description || '');
    setIsActive(p.is_active ?? true);
    setModalOpen(true);
  };

  // Submit Add / Edit
  const handleSubmitProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toastError('Product name is required', 'Validation Error');
      return;
    }
    if (!sku.trim()) {
      toastError('SKU code is required', 'Validation Error');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: Partial<Product> = {
        name: name.trim(),
        sku: sku.trim(),
        category: category.trim() || null,
        brand: brand.trim() || null,
        unit_of_measurement: unitOfMeasurement.trim() || 'PCS',
        min_stock_level: Number(minStockLevel) || 0,
        description: description.trim() || null,
        is_active: isActive,
      };

      if (editingProduct) {
        await api.products.update(editingProduct.id, payload);
        toastSuccess(`Product ${payload.name} updated successfully.`, 'Product Saved');
      } else {
        await api.products.create(payload);
        toastSuccess(`Product ${payload.name} added to catalog.`, 'Product Created');
      }

      setModalOpen(false);
      fetchProducts();
    } catch (err: any) {
      toastError(err.message || 'Failed to save product', 'Save Error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Deactivate
  const handleDeleteConfirm = async () => {
    if (!deletingProduct) return;
    setIsDeleting(true);
    try {
      await api.products.delete(deletingProduct.id);
      toastInfo(`Product ${deletingProduct.name} deactivated.`, 'Product Deactivated');
      setDeletingProduct(null);
      fetchProducts();
    } catch (err: any) {
      toastError(err.message || 'Failed to deactivate product', 'Deactivation Failed');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center shrink-0">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Products Master Catalog
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Maintain standard catalog items, SKU barcodes, inventory units of measurement, and reorder alerts.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchProducts()}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Add New Product</span>
            </button>
          </div>
        </div>

        {/* Summary Counter Strip */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-5 border-t border-slate-100 text-xs">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-slate-400 block font-medium">Catalog Products</span>
            <span className="text-base font-bold text-slate-900 tabular-nums">
              {summary.totalItems}
            </span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-slate-400 block font-medium">Total Valuation</span>
            <span className="text-base font-bold text-emerald-700 tabular-nums">
              {formatNPR(summary.totalValuation)}
            </span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-slate-400 block font-medium">Low Stock Items</span>
            <span
              className={`text-base font-bold tabular-nums ${
                summary.lowStock > 0 ? 'text-amber-700' : 'text-slate-900'
              }`}
            >
              {summary.lowStock}
            </span>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-slate-400 block font-medium">Out of Stock Items</span>
            <span
              className={`text-base font-bold tabular-nums ${
                summary.outOfStock > 0 ? 'text-rose-700' : 'text-slate-900'
              }`}
            >
              {summary.outOfStock}
            </span>
          </div>
        </div>

        {/* Search & Category Filter Controls */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search product name, SKU, brand..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-emerald-600"
            />
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-700 focus:bg-white focus:outline-emerald-600"
            >
              <option value="">All Categories</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Stock Health Filter */}
          <div>
            <select
              value={stockStatusFilter}
              onChange={(e) => setStockStatusFilter(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-700 focus:bg-white focus:outline-emerald-600"
            >
              <option value="all">All Stock Statuses</option>
              <option value="available">In Stock (Available)</option>
              <option value="low">Low Stock Alerts</option>
              <option value="out">Out of Stock</option>
            </select>
          </div>

          {/* Inactive toggle */}
          <div className="flex items-center justify-between sm:justify-end text-xs text-slate-600">
            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
              />
              <span>Show Deactivated</span>
            </label>
          </div>
        </div>
      </div>

      {/* Product Catalog Grid / Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Product Name & SKU</th>
                <th className="px-4 py-3 whitespace-nowrap">Category</th>
                <th className="px-4 py-3 whitespace-nowrap">Brand</th>
                <th className="px-4 py-3 whitespace-nowrap">Unit</th>
                <th className="px-4 py-3 text-right whitespace-nowrap font-bold text-slate-900">
                  Current Stock
                </th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Min Level</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Avg Cost</th>
                <th className="px-4 py-3 text-right whitespace-nowrap font-bold text-slate-900">
                  Stock Value
                </th>
                <th className="px-4 py-3 text-center whitespace-nowrap">Health Status</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-16 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-600 mb-2" />
                    <span>Loading products catalog...</span>
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-16 text-center text-slate-400">
                    <Package className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-slate-600">No products match your filters</p>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => {
                  const stockValue = p.current_stock * p.avg_purchase_price;

                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        !p.is_active ? 'bg-slate-50/50 opacity-75' : ''
                      }`}
                    >
                      {/* Name & SKU */}
                      <td className="px-4 py-3.5">
                        <Link
                          to={`/products/${p.id}`}
                          className="font-bold text-slate-900 hover:text-indigo-700 hover:underline flex items-center gap-1.5"
                        >
                          <span>{p.name}</span>
                          <ExternalLink className="w-3 h-3 text-slate-400 opacity-60" />
                        </Link>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                          <span className="font-mono bg-slate-100 px-1.5 py-0.2 rounded text-slate-700">
                            {p.sku}
                          </span>
                          {!p.is_active && (
                            <span className="bg-rose-100 text-rose-800 px-1.5 py-0.2 rounded text-[10px] font-bold">
                              Inactive
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Category */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-slate-600">
                        {p.category || '—'}
                      </td>

                      {/* Brand */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-slate-600">
                        {p.brand || '—'}
                      </td>

                      {/* Unit */}
                      <td className="px-4 py-3.5 whitespace-nowrap uppercase font-mono text-slate-600">
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

                      {/* Stock Value */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap tabular-nums font-bold text-emerald-700">
                        {formatNPR(stockValue)}
                      </td>

                      {/* Stock Status Badge */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        <StockStatusBadge
                          currentStock={p.current_stock}
                          minStockLevel={p.min_stock_level}
                          size="sm"
                        />
                      </td>

                      {/* Row Actions */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            to={`/products/${p.id}`}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-semibold text-[11px] transition-colors"
                          >
                            Ledger
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(p)}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                            title="Edit Product"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          {isAdmin && p.is_active && (
                            <button
                              type="button"
                              onClick={() => setDeletingProduct(p)}
                              className="p-1.5 rounded-lg border border-slate-200 text-rose-600 hover:text-rose-800 hover:bg-rose-50 transition-colors"
                              title="Deactivate Product"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
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

      {/* ============================================================== */}
      {/* Add / Edit Product Modal                                       */}
      {/* ============================================================== */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-xs animate-fade-in"
          role="dialog"
          aria-modal="true"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-indigo-400" />
                <span>{editingProduct ? `Edit Product: ${editingProduct.name}` : 'Add New Product'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitProduct} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Product Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Ultra Tech Cement 50kg"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-emerald-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    SKU Code / Barcode <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="e.g. CEM-UTC-50"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Category
                  </label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="e.g. Construction Materials"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-emerald-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Brand / Manufacturer
                  </label>
                  <input
                    type="text"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    placeholder="e.g. UltraTech"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Unit of Measurement
                  </label>
                  <input
                    list="units-list"
                    type="text"
                    value={unitOfMeasurement}
                    onChange={(e) => setUnitOfMeasurement(e.target.value.toUpperCase())}
                    placeholder="e.g. PCS, BAG"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono uppercase text-slate-800 focus:outline-emerald-600"
                  />
                  <datalist id="units-list">
                    {COMMON_UNITS.map((u) => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Min Stock Reorder Level
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={minStockLevel}
                    onChange={(e) => setMinStockLevel(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold tabular-nums text-slate-800 focus:outline-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description / Specifications
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional technical specifications..."
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-emerald-600"
                />
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-slate-700 select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                />
                <span className="font-semibold">Active Product (Available for purchase line items)</span>
              </label>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !name.trim() || !sku.trim()}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
                >
                  {isSubmitting ? 'Saving...' : editingProduct ? 'Update Product' : 'Create Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* Deactivate Product Modal                                       */}
      {/* ============================================================== */}
      {deletingProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in"
          role="dialog"
          aria-modal="true"
          onClick={() => setDeletingProduct(null)}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 bg-rose-600 text-white flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Trash2 className="w-5 h-5" />
                <span>Deactivate Product</span>
              </h3>
              <button
                type="button"
                onClick={() => setDeletingProduct(null)}
                className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-700">
                Are you sure you want to deactivate{' '}
                <strong className="text-slate-900">{deletingProduct.name}</strong> ({deletingProduct.sku})?
              </p>
              <p className="text-xs text-slate-500">
                This will prevent new purchase entries or movements from selecting this item. Historical inventory movements and purchase items will remain intact.
              </p>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setDeletingProduct(null)}
                  disabled={isDeleting}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  disabled={isDeleting}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
                >
                  {isDeleting ? 'Deactivating...' : 'Confirm Deactivation'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
