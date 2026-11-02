import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import Button from '../../../shared/components/ui/Button';
import type { StudentInvitation } from '../api/student-invitations.api';
import {
  InvitationError,
  invitationAccessDenied,
  readStudentInvitation,
  resendStudentInvitation,
  resendWaitSeconds,
} from '../api/invitation-management.api';

const date = (v: string | null) =>
  v ? new Date(v).toLocaleString() : 'Not yet';
const errorLabels = {
  identity_conflict:
    'The authentication identity needs administrator attention.',
  provider_unavailable: 'The email provider could not complete delivery.',
  ineligible: 'The account is not eligible for delivery.',
};
export default function InvitationDialog({
  id,
  uid,
  onClose,
  onDenied,
}: {
  id: string;
  uid: string;
  onClose: () => void;
  onDenied: (message: string) => void;
}) {
  const [row, setRow] = useState<StudentInvitation>();
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [readError, setReadError] = useState('');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now);
  const dialog = useRef<HTMLDialogElement>(null);
  const writeController = useRef<AbortController | null>(null);
  const requestID = useRef<string | null>(null);
  const busy = useRef(false);
  const blocker = useBlocker(() => busy.current || uncertain);
  useEffect(() => {
    const controller = new AbortController();
    void readStudentInvitation(id, uid, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setRow(value);
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        if (invitationAccessDenied(e)) {
          onDenied(e.message);
          return;
        }
        setReadError(
          'Unable to check this invitation. Retry loading its details.',
        );
        setRow(undefined);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, uid, onDenied, revision]);
  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current!;
    element.showModal();
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(timer);
      writeController.current?.abort();
      element.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    if (pending || uncertain) window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pending, uncertain]);
  const wait = Math.max(
    Math.ceil((retryAt - now) / 1000),
    row &&
      !uncertain &&
      !row.setup_completed_at &&
      row.delivery_status !== 'pending'
      ? resendWaitSeconds(row, now)
      : 0,
    0,
  );
  const eligible =
    row &&
    !row.setup_completed_at &&
    row.delivery_status !== 'pending' &&
    !wait;
  function close() {
    if (!busy.current) onClose();
  }
  async function resend() {
    if (
      busy.current ||
      !row ||
      loading ||
      blocked ||
      accepted ||
      wait ||
      (!uncertain && !eligible)
    )
      return;
    try {
      requestID.current ??= crypto.randomUUID();
    } catch {
      setError('Unable to prepare a resend request. Please try again.');
      return;
    }
    busy.current = true;
    setPending(true);
    setError('');
    const controller = new AbortController();
    writeController.current = controller;
    try {
      const value = await resendStudentInvitation(
        id,
        requestID.current,
        uid,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setRow(value);
      setAccepted(true);
      setUncertain(false);
      setConfirm(false);
      setRetryAt(0);
    } catch (e) {
      if (controller.signal.aborted) return;
      if (invitationAccessDenied(e)) {
        onDenied((e as InvitationError).message);
        return;
      }
      if (e instanceof InvitationError && e.kind === 'cooldown') {
        setRetryAt(Date.now() + e.retryAfterSeconds * 1000);
        setNow(Date.now());
        setError(e.message);
      } else if (!(e instanceof InvitationError) || e.kind === 'unavailable') {
        setUncertain(true);
        setError(
          'The resend may already have been accepted. Check the current status or retry the identical request. Do not start another resend.',
        );
      } else {
        setBlocked(true);
        setError(e.message);
      }
    } finally {
      if (!controller.signal.aborted) {
        busy.current = false;
        setPending(false);
      }
    }
  }
  return (
    <dialog
      ref={dialog}
      className="invitation-dialog"
      aria-busy={pending || loading}
      aria-labelledby="invitation-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <p className="eyebrow">Student account setup</p>
      <h2 id="invitation-dialog-title">Student invitation</h2>
      {loading && <p role="status">Checking invitation…</p>}
      {readError && (
        <p role="alert" className="invitation-error">
          {readError}
        </p>
      )}
      {row && (
        <>
          <p className="invitation-email">{row.email}</p>
          <dl className="invitation-details">
            <div>
              <dt>Delivery status</dt>
              <dd>
                {
                  {
                    pending: 'Pending',
                    sent: 'Sent',
                    failed: 'Failed',
                    skipped: 'Skipped',
                  }[row.delivery_status]
                }
              </dd>
            </div>
            <div>
              <dt>Account setup</dt>
              <dd>
                {row.setup_completed_at ? 'Completed' : 'Awaiting student'}
              </dd>
            </div>
            <div>
              <dt>Last requested</dt>
              <dd>{date(row.last_requested_at)}</dd>
            </div>
            <div>
              <dt>Last sent</dt>
              <dd>{date(row.last_sent_at)}</dd>
            </div>
            <div>
              <dt>Next delivery attempt</dt>
              <dd>{date(row.next_attempt_at)}</dd>
            </div>
            <div>
              <dt>Delivery attempts</dt>
              <dd>{row.attempts} / 8</dd>
            </div>
            {row.setup_completed_at && (
              <div>
                <dt>Setup completed</dt>
                <dd>{date(row.setup_completed_at)}</dd>
              </div>
            )}
          </dl>
          {row.last_error && (
            <p className="invitation-hint">
              {errorLabels[row.last_error as keyof typeof errorLabels]}
            </p>
          )}
          {!accepted &&
            !uncertain &&
            !row.setup_completed_at &&
            row.delivery_status === 'pending' && (
              <p className="invitation-hint">
                Delivery is queued. Check status for progress; another resend is
                not needed while it is pending.
              </p>
            )}
          {row.setup_completed_at && !uncertain && (
            <p className="invitation-hint">
              Account setup is complete. Use the normal password recovery
              process if the student cannot sign in.
            </p>
          )}
        </>
      )}
      {wait > 0 && (
        <p role="status" className="invitation-hint">
          Resend available in {Math.floor(wait / 60)}m {wait % 60}s. The backend
          checks the cooldown again.
        </p>
      )}
      {confirm && !accepted && !uncertain && (
        <div className="invitation-notice">
          <strong>Resend this student's setup invitation?</strong>
          <p>
            The backend will queue delivery if this account is eligible. This
            does not create another student account.
          </p>
        </div>
      )}
      {accepted && (
        <p role="status" className="invitation-notice">
          Resend request accepted. Delivery runs in the background. A Sent
          status means the provider accepted the email request; it does not
          confirm inbox receipt or completed setup.
        </p>
      )}
      {error && (
        <p role="alert" className="invitation-error">
          {error}
        </p>
      )}
      {blocker.state === 'blocked' && (
        <p role="alert">
          Finish or check this resend before leaving.
          <Button variant="secondary" onClick={() => blocker.reset()}>
            Stay on this page
          </Button>
        </p>
      )}
      <div className="invitation-dialog-footer">
        <Button variant="secondary" disabled={pending} onClick={close}>
          {uncertain ? 'Close and check directory' : 'Close'}
        </Button>
        <Button
          variant="secondary"
          disabled={pending || loading}
          onClick={() => {
            setLoading(true);
            setReadError('');
            setRevision((value) => value + 1);
          }}
        >
          Check status
        </Button>
        {!accepted && (
          <Button
            disabled={
              pending ||
              loading ||
              blocked ||
              !row ||
              wait > 0 ||
              (!uncertain && !eligible)
            }
            onClick={() => {
              if (confirm || uncertain) void resend();
              else setConfirm(true);
            }}
          >
            {pending
              ? 'Requesting resend…'
              : uncertain
                ? 'Retry identical resend'
                : confirm
                  ? 'Confirm resend'
                  : 'Resend invitation'}
          </Button>
        )}
      </div>
      <p className="invitation-caption">
        Times use your device timezone. Check the student's spam folder if
        delivery is marked Sent.
      </p>
    </dialog>
  );
}
