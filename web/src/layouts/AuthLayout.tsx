import { Link, Outlet, useLocation } from 'react-router-dom';
import BrandLogo from '../shared/components/ui/BrandLogo';
import { routePaths } from '../app/router/routePaths';
import AppFooter from './components/AppFooter';

export default function AuthLayout() {
  const { pathname } = useLocation();
  return (
    <div className="auth-shell">
      <a className="skip-link" href="#auth-content">
        Skip to content
      </a>
      <header className="auth-header">
        <Link
          to={
            pathname.startsWith('/student') ||
            pathname === routePaths.studentLogin
              ? routePaths.studentLogin
              : routePaths.login
          }
          className="auth-brand"
          aria-label="HostelHive sign in"
        >
          <BrandLogo />
        </Link>
        <p className="auth-support">
          <span aria-hidden="true">ⓘ</span> Having trouble? Contact your hostel
          administrator.
        </p>
      </header>
      <main id="auth-content" className="auth-main" tabIndex={-1}>
        <Outlet />
      </main>
      <AppFooter />
    </div>
  );
}
