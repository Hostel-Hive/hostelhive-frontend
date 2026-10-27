import { Outlet } from 'react-router-dom';
import AppHeader from './components/AppHeader';
import AppSidebar from './components/AppSidebar';
import StaffAccountMenu from './components/StaffAccountMenu';

export default function DashboardLayout() {
  return (
    <div className="dashboard-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <AppHeader />
      <div className="dashboard-body">
        <aside className="desktop-sidebar">
          <div className="staff-sidebar-navigation">
            <AppSidebar />
          </div>
          <StaffAccountMenu />
        </aside>
        <main id="main-content" className="dashboard-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
