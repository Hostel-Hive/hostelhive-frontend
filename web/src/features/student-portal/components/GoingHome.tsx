import { useEffect, useRef, useState } from 'react';
import { Link, useBlocker } from 'react-router-dom';
import Button from '../../../shared/components/ui/Button';
import { routePaths } from '../../../app/router/routePaths';
import {
  declareGoingHome,
  GoingHomeError,
  type GoingHomeDeclaration,
} from '../api/going-home.api';
import { StudentPortalError } from '../api/student-portal.api';
import type { OwnLeaveProps } from './OwnLeaveList';

export default function GoingHome({
  uid,
  studentID,
  onAccessError,
}: OwnLeaveProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<GoingHomeError>();
  const [result, setResult] = useState<GoingHomeDeclaration>();
  const operation = useRef<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const blocker = useBlocker(() => busy.current || Boolean(error?.uncertain));
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => event.preventDefault();
    if (pending || error?.uncertain)
      window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [pending, error]);
  async function submit() {
    if (busy.current || !confirmed || result) return;
    if (!operation.current) operation.current = crypto.randomUUID();
    busy.current = true;
    setPending(true);
    setError(undefined);
    const request = new AbortController();
    controller.current = request;
    try {
      const value = await declareGoingHome(
        uid,
        studentID,
        operation.current,
        request.signal,
      );
      if (!request.signal.aborted) setResult(value);
    } catch (failure) {
      if (request.signal.aborted) return;
      if (failure instanceof StudentPortalError) onAccessError(failure);
      else
        setError(
          failure instanceof GoingHomeError
            ? failure
            : new GoingHomeError(
                true,
                'Unable to confirm the declaration. Retry the same declaration.',
              ),
        );
    } finally {
      busy.current = false;
      if (!request.signal.aborted) setPending(false);
    }
  }
  return (
    <section className="portal-card" aria-labelledby="going-home-title">
      <p className="eyebrow">Departure declaration</p>
      <h2 id="going-home-title">I am going home now</h2>
      <p>
        Record your intention to go home when you are ready to leave. This is
        not an approval request.
      </p>
      <div className="portal-notice">
        <p>
          <strong>
            Scan your QR code at the exit gate to record your departure.
          </strong>{' '}
          This button does not mark you OUT. Scan at the entry gate when you
          return.
        </p>
        <p>
          Restricted-hours entry or exit still requires an approved access
          request. Going Home does not grant that permission.
        </p>
      </div>
      {result ? (
        <div role="status">
          <h3>
            {result.status === 'departed'
              ? 'Departure already recorded'
              : 'Going Home declaration recorded'}
          </h3>
          <p>
            {result.status === 'departed'
              ? 'The backend confirms that an exit scan has been linked to this declaration.'
              : 'Your intention has been saved. Complete an exit scan when you leave.'}
          </p>
          <p>
            Declared{' '}
            <time dateTime={result.declared_at}>
              {new Date(result.declared_at).toLocaleString()}
            </time>
          </p>
          <p className="portal-caption">Reference: {result.going_home_id}</p>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className="portal-going-home-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={pending || Boolean(error?.uncertain)}
              onChange={(event) => setConfirmed(event.target.checked)}
            />{' '}
            I confirm that I am ready to go home and understand that I must scan
            at the gate.
          </label>
          {error && <p role="alert">{error.message}</p>}
          <Button type="submit" disabled={!confirmed || pending}>
            {pending
              ? 'Recording declaration…'
              : error?.uncertain
                ? 'Retry same declaration'
                : 'Confirm Going Home'}
          </Button>
        </form>
      )}
      <div className="student-entry-actions">
        <Link
          className="ui-button ui-button--secondary ui-button--sm"
          to={routePaths.ownStudentQR}
        >
          My QR code
        </Link>
        <Link
          className="ui-button ui-button--secondary ui-button--sm"
          to={routePaths.ownLateAccess}
        >
          Access requests
        </Link>
        <Link to={routePaths.ownLeaves}>View leave history</Link>
      </div>
      {blocker.state === 'blocked' && (
        <div role="alert">
          <p>
            {pending
              ? 'A declaration is being submitted. Stay here until the result is confirmed.'
              : result
                ? 'Your declaration has been recorded. You can now leave this page.'
                : 'The result is unknown. Leaving will lose this retry reference. Your declaration may already be saved; check with staff before making another.'}
          </p>
          <Button variant="secondary" onClick={() => blocker.reset()}>
            Stay on this page
          </Button>
          {!pending && (
            <Button variant="secondary" onClick={() => blocker.proceed()}>
              Leave page
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
