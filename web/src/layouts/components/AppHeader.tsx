import { Link } from 'react-router-dom';
import { routePaths } from '../../app/router/routePaths';
import MobileSidebar from './MobileSidebar';

export default function AppHeader() {
  return (
    <header className="app-header">
      <Link
        className="brand"
        to={routePaths.adminDashboard}
        aria-label="HostelHive dashboard"
      >
        HostelHive
      </Link>
      <span className="app-header__description">Staff workspace</span>
      <MobileSidebar />
    </header>
  );
}
