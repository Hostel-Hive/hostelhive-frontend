import { Link } from 'react-router-dom';
import { routePaths } from './routePaths';

export default function NotFoundPage() {
  return (
    <main className="not-found">
      <p className="eyebrow">404</p>
      <h1>Page not found</h1>
      <p>The page you requested could not be found.</p>
      <Link className="button-link" to={routePaths.adminDashboard}>
        Return to dashboard
      </Link>
    </main>
  );
}
