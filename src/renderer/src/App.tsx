import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@renderer/components/layout/AppLayout';
import { LoadingState } from '@renderer/components/ui/LoadingState';
import { NotificationToaster } from '@renderer/components/ui/Notification';
import { useAuth } from '@renderer/context/AuthContext';
import { AreasPage } from '@renderer/pages/AreasPage';
import { CostSalesProfitPage } from '@renderer/pages/CostSalesProfitPage';
import { CustomerDetailPage } from '@renderer/pages/CustomerDetailPage';
import { CustomersPage } from '@renderer/pages/CustomersPage';
import { DailyOrderDetailPage } from '@renderer/pages/DailyOrderDetailPage';
import { DailyOrdersPage } from '@renderer/pages/DailyOrdersPage';
import { DashboardPage } from '@renderer/pages/DashboardPage';
import { FarmDetailPage } from '@renderer/pages/FarmDetailPage';
import { FarmPaymentsPage } from '@renderer/pages/FarmPaymentsPage';
import { FarmPricesPage } from '@renderer/pages/FarmPricesPage';
import { FarmsPage } from '@renderer/pages/FarmsPage';
import { LoginPage } from '@renderer/pages/LoginPage';
import { OrdersPage } from '@renderer/pages/OrdersPage';
import { ProductsPage } from '@renderer/pages/ProductsPage';
import { ReportsPage } from '@renderer/pages/ReportsPage';
import { SalesPricesPage } from '@renderer/pages/SalesPricesPage';
import { SettingsPage } from '@renderer/pages/SettingsPage';

function ProtectedRoutes(): JSX.Element {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-100 p-6">
        <LoadingState label="Checking login..." />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <AppLayout />;
}

export function App(): JSX.Element {
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoutes />}>
          <Route index element={<DashboardPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="daily-orders" element={<DailyOrdersPage />} />
          <Route path="daily-orders/:id" element={<DailyOrderDetailPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="customers/:id" element={<CustomerDetailPage />} />
          <Route path="areas" element={<AreasPage />} />
          <Route path="farms" element={<FarmsPage />} />
          <Route path="farms/:id" element={<FarmDetailPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="farm-prices" element={<FarmPricesPage />} />
          <Route path="sales-prices" element={<SalesPricesPage />} />
          <Route path="cost-sales-profit" element={<CostSalesProfitPage />} />
          <Route path="farm-payments" element={<FarmPaymentsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
      <NotificationToaster />
    </>
  );
}
