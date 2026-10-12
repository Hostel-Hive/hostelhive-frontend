import useAuth from '../hooks/useAuth';
import Button from '../../../shared/components/ui/Button';

export default function SessionGate() {
  const auth = useAuth();
  return (
    <main className="session-gate">
      {auth.status === 'error' ? (
        <section aria-labelledby="session-error-title">
          <h1 id="session-error-title">Unable to verify your session</h1>
          <p role="alert">{auth.message}</p>
          <div className="session-actions">
            <Button onClick={() => void auth.retry()}>
              Retry verification
            </Button>
            <Button variant="secondary" onClick={() => void auth.signOut()}>
              Sign out
            </Button>
          </div>
        </section>
      ) : (
        <p role="status">Checking your session…</p>
      )}
    </main>
  );
}
