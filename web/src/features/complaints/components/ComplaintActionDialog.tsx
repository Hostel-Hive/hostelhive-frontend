import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import Button from '../../../shared/components/ui/Button';
import {
  actionError,
  changeComplaint,
  complaintError,
  getComplaint,
  listComplaintUpdates,
  statusLabel,
  transitions,
  type ComplaintError,
} from '../api/complaints.api';
import type {
  Complaint,
  ComplaintAction,
  ComplaintPage,
  ComplaintUpdate,
} from '../complaints.types';
interface Props {
  row: Complaint;
  noteOnly: boolean;
  uid: string;
  historyOffset: number;
  onClose: () => void;
  onSaved: () => void;
  onChecked: (row: Complaint, history: ComplaintPage<ComplaintUpdate>) => void;
  onDenied: (error: ComplaintError) => void;
}
export default function ComplaintActionDialog({
  row,
  noteOnly,
  uid,
  historyOffset,
  onClose,
  onSaved,
  onChecked,
  onDenied,
}: Props) {
  const [text, setText] = useState('');
  const [target, setTarget] = useState<'' | 'in_progress' | 'resolved'>(
    transitions(row.status)[0],
  );
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [reviewedInput, setReviewedInput] = useState<ComplaintAction | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [locked, setLocked] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [info, setInfo] = useState('');
  const attempt = useRef<{ row: Complaint; input: ComplaintAction } | null>(
    null,
  );
  const busy = useRef(false);
  const finished = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const blocker = useBlocker(
    () => !finished.current && (busy.current || Boolean(text) || uncertain),
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
    if (pending || text || uncertain)
      window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [pending, text, uncertain]);
  function review() {
    if (busy.current || locked) return;
    if (!uncertain) {
      if (!noteOnly && !target) {
        setError('Choose the next status.');
        return;
      }
      const status = noteOnly ? undefined : target || undefined;
      const validation = actionError(row, status, text);
      if (validation) {
        setError(validation);
        return;
      }
      attempt.current = {
        row,
        input: {
          request_id: crypto.randomUUID(),
          expected_version: row.version,
          text: text.trim(),
          ...(status ? { status } : {}),
        },
      };
    }
    setError('');
    setReviewedInput(attempt.current?.input ?? null);
    setConfirm(true);
  }
  async function run(reload: boolean) {
    if (busy.current || (!reload && (!confirm || locked || !attempt.current)))
      return;
    busy.current = true;
    setPending(true);
    setError('');
    setInfo('');
    const request = new AbortController();
    controller.current = request;
    try {
      if (reload) {
        const [fresh, history] = await Promise.all([
          getComplaint(row.complaint_id, uid, request.signal),
          listComplaintUpdates(
            row.complaint_id,
            uid,
            request.signal,
            historyOffset,
          ),
        ]);
        if (request.signal.aborted) return;
        onChecked(fresh, history);
        setLocked(false);
        setConfirm(false);
        if (!uncertain && target && !transitions(fresh.status).includes(target))
          setTarget('');
        setInfo(
          uncertain
            ? 'Current complaint checked. You may explicitly retry the identical action with its original request ID and version. Review history first; cancel if no retry is needed.'
            : `Reloaded version ${fresh.version}. Review the updated complaint and history before submitting a new action.`,
        );
      } else {
        const original = attempt.current!;
        await changeComplaint(
          original.row,
          original.input,
          uid,
          request.signal,
        );
        if (!request.signal.aborted) {
          finished.current = true;
          onSaved();
        }
      }
    } catch (failure) {
      if (request.signal.aborted) return;
      const mapped = complaintError(failure);
      if (['session', 'forbidden', 'not-found'].includes(mapped.kind)) {
        onDenied(mapped);
        return;
      }
      setConfirm(false);
      if (reload) {
        setLocked(true);
        setError(mapped.message);
      } else if (mapped.kind === 'unavailable') {
        setUncertain(true);
        setLocked(true);
        setError(
          'The action may have been saved. Reload the complaint before considering an identical retry. Your original request ID and payload are preserved.',
        );
      } else {
        attempt.current = null;
        setUncertain(false);
        setLocked(mapped.kind === 'conflict');
        setError(mapped.message);
      }
    } finally {
      busy.current = false;
      if (!request.signal.aborted) setPending(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="complaint-dialog"
      aria-labelledby="complaint-action-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy.current) onClose();
      }}
    >
      <form
        noValidate
        aria-busy={pending}
        onSubmit={(event) => {
          event.preventDefault();
          void run(false);
        }}
      >
        <h2 id="complaint-action-title">
          {noteOnly ? 'Add complaint note' : 'Change complaint status'}
        </h2>
        <p>
          Current status: {statusLabel(row.status)} · Version {row.version}
        </p>
        <p>
          All notes and explanations are visible to the owning student. Do not
          enter confidential staff notes.
        </p>
        {!noteOnly && (
          <>
            <label htmlFor="complaint-next-status">Next status</label>
            <select
              id="complaint-next-status"
              className="ui-input"
              value={target}
              disabled={pending || confirm || uncertain}
              onChange={(event) =>
                setTarget(event.target.value as typeof target)
              }
            >
              <option value="">Choose next status</option>
              {transitions(row.status).map((value) => (
                <option key={value} value={value}>
                  {statusLabel(value)}
                </option>
              ))}
            </select>
          </>
        )}
        <label htmlFor="complaint-action-text">
          {noteOnly ? 'Note' : 'Explanation'}
        </label>
        <textarea
          id="complaint-action-text"
          className="ui-input"
          rows={5}
          value={text}
          disabled={pending || confirm || uncertain}
          aria-describedby="complaint-text-help complaint-action-error"
          aria-invalid={Boolean(error)}
          onChange={(event) => {
            setText(event.target.value);
            setError('');
          }}
        />
        <p id="complaint-text-help">
          {Array.from(text.trim()).length}/2000 characters. Notes, resolution
          and reopening require text.
        </p>
        <p id="complaint-action-error" role={error ? 'alert' : undefined}>
          {error}
        </p>
        {info && <p role="status">{info}</p>}
        {locked && (
          <Button
            disabled={pending}
            onClick={() => {
              void run(true);
            }}
          >
            Reload complaint and history
          </Button>
        )}
        {pending && <p role="status">Processing complaint action…</p>}
        {confirm && reviewedInput && (
          <div
            className="complaint-confirm"
            role="region"
            aria-label="Action confirmation"
          >
            <h3>
              {uncertain
                ? 'Confirm identical retry'
                : 'Confirm complaint action'}
            </h3>
            <p>
              {noteOnly
                ? 'Add note'
                : `Change status to ${statusLabel(reviewedInput.status!)}`}{' '}
              · Expected version {reviewedInput.expected_version}
            </p>
            <p className="complaint-prose">
              {reviewedInput.text || 'No explanation provided.'}
            </p>
          </div>
        )}
        <div className="complaint-actions">
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
              {!uncertain && (
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() => {
                    setConfirm(false);
                    attempt.current = null;
                  }}
                >
                  Edit action
                </Button>
              )}
              <Button type="submit" disabled={pending || locked}>
                {uncertain ? 'Confirm identical retry' : 'Confirm action'}
              </Button>
            </>
          ) : (
            <Button disabled={pending || locked} onClick={review}>
              {uncertain ? 'Review identical retry' : 'Review action'}
            </Button>
          )}
        </div>
        {blocker.state === 'blocked' && (
          <div role="alert" className="complaint-confirm">
            <p>
              {pending
                ? 'Wait for the current operation before leaving.'
                : 'Discard this complaint draft and leave?'}
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
