import { Link, Outlet } from 'react-router-dom';
import { routePaths } from '../app/router/routePaths';
import AppFooter from './components/AppFooter';

export default function AuthLayout() {
  return (
    <div className="auth-shell">
      <a className="skip-link" href="#auth-content">
        Skip to content
      </a>
      <header className="auth-header">
        <Link
          to={routePaths.login}
          className="auth-brand"
          aria-label="HostelHive sign in"
        >
          <span>HostelHive</span>
          <svg width="28" height="32" viewBox="0 0 28 32" aria-hidden="true">
            <path fill="currentColor" d="M2 5h6v9h12V1h6v30h-6V20H8v11H2z" />
          </svg>
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
