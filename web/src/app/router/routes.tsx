import { Navigate, Route, Routes } from 'react-router-dom';
import DashboardLayout from '../../layouts/DashboardLayout';
import AdminDashboardPage from '../../features/dashboard/pages/AdminDashboardPage';
import WardenDashboardPage from '../../features/dashboard/pages/WardenDashboardPage';
import NotFoundPage from './NotFoundPage';
import { routePaths } from './routePaths';

export default function AppRoutes() {
  return (
    <Routes>
      <Route
        path={routePaths.home}
        element={<Navigate to={routePaths.adminDashboard} replace />}
      />
      <Route path={routePaths.dashboard} element={<DashboardLayout />}>
        <Route
          index
          element={<Navigate to={routePaths.adminDashboard} replace />}
        />
        <Route path="admin" element={<AdminDashboardPage />} />
        <Route path="warden" element={<WardenDashboardPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
