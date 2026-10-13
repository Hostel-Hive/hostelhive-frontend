import { Navigate, Outlet, useLocation } from 'react-router-dom';
import useAuth from '../../features/auth/hooks/useAuth';
import SessionGate from '../../features/auth/components/SessionGate';
import { routePaths } from './routePaths';

export default function ProtectedRoute() {
  const auth = useAuth();
  const { pathname } = useLocation();
  if (
    auth.verifiedPath !== pathname ||
    auth.status === 'checking' ||
    auth.status === 'error'
  )
    return <SessionGate />;
  if (!auth.account) return <Navigate to={routePaths.login} replace />;
  return <Outlet />;
}
