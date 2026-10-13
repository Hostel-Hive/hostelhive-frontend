import { Navigate, Route, Routes } from 'react-router-dom';
import DashboardLayout from '../../layouts/DashboardLayout';
import AdminDashboardPage from '../../features/dashboard/pages/AdminDashboardPage';
import WardenDashboardPage from '../../features/dashboard/pages/WardenDashboardPage';
import NotFoundPage from './NotFoundPage';
import { routePaths } from './routePaths';
import AuthLayout from '../../layouts/AuthLayout';
import LoginPage from '../../features/auth/pages/LoginPage';
import PasswordRecoveryPage from '../../features/auth/pages/PasswordRecoveryPage';
import ResetPasswordPage from '../../features/auth/pages/ResetPasswordPage';
import FirstLoginSetupPage from '../../features/auth/pages/FirstLoginSetupPage';
import ProtectedRoute from './ProtectedRoute';
import PublicOnlyRoute from './PublicOnlyRoute';
import RoleGuard from './RoleGuard';
import useAuth from '../../features/auth/hooks/useAuth';
import { dashboardForRole } from '../../config/roles';

function DashboardRedirect() {
  const { account } = useAuth();
  return (
    <Navigate
      to={account ? dashboardForRole(account.role) : routePaths.login}
      replace
    />
  );
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route
        path={routePaths.home}
        element={<Navigate to={routePaths.login} replace />}
      />
      <Route element={<AuthLayout />}>
        <Route element={<PublicOnlyRoute />}>
          <Route path={routePaths.login} element={<LoginPage />} />
        </Route>
        <Route
          path={routePaths.forgotPassword}
          element={<PasswordRecoveryPage />}
        />
        <Route
          path={routePaths.resetPassword}
          element={<ResetPasswordPage />}
        />
        <Route path={routePaths.firstLogin} element={<FirstLoginSetupPage />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route path={routePaths.dashboard} element={<DashboardLayout />}>
          <Route index element={<DashboardRedirect />} />
          <Route element={<RoleGuard role="admin" />}>
            <Route path="admin" element={<AdminDashboardPage />} />
          </Route>
          <Route element={<RoleGuard role="warden" />}>
            <Route path="warden" element={<WardenDashboardPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
