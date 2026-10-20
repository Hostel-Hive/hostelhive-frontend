import useAuth from '../../auth/hooks/useAuth';
import Button from '../../../shared/components/ui/Button';
import AppFooter from '../../../layouts/components/AppFooter';

export default function StudentHomePage() {
  const { account, signOut } = useAuth();
  return (
    <div className="auth-shell">
      <a className="skip-link" href="#student-content">
        Skip to content
      </a>
      <header className="auth-header">
        <span className="auth-brand">HostelHive</span>
        <Button variant="secondary" onClick={() => void signOut()}>
          Sign out
        </Button>
      </header>
      <main id="student-content" className="auth-main" tabIndex={-1}>
        <section className="auth-panel" aria-labelledby="student-home-title">
          <p className="eyebrow">Student portal</p>
          <h1 id="student-home-title">
            Welcome to <em>HostelHive.</em>
          </h1>
          <p className="auth-description">Signed in as {account?.email}.</p>
          <p>
            Your account is ready. Student services will appear here as they
            become available.
          </p>
        </section>
      </main>
      <AppFooter />
    </div>
  );
}
