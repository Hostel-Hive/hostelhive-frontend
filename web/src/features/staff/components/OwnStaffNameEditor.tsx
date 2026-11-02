import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import type { StaffAccount } from '../../auth/auth.types';
import Button from '../../../shared/components/ui/Button';
import { StaffError, staffAccessError } from '../api/staff.api';
import {
  getOwnStaffProfile,
  updateOwnStaffName,
  staffNameError,
  type OwnStaffProfile,
} from '../api/own-staff.api';
export default function OwnStaffNameEditor({
  account,
  profile,
  onSaved,
  onClose,
  onDenied,
}: {
  account: StaffAccount;
  profile: OwnStaffProfile;
  onSaved: (value: OwnStaffProfile, message: string) => void;
  onClose: (check: boolean) => void;
  onDenied: (message: string) => void;
}) {
  const [name, setName] = useState(profile.full_name);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const [discard, setDiscard] = useState(false);
  const [review, setReview] = useState<OwnStaffProfile>();
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const finished = useRef(false);
  const dirty = name !== profile.full_name;
  const blocker = useBlocker(
    () => !finished.current && (dirty || busy.current || uncertain),
  );
  useEffect(() => {
    input.current?.focus();
    return () => controller.current?.abort();
  }, []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    if (dirty || pending || uncertain)
      window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, pending, uncertain]);
  function cancel() {
    if (busy.current) return;
    if (dirty || uncertain) setDiscard(true);
    else onClose(false);
  }
  function leave() {
    if (busy.current) return;
    finished.current = true;
    if (blocker.state === 'blocked') blocker.proceed();
    else onClose(uncertain || Boolean(review));
  }
  async function run(check: boolean) {
    if (busy.current || (!check && (uncertain || review))) return;
    if (!check) {
      const invalid = staffNameError(name);
      if (invalid) {
        setError(invalid);
        input.current?.focus();
        return;
      }
    }
    busy.current = true;
    setPending(true);
    setError('');
    const request = new AbortController();
    controller.current = request;
    try {
      const saved = check
        ? await getOwnStaffProfile(account, request.signal)
        : await updateOwnStaffName(account, name, request.signal);
      if (request.signal.aborted) return;
      if (check && saved.full_name !== name.trim()) {
        setReview(saved);
        setUncertain(false);
        setError(
          'Your current saved name differs from this draft. Review it before making another change.',
        );
      } else {
        finished.current = true;
        onSaved(
          saved,
          check
            ? 'Your current saved name matches this change.'
            : 'Your full name was updated.',
        );
      }
    } catch (e) {
      if (request.signal.aborted) return;
      if (
        staffAccessError(e) ||
        (e instanceof StaffError && e.kind === 'conflict')
      ) {
        onDenied(
          e instanceof Error
            ? e.message
            : 'Staff access could not be verified.',
        );
        return;
      }
      if (check)
        setError(
          'Your current profile could not be checked. Please try checking again.',
        );
      else if (!(e instanceof StaffError) || e.kind === 'unavailable') {
        setUncertain(true);
        setError(
          'This update may have completed. Check your current profile before saving another change.',
        );
      } else setError(e.message);
    } finally {
      if (!request.signal.aborted) {
        busy.current = false;
        setPending(false);
      }
    }
  }
  return (
    <form
      className="own-staff-form"
      noValidate
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault();
        void run(false);
      }}
    >
      <div className="own-staff-card-heading">
        <div>
          <p className="eyebrow">Personal details</p>
          <h2>Edit your name</h2>
        </div>
      </div>
      <label htmlFor="own-staff-name">Full name</label>
      <input
        ref={input}
        id="own-staff-name"
        className="ui-input"
        value={name}
        required
        autoComplete="name"
        disabled={pending || uncertain || Boolean(review)}
        aria-invalid={Boolean(error)}
        aria-describedby="own-staff-name-help"
        onChange={(event) => {
          setName(event.target.value);
          setError('');
        }}
      />
      <p id="own-staff-name-help" className="own-staff-caption">
        Use your full name, up to 200 characters. Your role, email and
        designation are managed separately.
      </p>
      {error && (
        <p role="alert" className="own-staff-error">
          {error}
        </p>
      )}
      {uncertain && (
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => void run(true)}
        >
          Check current profile
        </Button>
      )}
      {review && (
        <div className="own-staff-notice">
          <p>
            Current saved name:{' '}
            <strong>{review.full_name || 'Not provided'}</strong>
          </p>
          <div className="own-staff-actions">
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => {
                finished.current = true;
                onSaved(review, 'Your current profile was reloaded.');
              }}
            >
              Use saved profile
            </Button>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => {
                setReview(undefined);
                setError('');
              }}
            >
              Continue with my draft
            </Button>
          </div>
        </div>
      )}
      <div className="own-staff-actions">
        <Button variant="secondary" disabled={pending} onClick={cancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={
            pending ||
            uncertain ||
            Boolean(review) ||
            name.trim() === profile.full_name
          }
        >
          {pending ? 'Saving…' : 'Save name'}
        </Button>
      </div>
      {(discard || blocker.state === 'blocked') && (
        <div
          className="own-staff-notice"
          role="region"
          aria-label="Unsaved profile changes"
        >
          <p>
            {pending
              ? 'Wait for the current request to finish.'
              : 'Leave without saving this draft? If an update was unconfirmed, check the current profile before making another change.'}
          </p>
          <div className="own-staff-actions">
            <Button
              variant="secondary"
              onClick={() => {
                setDiscard(false);
                if (blocker.state === 'blocked') blocker.reset();
              }}
            >
              Keep editing
            </Button>
            <Button variant="danger" disabled={pending} onClick={leave}>
              Discard changes
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
