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
import { AdminReviewPage } from './pages/AdminReviewPage';
import { VendorsPage } from './pages/VendorsPage';
import { VendorProfilePage } from './pages/VendorProfilePage';
import { VendorPaymentsPage } from './pages/VendorPaymentsPage';
import { InventoryDashboardPage } from './pages/InventoryDashboardPage';
import { ProductsPage } from './pages/ProductsPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
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
              <Route path="vendors" element={<VendorsPage />} />
              <Route path="vendors/:id" element={<VendorProfilePage />} />

              {/* Inventory & Products Section */}
              <Route path="inventory" element={<InventoryDashboardPage />} />
              <Route path="products" element={<ProductsPage />} />
              <Route path="products/:id" element={<ProductDetailPage />} />

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
                    <AdminReviewPage />
                  </RequireAdmin>
                }
              />
              <Route
                path="payments"
                element={
                  <RequireAdmin>
                    <VendorPaymentsPage />
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
