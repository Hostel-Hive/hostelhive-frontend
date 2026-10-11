import { Navigate, Route, Routes } from 'react-router-dom';
import DashboardLayout from '../../layouts/DashboardLayout';
import AdminDashboardPage from '../../features/dashboard/pages/AdminDashboardPage';
import WardenDashboardPage from '../../features/dashboard/pages/WardenDashboardPage';
import NotFoundPage from './NotFoundPage';
import { routePaths } from './routePaths';
import AuthLayout from '../../layouts/AuthLayout';
import LoginPage from '../../features/auth/pages/LoginPage';
import PasswordRecoveryPage from '../../features/auth/pages/PasswordRecoveryPage';

export default function AppRoutes() {
  return (
    <Routes>
      <Route
        path={routePaths.home}
        element={<Navigate to={routePaths.login} replace />}
      />
      <Route element={<AuthLayout />}>
        <Route path={routePaths.login} element={<LoginPage />} />
        <Route
          path={routePaths.forgotPassword}
          element={<PasswordRecoveryPage />}
        />
      </Route>
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
