import { Link } from 'react-router-dom';
import { routePaths } from '../../app/router/routePaths';
import MobileSidebar from './MobileSidebar';
import useAuth from '../../features/auth/hooks/useAuth';
import { dashboardForRole } from '../../config/roles';
import Button from '../../shared/components/ui/Button';

export default function AppHeader() {
  const { account, signOut } = useAuth();
  return (
    <header className="app-header">
      <Link
        className="brand"
        to={account ? dashboardForRole(account.role) : routePaths.login}
        aria-label="HostelHive dashboard"
      >
        Hostel<span className="brand__accent">Hive</span>
      </Link>
      <span className="app-header__description">Staff workspace</span>
      <div className="app-header__actions">
        <Button variant="secondary" onClick={() => void signOut()}>
          Sign out
        </Button>
        <MobileSidebar />
      </div>
    </header>
  );
}
