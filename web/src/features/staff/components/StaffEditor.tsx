import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import Button from '../../../shared/components/ui/Button';
import Input from '../../../shared/components/ui/Input';
import {
  getStaff,
  saveStaff,
  normalizeStaff,
  validateStaff,
  staffAccessError,
  StaffError,
  type StaffDetails,
  type StaffProfile,
} from '../api/staff.api';

interface Props {
  profile: StaffProfile;
  uid: string;
  onClose: () => void;
  onSaved: (profile: StaffProfile) => void;
  onDenied: (message: string) => void;
  onRefresh: () => void;
}
export default function StaffEditor({
  profile,
  uid,
  onClose,
  onSaved,
  onDenied,
  onRefresh,
}: Props) {
  const [draft, setDraft] = useState<StaffDetails>({
    full_name: profile.full_name,
    designation: profile.designation,
  });
  const [errors, setErrors] = useState<
    Partial<Record<keyof StaffDetails, string>>
  >({});
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [review, setReview] = useState<StaffProfile>();
  const [closing, setClosing] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  const request = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const finished = useRef(false);
  const dirty =
    draft.full_name !== profile.full_name ||
    draft.designation !== profile.designation;
  const blocker = useBlocker(
    () => !finished.current && (dirty || busy.current || uncertain),
  );
  const discarding = closing || blocker.state === 'blocked';
  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement;
    element.showModal();
    form.current?.querySelector<HTMLInputElement>('input')?.focus();
    return () => {
      request.current?.abort();
      element.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
      else document.getElementById('staff-title')?.focus();
    };
  }, []);
  useEffect(() => {
    if (discarding) keep.current?.focus();
    else form.current?.querySelector<HTMLInputElement>('input')?.focus();
  }, [discarding]);
  useEffect(() => {
    if (!dirty && !pending && !uncertain) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, pending, uncertain]);
  function close() {
    if (busy.current) return;
    if (dirty || uncertain) setClosing(true);
    else onClose();
  }
  function keepEditing() {
    if (busy.current) return;
    setClosing(false);
    if (blocker.state === 'blocked') blocker.reset();
  }
  function discard() {
    if (busy.current) return;
    finished.current = true;
    if (blocker.state === 'blocked') blocker.proceed();
    else if (uncertain || unavailable) onRefresh();
    else onClose();
  }
  async function run(check: boolean) {
    if (busy.current || unavailable || (!check && uncertain)) return;
    if (!check) {
      const validation = validateStaff(draft);
      setErrors(validation);
      if (Object.keys(validation).length) {
        form.current
          ?.querySelector<HTMLInputElement>(
            `#staff-${Object.keys(validation)[0]}`,
          )
          ?.focus();
        return;
      }
    }
    busy.current = true;
    setPending(true);
    setError('');
    const controller = new AbortController();
    request.current = controller;
    try {
      const saved = check
        ? await getStaff(profile.user_id, uid, controller.signal)
        : await saveStaff(profile, draft, uid, controller.signal);
      if (controller.signal.aborted) return;
      const normalized = normalizeStaff(draft);
      if (
        check &&
        (saved.full_name !== normalized.full_name ||
          saved.designation !== normalized.designation)
      ) {
        setReview(saved);
        setUncertain(false);
        if (saved.role === 'student') {
          setUnavailable(true);
          setError(
            'This account no longer has a staff role. Close and refresh the profile.',
          );
        }
      } else {
        finished.current = true;
        if (blocker.state === 'blocked') blocker.proceed();
        else onSaved(saved);
      }
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (staffAccessError(failure)) {
        onDenied((failure as StaffError).message);
        return;
      }
      if (
        failure instanceof StaffError &&
        (failure.kind === 'missing' || failure.kind === 'conflict')
      ) {
        setUnavailable(true);
        setError(failure.message);
      } else if (check) {
        setError(
          'The current profile could not be checked. Your draft is preserved. Try checking again.',
        );
      } else if (
        !(failure instanceof StaffError) ||
        failure.kind === 'unavailable'
      ) {
        setUncertain(true);
        setError(
          'The save result could not be confirmed. Your changes may already be saved. Check the current profile before saving again.',
        );
      } else setError(failure.message);
    } finally {
      busy.current = false;
      if (!controller.signal.aborted) setPending(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="staff-editor"
      aria-labelledby="staff-editor-title"
      aria-describedby="staff-editor-description"
      onCancel={(event) => {
        event.preventDefault();
        if (discarding) keepEditing();
        else close();
      }}
    >
      {discarding ? (
        <>
          <h2 id="staff-editor-title">Discard unsaved changes?</h2>
          <p id="staff-editor-description">
            {pending
              ? 'A profile request is still processing. Wait for its result before leaving.'
              : uncertain
                ? 'The last save may already have been applied. Leaving discards your local draft; it does not undo a saved change.'
                : 'Your changes have not been saved.'}
          </p>
          <div className="staff-actions">
            <Button
              ref={keep}
              variant="secondary"
              disabled={pending}
              onClick={keepEditing}
            >
              Keep editing
            </Button>
            <Button variant="danger" disabled={pending} onClick={discard}>
              Discard changes
            </Button>
          </div>
        </>
      ) : (
        <form
          ref={form}
          noValidate
          aria-busy={pending}
          onSubmit={(event) => {
            event.preventDefault();
            void run(false);
          }}
        >
          <h2 id="staff-editor-title">Edit staff profile</h2>
          <p id="staff-editor-description">
            Update full name and designation for {profile.email}. Email, role
            and account access are managed separately.
          </p>
          {(['full_name', 'designation'] as const).map((key) => (
            <div className="staff-field" key={key}>
              <label htmlFor={`staff-${key}`}>
                {key === 'full_name' ? 'Full name' : 'Designation'}
              </label>
              <Input
                id={`staff-${key}`}
                name={key}
                value={draft[key]}
                required
                disabled={pending || uncertain || unavailable}
                aria-invalid={Boolean(errors[key])}
                aria-describedby={
                  errors[key] ? `staff-${key}-error` : undefined
                }
                onChange={(event) => {
                  setDraft((value) => ({
                    ...value,
                    [key]: event.target.value,
                  }));
                  setErrors({});
                  setError('');
                }}
              />
              {errors[key] && (
                <p id={`staff-${key}-error`} role="alert">
                  {errors[key]}
                </p>
              )}
            </div>
          ))}
          <p>
            Full name: up to 200 characters. Designation: up to 120 characters.
            Both are required.
          </p>
          {review && (
            <div className="staff-review" role="status">
              <p>
                Current saved profile: <strong>{review.full_name}</strong> —{' '}
                {review.designation}.
              </p>
              <p>
                Your draft is preserved. Review it before saving again. Another
                staff member may also be editing this profile.
              </p>
            </div>
          )}
          {error && <p role="alert">{error}</p>}
          {pending && (
            <p role="status">
              {uncertain ? 'Checking current profile…' : 'Saving profile…'}
            </p>
          )}
          <div className="staff-actions">
            <Button variant="secondary" disabled={pending} onClick={close}>
              Cancel
            </Button>
            {unavailable ? (
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  finished.current = true;
                  onRefresh();
                }}
              >
                Close and refresh profile
              </Button>
            ) : uncertain ? (
              <Button disabled={pending} onClick={() => void run(true)}>
                Check current profile
              </Button>
            ) : (
              <Button type="submit" disabled={pending || !dirty}>
                Save changes
              </Button>
            )}
          </div>
        </form>
      )}
    </dialog>
  );
}
