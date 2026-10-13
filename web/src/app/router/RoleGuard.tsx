import { Navigate, Outlet } from 'react-router-dom';
import useAuth from '../../features/auth/hooks/useAuth';
import { dashboardForRole } from '../../config/roles';
import type { StaffAccount } from '../../features/auth/auth.types';
import { routePaths } from './routePaths';

export default function RoleGuard({ role }: { role: StaffAccount['role'] }) {
  const { account } = useAuth();
  if (!account) return <Navigate to={routePaths.login} replace />;
  if (account.role !== role)
    return <Navigate to={dashboardForRole(account.role)} replace />;
  return <Outlet />;
}
