import { Navigate, Outlet, useLocation } from 'react-router-dom';
import useAuth from '../../features/auth/hooks/useAuth';
import SessionGate from '../../features/auth/components/SessionGate';
import { homeForAccount } from '../../config/roles';

export default function PublicOnlyRoute() {
  const auth = useAuth();
  const { pathname } = useLocation();
  if (
    auth.verifiedPath !== pathname ||
    (auth.status === 'checking' && !auth.account)
  )
    return <SessionGate />;
  if (auth.account)
    return <Navigate to={homeForAccount(auth.account)} replace />;
  return <Outlet />;
}
