import LoginForm from '../components/LoginForm';

export default function LoginPage() {
  return (
    <section className="auth-panel" aria-labelledby="login-title">
      <p className="eyebrow">Welcome back</p>
      <h1 id="login-title">
        Sign in to <em>HostelHive.</em>
      </h1>
      <p className="auth-description">
        Warden &amp; administrator portal for Bulugaha Girls’ Hostel.
      </p>
      <LoginForm />
      <p className="auth-divider">Hostel staff only</p>
    </section>
  );
}
