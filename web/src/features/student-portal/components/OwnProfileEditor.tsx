import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import Button from '../../../shared/components/ui/Button';
import type { OwnStudentProfile } from '../student-portal.types';
import {
  getOwnProfile,
  isAccessError,
  portalError,
  StudentPortalError,
} from '../api/student-portal.api';
import {
  OwnProfileInputError,
  patchOwnProfile,
  type GuardianInput,
  type OwnProfilePatch,
} from '../api/own-profile-edit.api';

const phoneValid = (value: string) =>
  /^[+()0-9 -]{7,32}$/.test(value.trim()) &&
  value.replace(/[^0-9]/g, '').length >= 7;
const textValid = (value: string, max: number) =>
  value.trim().length > 0 &&
  [...value.trim()].length <= max &&
  !/\p{Cc}/u.test(value);
const normalize = (guardians: GuardianInput[]) =>
  guardians.map((guardian) => ({
    name: guardian.name.trim(),
    relationship: guardian.relationship.trim(),
    contact_phone: guardian.contact_phone.trim(),
  }));

export default function OwnProfileEditor({
  profile,
  uid,
  onClose,
  onSaved,
  onAccessError,
}: {
  profile: OwnStudentProfile;
  uid: string;
  onClose: () => void;
  onSaved: (profile: OwnStudentProfile, message: string) => void;
  onAccessError: (error: StudentPortalError) => void;
}) {
  const [phone, setPhone] = useState(profile.contact_phone);
  const [guardians, setGuardians] = useState(() =>
    normalize(profile.guardians).map((guardian, key) => ({ ...guardian, key })),
  );
  const nextKey = useRef(guardians.length);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const alert = useRef<HTMLParagraphElement>(null);
  const work = useRef<AbortController | null>(null);
  const finished = useRef(false);
  const changedPhone = phone.trim() !== profile.contact_phone.trim();
  const changedGuardians =
    JSON.stringify(normalize(guardians)) !==
    JSON.stringify(normalize(profile.guardians));
  const dirty = changedPhone || changedGuardians;
  const blocker = useBlocker(
    () => !finished.current && (dirty || pending || uncertain),
  );
  const locked = pending || uncertain;

  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    element.showModal();
    element.querySelector<HTMLInputElement>('input')?.focus();
    return () => {
      work.current?.abort();
      element.close();
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    if (!dirty && !pending && !uncertain) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, pending, uncertain]);
  useEffect(() => {
    if (error) alert.current?.focus();
  }, [error]);
  function close() {
    if (pending) return;
    if (dirty || uncertain) setDiscard(true);
    else onClose();
  }
  function report(reason: unknown) {
    const failure = portalError(reason);
    if (isAccessError(failure) || failure.kind === 'not-found')
      onAccessError(failure);
    else {
      setUncertain(true);
      setError(failure.message);
    }
  }
  async function save() {
    if (work.current || locked || !dirty) return;
    if (changedPhone && !phoneValid(phone)) {
      setError(
        'Enter a contact phone with at least 7 digits and at most 32 permitted characters.',
      );
      return;
    }
    if (
      changedGuardians &&
      (guardians.length < 1 ||
        guardians.length > 10 ||
        guardians.some(
          (guardian) =>
            !textValid(guardian.name, 200) ||
            !textValid(guardian.relationship, 80) ||
            !phoneValid(guardian.contact_phone),
        ))
    ) {
      setError(
        'Provide 1–10 guardians with a name (up to 200 characters), relationship (up to 80 characters), and valid phone number.',
      );
      return;
    }
    const patch: OwnProfilePatch = {
      ...(changedPhone ? { contact_phone: phone.trim() } : {}),
      ...(changedGuardians ? { guardians: normalize(guardians) } : {}),
    };
    const controller = new AbortController();
    work.current = controller;
    setPending(true);
    setError('');
    try {
      const saved = await patchOwnProfile(
        patch,
        profile.student_id,
        uid,
        controller.signal,
      );
      if (!controller.signal.aborted) {
        finished.current = true;
        onSaved(saved, 'Profile contact and guardian details updated.');
      }
    } catch (reason) {
      if (!controller.signal.aborted) {
        if (reason instanceof OwnProfileInputError) setError(reason.message);
        else report(reason);
      }
    } finally {
      if (!controller.signal.aborted) {
        work.current = null;
        setPending(false);
      }
    }
  }
  async function checkCurrent() {
    if (work.current) return;
    const controller = new AbortController();
    work.current = controller;
    setPending(true);
    setError('');
    try {
      const current = await getOwnProfile(uid, controller.signal);
      if (!controller.signal.aborted) {
        if (current.student_id !== profile.student_id) {
          onAccessError(
            new StudentPortalError(
              'not-found',
              'Your student profile changed. Reload your profile.',
            ),
          );
          return;
        }
        finished.current = true;
        onSaved(
          current,
          'Current profile reloaded. Review the details before editing again.',
        );
      }
    } catch (reason) {
      if (!controller.signal.aborted) report(reason);
    } finally {
      if (!controller.signal.aborted) {
        work.current = null;
        setPending(false);
      }
    }
  }
  const leaving = discard || blocker.state === 'blocked';
  return (
    <dialog
      ref={dialog}
      className="portal-profile-editor"
      aria-labelledby="own-profile-edit-title"
      aria-describedby="own-profile-edit-help"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <p className="portal-kicker">Personal details</p>
      <h2 id="own-profile-edit-title">Edit profile</h2>
      <p id="own-profile-edit-help" className="portal-muted">
        Update your phone and guardian details. Your name, registration number,
        email, faculty and academic year are managed by hostel staff.
      </p>
      <p className="portal-profile-readonly">
        {profile.full_name} · {profile.index_no} · {profile.faculty} · Year{' '}
        {profile.year}
      </p>
      <form
        className="portal-leave-form"
        noValidate
        aria-busy={pending}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label>
          Contact phone
          <input
            type="tel"
            autoComplete="tel"
            value={phone}
            disabled={locked}
            onChange={(event) => {
              setPhone(event.target.value);
              setError('');
            }}
          />
        </label>
        <div className="portal-editor-guardians">
          <h3>Guardian details</h3>
          <p className="portal-caption">
            Keep all guardians you want to retain. Up to ten guardians are
            supported.
          </p>
          {guardians.map((guardian, index) => (
            <fieldset
              key={guardian.key}
              disabled={locked}
              className="portal-editor-guardian"
            >
              <legend>Guardian {index + 1}</legend>
              {(['name', 'relationship', 'contact_phone'] as const).map(
                (field) => (
                  <label key={field}>
                    {field === 'name'
                      ? 'Guardian name'
                      : field === 'relationship'
                        ? 'Relationship'
                        : 'Guardian phone'}
                    <input
                      type={field === 'contact_phone' ? 'tel' : 'text'}
                      value={guardian[field]}
                      onChange={(event) => {
                        const value = event.target.value;
                        setGuardians((previous) =>
                          previous.map((item) =>
                            item.key === guardian.key
                              ? { ...item, [field]: value }
                              : item,
                          ),
                        );
                        setError('');
                      }}
                    />
                  </label>
                ),
              )}
              <Button
                size="sm"
                variant="secondary"
                disabled={guardians.length <= 1}
                onClick={() =>
                  setGuardians((previous) =>
                    previous.filter((item) => item.key !== guardian.key),
                  )
                }
              >
                Remove guardian {index + 1}
              </Button>
            </fieldset>
          ))}
          <Button
            size="sm"
            variant="secondary"
            disabled={locked || guardians.length >= 10}
            onClick={() =>
              setGuardians((previous) => [
                ...previous,
                {
                  key: nextKey.current++,
                  name: '',
                  relationship: '',
                  contact_phone: '',
                },
              ])
            }
          >
            Add guardian
          </Button>
        </div>
        <p ref={alert} role={error ? 'alert' : undefined} tabIndex={-1}>
          {error}
        </p>
        {pending && (
          <p role="status">
            {uncertain ? 'Checking current profile…' : 'Saving profile…'}
          </p>
        )}
        {uncertain && (
          <div className="portal-complaint-warning">
            <p>
              The update may already have saved. Reload the current profile
              before making another change.
            </p>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => void checkCurrent()}
            >
              Check current profile
            </Button>
          </div>
        )}
        <div className="portal-actions">
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={close}
          >
            Cancel
          </Button>
          <Button size="sm" type="submit" disabled={locked || !dirty}>
            Save changes
          </Button>
        </div>
      </form>
      {leaving && (
        <div className="portal-complaint-warning" role="alert">
          <p>
            {pending
              ? 'Wait for the profile operation to finish.'
              : uncertain
                ? 'The update may already have saved. Closing loses your draft; reload the profile before editing again.'
                : 'Discard your unsaved profile changes?'}
          </p>
          <div className="portal-actions">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setDiscard(false);
                if (blocker.state === 'blocked') blocker.reset();
              }}
            >
              Keep editing
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={pending}
              onClick={() => {
                finished.current = true;
                if (blocker.state === 'blocked') blocker.proceed();
                else onClose();
              }}
            >
              Discard changes
            </Button>
          </div>
        </div>
      )}
    </dialog>
  );
}
