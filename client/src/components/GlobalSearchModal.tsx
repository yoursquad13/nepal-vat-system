import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  X,
  Package,
  Building2,
  Receipt,
  Phone,
  ArrowRight,
  Loader2,
  CornerDownLeft,
} from 'lucide-react';
import { api, SearchResponse } from '../api/client';
import { formatNpr } from '../utils/money';
import { VatStatusBadge, PaymentStatusBadge, StockStatusBadge } from './StatusBadges';

export interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GlobalSearchModal({ isOpen, onClose }: GlobalSearchModalProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'ALL' | 'PRODUCTS' | 'VENDORS' | 'PURCHASES'>('ALL');

  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      setQuery('');
      setResults(null);
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Debounced search
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await api.search.query(trimmed);
        setResults(data);
      } catch (err) {
        console.error('Global search error:', err);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  const handleNavigate = useCallback(
    (path: string) => {
      onClose();
      navigate(path);
    },
    [navigate, onClose]
  );

  if (!isOpen) return null;

  const products = results?.products || [];
  const vendors = results?.vendors || [];
  const purchases = results?.purchases || [];

  const totalCount = products.length + vendors.length + purchases.length;
  const hasSearched = query.trim().length > 0;

  return (
    <div
      className="search-modal fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6 sm:pt-20 bg-slate-950/70 backdrop-blur-xs animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Global Search"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="relative flex items-center px-4 py-3.5 border-b border-slate-200 bg-slate-50/50">
          <Search className="w-5 h-5 text-slate-400 shrink-0 ml-1" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products, suppliers, phone numbers, PAN, bill numbers, dates..."
            className="w-full bg-transparent border-0 px-3 py-1 text-slate-900 placeholder-slate-400 text-sm sm:text-base focus:outline-none focus:ring-0"
          />
          {loading ? (
            <Loader2 className="w-5 h-5 text-emerald-600 animate-spin shrink-0 mr-2" />
          ) : query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-md mr-1"
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 text-[11px] font-mono font-medium text-slate-400 bg-slate-200/60 rounded border border-slate-300">
            ESC
          </kbd>
        </div>

        {/* Tab Filters */}
        {hasSearched && (
          <div className="flex items-center gap-1 px-4 py-2 bg-slate-100/70 border-b border-slate-200 text-xs font-medium text-slate-600">
            <button
              type="button"
              onClick={() => setActiveTab('ALL')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                activeTab === 'ALL'
                  ? 'bg-white text-emerald-800 shadow-xs font-semibold'
                  : 'hover:text-slate-900'
              }`}
            >
              All Results ({totalCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('PRODUCTS')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                activeTab === 'PRODUCTS'
                  ? 'bg-white text-emerald-800 shadow-xs font-semibold'
                  : 'hover:text-slate-900'
              }`}
            >
              Products ({products.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('VENDORS')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                activeTab === 'VENDORS'
                  ? 'bg-white text-emerald-800 shadow-xs font-semibold'
                  : 'hover:text-slate-900'
              }`}
            >
              Vendors ({vendors.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('PURCHASES')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                activeTab === 'PURCHASES'
                  ? 'bg-white text-emerald-800 shadow-xs font-semibold'
                  : 'hover:text-slate-900'
              }`}
            >
              Purchases ({purchases.length})
            </button>
          </div>
        )}

        {/* Search Results Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {!hasSearched && (
            <div className="py-12 text-center text-slate-400 text-sm">
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                <Search className="w-6 h-6" />
              </div>
              <p className="font-medium text-slate-700">Quick Global Search</p>
              <p className="text-xs text-slate-500 mt-1">
                Type product names, brand, PAN/VAT, vendor phone number, bill code, or date.
              </p>
            </div>
          )}

          {hasSearched && !loading && totalCount === 0 && (
            <div className="py-12 text-center text-slate-500 text-sm">
              <p className="font-medium">No results found for &ldquo;{query}&rdquo;</p>
              <p className="text-xs text-slate-400 mt-1">
                Try searching by exact SKU, vendor name, or bill number.
              </p>
            </div>
          )}

          {/* 1. Products Section */}
          {(activeTab === 'ALL' || activeTab === 'PRODUCTS') && products.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2 px-1">
                <Package className="w-4 h-4 text-emerald-600" />
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Products ({products.length})
                </h4>
              </div>
              <div className="divide-y divide-slate-100 border border-slate-200/90 rounded-xl overflow-hidden bg-white shadow-xs">
                {products.map((p) => (
                  <div
                    key={p.id}
                    className="p-3.5 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          onClick={() => handleNavigate(`/products/${p.id}`)}
                          className="font-semibold text-slate-900 hover:text-emerald-700 cursor-pointer text-sm"
                        >
                          {p.name}
                        </span>
                        <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          {p.sku}
                        </span>
                        <StockStatusBadge
                          currentStock={p.current_stock}
                          minStockLevel={p.min_stock_level}
                        />
                      </div>

                      <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-3 tabular-nums">
                        <span>
                          Stock: <strong className="text-slate-800">{p.current_stock}</strong>{' '}
                          {p.unit_of_measurement}
                        </span>
                        <span>•</span>
                        <span>
                          Latest Rate:{' '}
                          <strong className="text-emerald-700">
                            {formatNpr(p.latest_purchase_price)}
                          </strong>
                        </span>
                        {p.category && (
                          <>
                            <span>•</span>
                            <span>{p.category}</span>
                          </>
                        )}
                      </div>

                      {/* Associated Vendors who supply this product */}
                      {p.vendors && p.vendors.length > 0 && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-medium text-slate-500">
                            Suppliers:
                          </span>
                          {p.vendors.slice(0, 3).map((v) => (
                            <div
                              key={v.id}
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 text-xs border border-slate-200"
                            >
                              <span
                                onClick={() => handleNavigate(`/vendors/${v.id}`)}
                                className="hover:text-emerald-700 cursor-pointer font-medium"
                              >
                                {v.company_name}
                              </span>
                              {v.contact_number && (
                                <a
                                  href={`tel:${v.contact_number.replace(/\s+/g, '')}`}
                                  className="text-emerald-600 hover:text-emerald-800 p-0.5"
                                  title={`Call ${v.contact_person || v.company_name}: ${v.contact_number}`}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Phone className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleNavigate(`/products/${p.id}`)}
                      className="self-end sm:self-center shrink-0 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800 px-2.5 py-1.5 rounded-lg border border-emerald-200 hover:bg-emerald-50 transition-colors"
                    >
                      <span>Ledger</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. Vendors Section */}
          {(activeTab === 'ALL' || activeTab === 'VENDORS') && vendors.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2 px-1">
                <Building2 className="w-4 h-4 text-emerald-600" />
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Vendors ({vendors.length})
                </h4>
              </div>
              <div className="divide-y divide-slate-100 border border-slate-200/90 rounded-xl overflow-hidden bg-white shadow-xs">
                {vendors.map((v) => (
                  <div
                    key={v.id}
                    className="p-3.5 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          onClick={() => handleNavigate(`/vendors/${v.id}`)}
                          className="font-semibold text-slate-900 hover:text-emerald-700 cursor-pointer text-sm"
                        >
                          {v.company_name}
                        </span>
                        {v.pan_number && (
                          <span className="text-[11px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                            PAN: {v.pan_number}
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-3">
                        {v.contact_person && <span>Contact: {v.contact_person}</span>}
                        {v.contact_number && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="w-3 h-3 text-emerald-600" />
                            <a
                              href={`tel:${v.contact_number.replace(/\s+/g, '')}`}
                              className="text-emerald-700 hover:underline font-mono"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {v.contact_number}
                            </a>
                          </span>
                        )}
                        {v.address && <span className="truncate max-w-xs">{v.address}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      {v.contact_number && (
                        <a
                          href={`tel:${v.contact_number.replace(/\s+/g, '')}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          <span>Call</span>
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => handleNavigate(`/vendors/${v.id}`)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
                      >
                        <span>Profile</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. Purchases Section */}
          {(activeTab === 'ALL' || activeTab === 'PURCHASES') && purchases.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2 px-1">
                <Receipt className="w-4 h-4 text-emerald-600" />
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Purchases ({purchases.length})
                </h4>
              </div>
              <div className="divide-y divide-slate-100 border border-slate-200/90 rounded-xl overflow-hidden bg-white shadow-xs">
                {purchases.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => handleNavigate(`/purchases/${p.id}`)}
                    className="p-3.5 hover:bg-slate-50/80 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono font-semibold text-emerald-700 text-xs">
                          {p.purchase_code}
                        </span>
                        {p.bill_number && (
                          <span className="text-[11px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                            Bill #{p.bill_number}
                          </span>
                        )}
                        <VatStatusBadge status={p.vat_bill_status} />
                        <PaymentStatusBadge status={p.payment_status} />
                      </div>

                      <p className="text-sm font-medium text-slate-900 truncate">
                        {p.product_summary}
                      </p>

                      <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-2 tabular-nums">
                        <span>Vendor: {p.vendor_name}</span>
                        <span>•</span>
                        <span>Date: {p.purchase_date_bs} BS ({p.purchase_date_ad})</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-slate-900 tabular-nums">
                        {formatNpr(p.total_amount)}
                      </p>
                      {p.paid_amount > 0 && (
                        <p className="text-xs text-slate-500 tabular-nums">
                          Paid: {formatNpr(p.paid_amount)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Help Bar */}
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-slate-500 text-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <CornerDownLeft className="w-3 h-3" /> Select
            </span>
            <span>Esc to close</span>
          </div>
          <span className="text-slate-400 font-mono text-[11px]">
            Nepal VAT System Search
          </span>
        </div>
      </div>
    </div>
  );
}
