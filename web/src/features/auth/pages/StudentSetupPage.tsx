import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import { routePaths } from '../../../app/router/routePaths';
import Button from '../../../shared/components/ui/Button';
import {
  completeStudentSetup,
  StudentSetupError,
} from '../api/student-setup.api';

export default function StudentSetupPage() {
  const { account, retry, signOut } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const work = useRef<AbortController | null>(null);
  useEffect(() => () => work.current?.abort(), []);
  if (account?.role !== 'student') return null;
  if (!account.setup_required)
    return <Navigate to={routePaths.studentHome} replace />;

  async function complete() {
    if (work.current || !account) return;
    const controller = new AbortController();
    work.current = controller;
    setPending(true);
    setError('');
    try {
      await completeStudentSetup(account.firebase_uid, controller.signal);
      if (!controller.signal.aborted) await retry();
    } catch (reason) {
      if (!controller.signal.aborted) {
        setError(
          reason instanceof StudentSetupError
            ? reason.message
            : 'Setup verification is unavailable. Please retry.',
        );
      }
    } finally {
      if (!controller.signal.aborted) {
        work.current = null;
        setPending(false);
      }
    }
  }
  return (
    <section
      className="auth-panel"
      aria-labelledby="student-setup-title"
      aria-busy={pending}
    >
      <p className="eyebrow">Student account setup</p>
      <h1 id="student-setup-title">
        Complete your <em>account setup.</em>
      </h1>
      <p className="auth-description">
        Open the invitation sent to {account.email} and choose your HostelHive
        password using the secure email link. Then sign in with that password
        and verify setup here.
      </p>
      <p className="auth-description">
        If the link has expired or the invitation has not arrived, contact your
        hostel administrator. Your student portal stays locked until setup is
        verified.
      </p>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <div className="student-entry-actions">
        <Button onClick={() => void complete()} disabled={pending}>
          {pending ? 'Verifying setup…' : 'Verify account setup'}
        </Button>
        <Button
          variant="secondary"
          onClick={() => void signOut()}
          disabled={pending}
        >
          Sign out and sign in again
        </Button>
      </div>
      {pending && <p role="status">Verifying your account setup…</p>}
    </section>
  );
}
