import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useBlocker, useLocation } from 'react-router-dom';
import useAuth from '../../auth/hooks/useAuth';
import Button from '../../../shared/components/ui/Button';
import Input from '../../../shared/components/ui/Input';
import { routePaths } from '../../../app/router/routePaths';
import {
  validUser,
  roleLabels,
  type ManagedUser,
} from '../../users/api/users.api';
import {
  createStaffProfile,
  getStaff,
  normalizeStaff,
  validateStaff,
  staffAccessError,
  StaffError,
  type StaffProfile,
} from '../api/staff.api';
import {
  provisionStaff,
  validateAccount,
  normalizeEmail,
  isStaffRole,
  staffRoles,
  readStaffRecovery,
  writeStaffRecovery,
  clearStaffRecovery,
  ProvisionError,
  type StaffRole,
  type StaffRecovery,
} from '../api/staff-provisioning.api';
import ExistingStaffAccounts from '../components/ExistingStaffAccounts';
import StaffSetupDiscard from '../components/StaffSetupDiscard';
import '../../../styles/staff-management.css';

export default function StaffCreationPage() {
  const { account } = useAuth();
  if (!account || account.role !== 'admin' || !account.is_active)
    return <p role="alert">Staff creation requires an active Admin account.</p>;
  return (
    <Setup
      key={`${account.firebase_uid}:${account.user_id}`}
      uid={account.firebase_uid}
    />
  );
}
function Setup({ uid }: { uid: string }) {
  const { state } = useLocation();
  const { signOut, retry } = useAuth();
  const [seed] = useState(() => {
    const linked: unknown = state?.staffAccount;
    if (
      state?.staffActor === uid &&
      validUser(linked) &&
      isStaffRole(linked.role)
    )
      return { linked };
    try {
      return { recovery: readStaffRecovery(uid) };
    } catch (error) {
      return {
        storageError:
          error instanceof Error
            ? error.message
            : 'Saved setup is unavailable.',
      };
    }
  });
  const [mode, setMode] = useState<'new' | 'existing'>(
    seed.linked ? 'existing' : 'new',
  );
  const [attempt, setAttempt] = useState<StaffRecovery | null>(
    seed.recovery ?? null,
  );
  const [account, setAccount] = useState<ManagedUser | undefined>(
    seed.linked ?? seed.recovery?.account,
  );
  const [draft, setDraft] = useState({
    full_name: seed.recovery?.full_name ?? seed.linked?.full_name ?? '',
    designation: seed.recovery?.designation ?? seed.linked?.designation ?? '',
    email: seed.recovery?.email ?? '',
    role: seed.recovery?.role ?? ('warden' as StaffRole),
    password: '',
  });
  const [visible, setVisible] = useState(false);
  const [lockedPassword, setLockedPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState(seed.storageError ?? '');
  const [storageProblem, setStorageProblem] = useState(
    Boolean(seed.storageError),
  );
  const [rejected, setRejected] = useState(false);
  const [uncertainProfile, setUncertainProfile] = useState(false);
  const [complete, setComplete] = useState<{
    profile: StaffProfile;
    existing: boolean;
  }>();
  const [denial, setDenial] = useState('');
  const [leaving, setLeaving] = useState<'new' | 'existing' | 'reset' | null>(
    null,
  );
  const busy = useRef(false);
  const active = useRef(false);
  const request = useRef<AbortController | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const finished = useRef(false);
  const dirty = Boolean(
    draft.full_name ||
    draft.designation ||
    draft.email ||
    draft.password ||
    account ||
    attempt,
  );
  const blocker = useBlocker(
    () => !finished.current && !denial && (dirty || busy.current),
  );
  const blocked = leaving !== null || blocker.state === 'blocked';
  const deny = useCallback((message: string) => {
    setDenial(message);
    setDraft({
      full_name: '',
      designation: '',
      email: '',
      role: 'warden',
      password: '',
    });
    setAccount(undefined);
    setAttempt(null);
    setComplete(undefined);
    setErrors({});
    setError('');
    setVisible(false);
  }, []);
  useEffect(() => {
    active.current = true;
    heading.current?.focus();
    return () => {
      active.current = false;
      request.current?.abort();
    };
  }, []);
  useEffect(() => {
    if ((!dirty && !pending) || complete || denial) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty, pending, complete, denial]);
  async function finishProfile(
    target: ManagedUser,
    controller: AbortController,
  ) {
    try {
      const existing = await getStaff(target.user_id, uid, controller.signal);
      if (!controller.signal.aborted) finish(existing, true);
      return;
    } catch (failure) {
      if (!(failure instanceof StaffError) || failure.kind !== 'missing')
        throw failure;
    }
    if (controller.signal.aborted) return;
    const saved = await createStaffProfile(
      target.user_id,
      normalizeStaff(draft),
      uid,
      controller.signal,
    );
    if (!controller.signal.aborted) finish(saved, false);
  }
  function finish(profile: StaffProfile, existing: boolean) {
    finished.current = true;
    if (mode === 'new') clearStaffRecovery(uid);
    setComplete({ profile, existing });
    setDraft((value) => ({ ...value, password: '' }));
    setVisible(false);
    setError('');
    setUncertainProfile(false);
    heading.current?.focus();
  }
  async function submit() {
    if (
      busy.current ||
      complete ||
      denial ||
      (storageProblem && mode === 'new')
    )
      return;
    const validation = {
      ...validateStaff(draft),
      ...(mode === 'new' && !account ? validateAccount(draft) : {}),
    };
    if (mode === 'existing' && !account) {
      setError('Choose an existing staff account.');
      return;
    }
    setErrors(validation);
    if (Object.keys(validation).length) {
      form.current
        ?.querySelector<HTMLInputElement>(
          `#setup-${Object.keys(validation)[0]}`,
        )
        ?.focus();
      return;
    }
    if (account && !isStaffRole(account.role)) {
      setError(
        'This account no longer has a staff role. Review it in User management.',
      );
      return;
    }
    busy.current = true;
    setPending(true);
    setError('');
    setRejected(false);
    const controller = new AbortController();
    request.current = controller;
    let target = account;
    let currentAttempt = attempt;
    try {
      if (!target) {
        if (!currentAttempt) {
          currentAttempt = {
            key: crypto.randomUUID(),
            email: normalizeEmail(draft.email),
            role: draft.role,
            ...normalizeStaff(draft),
          };
          writeStaffRecovery(uid, currentAttempt);
          setAttempt(currentAttempt);
        }
        setLockedPassword(true);
        const result = await provisionStaff(
          {
            email: currentAttempt.email,
            role: currentAttempt.role,
            password: draft.password,
          },
          currentAttempt.key,
          uid,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        target = result.account;
        setAccount(target);
        setDraft((value) => ({ ...value, password: '' }));
        setVisible(false);
        currentAttempt = { ...currentAttempt, account: target };
        setAttempt(currentAttempt);
        try {
          writeStaffRecovery(uid, currentAttempt);
        } catch {
          /* The original persisted key still permits recovery. */
        }
      }
      if (!isStaffRole(target.role))
        throw new StaffError(
          'conflict',
          'The confirmed account no longer has a staff role. Review it in User management.',
        );
      if (mode === 'new' && currentAttempt) {
        const updated = {
          ...currentAttempt,
          ...normalizeStaff(draft),
          account: target,
        };
        setAttempt(updated);
        try {
          writeStaffRecovery(uid, updated);
        } catch {
          /* Retain the original safe account reference. */
        }
      }
      await finishProfile(target, controller);
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (
        staffAccessError(failure) ||
        (failure instanceof ProvisionError &&
          ['session', 'forbidden'].includes(failure.kind))
      ) {
        deny((failure as Error).message);
        return;
      }
      const accountRejected =
        !target &&
        failure instanceof ProvisionError &&
        ['invalid', 'conflict'].includes(failure.kind);
      setRejected(accountRejected);
      if (target) {
        setUncertainProfile(
          !(failure instanceof StaffError) || failure.kind === 'unavailable',
        );
        setError(
          `The account exists. Profile setup is incomplete: ${failure instanceof StaffError && failure.kind !== 'unavailable' ? failure.message : 'the profile result could not be confirmed. Retry profile completion to check saved state first.'}`,
        );
      } else
        setError(
          failure instanceof ProvisionError
            ? failure.message
            : 'Account creation could not be confirmed. Retry the original request.',
        );
    } finally {
      busy.current = false;
      if (!controller.signal.aborted) setPending(false);
    }
  }
  function reset(next: 'new' | 'existing' | 'reset') {
    if (busy.current) return;
    let restored: StaffRecovery | null = null;
    let restoreError = '';
    if (next === 'reset') {
      clearStaffRecovery(uid);
    } else {
      setMode(next);
      if (next === 'new') {
        try {
          restored = readStaffRecovery(uid);
        } catch (failure) {
          restoreError =
            failure instanceof Error
              ? failure.message
              : 'Saved setup could not be read safely.';
        }
      }
    }
    setAttempt(restored);
    setAccount(restored?.account);
    setLockedPassword(false);
    setUncertainProfile(false);
    setStorageProblem(Boolean(restoreError));
    setDraft({
      full_name: restored?.full_name ?? '',
      designation: restored?.designation ?? '',
      email: restored?.email ?? '',
      role: restored?.role ?? 'warden',
      password: '',
    });
    setErrors({});
    setError(restoreError);
    setRejected(false);
    setVisible(false);
    setLeaving(null);
  }
  if (denial)
    return (
      <section>
        <h1>Add staff member</h1>
        <p role="alert">{denial}</p>
        <div className="staff-actions">
          <Button
            onClick={() => {
              void retry().catch(() => {
                if (active.current)
                  setDenial('Access could not be verified. Please try again.');
              });
            }}
          >
            Check access again
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              void signOut().catch(() => {
                if (active.current)
                  setDenial(
                    'Sign out could not be confirmed. Please try again.',
                  );
              });
            }}
          >
            Sign out
          </Button>
        </div>
      </section>
    );
  return (
    <section className="staff-page" aria-labelledby="staff-creation-title">
      <p className="eyebrow">Admin / Staff / Add</p>
      <h1 id="staff-creation-title" ref={heading} tabIndex={-1}>
        Add staff member
      </h1>
      <Link to={routePaths.staff}>Back to staff directory</Link>
      {complete ? (
        <div className="staff-panel">
          <h2>
            {complete.existing
              ? 'Existing staff profile found'
              : 'Staff profile ready'}
          </h2>
          <p role="status">
            {complete.existing
              ? 'The existing profile was preserved. Review its saved details.'
              : 'Account and staff profile are confirmed.'}
          </p>
          <dl className="staff-details">
            {[
              ['Full name', complete.profile.full_name],
              ['Designation', complete.profile.designation],
              ['Email', complete.profile.email],
              ['Role', roleLabels[complete.profile.role]],
              ['Access', complete.profile.is_active ? 'Active' : 'Inactive'],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <Link
            className="button-link"
            to={`${routePaths.staff}/${complete.profile.user_id}`}
          >
            View staff profile
          </Link>
        </div>
      ) : (
        <div className="staff-panel">
          <div
            className="staff-actions"
            role="group"
            aria-label="Staff setup type"
          >
            {(['new', 'existing'] as const).map((value) => (
              <Button
                key={value}
                variant={mode === value ? 'primary' : 'secondary'}
                aria-pressed={mode === value}
                disabled={pending || Boolean(attempt)}
                onClick={() => {
                  if (value !== mode) {
                    if (dirty) setLeaving(value);
                    else reset(value);
                  }
                }}
              >
                {value === 'new'
                  ? 'New staff account'
                  : 'Existing staff account'}
              </Button>
            ))}
          </div>
          <p>
            Only Admins can add staff. Sub-warden and Security staff do not yet
            have dedicated web portals.
          </p>
          {mode === 'existing' && !account && (
            <ExistingStaffAccounts
              uid={uid}
              onDenied={deny}
              onSelect={(value) => {
                setAccount(value);
                setDraft((current) => ({
                  ...current,
                  full_name: current.full_name || value.full_name || '',
                  designation: current.designation || value.designation || '',
                }));
                setError('');
              }}
            />
          )}
          {account && (
            <div className="staff-review">
              <h2>Account confirmed</h2>
              <p>
                {account.email} — {roleLabels[account.role]} (
                {account.is_active ? 'Active' : 'Inactive'})
              </p>
              <p>
                Account ID: {account.user_id}. Profile completion will not
                create another login account or change its role/access.
              </p>
              <Link to={`${routePaths.staff}/${account.user_id}`}>
                View staff profile if it already exists
              </Link>
            </div>
          )}
          {attempt && !account && (
            <p role="status">
              An account request is pending or unconfirmed. Email and role are
              locked. Retry the original request. After a reload, re-enter the
              original initial password; retries never reset an existing
              password.
            </p>
          )}
          <form
            ref={form}
            noValidate
            aria-busy={pending}
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            {(['full_name', 'designation'] as const).map((key) => (
              <div className="staff-field" key={key}>
                <label htmlFor={`setup-${key}`}>
                  {key === 'full_name' ? 'Full name' : 'Designation'}
                </label>
                <Input
                  id={`setup-${key}`}
                  value={draft[key]}
                  required
                  disabled={
                    pending || uncertainProfile || Boolean(attempt && !account)
                  }
                  aria-invalid={Boolean(errors[key])}
                  aria-describedby={
                    errors[key] ? `setup-${key}-error` : undefined
                  }
                  onChange={(event) => {
                    setDraft((value) => ({
                      ...value,
                      [key]: event.target.value,
                    }));
                    setErrors({});
                  }}
                />
                {errors[key] && (
                  <p role="alert" id={`setup-${key}-error`}>
                    {errors[key]}
                  </p>
                )}
              </div>
            ))}
            {mode === 'new' && !account && (
              <>
                <div className="staff-field">
                  <label htmlFor="setup-email">Email</label>
                  <Input
                    id="setup-email"
                    type="email"
                    autoComplete="off"
                    value={draft.email}
                    disabled={pending || Boolean(attempt)}
                    required
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={
                      errors.email ? 'setup-email-error' : undefined
                    }
                    onChange={(event) =>
                      setDraft((value) => ({
                        ...value,
                        email: event.target.value,
                      }))
                    }
                  />
                  {errors.email && (
                    <p role="alert" id="setup-email-error">
                      {errors.email}
                    </p>
                  )}
                </div>
                <div className="staff-field">
                  <label htmlFor="setup-role">Staff role</label>
                  <select
                    id="setup-role"
                    value={draft.role}
                    disabled={pending || Boolean(attempt)}
                    onChange={(event) =>
                      setDraft((value) => ({
                        ...value,
                        role: event.target.value as StaffRole,
                      }))
                    }
                  >
                    {staffRoles.map((role) => (
                      <option key={role} value={role}>
                        {roleLabels[role]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="staff-field">
                  <label htmlFor="setup-password">Initial password</label>
                  <div className="staff-password">
                    <Input
                      id="setup-password"
                      type={visible ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={draft.password}
                      disabled={pending || lockedPassword}
                      required
                      aria-invalid={Boolean(errors.password)}
                      aria-describedby="setup-password-help"
                      onChange={(event) =>
                        setDraft((value) => ({
                          ...value,
                          password: event.target.value,
                        }))
                      }
                    />
                    <Button
                      variant="secondary"
                      disabled={pending}
                      aria-label={visible ? 'Hide password' : 'Show password'}
                      aria-pressed={visible}
                      onClick={() => setVisible((value) => !value)}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="20"
                        height="20"
                        fill="none"
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" />
                        <circle cx="12" cy="12" r="3" />
                        {visible && <path d="m3 3 18 18" />}
                      </svg>
                    </Button>
                  </div>
                  <p id="setup-password-help">
                    Use 12–128 characters. This flow sets an initial password;
                    no setup invitation or automatic credential email is sent.
                  </p>
                  {errors.password && <p role="alert">{errors.password}</p>}
                </div>
              </>
            )}
            {error && <p role="alert">{error}</p>}
            {pending && (
              <p role="status">
                {account
                  ? 'Checking or completing staff profile…'
                  : 'Creating account, then checking its staff profile…'}
              </p>
            )}
            <div className="staff-actions">
              <Button
                type="submit"
                disabled={
                  pending ||
                  (mode === 'existing' && !account) ||
                  (storageProblem && mode === 'new') ||
                  Boolean(account && !isStaffRole(account.role))
                }
              >
                {account
                  ? 'Complete staff profile'
                  : attempt
                    ? 'Retry same account request'
                    : 'Create staff member'}
              </Button>
              {(rejected || storageProblem) && (
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() => setLeaving('reset')}
                >
                  Review account details and reset saved reference
                </Button>
              )}
            </div>
          </form>
          <p>
            Already have an account? Use{' '}
            <Link to={routePaths.users}>User management</Link> to select an
            existing staff account. Account creation and profile creation are
            separate operations.
          </p>
        </div>
      )}
      {blocked && !complete && (
        <StaffSetupDiscard
          pending={pending}
          keep={() => {
            if (busy.current) return;
            setLeaving(null);
            if (blocker.state === 'blocked') blocker.reset();
          }}
          discard={() => {
            if (busy.current) return;
            if (blocker.state === 'blocked') {
              finished.current = true;
              blocker.proceed();
            } else if (leaving) reset(leaving);
          }}
        />
      )}
    </section>
  );
}
