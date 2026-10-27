import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../../shared/components/ui/Button';
import { routePaths } from '../../../app/router/routePaths';
import useAuth from '../../auth/hooks/useAuth';
import { archiveStudent, getStudent, studentError } from '../api/students.api';
import type { StudentRequestError } from '../api/students.api';
import type { Student } from '../student.types';

export default function StudentArchiveAction({
  student,
  search,
  onEndStay,
}: {
  student: Student;
  search: string;
  onEndStay?: () => void;
}) {
  const { account, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<
    'confirm' | 'uncertain' | 'missing' | 'blocked'
  >('confirm');
  const [pending, setPending] = useState<'archive' | 'check' | null>(null);
  const [error, setError] = useState<StudentRequestError>();
  const [checked, setChecked] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const active = useRef(false);
  const operation = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const directory = `${routePaths.students}${search ? `?${search}` : ''}`;
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current!;
    const trigger = triggerRef.current;
    dialog.showModal();
    cancelRef.current?.focus();
    return () => {
      dialog.close();
      trigger?.focus();
    };
  }, [open]);
  function close() {
    if (!operation.current) setOpen(false);
  }
  async function perform(check: boolean) {
    if (operation.current || (!check && phase !== 'confirm')) return;
    operation.current = true;
    setPending(check ? 'check' : 'archive');
    setError(undefined);
    setChecked(false);
    controller.current = new AbortController();
    try {
      if (check) {
        await getStudent(
          student.student_id,
          account!.firebase_uid,
          controller.current.signal,
        );
        if (active.current) {
          setPhase('confirm');
          setChecked(true);
        }
      } else {
        await archiveStudent(
          student.student_id,
          account!.firebase_uid,
          controller.current.signal,
        );
        if (active.current)
          navigate(directory, {
            replace: true,
            state: { studentNotice: 'Student profile archived.' },
          });
      }
    } catch (reason) {
      if (active.current) {
        const failure = studentError(reason);
        setError(failure);
        setPhase(
          failure.kind === 'not-found'
            ? 'missing'
            : failure.kind === 'session' ||
                failure.kind === 'forbidden' ||
                failure.kind === 'invalid'
              ? 'blocked'
              : 'uncertain',
        );
      }
    } finally {
      operation.current = false;
      if (active.current) setPending(null);
    }
  }
  return (
    <>
      <Button
        ref={triggerRef}
        variant="secondary"
        className="student-archive-trigger"
        onClick={() => setOpen(true)}
      >
        Archive student profile
      </Button>
      {open && (
        <dialog
          ref={dialogRef}
          className="student-discard student-archive-dialog"
          role="alertdialog"
          aria-labelledby="archive-title"
          aria-describedby="archive-description"
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
        >
          <h2 id="archive-title">Archive student profile?</h2>
          <p>
            <strong>{student.full_name}</strong> ·{' '}
            <span className="student-id">{student.index_no}</span>
          </p>
          <div id="archive-description">
            <div className="lifecycle-guidance">
              <strong>For a permanent departure, use End hostel stay</strong>
              <p>
                It releases the bed and archives the profile together, with an
                explicit choice about account access. Archive alone only hides
                the profile.
              </p>
              {onEndStay ? (
                <Button
                  variant="primary"
                  disabled={Boolean(pending) || phase !== 'confirm'}
                  onClick={() => {
                    setOpen(false);
                    onEndStay();
                  }}
                >
                  Use End hostel stay
                </Button>
              ) : (
                <p>
                  Ask an Admin to complete End hostel stay for a permanent
                  departure.
                </p>
              )}
            </div>
            <p>
              This removes the profile from current student listings and
              preserves historical records.
            </p>
            <p>
              The login account will not be deactivated. An allocated bed will
              not be released automatically; manage it separately through the
              allocation workflow.
            </p>
            <p>
              The profile photo will be removed and will not return
              automatically if the profile is restored.
            </p>
            <p>
              An Admin can restore this profile from the Archived students view.
            </p>
          </div>
          {error && (
            <p role="alert">
              {phase === 'uncertain'
                ? 'The service could not confirm the outcome. The profile may already be archived. Check the profile before considering another request.'
                : phase === 'missing'
                  ? 'This profile is no longer available. It may already be archived or removed from your access. No new archival success has been confirmed.'
                  : error.message}
            </p>
          )}
          {checked && (
            <p role="status">
              The profile still exists. Review the details before confirming
              another archive request.
            </p>
          )}
          {pending && (
            <p role="status">
              {pending === 'archive'
                ? 'Archiving student profile…'
                : 'Checking student profile…'}
            </p>
          )}
          <div className="student-form-actions">
            <Button
              ref={cancelRef}
              variant="secondary"
              disabled={Boolean(pending)}
              onClick={close}
            >
              Cancel
            </Button>
            {phase === 'confirm' && (
              <Button
                variant="danger"
                disabled={Boolean(pending)}
                onClick={() => void perform(false)}
              >
                Archive profile
              </Button>
            )}
            {phase === 'uncertain' && (
              <Button
                disabled={Boolean(pending)}
                onClick={() => void perform(true)}
              >
                Check profile
              </Button>
            )}
            {phase === 'missing' && (
              <Button onClick={() => navigate(directory, { replace: true })}>
                Return to students
              </Button>
            )}
            {error?.kind === 'session' && (
              <Button onClick={() => void signOut()}>Sign in again</Button>
            )}
          </div>
        </dialog>
      )}
    </>
  );
}
