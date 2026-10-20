import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { routePaths } from '../../../app/router/routePaths';
import { loginErrorMessage } from '../api/auth.api';
import useAuth from '../hooks/useAuth';
import { validateLogin } from '../auth.schema';
import { homeForAccount } from '../../../config/roles';
import Button from '../../../shared/components/ui/Button';
import Input from '../../../shared/components/ui/Input';

export default function LoginForm({ student = false }: { student?: boolean }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>(
    {},
  );
  const [error, setError] = useState('');
  const { signIn, status, message, busy: authBusy } = useAuth();
  const checking = status === 'checking';
  const [isSubmitting, setSubmitting] = useState(false);
  const submitting = isSubmitting || authBusy;
  const busy = useRef(false);
  const mounted = useRef(true);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || checking || authBusy) return;
    const input = {
      email,
      password,
      rememberMe,
      ...(student ? { portal: 'student' as const } : {}),
    };
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
      const account = await signIn(input);
      if (!mounted.current) return;
      setPassword('');
      setShowPassword(false);
      navigate(homeForAccount(account), { replace: true });
    } catch (reason) {
      if (!mounted.current) return;
      setError(loginErrorMessage(reason));
      setPassword('');
      setShowPassword(false);
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
      {(error || message) && (
        <p className="auth-error" role="alert">
          {error || message}
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
          <Link
            to={
              student
                ? routePaths.studentForgotPassword
                : routePaths.forgotPassword
            }
          >
            Forgot password?
          </Link>
        </div>
        <div className="auth-password-wrapper">
          <Input
            ref={passwordRef}
            id="login-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Enter your password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? 'password-error' : undefined}
            disabled={submitting}
          />
          <button
            type="button"
            className="auth-password-toggle"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-controls="login-password"
            disabled={submitting}
            onClick={() => setShowPassword((visible) => !visible)}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
              <circle cx="12" cy="12" r="3" />
              {showPassword && <path d="m3 3 18 18" />}
            </svg>
          </button>
        </div>
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
