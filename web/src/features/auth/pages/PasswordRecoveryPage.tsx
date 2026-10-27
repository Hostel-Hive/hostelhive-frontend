import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { routePaths } from '../../../app/router/routePaths';
import Button from '../../../shared/components/ui/Button';
import Input from '../../../shared/components/ui/Input';
import {
  passwordErrorMessage,
  requestPasswordReset,
} from '../api/password.api';
import { validateRecoveryEmail } from '../password.schema';

export default function PasswordRecoveryPage({
  student = false,
}: {
  student?: boolean;
}) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [seconds, setSeconds] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!sent) return;
    const timer = window.setInterval(
      () => setSeconds((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [sent]);

  async function send(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (busy.current || seconds > 0) return;
    const validation = validateRecoveryEmail(email);
    setFieldError(validation);
    setError('');
    if (validation) {
      inputRef.current?.focus();
      return;
    }
    busy.current = true;
    setPending(true);
    try {
      if (student) await requestPasswordReset(email, true);
      else await requestPasswordReset(email);
      if (mounted.current) {
        setSent(true);
        setSeconds(60);
      }
    } catch (reason) {
      if (mounted.current) setError(passwordErrorMessage(reason));
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }

  return (
    <section
      className={`auth-panel ${sent ? 'auth-panel--centered' : ''}`}
      aria-labelledby="recovery-title"
    >
      {sent && (
        <span className="auth-success-mark" aria-hidden="true">
          ✉
        </span>
      )}
      <p className="eyebrow">{sent ? 'Check your email' : 'Reset access'}</p>
      <h1 id="recovery-title">
        {sent ? (
          <>
            Check your <em>inbox.</em>
          </>
        ) : (
          <>
            Forgot your <em>password?</em>
          </>
        )}
      </h1>
      <p className="auth-description">
        {sent
          ? 'If an account exists for that address, you’ll receive a password reset link. Check your inbox and spam folder.'
          : 'Enter your account email address to request a password reset link.'}
      </p>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      {sent ? (
        <div className="auth-recovery-actions">
          <Button
            className="auth-submit"
            variant="secondary"
            size="lg"
            disabled={pending || seconds > 0}
            onClick={() => void send()}
          >
            {pending
              ? 'Sending…'
              : seconds > 0
                ? `Resend link in ${seconds}s`
                : 'Resend link'}
          </Button>
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setSent(false);
              setSeconds(0);
              setError('');
            }}
          >
            Use a different email
          </Button>
        </div>
      ) : (
        <form
          className="login-form"
          onSubmit={send}
          noValidate
          aria-busy={pending}
        >
          <div className="auth-field">
            <label htmlFor="recovery-email">Account email</label>
            <Input
              ref={inputRef}
              id="recovery-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
              value={email}
              disabled={pending}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={Boolean(fieldError)}
              aria-describedby={fieldError ? 'recovery-email-error' : undefined}
            />
            {fieldError && (
              <p id="recovery-email-error" className="field-error">
                {fieldError}
              </p>
            )}
          </div>
          <Button
            className="auth-submit"
            size="lg"
            type="submit"
            disabled={pending}
          >
            {pending ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}
      <span role="status" className="sr-only">
        {pending
          ? 'Sending reset request.'
          : sent
            ? 'Reset request accepted. Check your email if an account exists.'
            : ''}
      </span>
      <Link
        className="auth-back-link"
        to={student ? routePaths.studentLogin : routePaths.login}
      >
        ← Back to sign in
      </Link>
    </section>
  );
}
