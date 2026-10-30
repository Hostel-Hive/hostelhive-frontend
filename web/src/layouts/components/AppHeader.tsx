import { Link } from 'react-router-dom';
import BrandLogo from '../../shared/components/ui/BrandLogo';
import { routePaths } from '../../app/router/routePaths';
import MobileSidebar from './MobileSidebar';
import useAuth from '../../features/auth/hooks/useAuth';
import { dashboardForRole } from '../../config/roles';
import NotificationBadge from '../../features/notifications/components/NotificationBadge';

export default function AppHeader() {
  const { account } = useAuth();
  return (
    <header className="app-header">
      <Link
        className="brand"
        to={account ? dashboardForRole(account.role) : routePaths.login}
        aria-label="HostelHive dashboard"
      >
        <BrandLogo />
      </Link>
      <span className="app-header__description">Staff workspace</span>
      {account && (
        <span className="app-header__role">
          {account.role === 'admin' ? 'Admin' : 'Warden'}
        </span>
      )}
      <div className="app-header__actions">
        <NotificationBadge />
        <MobileSidebar />
      </div>
    </header>
  );
}
