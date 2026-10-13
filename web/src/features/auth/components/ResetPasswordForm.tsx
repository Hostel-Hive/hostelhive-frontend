import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { PasswordPolicy } from 'firebase/auth';
import Button from '../../../shared/components/ui/Button';
import Input from '../../../shared/components/ui/Input';
import {
  completePasswordReset,
  isInvalidResetLink,
  passwordErrorMessage,
} from '../api/password.api';
import { passwordRequirements } from '../password.schema';
import PasswordRequirements from './PasswordRequirements';

interface Props {
  code: string;
  policy: PasswordPolicy;
  onComplete: () => void;
  onInvalid: (message: string) => void;
}
export default function ResetPasswordForm({
  code,
  policy,
  onComplete,
  onInvalid,
}: Props) {
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
  const requirements = passwordRequirements(password, policy);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const passwordError = !password
      ? 'Enter a new password.'
      : requirements.some((row) => !row.met)
        ? 'Meet all password requirements below.'
        : '';
    const mismatch = !confirmation
      ? 'Confirm your new password.'
      : password !== confirmation
        ? 'Passwords do not match.'
        : '';
    setFieldError(passwordError);
    setConfirmError(mismatch);
    setError('');
    if (passwordError || mismatch) {
      (passwordError ? passwordRef : confirmRef).current?.focus();
      return;
    }
    busy.current = true;
    setPending(true);
    try {
      await completePasswordReset(code, password);
      if (mounted.current) {
        setPassword('');
        setConfirmation('');
        onComplete();
      }
    } catch (reason) {
      if (mounted.current) {
        if (isInvalidResetLink(reason)) onInvalid(passwordErrorMessage(reason));
        else {
          setError(passwordErrorMessage(reason));
          setPassword('');
          setConfirmation('');
          passwordRef.current?.focus();
        }
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
        <label htmlFor="reset-password">New password</label>
        <Input
          ref={passwordRef}
          id="reset-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={pending}
          required
          aria-invalid={Boolean(fieldError)}
          aria-describedby={
            fieldError
              ? 'new-password-error password-requirements'
              : 'password-requirements'
          }
        />
        {fieldError && (
          <p id="new-password-error" className="field-error">
            {fieldError}
          </p>
        )}
        <PasswordRequirements
          id="password-requirements"
          password={password}
          policy={policy}
        />
      </div>
      <div className="auth-field">
        <label htmlFor="confirm-password">Confirm new password</label>
        <Input
          ref={confirmRef}
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          disabled={pending}
          required
          aria-invalid={Boolean(confirmError)}
          aria-describedby={confirmError ? 'confirm-password-error' : undefined}
        />
        {confirmError && (
          <p id="confirm-password-error" className="field-error">
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
        {pending ? 'Updating password…' : 'Update password'}
      </Button>
      <span role="status" className="sr-only">
        {pending ? 'Updating your password.' : ''}
      </span>
    </form>
  );
}
