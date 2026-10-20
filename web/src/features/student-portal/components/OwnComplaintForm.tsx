import { useEffect, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate } from 'react-router-dom';
import Button from '../../../shared/components/ui/Button';
import { routePaths } from '../../../app/router/routePaths';
import {
  addOwnComplaintNote,
  complaintAccessError,
  complaintTextError,
  getOwnComplaint,
  getOwnComplaintHistory,
  ownComplaintError,
  submitOwnComplaint,
} from '../api/own-complaints.api';
import type { ComplaintSubmission } from '../api/own-complaints.api';
import type {
  Complaint,
  ComplaintAction,
  ComplaintCategory,
  ComplaintPage,
  ComplaintUpdate,
} from '../../complaints/complaints.types';
import type { OwnComplaintProps } from './OwnComplaintList';

type Attempt =
  | { kind: 'submit'; payload: ComplaintSubmission }
  | { kind: 'note'; row: Complaint; payload: ComplaintAction };
interface Props extends OwnComplaintProps {
  row?: Complaint;
  onSaved?: () => void;
  onReviewed?: (
    row: Complaint,
    history: ComplaintPage<ComplaintUpdate>,
  ) => void;
}
export default function OwnComplaintForm({
  uid,
  studentID,
  onAccessError,
  row,
  onSaved,
  onReviewed,
}: Props) {
  const navigate = useNavigate();
  const [category, setCategory] = useState<ComplaintCategory>('maintenance');
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [uncertain, setUncertain] = useState<Attempt>();
  const [reviewRequired, setReviewRequired] = useState(false);
  const busy = useRef(false);
  const finished = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const alert = useRef<HTMLParagraphElement>(null);
  const dirty = Boolean(text || uncertain || category !== 'maintenance');
  const blocker = useBlocker(
    () => !finished.current && (dirty || busy.current),
  );
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => event.preventDefault();
    if (dirty || pending) window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty, pending]);
  useEffect(() => {
    if (error) alert.current?.focus();
  }, [error]);
  async function run(review = false) {
    if (busy.current || (!review && reviewRequired)) return;
    if (!review && !uncertain) {
      const invalid = complaintTextError(text);
      if (invalid) {
        setError(invalid);
        return;
      }
      if (row?.status === 'resolved') {
        setError('Resolved complaints cannot receive notes.');
        return;
      }
    }
    let attempt = uncertain;
    try {
      if (!review && !attempt)
        attempt = row
          ? {
              kind: 'note',
              row,
              payload: {
                request_id: crypto.randomUUID(),
                expected_version: row.version,
                text: text.trim(),
              },
            }
          : {
              kind: 'submit',
              payload: {
                request_id: crypto.randomUUID(),
                category,
                description: text.trim(),
              },
            };
    } catch {
      setError('Unable to prepare your complaint. Your text has been kept.');
      return;
    }
    busy.current = true;
    setPending(true);
    setError('');
    setInfo('');
    const request = new AbortController();
    controller.current = request;
    try {
      if (review && row) {
        const fresh = await getOwnComplaint(
          row.complaint_id,
          uid,
          studentID,
          request.signal,
        );
        const history = await getOwnComplaintHistory(
          fresh,
          uid,
          studentID,
          request.signal,
        );
        if (request.signal.aborted) return;
        onReviewed?.(fresh, history);
        setReviewRequired(false);
        setInfo(
          `Reloaded version ${fresh.version}. Review the status and history before submitting your preserved note as a new action.`,
        );
      } else if (attempt?.kind === 'submit') {
        const saved = await submitOwnComplaint(
          attempt.payload,
          uid,
          studentID,
          request.signal,
        );
        if (request.signal.aborted) return;
        finished.current = true;
        navigate(`${routePaths.ownComplaints}/${saved.complaint_id}`, {
          replace: true,
          state: { complaintSubmitted: true },
        });
      } else if (attempt?.kind === 'note') {
        await addOwnComplaintNote(
          attempt.row,
          attempt.payload,
          uid,
          studentID,
          request.signal,
        );
        if (request.signal.aborted) return;
        setText('');
        setUncertain(undefined);
        setReviewRequired(false);
        setInfo('Note saved. Refreshing complaint and history.');
        onSaved?.();
      }
    } catch (reason) {
      if (request.signal.aborted) return;
      const failure = ownComplaintError(reason);
      const access = complaintAccessError(failure);
      if (access) {
        onAccessError(access);
        return;
      }
      if (failure.kind === 'unavailable' && !review && attempt) {
        setUncertain(attempt);
        setError(
          'The action may already be saved. Retry the identical action with its original reference and details. Check your complaints before submitting another.',
        );
      } else {
        if (!review) {
          setUncertain(undefined);
          setReviewRequired(failure.kind === 'conflict' && Boolean(row));
        }
        setError(failure.message);
      }
    } finally {
      if (!request.signal.aborted) {
        busy.current = false;
        setPending(false);
      }
    }
  }
  const locked = pending || Boolean(uncertain) || reviewRequired;
  const resolved = row?.status === 'resolved';
  return (
    <section className="portal-card" aria-labelledby="own-complaint-form-title">
      {!row && <Link to={routePaths.ownComplaints}>Back to my complaints</Link>}
      <h2 id="own-complaint-form-title">
        {row ? 'Add a note' : 'New complaint'}
      </h2>
      <p className="portal-muted">
        {row
          ? 'Notes and staff responses are visible in your complaint history.'
          : 'Describe a maintenance or disciplinary concern for hostel staff to review.'}
      </p>
      {!row && (
        <p className="portal-caption">
          Submit your complaint first. You can then attach up to three evidence
          images on its details page.
        </p>
      )}
      {row && (
        <p>
          Current status: {row.status.replace('_', ' ')} · Version {row.version}
        </p>
      )}
      {resolved && (
        <p>
          Resolved complaints cannot receive new notes. Only staff can reopen a
          complaint.
        </p>
      )}
      <form
        className="portal-leave-form"
        noValidate
        aria-busy={pending}
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
      >
        {!row && (
          <label>
            Category
            <select
              value={category}
              disabled={locked}
              onChange={(event) =>
                setCategory(event.target.value as ComplaintCategory)
              }
            >
              <option value="maintenance">Maintenance</option>
              <option value="disciplinary">Disciplinary</option>
            </select>
          </label>
        )}
        <label>
          {row ? 'Note' : 'Description'}
          <textarea
            rows={5}
            value={text}
            disabled={locked || Boolean(resolved)}
            required
            aria-describedby="complaint-text-help complaint-submit-error"
            onChange={(event) => {
              setText(event.target.value);
              setError('');
            }}
          />
        </label>
        <p id="complaint-text-help" className="portal-caption">
          {Array.from(text.trim()).length}/2000 characters. Do not include
          passwords or other secrets.
        </p>
        <p
          id="complaint-submit-error"
          ref={alert}
          tabIndex={-1}
          role={error ? 'alert' : undefined}
        >
          {error}
        </p>
        {info && <p role="status">{info}</p>}
        {uncertain && (
          <p className="portal-caption">
            Your original details are locked to keep the retry identical.
          </p>
        )}
        <div className="portal-actions">
          {reviewRequired && row ? (
            <Button size="sm" disabled={pending} onClick={() => void run(true)}>
              Reload complaint and history
            </Button>
          ) : (
            <Button
              size="sm"
              type="submit"
              disabled={pending || Boolean(resolved && !uncertain)}
            >
              {pending
                ? 'Processing…'
                : uncertain
                  ? 'Retry identical action'
                  : row
                    ? 'Submit note'
                    : 'Submit complaint'}
            </Button>
          )}
          {!row && (
            <Link to={routePaths.ownComplaints}>View my complaints</Link>
          )}
        </div>
      </form>
      {blocker.state === 'blocked' && (
        <div className="portal-complaint-warning" role="alert">
          <p>
            {pending
              ? 'Wait for the current operation before leaving.'
              : uncertain
                ? 'Leave an unconfirmed action? It may already be saved. Leaving loses the exact retry details; check complaint history before creating another action.'
                : 'Discard this complaint draft and leave?'}
          </p>
          <div className="portal-actions">
            <Button size="sm" onClick={() => blocker.reset()}>
              Stay here
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={pending}
              onClick={() => {
                finished.current = true;
                blocker.proceed();
              }}
            >
              Discard and leave
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
