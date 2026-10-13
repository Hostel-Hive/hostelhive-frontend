import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { PasswordPolicy } from 'firebase/auth';
import Button from '../../../shared/components/ui/Button';
import Input from '../../../shared/components/ui/Input';
import {
  firstLoginErrorMessage,
  validateFirstLoginPassword,
} from '../api/first-login.api';
import { passwordRequirements } from '../password.schema';
import PasswordRequirements from './PasswordRequirements';

export default function FirstLoginSetupForm({
  policy,
  onValidated,
}: {
  policy: PasswordPolicy;
  onValidated: () => void;
}) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const invalidPassword = !password
      ? 'Enter a sample password.'
      : passwordRequirements(password, policy).some((row) => !row.met)
        ? 'Meet all password requirements below.'
        : '';
    const mismatch = !confirmation
      ? 'Confirm the sample password.'
      : password !== confirmation
        ? 'Passwords do not match.'
        : '';
    setFieldError(invalidPassword);
    setConfirmError(mismatch);
    setError('');
    if (invalidPassword || mismatch) {
      (invalidPassword ? passwordRef : confirmRef).current?.focus();
      return;
    }
    busy.current = true;
    setPending(true);
    try {
      const valid = await validateFirstLoginPassword(password);
      if (!mounted.current) return;
      if (!valid) {
        setFieldError(
          'The sample password does not meet the current policy. Reload the requirements and try again.',
        );
        passwordRef.current?.focus();
        return;
      }
      setPassword('');
      setConfirmation('');
      onValidated();
    } catch (reason) {
      if (mounted.current) {
        setError(firstLoginErrorMessage(reason));
        setPassword('');
        setConfirmation('');
        passwordRef.current?.focus();
      }
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }

  return (
    <form
      className="login-form"
      onSubmit={submit}
      noValidate
      aria-busy={pending}
    >
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <div className="auth-field">
        <label htmlFor="first-login-password">New password</label>
        <Input
          ref={passwordRef}
          id="first-login-password"
          type="password"
          autoComplete="off"
          required
          disabled={pending}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={Boolean(fieldError)}
          aria-describedby={
            fieldError
              ? 'first-login-password-error first-login-requirements'
              : 'first-login-requirements'
          }
        />
        {fieldError && (
          <p id="first-login-password-error" className="field-error">
            {fieldError}
          </p>
        )}
        <PasswordRequirements
          id="first-login-requirements"
          password={password}
          policy={policy}
        />
      </div>
      <div className="auth-field">
        <label htmlFor="first-login-confirm">Confirm new password</label>
        <Input
          ref={confirmRef}
          id="first-login-confirm"
          type="password"
          autoComplete="off"
          required
          disabled={pending}
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          aria-invalid={Boolean(confirmError)}
          aria-describedby={
            confirmError ? 'first-login-confirm-error' : undefined
          }
        />
        {confirmError && (
          <p id="first-login-confirm-error" className="field-error">
            {confirmError}
          </p>
        )}
      </div>
      <Button
        className="auth-submit"
        size="lg"
        type="submit"
        disabled={pending}
      >
        {pending ? 'Checking requirements…' : 'Preview password setup →'}
      </Button>
      <span className="sr-only" role="status">
        {pending ? 'Checking sample password requirements.' : ''}
      </span>
    </form>
  );
}
