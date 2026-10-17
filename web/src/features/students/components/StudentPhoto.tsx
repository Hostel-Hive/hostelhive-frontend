import { useEffect, useRef, useState } from 'react';
import Button from '../../../shared/components/ui/Button';
import useAuth from '../../auth/hooks/useAuth';
import { getStudent, studentError } from '../api/students.api';
import {
  getStudentImage,
  uploadStudentImage,
  removeStudentImage,
} from '../api/student-images.api';
import { validateStudentImage } from '../student-image';
import type { Student } from '../student.types';

function Photo({ blob, alt }: { blob: Blob; alt: string }) {
  const ref = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const image = ref.current!;
    const url = URL.createObjectURL(blob);
    image.src = url;
    return () => {
      image.removeAttribute('src');
      URL.revokeObjectURL(url);
    };
  }, [blob]);
  return (
    <>
      <img
        ref={ref}
        alt={alt}
        className="student-photo-image"
        hidden={failed}
        onLoad={() => setFailed(false)}
        onError={() => setFailed(true)}
      />
      {failed && (
        <p role="alert">
          This photo could not be displayed. Check photo status to reload it.
        </p>
      )}
    </>
  );
}

function RemoveConfirmation({
  name,
  pending,
  close,
  remove,
}: {
  name: string;
  pending: boolean;
  close: () => void;
  remove: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const trigger = document.activeElement as HTMLElement | null;
    dialog.showModal();
    dialog.querySelector('button')?.focus();
    return () => {
      dialog.close();
      trigger?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="student-discard"
      aria-labelledby="remove-photo-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) close();
      }}
    >
      <h2 id="remove-photo-title">Remove profile photo?</h2>
      <p>
        Remove the saved photo for {name}? Student and guardian details will be
        kept.
      </p>
      <div className="student-form-actions">
        <Button variant="secondary" disabled={pending} onClick={close}>
          Cancel
        </Button>
        <Button variant="danger" disabled={pending} onClick={remove}>
          {pending ? 'Removing photo…' : 'Confirm removal'}
        </Button>
      </div>
    </dialog>
  );
}

export default function StudentPhoto({
  student,
  uid,
}: {
  student: Student;
  uid: string;
}) {
  const { signOut } = useAuth();
  const [saved, setSaved] = useState<Blob | null>(null);
  const [exists, setExists] = useState(Boolean(student.profile_image_url));
  const [selected, setSelected] = useState<File | null>(null);
  const [pending, setPending] = useState<string | null>(
    student.profile_image_url ? 'Loading photo…' : null,
  );
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const mounted = useRef(false);
  const busy = useRef(false);
  const selection = useRef(0);
  const controller = useRef<AbortController | null>(null);

  function failure(reason: unknown, mutation = false) {
    const problem = studentError(reason);
    if (problem.kind === 'session' || problem.kind === 'forbidden') {
      setBlocked(true);
      setSessionExpired(problem.kind === 'session');
      setSaved(null);
      setSelected(null);
      setError(
        problem.kind === 'session'
          ? problem.message
          : 'You no longer have permission to manage this photo.',
      );
    } else if (problem.kind === 'not-found') {
      setBlocked(true);
      setSaved(null);
      setSelected(null);
      setError('Student profile not found. Return to the directory.');
    } else if (problem.kind === 'invalid') {
      setError(
        'The photo was rejected. Choose a valid JPEG or PNG within the displayed limits.',
      );
    } else {
      if (mutation) setUncertain(true);
      setError(
        mutation
          ? 'The change could not be confirmed. Check photo status before trying again.'
          : 'Photo service is unavailable. Check photo status to try again. Student details remain available.',
      );
    }
  }

  useEffect(() => {
    mounted.current = true;
    const initial = new AbortController();
    controller.current = initial;
    if (student.profile_image_url) {
      getStudentImage(student.student_id, uid, initial.signal)
        .then((blob) => {
          if (!initial.signal.aborted) {
            setSaved(blob);
            setExists(Boolean(blob));
          }
        })
        .catch((reason: unknown) => {
          if (!initial.signal.aborted) failure(reason);
        })
        .finally(() => {
          if (!initial.signal.aborted) setPending(null);
        });
    }
    return () => {
      mounted.current = false;
      initial.abort();
      controller.current?.abort();
    };
    // The parent keys this component by staff UID and student ID. New profile
    // snapshots are loaded explicitly so they cannot overwrite an in-flight edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function choose(file?: File) {
    const current = ++selection.current;
    setSelected(null);
    setMessage('');
    setError('');
    if (!file) return;
    busy.current = true;
    setPending('Checking photo…');
    try {
      await validateStudentImage(file);
      if (mounted.current && current === selection.current) setSelected(file);
    } catch (reason) {
      if (mounted.current && current === selection.current)
        setError(
          reason instanceof Error
            ? reason.message
            : 'Unable to read this photo.',
        );
    } finally {
      if (mounted.current && current === selection.current) {
        busy.current = false;
        setPending(null);
      }
    }
  }

  async function perform(action: 'check' | 'upload' | 'remove') {
    if (
      busy.current ||
      pending ||
      blocked ||
      (action !== 'check' && uncertain) ||
      (action === 'upload' && !selected)
    )
      return;
    busy.current = true;
    const abort = new AbortController();
    controller.current = abort;
    setPending(
      action === 'check'
        ? 'Checking photo status…'
        : action === 'upload'
          ? 'Saving photo…'
          : 'Removing photo…',
    );
    setError('');
    setMessage('');
    let acknowledged = false;
    try {
      if (action === 'check') {
        const profile = await getStudent(student.student_id, uid, abort.signal);
        const blob = profile.profile_image_url
          ? await getStudentImage(student.student_id, uid, abort.signal)
          : null;
        if (!mounted.current) return;
        setSaved(blob);
        setExists(Boolean(blob));
        setSelected(null);
        setUncertain(false);
        setMessage('Photo status checked.');
      } else if (action === 'remove') {
        await removeStudentImage(student.student_id, uid, abort.signal);
        if (!mounted.current) return;
        setSaved(null);
        setExists(false);
        setSelected(null);
        setMessage('Profile photo removed.');
      } else {
        await uploadStudentImage(
          student.student_id,
          selected!,
          uid,
          abort.signal,
        );
        if (!mounted.current) return;
        acknowledged = true;
        setExists(true);
        setSelected(null);
        setSaved(null);
        setMessage('Profile photo saved.');
        const blob = await getStudentImage(
          student.student_id,
          uid,
          abort.signal,
        );
        if (!mounted.current) return;
        setSaved(blob);
        if (!blob)
          setError(
            'Photo saved, but it is no longer available. Check photo status.',
          );
      }
    } catch (reason) {
      if (mounted.current) failure(reason, action !== 'check' && !acknowledged);
    } finally {
      busy.current = false;
      if (mounted.current) {
        setPending(null);
        setConfirm(false);
      }
    }
  }

  return (
    <section
      className="student-card student-photo"
      aria-labelledby="student-photo-title"
      aria-busy={Boolean(pending)}
    >
      <h2 id="student-photo-title">Profile photo</h2>
      <p id="student-photo-help" className="student-form-help">
        JPEG or PNG, up to 5 MiB. Maximum 4096 pixels per side and 12 million
        pixels. Photos are visible to authorized staff.
      </p>
      {!blocked && (
        <div className="student-photo-content">
          {selected ? (
            <Photo
              key="preview"
              blob={selected}
              alt={`Selected photo preview for ${student.full_name}`}
            />
          ) : saved ? (
            <Photo
              key={saved.size + ':' + saved.type + ':' + message}
              blob={saved}
              alt={`Profile photo of ${student.full_name}`}
            />
          ) : (
            <div className="student-photo-placeholder">
              {exists ? 'Photo preview unavailable' : 'No profile photo'}
            </div>
          )}
          <div className="student-photo-controls">
            <label htmlFor="student-photo-file">
              {exists ? 'Choose replacement photo' : 'Choose profile photo'}
            </label>
            <input
              id="student-photo-file"
              type="file"
              accept="image/jpeg,image/png"
              aria-describedby="student-photo-help"
              disabled={Boolean(pending) || uncertain}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                void choose(file);
              }}
            />
            <div className="student-form-actions">
              {selected && (
                <>
                  <Button
                    size="sm"
                    disabled={Boolean(pending) || uncertain}
                    onClick={() => void perform('upload')}
                  >
                    {exists ? 'Replace photo' : 'Upload photo'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={Boolean(pending)}
                    onClick={() => {
                      setSelected(null);
                      setError('');
                    }}
                  >
                    Discard selection
                  </Button>
                </>
              )}
              {exists && (
                <Button
                  size="sm"
                  variant="danger"
                  disabled={Boolean(pending) || uncertain}
                  onClick={() => setConfirm(true)}
                >
                  Remove photo
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                disabled={Boolean(pending)}
                onClick={() => void perform('check')}
              >
                Check photo status
              </Button>
            </div>
          </div>
        </div>
      )}
      {pending && <p role="status">{pending}</p>}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      {uncertain && !blocked && (
        <p>
          The displayed photo may be out of date. A status check will discard
          the local selection and load the saved photo.
        </p>
      )}
      {sessionExpired && (
        <Button variant="secondary" onClick={() => void signOut()}>
          Sign in again
        </Button>
      )}
      {confirm && (
        <RemoveConfirmation
          name={student.full_name}
          pending={Boolean(pending)}
          close={() => setConfirm(false)}
          remove={() => void perform('remove')}
        />
      )}
    </section>
  );
}
