import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import Button from '../../../shared/components/ui/Button';
import {
  decideLeave,
  decisionNoteError,
  getLeave,
  leaveError,
  type LeaveError,
} from '../api/leave.api';
import type { LeaveDecision, LeaveRequest } from '../leave.types';
import LeaveDate from './LeaveDate';

interface Props {
  row: LeaveRequest;
  status: LeaveDecision;
  uid: string;
  onClose: () => void;
  onSaved: () => void;
  onChecked: (row: LeaveRequest) => void;
  onDenied: (error: LeaveError) => void;
}
export default function LeaveDecisionDialog({
  row,
  status,
  uid,
  onClose,
  onSaved,
  onChecked,
  onDenied,
}: Props) {
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [needsCheck, setNeedsCheck] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);
  const finished = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const blocker = useBlocker(
    () => !finished.current && (busy.current || Boolean(note) || needsCheck),
  );
  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current!;
    element.showModal();
    cancel.current?.focus();
    return () => {
      controller.current?.abort();
      element.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    if (pending || note || needsCheck)
      window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [pending, note, needsCheck]);
  async function run(check: boolean) {
    if (busy.current || (!check && (needsCheck || !confirm))) return;
    busy.current = true;
    setPending(true);
    setError('');
    const request = new AbortController();
    controller.current = request;
    try {
      if (check) {
        const fresh = await getLeave(row.leave_id, uid, request.signal);
        if (request.signal.aborted) return;
        setNeedsCheck(false);
        setConfirm(false);
        onChecked(fresh);
        if (fresh.status === 'pending')
          setError(
            'Current status checked: still pending. Review your decision again before submitting.',
          );
      } else {
        await decideLeave(row, status, note, uid, request.signal);
        if (!request.signal.aborted) {
          finished.current = true;
          onSaved();
        }
      }
    } catch (failure) {
      if (request.signal.aborted) return;
      const mapped = leaveError(failure);
      if (['session', 'forbidden', 'not-found'].includes(mapped.kind)) {
        onDenied(mapped);
        return;
      }
      if (
        check ||
        ['unavailable', 'conflict', 'ineligible'].includes(mapped.kind)
      ) {
        setNeedsCheck(true);
        setConfirm(false);
        setError(
          mapped.kind === 'unavailable' && !check
            ? 'The decision may have been saved. Check the current request status before deciding again.'
            : mapped.message,
        );
      } else {
        setError(mapped.message);
        setConfirm(false);
      }
    } finally {
      busy.current = false;
      if (!request.signal.aborted) setPending(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="leave-dialog"
      aria-labelledby="leave-decision-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy.current) onClose();
      }}
    >
      <form
        aria-busy={pending}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void run(false);
        }}
      >
        <h2 id="leave-decision-title">
          {status === 'approved' ? 'Approve' : 'Reject'} leave request
        </h2>
        <p>
          Student ID: <span className="leave-id">{row.student_id}</span>
        </p>
        <p>
          <LeaveDate value={row.starts_at} /> —{' '}
          <LeaveDate value={row.ends_at} />
        </p>
        <label htmlFor="leave-decision-note">
          Decision note {status === 'rejected' ? '(required)' : '(optional)'}
        </label>
        <textarea
          id="leave-decision-note"
          className="ui-input"
          rows={4}
          value={note}
          disabled={pending || confirm}
          aria-invalid={Boolean(error)}
          aria-describedby="leave-note-help leave-decision-error"
          onChange={(event) => {
            setNote(event.target.value);
            setError('');
          }}
        />
        <p id="leave-note-help">
          {Array.from(note.trim()).length}/1000 characters. Surrounding spaces
          are removed.
        </p>
        <p id="leave-decision-error" role={error ? 'alert' : undefined}>
          {error}
        </p>
        <p>
          Decisions are final. Attendance and presence remain based on
          entry/exit scans.
        </p>
        {pending && (
          <p role="status">
            {needsCheck ? 'Checking current request…' : 'Saving decision…'}
          </p>
        )}
        {needsCheck && (
          <Button
            disabled={pending}
            onClick={() => {
              void run(true);
            }}
          >
            Check current status
          </Button>
        )}
        {confirm && (
          <div
            className="leave-confirm"
            role="region"
            aria-label="Decision confirmation"
          >
            <h3>Confirm {status === 'approved' ? 'approval' : 'rejection'}</h3>
            <p className="leave-prose">{note.trim() || 'No decision note.'}</p>
            <p>
              This will record your decision for this student’s leave request.
            </p>
          </div>
        )}
        <div className="leave-actions">
          <Button
            ref={cancel}
            variant="secondary"
            disabled={pending}
            onClick={onClose}
          >
            Cancel
          </Button>
          {confirm ? (
            <>
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => setConfirm(false)}
              >
                Edit note
              </Button>
              <Button
                type="submit"
                variant={status === 'rejected' ? 'danger' : 'primary'}
                disabled={pending || needsCheck}
              >
                Confirm {status === 'approved' ? 'approval' : 'rejection'}
              </Button>
            </>
          ) : (
            <Button
              disabled={pending || needsCheck}
              onClick={() => {
                const message = decisionNoteError(status, note);
                setError(message ?? '');
                if (!message) setConfirm(true);
              }}
            >
              Review decision
            </Button>
          )}
        </div>
        {blocker.state === 'blocked' && (
          <div className="leave-confirm" role="alert">
            <p>
              {pending
                ? 'Wait for the current operation before leaving.'
                : 'Discard this decision draft and leave?'}
            </p>
            <Button onClick={() => blocker.reset()}>Stay here</Button>
            {!pending && (
              <Button variant="danger" onClick={() => blocker.proceed()}>
                Discard and leave
              </Button>
            )}
          </div>
        )}
      </form>
    </dialog>
  );
}
