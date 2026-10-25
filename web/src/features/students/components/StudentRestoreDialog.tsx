import { useEffect, useRef, useState } from 'react';
import Button from '../../../shared/components/ui/Button';
import useAuth from '../../auth/hooks/useAuth';
import {
  restoreStudent,
  studentError,
  type StudentRequestError,
} from '../api/students.api';
import type { Student } from '../student.types';
export default function StudentRestoreDialog({
  student,
  uid,
  close,
  restored,
}: {
  student: Student;
  uid: string;
  close: () => void;
  restored: (alreadyCurrent: boolean) => void;
}) {
  const { signOut } = useAuth();
  const dialog = useRef<HTMLDialogElement>(null);
  const active = useRef(false);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<StudentRequestError>();
  useEffect(() => {
    active.current = true;
    const element = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    element.showModal();
    element.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      active.current = false;
      controller.current?.abort();
      element.close();
      if (previous?.isConnected) previous.focus();
      else
        document
          .querySelector<HTMLButtonElement>(
            '.student-directory-tabs [aria-pressed="true"]',
          )
          ?.focus();
    };
  }, []);
  async function confirm() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(undefined);
    controller.current = new AbortController();
    try {
      const result = await restoreStudent(
        student.student_id,
        uid,
        controller.current.signal,
      );
      if (!active.current) return;
      if (active.current) restored(!result.restored);
    } catch (reason) {
      if (active.current) setError(studentError(reason));
    } finally {
      busy.current = false;
      if (active.current) setPending(false);
    }
  }
  const blocked = error && error.kind !== 'unavailable';
  return (
    <dialog
      ref={dialog}
      className="student-discard student-restore-dialog"
      aria-labelledby="restore-student-title"
      aria-describedby="restore-student-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy.current) close();
      }}
    >
      <p className="eyebrow">Student recovery</p>
      <h2 id="restore-student-title">Restore student profile?</h2>
      <p>
        <strong>{student.full_name}</strong> · {student.index_no}
      </p>
      <div id="restore-student-description">
        <p>
          The original profile, guardians and history will be available in the
          current student directory again.
        </p>
        <p>
          This does not reactivate the login account, recover a removed photo,
          change recorded presence or assign a bed.
        </p>
      </div>
      {error && (
        <p role="alert" className="auth-error">
          {error.kind === 'unavailable'
            ? 'Restoration could not be confirmed. Retry safely to check the same profile; it will not create another restoration if already restored.'
            : error.kind === 'account'
              ? 'This profile needs an active account with the student role. Update its account eligibility before restoring.'
              : error.message}
        </p>
      )}
      {pending && <p role="status">Restoring student profile…</p>}
      <div className="student-form-actions">
        <Button variant="secondary" disabled={pending} onClick={close}>
          Cancel
        </Button>
        <Button
          disabled={pending || Boolean(blocked)}
          onClick={() => void confirm()}
        >
          {pending
            ? 'Restoring…'
            : error?.kind === 'unavailable'
              ? 'Retry restoration'
              : 'Restore profile'}
        </Button>
        {error?.kind === 'session' && (
          <Button onClick={() => void signOut()}>Sign in again</Button>
        )}
      </div>
    </dialog>
  );
}
