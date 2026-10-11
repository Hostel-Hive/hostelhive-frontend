import { Link } from 'react-router-dom';
import { routePaths } from '../../../app/router/routePaths';

export default function PasswordRecoveryPage() {
  return (
    <section className="auth-panel" aria-labelledby="recovery-title">
      <p className="eyebrow">Reset access</p>
      <h1 id="recovery-title">
        Forgot your <em>password?</em>
      </h1>
      <p className="auth-description">
        Online password recovery is not available yet. Contact the Head Warden’s
        office for assistance.
      </p>
      <Link className="auth-back-link" to={routePaths.login}>
        ← Back to sign in
      </Link>
    </section>
  );
}
