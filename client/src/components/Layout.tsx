import { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  PlusCircle,
  FileClock,
  ShieldCheck,
  Building2,
  CreditCard,
  Boxes,
  Package,
  FileBarChart,
  Users,
  Settings,
  Search,
  LogOut,
  Menu,
  X,
  Clock,
  Building,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getNowNpt } from '../utils/nepaliDate';
import { GlobalSearchModal } from './GlobalSearchModal';

export function Layout() {
  const { user, settings, isAdmin, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [currentTimeNpt, setCurrentTimeNpt] = useState(() => getNowNpt());
  const location = useLocation();

  // Update live NPT clock every second, aligned to the wall-clock second boundary
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const delayMs = 1000 - (Date.now() % 1000);
    const timeoutId = setTimeout(() => {
      setCurrentTimeNpt(getNowNpt());
      intervalId = setInterval(() => {
        setCurrentTimeNpt(getNowNpt());
      }, 1000);
    }, delayMs);
    return () => {
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Global Cmd+K / Ctrl+K keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchModalOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const navItemClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-emerald-600 text-white shadow-xs font-semibold'
        : 'text-slate-300 hover:text-white hover:bg-slate-800'
    }`;

  const companyTitle = settings?.company_name || 'Himalayan Trading';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row text-slate-900">
      {/* ============================================================== */}
      {/* Desktop Persistent Sidebar (Deep Slate #0F172A)                */}
      {/* ============================================================== */}
      <aside className="no-print hidden md:flex flex-col w-64 bg-slate-900 text-slate-100 border-r border-slate-800 shrink-0 select-none">
        {/* Brand Header */}
        <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-800">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white shadow-sm font-bold text-lg">
            V
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold truncate text-slate-100 tracking-tight">
              {companyTitle}
            </h1>
            <p className="text-[11px] text-emerald-400 font-medium">Nepal VAT & Vendor System</p>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {/* Main Operations */}
          <div>
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              Operations
            </p>
            <div className="space-y-1">
              <NavLink to="/" end className={navItemClass}>
                <LayoutDashboard className="w-4 h-4 shrink-0" />
                <span>Dashboard</span>
              </NavLink>

              <NavLink to="/purchases" end className={navItemClass}>
                <ShoppingCart className="w-4 h-4 shrink-0" />
                <span>Purchases</span>
              </NavLink>

              <NavLink to="/purchases/new" className={navItemClass}>
                <PlusCircle className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>Add Purchase</span>
              </NavLink>

              <NavLink to="/vat-pending" className={navItemClass}>
                <FileClock className="w-4 h-4 shrink-0 text-amber-400" />
                <span>VAT Pending Bills</span>
              </NavLink>
            </div>
          </div>

          {/* Vendors & Inventory */}
          <div>
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              Ledger & Stock
            </p>
            <div className="space-y-1">
              <NavLink to="/vendors" className={navItemClass}>
                <Building2 className="w-4 h-4 shrink-0" />
                <span>Vendors</span>
              </NavLink>

              <NavLink to="/inventory" className={navItemClass}>
                <Boxes className="w-4 h-4 shrink-0" />
                <span>Inventory & Movements</span>
              </NavLink>

              <NavLink to="/products" className={navItemClass}>
                <Package className="w-4 h-4 shrink-0" />
                <span>Products</span>
              </NavLink>

              <NavLink to="/reports" className={navItemClass}>
                <FileBarChart className="w-4 h-4 shrink-0" />
                <span>Reports & Exports</span>
              </NavLink>
            </div>
          </div>

          {/* Admin Restricted Section */}
          {isAdmin && (
            <div>
              <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-amber-400/90 mb-2">
                Admin Controls
              </p>
              <div className="space-y-1">
                <NavLink to="/admin/review" className={navItemClass}>
                  <ShieldCheck className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>Review & Approval</span>
                </NavLink>

                <NavLink to="/payments" className={navItemClass}>
                  <CreditCard className="w-4 h-4 shrink-0 text-indigo-400" />
                  <span>Vendor Payments</span>
                </NavLink>

                <NavLink to="/admin/users" className={navItemClass}>
                  <Users className="w-4 h-4 shrink-0" />
                  <span>Users & Staff</span>
                </NavLink>

                <NavLink to="/admin/settings" className={navItemClass}>
                  <Settings className="w-4 h-4 shrink-0" />
                  <span>Company Settings</span>
                </NavLink>
              </div>
            </div>
          )}
        </nav>

        {/* User Footer Card */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/50">
          <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-800/60">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-100 truncate">
                {user?.fullName || 'User'}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold ${
                    isAdmin
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  }`}
                >
                  {user?.role}
                </span>
                <span className="text-[10px] text-slate-400 truncate font-mono">
                  @{user?.username}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={logout}
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-700/60 rounded-md transition-colors"
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ============================================================== */}
      {/* Mobile Drawer Slide-over                                       */}
      {/* ============================================================== */}
      {mobileMenuOpen && (
        <div className="no-print fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs animate-fade-in"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] bg-slate-900 text-slate-100 flex flex-col h-full shadow-2xl z-10 animate-slide-up">
            <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center font-bold text-white">
                  V
                </div>
                <span className="font-bold text-sm truncate">{companyTitle}</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-3 space-y-4">
              <div className="space-y-1">
                <NavLink to="/" end className={navItemClass}>
                  <LayoutDashboard className="w-4 h-4" />
                  <span>Dashboard</span>
                </NavLink>
                <NavLink to="/purchases" end className={navItemClass}>
                  <ShoppingCart className="w-4 h-4" />
                  <span>Purchases</span>
                </NavLink>
                <NavLink to="/purchases/new" className={navItemClass}>
                  <PlusCircle className="w-4 h-4 text-emerald-400" />
                  <span>Add Purchase</span>
                </NavLink>
                <NavLink to="/vat-pending" className={navItemClass}>
                  <FileClock className="w-4 h-4 text-amber-400" />
                  <span>VAT Pending Bills</span>
                </NavLink>
                <NavLink to="/vendors" className={navItemClass}>
                  <Building2 className="w-4 h-4" />
                  <span>Vendors</span>
                </NavLink>
                <NavLink to="/inventory" className={navItemClass}>
                  <Boxes className="w-4 h-4" />
                  <span>Inventory</span>
                </NavLink>
                <NavLink to="/products" className={navItemClass}>
                  <Package className="w-4 h-4" />
                  <span>Products</span>
                </NavLink>
                <NavLink to="/reports" className={navItemClass}>
                  <FileBarChart className="w-4 h-4" />
                  <span>Reports</span>
                </NavLink>
              </div>

              {isAdmin && (
                <div className="pt-2 border-t border-slate-800 space-y-1">
                  <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                    Admin
                  </p>
                  <NavLink to="/admin/review" className={navItemClass}>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Review & Approval</span>
                  </NavLink>
                  <NavLink to="/payments" className={navItemClass}>
                    <CreditCard className="w-4 h-4" />
                    <span>Vendor Payments</span>
                  </NavLink>
                  <NavLink to="/admin/users" className={navItemClass}>
                    <Users className="w-4 h-4" />
                    <span>Users</span>
                  </NavLink>
                  <NavLink to="/admin/settings" className={navItemClass}>
                    <Settings className="w-4 h-4" />
                    <span>Company Settings</span>
                  </NavLink>
                </div>
              )}
            </nav>

            <div className="p-3 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold">{user?.fullName}</p>
                <p className="text-[10px] text-slate-400">{user?.role}</p>
              </div>
              <button
                type="button"
                onClick={logout}
                className="p-2 text-rose-400 hover:bg-slate-800 rounded-md"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* Main Content Area + Sticky Top Header                          */}
      {/* ============================================================== */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Sticky Header */}
        <header className="no-print sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-3 shadow-2xs">
          {/* Mobile Hamburger & Breadcrumb */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100"
              aria-label="Open mobile menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="hidden sm:flex items-center gap-2 text-xs font-medium text-slate-500">
              <Building className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-semibold text-slate-700 truncate max-w-[200px]">
                {companyTitle}
              </span>
              <span className="text-slate-300">/</span>
              <span className="font-mono text-slate-600">FY {currentTimeNpt.fiscalYear}</span>
            </div>
          </div>

          {/* Center / Right Header Badges & Search Trigger */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Live BS Date & NPT Clock */}
            <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs tabular-nums text-slate-700">
              <Clock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="font-semibold text-slate-900">{currentTimeNpt.dateBs} BS</span>
              <span className="text-slate-300">|</span>
              <span className="text-slate-500 font-mono">{currentTimeNpt.timeNpt} NPT</span>
            </div>

            {/* Quick Search Trigger (Cmd+K) */}
            <button
              type="button"
              onClick={() => setSearchModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <Search className="w-4 h-4 text-slate-400" />
              <span className="hidden sm:inline">Search records...</span>
              <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-400 bg-white rounded border border-slate-200 shadow-2xs">
                ⌘K
              </kbd>
            </button>

            {/* Role Indicator & User Name */}
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs uppercase shadow-2xs">
                {user?.fullName?.charAt(0) || 'U'}
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-xs font-semibold text-slate-900 leading-tight">
                  {user?.fullName}
                </p>
                <p className="text-[10px] font-mono font-medium text-emerald-700">
                  {user?.role}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content Body */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>

      {/* Global Search Modal */}
      <GlobalSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
      />
    </div>
  );
}
