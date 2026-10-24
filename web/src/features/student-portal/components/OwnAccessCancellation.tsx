import { useEffect, useRef, useState } from 'react';
import Button from '../../../shared/components/ui/Button';
import {
  cancelOwnLateAccess,
  getOwnLateAccess,
  lateAccessAccountError,
  ownLateAccessError,
  type OwnLateAccess,
} from '../api/own-late-access.api';
import type { OwnLateAccessProps } from './OwnLateAccessList';

export default function OwnAccessCancellation({
  uid,
  studentID,
  onAccessError,
  row,
  onClose,
  onUpdated,
}: OwnLateAccessProps & {
  row: OwnLateAccess;
  onClose: () => void;
  onUpdated: (row: OwnLateAccess, message: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  const work = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current;
    element?.showModal();
    keep.current?.focus();
    return () => {
      work.current?.abort();
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);

  async function run(checkOnly = false) {
    if (work.current || (uncertain && !checkOnly)) return;
    const controller = new AbortController();
    work.current = controller;
    setPending(true);
    setError('');
    try {
      const fresh = checkOnly
        ? await getOwnLateAccess(
            row.late_access_id,
            uid,
            studentID,
            controller.signal,
          )
        : await cancelOwnLateAccess(
            row.late_access_id,
            uid,
            studentID,
            controller.signal,
          );
      if (!controller.signal.aborted)
        onUpdated(
          fresh,
          checkOnly
            ? `Current request status: ${fresh.status}. Review it before taking another action.`
            : 'Your access request was cancelled.',
        );
    } catch (reason) {
      if (controller.signal.aborted) return;
      const failure = ownLateAccessError(reason);
      const access = lateAccessAccountError(failure);
      if (access) {
        onAccessError(access);
        return;
      }
      setUncertain(true);
      setError(
        failure.kind === 'conflict'
          ? 'This request may already have been decided. Checking its current status…'
          : 'Cancellation could not be confirmed. It may have succeeded. Check the current request before trying again.',
      );
      if (!checkOnly) {
        try {
          const fresh = await getOwnLateAccess(
            row.late_access_id,
            uid,
            studentID,
            controller.signal,
          );
          if (!controller.signal.aborted)
            onUpdated(
              fresh,
              `Current request status: ${fresh.status}. ${fresh.status === 'pending' ? 'Cancellation was not confirmed. You can review and try again.' : 'This request can no longer be cancelled.'}`,
            );
        } catch (readReason) {
          if (controller.signal.aborted) return;
          const readFailure = ownLateAccessError(readReason);
          const denied = lateAccessAccountError(readFailure);
          if (denied) onAccessError(denied);
          else
            setError(
              'Unable to verify the current request. Check its status before trying cancellation again.',
            );
        }
      }
    } finally {
      if (!controller.signal.aborted) {
        work.current = null;
        setPending(false);
      }
    }
  }
  return (
    <dialog
      ref={dialog}
      className="portal-leave-dialog"
      aria-labelledby="cancel-access-title"
      aria-describedby="cancel-access-description"
      aria-busy={pending}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
    >
      <h2 id="cancel-access-title">Cancel this access request?</h2>
      <p id="cancel-access-description">
        You will withdraw this request from staff review. It will remain in your
        history as Cancelled. Your recorded attendance will stay the same.
      </p>
      {error && <p role="alert">{error}</p>}
      {pending && (
        <p role="status">
          {uncertain ? 'Checking current request…' : 'Cancelling your request…'}
        </p>
      )}
      <div className="portal-actions">
        <Button
          ref={keep}
          variant="secondary"
          disabled={pending}
          onClick={onClose}
        >
          {uncertain ? 'Close' : 'Keep request'}
        </Button>
        {uncertain ? (
          <Button disabled={pending} onClick={() => void run(true)}>
            Check current request
          </Button>
        ) : (
          <Button
            variant="danger"
            disabled={pending}
            onClick={() => void run()}
          >
            Confirm cancellation
          </Button>
        )}
      </div>
    </dialog>
  );
}
