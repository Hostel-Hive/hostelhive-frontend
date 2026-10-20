import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { PasswordPolicy } from 'firebase/auth';
import { routePaths } from '../../../app/router/routePaths';
import Button from '../../../shared/components/ui/Button';
import useAuth from '../hooks/useAuth';
import ResetPasswordForm from '../components/ResetPasswordForm';
import {
  inspectResetLink,
  isInvalidResetLink,
  passwordErrorMessage,
} from '../api/password.api';
import { parseResetRequest } from '../password.schema';

interface ResetState {
  status: 'checking' | 'ready' | 'invalid' | 'error';
  email: string;
  policy: PasswordPolicy | null;
  message: string;
}

function isStudentReset(pathname: string, search: string) {
  const continuation = new URLSearchParams(search).get('continueUrl');
  return (
    pathname === routePaths.studentResetPassword ||
    [routePaths.studentLogin, '/student/login'].some(
      (path) => continuation === `${window.location.origin}${path}`,
    )
  );
}

export default function ResetPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [capture, setCapture] = useState(() => ({
    request: parseResetRequest(location.search),
    search: location.search,
    revision: 0,
    student: isStudentReset(location.pathname, location.search),
  }));
  // A new action URL must discard the previous account, password fields and pending verification.
  if (location.search !== capture.search) {
    setCapture({
      request: location.search
        ? parseResetRequest(location.search)
        : capture.request,
      search: location.search,
      revision: capture.revision + (location.search ? 1 : 0),
      student: location.search
        ? isStudentReset(location.pathname, location.search)
        : capture.student,
    });
  }
  useEffect(() => {
    if (location.search) navigate(location.pathname, { replace: true });
  }, [location.search, location.pathname, navigate]);
  return (
    <ResetFlow
      key={capture.revision}
      request={capture.request}
      student={capture.student}
    />
  );
}

function ResetFlow({
  request,
  student,
}: {
  request: ReturnType<typeof parseResetRequest>;
  student: boolean;
}) {
  const loginPath = student ? routePaths.studentLogin : routePaths.login;
  const { signOut } = useAuth();
  const [state, setState] = useState<ResetState>({
    status: request ? 'checking' : 'invalid',
    email: '',
    policy: null,
    message:
      'This reset link is invalid, expired or already used. Request a new link.',
  });
  const [attempt, setAttempt] = useState(0);
  const [done, setDone] = useState(false);
  const invalidate = useCallback(
    (message: string) =>
      setState({ status: 'invalid', email: '', policy: null, message }),
    [],
  );
  useEffect(() => {
    if (!request) return;
    let active = true;
    inspectResetLink(request.code)
      .then(({ email, policy }) => {
        if (active) setState({ status: 'ready', email, policy, message: '' });
      })
      .catch((reason: unknown) => {
        if (active)
          setState({
            status: isInvalidResetLink(reason) ? 'invalid' : 'error',
            email: '',
            policy: null,
            message: passwordErrorMessage(reason),
          });
      });
    return () => {
      active = false;
    };
  }, [request, attempt]);

  if (done)
    return (
      <section
        className="auth-panel auth-panel--centered"
        aria-labelledby="reset-success-title"
      >
        <span className="auth-success-mark" aria-hidden="true">
          ✓
        </span>
        <p className="eyebrow">Password updated</p>
        <h1 id="reset-success-title">
          You’re <em>all set.</em>
        </h1>
        <p className="auth-description">
          Your password has been updated. Sign in with your new password to
          continue.
        </p>
        <Link
          className="ui-button ui-button--primary ui-button--lg auth-submit"
          to={loginPath}
        >
          Sign in with new password
        </Link>
      </section>
    );
  return (
    <section className="auth-panel" aria-labelledby="reset-title">
      <p className="eyebrow">Set a new password</p>
      <h1 id="reset-title">
        {state.status === 'invalid' ? (
          <>
            Request a new <em>link.</em>
          </>
        ) : (
          <>
            Choose a new <em>password.</em>
          </>
        )}
      </h1>
      {state.status === 'checking' ? (
        <p role="status">Checking your reset link…</p>
      ) : state.status === 'invalid' || state.status === 'error' ? (
        <>
          <p className="auth-error" role="alert">
            {state.message}
          </p>
          {state.status === 'error' && (
            <Button
              className="auth-submit"
              onClick={() => {
                setState({
                  status: 'checking',
                  email: '',
                  policy: null,
                  message: '',
                });
                setAttempt((value) => value + 1);
              }}
            >
              Retry link verification
            </Button>
          )}
          <Link
            className="auth-back-link"
            to={
              student
                ? routePaths.studentForgotPassword
                : routePaths.forgotPassword
            }
          >
            Request a new reset link
          </Link>
        </>
      ) : state.policy && request ? (
        <>
          <p className="auth-description">
            Choose a new password that meets your hostel’s configured policy.
          </p>
          <p className="auth-account-email">
            Resetting password for <strong>{state.email}</strong>
          </p>
          <ResetPasswordForm
            code={request.code}
            policy={state.policy}
            onInvalid={invalidate}
            onComplete={() => {
              setDone(true);
              void signOut();
            }}
          />
        </>
      ) : null}
      <Link className="auth-back-link" to={loginPath}>
        ← Back to sign in
      </Link>
    </section>
  );
}
