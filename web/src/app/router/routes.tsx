import { Navigate, Route, Routes } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import DashboardLayout from '../../layouts/DashboardLayout';
import AdminDashboardPage from '../../features/dashboard/pages/AdminDashboardPage';
import WardenDashboardPage from '../../features/dashboard/pages/WardenDashboardPage';
import StudentDirectoryPage from '../../features/students/pages/StudentDirectoryPage';
import StudentProfilePage from '../../features/students/pages/StudentProfilePage';
import StudentFormPage from '../../features/students/pages/StudentFormPage';
import NotFoundPage from './NotFoundPage';
import { routePaths } from './routePaths';
import AuthLayout from '../../layouts/AuthLayout';
import LoginPage from '../../features/auth/pages/LoginPage';
import PasswordRecoveryPage from '../../features/auth/pages/PasswordRecoveryPage';
import ResetPasswordPage from '../../features/auth/pages/ResetPasswordPage';
import ProtectedRoute from './ProtectedRoute';
import PublicOnlyRoute from './PublicOnlyRoute';
import RoleGuard from './RoleGuard';
import useAuth from '../../features/auth/hooks/useAuth';
import { dashboardForRole } from '../../config/roles';

const StudentImportPage = lazy(
  () => import('../../features/students/pages/StudentImportPage'),
);
const InventoryPage = lazy(
  () => import('../../features/inventory/pages/InventoryPage'),
);
const LeaveListPage = lazy(
  () => import('../../features/leave/pages/LeaveListPage'),
);
const LeaveDetailPage = lazy(
  () => import('../../features/leave/pages/LeaveDetailPage'),
);

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
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route path={routePaths.dashboard} element={<DashboardLayout />}>
          <Route index element={<DashboardRedirect />} />
          <Route
            path="leaves"
            element={
              <Suspense fallback={<p role="status">Loading leave requests…</p>}>
                <LeaveListPage />
              </Suspense>
            }
          />
          <Route
            path="leaves/:leaveID"
            element={
              <Suspense fallback={<p role="status">Loading leave request…</p>}>
                <LeaveDetailPage />
              </Suspense>
            }
          />
          <Route
            path="inventory"
            element={
              <Suspense fallback={<p role="status">Loading inventory…</p>}>
                <InventoryPage />
              </Suspense>
            }
          />
          <Route path="students" element={<StudentDirectoryPage />} />
          <Route path="students/new" element={<StudentFormPage creating />} />
          <Route
            path="students/:studentID/edit"
            element={<StudentFormPage />}
          />
          <Route path="students/:studentID" element={<StudentProfilePage />} />
          <Route element={<RoleGuard role="admin" />}>
            <Route
              path="students/import"
              element={
                <Suspense
                  fallback={<p role="status">Loading student import…</p>}
                >
                  <StudentImportPage />
                </Suspense>
              }
            />
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
