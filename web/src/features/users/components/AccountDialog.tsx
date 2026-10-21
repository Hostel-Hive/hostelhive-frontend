import { useEffect, useRef, useState } from 'react';
import Button from '../../../shared/components/ui/Button';
import {
  changeUser,
  roles,
  roleLabels,
  UserManagementError,
  type ManagedUser,
  type UserRole,
  type AccountAction,
} from '../api/users.api';

interface Props {
  user: ManagedUser;
  kind: AccountAction['kind'];
  uid: string;
  onClose: () => void;
  onRefresh: () => void;
  onSaved: (message: string, selfChanged: boolean) => void;
  onDenied: (message: string) => void;
}
export default function AccountDialog({
  user,
  kind,
  uid,
  onClose,
  onRefresh,
  onSaved,
  onDenied,
}: Props) {
  const [role, setRole] = useState<UserRole>(user.role);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [missing, setMissing] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);
  const request = useRef<AbortController | null>(null);
  const title =
    kind === 'role'
      ? 'Change account role'
      : kind === 'activate'
        ? 'Activate account'
        : 'Deactivate account';
  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current!;
    element.showModal();
    cancel.current?.focus();
    return () => {
      request.current?.abort();
      element.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
      else document.getElementById('users-title')?.focus();
    };
  }, []);
  useEffect(() => {
    if (!pending) return;
    const prevent = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [pending]);
  async function submit() {
    if (
      busy.current ||
      uncertain ||
      missing ||
      (kind === 'role' && role === user.role)
    )
      return;
    busy.current = true;
    setPending(true);
    setError('');
    const controller = new AbortController();
    request.current = controller;
    try {
      const result = await changeUser(
        uid,
        controller.signal,
        user,
        kind === 'role' ? { kind, role } : { kind },
      );
      if (controller.signal.aborted) return;
      const message =
        kind === 'role'
          ? `Role changed to ${roleLabels[result.account.role]}.`
          : kind === 'activate'
            ? 'Account activated.'
            : result.revocationPending
              ? 'Account deactivated locally. Firebase session revocation is still processing.'
              : 'Account deactivated.';
      onSaved(
        message,
        user.firebase_uid === uid &&
          (kind === 'deactivate' || (kind === 'role' && role !== 'admin')),
      );
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (
        failure instanceof UserManagementError &&
        ['session', 'forbidden'].includes(failure.kind)
      ) {
        onDenied(failure.message);
        return;
      }
      if (
        !(failure instanceof UserManagementError) ||
        failure.kind === 'unavailable'
      ) {
        setUncertain(true);
        setError(
          'The result could not be confirmed. The change may already be saved. Close and refresh accounts before considering another change.',
        );
      } else {
        setMissing(failure.kind === 'missing');
        setError(failure.message);
      }
    } finally {
      busy.current = false;
      if (!controller.signal.aborted) setPending(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="account-dialog"
      aria-labelledby="account-dialog-title"
      aria-describedby="account-dialog-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy.current) {
          if (uncertain || missing) onRefresh();
          else onClose();
        }
      }}
    >
      <form
        aria-busy={pending}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <h2 id="account-dialog-title">{title}</h2>
        <p id="account-dialog-description">
          Confirm this change for <strong>{user.email}</strong>.{' '}
          {kind === 'role'
            ? 'Changing the role changes account permissions.'
            : kind === 'activate'
              ? 'Activation restores account access when backend identity checks succeed.'
              : 'Deactivation denies account access. It does not archive the student profile.'}
        </p>
        {user.firebase_uid === uid && (
          <p>
            You are changing your own account. Your access will be checked again
            if it changes.
          </p>
        )}
        {kind === 'role' && (
          <>
            <label htmlFor="account-role">New role</label>
            <select
              id="account-role"
              value={role}
              disabled={pending || uncertain || missing}
              onChange={(event) => setRole(event.target.value as UserRole)}
            >
              {roles.map((value) => (
                <option key={value} value={value}>
                  {roleLabels[value]}
                </option>
              ))}
            </select>
            <p>
              Current role: {roleLabels[user.role]}. Sub-warden and Security
              staff do not currently have dedicated web portals.
            </p>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        {pending && <p role="status">Saving account change…</p>}
        <div className="account-actions">
          <Button
            ref={cancel}
            variant="secondary"
            disabled={pending}
            onClick={uncertain || missing ? onRefresh : onClose}
          >
            {uncertain || missing ? 'Close and refresh accounts' : 'Cancel'}
          </Button>
          {!uncertain && !missing && (
            <Button
              type="submit"
              variant={kind === 'deactivate' ? 'danger' : 'primary'}
              disabled={pending || (kind === 'role' && role === user.role)}
            >
              Confirm change
            </Button>
          )}
        </div>
      </form>
    </dialog>
  );
}
