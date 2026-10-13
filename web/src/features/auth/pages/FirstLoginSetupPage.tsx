import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PasswordPolicy } from 'firebase/auth';
import { routePaths } from '../../../app/router/routePaths';
import Button from '../../../shared/components/ui/Button';
import {
  firstLoginErrorMessage,
  loadFirstLoginPolicy,
} from '../api/first-login.api';
import FirstLoginSetupForm from '../components/FirstLoginSetupForm';

type PolicyState = {
  status: 'loading' | 'error' | 'ready';
  policy: PasswordPolicy | null;
  message: string;
};
export default function FirstLoginSetupPage() {
  const [state, setState] = useState<PolicyState>({
    status: 'loading',
    policy: null,
    message: '',
  });
  const [attempt, setAttempt] = useState(0);
  const [validated, setValidated] = useState(false);
  useEffect(() => {
    let active = true;
    loadFirstLoginPolicy()
      .then((policy) => {
        if (active) setState({ status: 'ready', policy, message: '' });
      })
      .catch((reason: unknown) => {
        if (active)
          setState({
            status: 'error',
            policy: null,
            message: firstLoginErrorMessage(reason),
          });
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  return (
    <section className="auth-panel" aria-labelledby="first-login-title">
      <p className="auth-preview-notice">
        UI preview only · Use sample passwords. Account setup is not connected.
      </p>
      <p className="eyebrow">First login · Setup preview</p>
      <h1 id="first-login-title">
        {validated ? (
          <>
            Preview <em>complete.</em>
          </>
        ) : (
          <>
            Welcome to <em>HostelHive.</em>
          </>
        )}
      </h1>
      {validated ? (
        <>
          <p className="auth-description" role="status">
            The sample password passed validation. No password was saved and no
            account or QR code was activated.
          </p>
          <Button
            variant="secondary"
            className="auth-submit"
            onClick={() => setValidated(false)}
          >
            Try another sample
          </Button>
        </>
      ) : (
        <>
          <p className="auth-description">
            Preview choosing a password that meets the configured policy.
          </p>
          {state.status === 'loading' ? (
            <p role="status">Loading password requirements…</p>
          ) : state.status === 'error' ? (
            <>
              <p className="auth-error" role="alert">
                {state.message}
              </p>
              <Button
                className="auth-submit"
                onClick={() => {
                  setState({ status: 'loading', policy: null, message: '' });
                  setAttempt((value) => value + 1);
                }}
              >
                Retry loading requirements
              </Button>
            </>
          ) : (
            state.policy && (
              <>
                <FirstLoginSetupForm
                  policy={state.policy}
                  onValidated={() => setValidated(true)}
                />
                <Button
                  variant="ghost"
                  onClick={() => {
                    setState({ status: 'loading', policy: null, message: '' });
                    setAttempt((value) => value + 1);
                  }}
                >
                  Reload requirements
                </Button>
              </>
            )
          )}
        </>
      )}
      <Link className="auth-back-link" to={routePaths.login}>
        ← Back to sign in
      </Link>
    </section>
  );
}
