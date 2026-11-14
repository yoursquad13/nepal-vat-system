import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import { ReportsPage } from './pages/ReportsPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { SettingsBackupsPage } from './pages/SettingsBackupsPage';

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
              <Route path="reports" element={<ReportsPage />} />

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
                    <AdminUsersPage />
                  </RequireAdmin>
                }
              />
              <Route
                path="admin/settings"
                element={
                  <RequireAdmin>
                    <SettingsBackupsPage />
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
