import { Navigate, Outlet, useLocation } from 'react-router-dom';
import useAuth from '../../features/auth/hooks/useAuth';
import SessionGate from '../../features/auth/components/SessionGate';
import { routePaths } from './routePaths';
import { homeForAccount } from '../../config/roles';

export default function ProtectedRoute({
  portal = 'staff',
  allowSetup = false,
}: {
  portal?: 'staff' | 'student';
  allowSetup?: boolean;
}) {
  const auth = useAuth();
  const { pathname } = useLocation();
  if (
    (auth.verifiedPath !== pathname && !auth.account) ||
    (auth.status === 'checking' && !auth.account) ||
    auth.status === 'error'
  )
    return <SessionGate />;
  if (!auth.account)
    return (
      <Navigate
        to={portal === 'student' ? routePaths.studentLogin : routePaths.login}
        replace
      />
    );
  if ((auth.account.role === 'student') !== (portal === 'student'))
    return <Navigate to={homeForAccount(auth.account)} replace />;
  if (
    auth.account.role === 'student' &&
    auth.account.setup_required &&
    !allowSetup
  )
    return <Navigate to={routePaths.studentSetup} replace />;
  return (
    <div
      key={`${auth.account.firebase_uid}:${auth.account.role}`}
      style={{ display: 'contents' }}
    >
      <Outlet />
    </div>
  );
}
