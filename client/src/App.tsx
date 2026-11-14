import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider, RequireAuth, RequireAdmin } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { PurchasesPage } from './pages/PurchasesPage';
import { PurchaseFormPage } from './pages/PurchaseFormPage';
import { PurchaseDetailPage } from './pages/PurchaseDetailPage';
import { VatPendingPage } from './pages/VatPendingPage';
import { Construction } from 'lucide-react';

/**
 * Clean placeholder view for routes scheduled in Tasks 10-12
 */
function RoutePlaceholder({
  title,
  subtitle,
  taskPhase,
}: {
  title: string;
  subtitle: string;
  taskPhase: string;
}) {
  const params = useParams();
  const paramEntries = Object.entries(params);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-xs">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shrink-0">
          <Construction className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-600 mt-1">{subtitle}</p>

          {paramEntries.length > 0 && (
            <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono">
              <span className="text-slate-500 font-semibold uppercase">Route Parameters:</span>
              <ul className="mt-1 space-y-0.5">
                {paramEntries.map(([k, v]) => (
                  <li key={k}>
                    <strong className="text-slate-700">{k}:</strong> {v}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-mono">
            <span>Scheduled Implementation:</span>
            <strong className="text-emerald-700 font-semibold">{taskPhase}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            {/* Public Auth Route */}
            <Route path="/login" element={<LoginPage />} />

            {/* Authenticated Protected Shell */}
            <Route
              path="/"
              element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              }
            >
              {/* Dashboard */}
              <Route index element={<DashboardPage />} />

              {/* Purchases Section */}
              <Route path="purchases" element={<PurchasesPage />} />
              <Route path="purchases/new" element={<PurchaseFormPage />} />
              <Route path="purchases/:id" element={<PurchaseDetailPage />} />
              <Route path="purchases/:id/edit" element={<PurchaseFormPage />} />
              <Route path="vat-pending" element={<VatPendingPage />} />

              {/* Vendors Section */}
              <Route
                path="vendors"
                element={
                  <RoutePlaceholder
                    title="Suppliers & Vendors Directory"
                    subtitle="Searchable vendor profiles with PAN/VAT, bank details, and clickable telephone call buttons."
                    taskPhase="Task 11: Vendor Payments & Inventory Operations"
                  />
                }
              />
              <Route
                path="vendors/:id"
                element={
                  <RoutePlaceholder
                    title="Vendor Profile & Ledger"
                    subtitle="Cumulative purchases, unpaid balances, VAT compliance, and payment records."
                    taskPhase="Task 11: Vendor Payments & Inventory Operations"
                  />
                }
              />

              {/* Inventory & Products Section */}
              <Route
                path="inventory"
                element={
                  <RoutePlaceholder
                    title="Inventory Management & Movements"
                    subtitle="Stock ledger, stock in/out forms, adjustments, and reorder point alerts."
                    taskPhase="Task 11: Vendor Payments & Inventory Operations"
                  />
                }
              />
              <Route
                path="products"
                element={
                  <RoutePlaceholder
                    title="Products Master Catalog"
                    subtitle="Product registry with categories, units of measurement, and current stock."
                    taskPhase="Task 11: Vendor Payments & Inventory Operations"
                  />
                }
              />
              <Route
                path="products/:id"
                element={
                  <RoutePlaceholder
                    title="Product Detail & Stock Movements Ledger"
                    subtitle="Transaction history, supplier comparisons, and weighted average cost."
                    taskPhase="Task 11: Vendor Payments & Inventory Operations"
                  />
                }
              />

              {/* Reports Section */}
              <Route
                path="reports"
                element={
                  <RoutePlaceholder
                    title="Financial Reports & Data Exports"
                    subtitle="Purchase, VAT, and Inventory reports exportable to Excel (.xlsx), CSV, and PDF."
                    taskPhase="Task 12: Reports & Polish"
                  />
                }
              />

              {/* Admin-Only Sections */}
              <Route
                path="admin/review"
                element={
                  <RequireAdmin>
                    <RoutePlaceholder
                      title="Admin Review & Approval Queue"
                      subtitle="Pending purchase approval, bill verification, and payment authorization."
                      taskPhase="Task 10: Purchases, VAT Workflow & Review Queue"
                    />
                  </RequireAdmin>
                }
              />
              <Route
                path="payments"
                element={
                  <RequireAdmin>
                    <RoutePlaceholder
                      title="Vendor Payment Dashboard"
                      subtitle="Outstanding payables by vendor, partial/full settlements, and bank transfer slip uploads."
                      taskPhase="Task 11: Vendor Payments & Inventory Operations"
                    />
                  </RequireAdmin>
                }
              />
              <Route
                path="admin/users"
                element={
                  <RequireAdmin>
                    <RoutePlaceholder
                      title="User & Staff Management"
                      subtitle="Role management (ADMIN vs STAFF), account deactivations, and credentials."
                      taskPhase="Task 12: Admin Controls & Settings"
                    />
                  </RequireAdmin>
                }
              />
              <Route
                path="admin/settings"
                element={
                  <RequireAdmin>
                    <RoutePlaceholder
                      title="Company Settings & Database Backups"
                      subtitle="Company PAN/VAT configuration, default VAT modes, and SQL/JSON snapshot exports."
                      taskPhase="Task 12: Admin Controls & Settings"
                    />
                  </RequireAdmin>
                }
              />
            </Route>

            {/* Catch-all Redirect */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
