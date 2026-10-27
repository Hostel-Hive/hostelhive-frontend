import { useEffect, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate } from 'react-router-dom';
import Button from '../../../shared/components/ui/Button';
import { routePaths } from '../../../app/router/routePaths';
import {
  ownLateAccessError,
  lateAccessAccountError,
  prepareLateAccessSubmission,
  submitOwnLateAccess,
  validateLateAccessDraft,
} from '../api/own-late-access.api';
import type {
  LateAccessDraft,
  LateAccessSubmission,
} from '../api/own-late-access.api';
import type { OwnLateAccessProps } from './OwnLateAccessList';

function AccessNavigationWarning({
  pending,
  uncertain,
  keep,
  leave,
}: {
  pending: boolean;
  uncertain: boolean;
  keep: () => void;
  leave: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement;
    element.showModal();
    element.querySelector('button')?.focus();
    return () => {
      element.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="portal-leave-dialog"
      aria-labelledby="access-navigation-title"
      aria-describedby="access-navigation-help"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) keep();
      }}
    >
      <h2 id="access-navigation-title">
        {pending
          ? 'Submitting your request'
          : uncertain
            ? 'Leave an unconfirmed submission?'
            : 'Discard this access draft?'}
      </h2>
      <p id="access-navigation-help">
        {pending
          ? 'Wait for submission to finish before leaving this form.'
          : uncertain
            ? 'Your request may already be saved. Leaving loses the exact retry details. Check your existing access requests before submitting another request.'
            : 'Your entered dates and reason will be lost.'}
      </p>
      <div className="portal-actions">
        <Button size="sm" variant="secondary" disabled={pending} onClick={keep}>
          Stay on form
        </Button>
        <Button size="sm" variant="danger" disabled={pending} onClick={leave}>
          Leave form
        </Button>
      </div>
    </dialog>
  );
}
export default function OwnLateAccessForm({
  uid,
  studentID,
  onAccessError,
}: OwnLateAccessProps) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<LateAccessDraft>({
    direction: '',
    expected: '',
    reason: '',
  });
  const [pending, setPending] = useState(false);
  const [retryPayload, setRetryPayload] = useState<LateAccessSubmission>();
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const finished = useRef(false);
  const message = useRef<HTMLParagraphElement>(null);
  const dirty = Boolean(
    draft.direction || draft.expected || draft.reason || retryPayload,
  );
  const blocker = useBlocker(
    ({ nextLocation }) =>
      !finished.current &&
      (busy.current || dirty) &&
      ![
        routePaths.studentLogin,
        routePaths.login,
        routePaths.studentSetup,
      ].some((path) => path === nextLocation.pathname),
  );
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    if (dirty || pending) window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty, pending]);
  useEffect(() => {
    if (error) message.current?.focus();
  }, [error]);
  async function submit() {
    if (busy.current) return;
    let payload: LateAccessSubmission;
    try {
      if (!retryPayload) {
        const invalid = validateLateAccessDraft(draft);
        if (invalid) {
          setError(invalid);
          return;
        }
      }
      payload =
        retryPayload ?? prepareLateAccessSubmission(draft, crypto.randomUUID());
    } catch {
      setError(
        'Unable to prepare your access request. Keep your details and try again.',
      );
      return;
    }
    busy.current = true;
    setPending(true);
    setError('');
    const request = new AbortController();
    controller.current = request;
    try {
      const row = await submitOwnLateAccess(
        payload,
        uid,
        studentID,
        request.signal,
      );
      if (request.signal.aborted) return;
      finished.current = true;
      navigate(`${routePaths.ownLateAccess}/${row.late_access_id}`, {
        replace: true,
        state: { lateAccessSubmitted: true },
      });
    } catch (reason) {
      if (request.signal.aborted) return;
      const failure = ownLateAccessError(reason);
      const access = lateAccessAccountError(failure);
      if (access) {
        onAccessError(access);
        return;
      }
      if (failure.kind === 'unavailable') {
        setRetryPayload(payload);
        setError(
          'The submission could not be confirmed. It may already be saved. Retry the same request, or check your existing requests before creating another.',
        );
      } else {
        setRetryPayload(undefined);
        setError(failure.message);
      }
    } finally {
      if (!request.signal.aborted) {
        busy.current = false;
        setPending(false);
      }
    }
  }
  const locked = pending || Boolean(retryPayload);
  return (
    <section className="portal-card" aria-labelledby="own-access-form-title">
      <Link to={routePaths.ownLateAccess}>Back to my access requests</Link>
      <h2 id="own-access-form-title" className="portal-leave-form-title">
        New access request
      </h2>
      <p className="portal-muted">
        Choose an early exit or late entry and its expected time. Hostel staff
        will review your request.
      </p>
      <p id="access-time-help" className="portal-caption">
        Enter times in your device timezone (
        {Intl.DateTimeFormat().resolvedOptions().timeZone}). The movement must
        be in the future. The backend checks whether permission is required
        under the hostel's current local-time rules.
      </p>
      <form
        className="portal-leave-form"
        noValidate
        aria-busy={pending}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="portal-leave-date-fields">
          <label>
            Movement
            <select
              value={draft.direction}
              disabled={locked}
              required
              aria-describedby="access-time-help access-submit-error"
              onChange={(event) => {
                setDraft({
                  ...draft,
                  direction: event.target.value as LateAccessDraft['direction'],
                });
                setError('');
              }}
            >
              <option value="">Choose a movement</option>
              <option value="OUT">Early exit (OUT)</option>
              <option value="IN">Late entry (IN)</option>
            </select>
          </label>
          <label>
            Expected date and time
            <input
              type="datetime-local"
              min="0001-01-01T00:00"
              max="9999-12-31T23:59"
              step={60}
              value={draft.expected}
              disabled={locked}
              required
              aria-describedby="access-time-help access-submit-error"
              onChange={(event) => {
                setDraft({ ...draft, expected: event.target.value });
                setError('');
              }}
            />
          </label>
        </div>
        <label>
          Reason for access
          <textarea
            rows={4}
            value={draft.reason}
            disabled={locked}
            required
            aria-describedby="access-reason-help access-submit-error"
            onChange={(event) => {
              setDraft({ ...draft, reason: event.target.value });
              setError('');
            }}
          />
        </label>
        <p id="access-reason-help" className="portal-caption">
          {Array.from(draft.reason.trim()).length}/1000 characters. Include
          enough detail for staff to review your request.
        </p>
        <p
          id="access-submit-error"
          ref={message}
          tabIndex={-1}
          role={error ? 'alert' : undefined}
        >
          {error}
        </p>
        {retryPayload && (
          <p className="portal-caption">
            The original details are locked so retrying uses the same submission
            reference and cannot create a duplicate.
          </p>
        )}
        <div className="portal-actions">
          <Button type="submit" size="sm" disabled={pending}>
            {pending
              ? 'Submitting request…'
              : retryPayload
                ? 'Retry same request'
                : 'Submit access request'}
          </Button>
          <Link to={routePaths.ownLateAccess}>View my requests</Link>
        </div>
      </form>
      {blocker.state === 'blocked' && (
        <AccessNavigationWarning
          pending={pending}
          uncertain={Boolean(retryPayload)}
          keep={() => blocker.reset()}
          leave={() => {
            finished.current = true;
            blocker.proceed();
          }}
        />
      )}
    </section>
  );
}
