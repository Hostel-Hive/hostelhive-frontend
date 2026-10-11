import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { routePaths } from '../../../app/router/routePaths';
import { login, loginErrorMessage, restoreStaffSession } from '../api/auth.api';
import { validateLogin } from '../auth.schema';
import type { StaffAccount } from '../auth.types';
import Button from '../../../shared/components/ui/Button';
import Input from '../../../shared/components/ui/Input';

export default function LoginForm() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>(
    {},
  );
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    restoreStaffSession()
      .then((account) => {
        if (active && account)
          navigate(
            account.role === 'admin'
              ? routePaths.adminDashboard
              : routePaths.wardenDashboard,
            { replace: true },
          );
      })
      .catch((reason: unknown) => {
        if (active) setError(loginErrorMessage(reason));
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [navigate]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || checking) return;
    const input = { email, password, rememberMe };
    const nextErrors = validateLogin(input);
    setErrors(nextErrors);
    setError('');
    if (nextErrors.email || nextErrors.password) {
      (nextErrors.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    busy.current = true;
    setSubmitting(true);
    try {
      const account: StaffAccount = await login(input);
      if (!mounted.current) return;
      setPassword('');
      navigate(
        account.role === 'admin'
          ? routePaths.adminDashboard
          : routePaths.wardenDashboard,
        { replace: true },
      );
    } catch (reason) {
      if (!mounted.current) return;
      setError(loginErrorMessage(reason));
      setPassword('');
      passwordRef.current?.focus();
    } finally {
      busy.current = false;
      if (mounted.current) setSubmitting(false);
    }
  }

  return (
    <form
      className="login-form"
      onSubmit={handleSubmit}
      noValidate
      aria-busy={checking || submitting}
    >
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <div className="auth-field">
        <label htmlFor="login-email">Email</label>
        <div className="auth-input-wrapper">
          <svg
            className="auth-input-icon"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 6 9 7 9-7" />
          </svg>
          <Input
            ref={emailRef}
            id="login-email"
            name="email"
            type="email"
            autoComplete="username"
            placeholder="you@example.com"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'email-error' : undefined}
            disabled={submitting}
          />
        </div>
        {errors.email && (
          <p id="email-error" className="field-error">
            {errors.email}
          </p>
        )}
      </div>
      <div className="auth-field">
        <div className="auth-field-heading">
          <label htmlFor="login-password">Password</label>
          <Link to={routePaths.forgotPassword}>Forgot password?</Link>
        </div>
        <Input
          ref={passwordRef}
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? 'password-error' : undefined}
          disabled={submitting}
        />
        {errors.password && (
          <p id="password-error" className="field-error">
            {errors.password}
          </p>
        )}
      </div>
      <label className="auth-remember">
        <input
          type="checkbox"
          checked={rememberMe}
          onChange={(event) => setRememberMe(event.target.checked)}
          disabled={submitting}
        />
        Keep me signed in
      </label>
      <Button
        className="auth-submit"
        size="lg"
        type="submit"
        disabled={checking || submitting}
      >
        {checking
          ? 'Checking session…'
          : submitting
            ? 'Signing in…'
            : 'Sign in'}
      </Button>
      <span className="sr-only" role="status">
        {checking
          ? 'Checking your session.'
          : submitting
            ? 'Signing in. Please wait.'
            : ''}
      </span>
    </form>
  );
}
