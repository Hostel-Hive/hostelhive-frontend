import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { routePaths } from '../../../app/router/routePaths';
import Button from '../../../shared/components/ui/Button';
import {
  getOwnLateAccess,
  ownLateAccessError,
  lateAccessAccountError,
} from '../api/own-late-access.api';
import type {
  OwnLateAccess,
  OwnLateAccessError,
} from '../api/own-late-access.api';
import type { OwnLateAccessProps } from './OwnLateAccessList';
import LeaveDate from '../../leave/components/LeaveDate';
export default function OwnLateAccessDetail({
  uid,
  studentID,
  onAccessError,
}: OwnLateAccessProps) {
  const location = useLocation();
  const { lateAccessID = '' } = useParams();
  const [attempt, setAttempt] = useState(0);
  const key = `${uid}:${studentID}:${lateAccessID}:${attempt}`;
  const [result, setResult] = useState<{
    key: string;
    data?: OwnLateAccess;
    error?: OwnLateAccessError;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    getOwnLateAccess(lateAccessID, uid, studentID, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResult({ key, data });
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        const error = ownLateAccessError(reason);
        setResult({ key, error });
        const access = lateAccessAccountError(error);
        if (access) onAccessError(access);
      });
    return () => controller.abort();
  }, [uid, studentID, lateAccessID, key, onAccessError]);
  const current = result?.key === key ? result : undefined;
  const row = current?.data;
  const error = current?.error;
  return (
    <section
      className="portal-card portal-request-detail"
      aria-labelledby="own-access-detail-title"
    >
      <Link to={routePaths.ownLateAccess}>Back to my access requests</Link>
      {location.state?.lateAccessSubmitted === true && (
        <p role="status">
          Your access request was submitted. Its current status is shown below.
        </p>
      )}
      <div className="portal-leave-toolbar">
        <h2 id="own-access-detail-title">Access request details</h2>
        <Button
          size="sm"
          variant="secondary"
          disabled={!current || Boolean(error && lateAccessAccountError(error))}
          onClick={() => setAttempt((n) => n + 1)}
        >
          Refresh request
        </Button>
      </div>
      {!current && <p role="status">Loading your access request…</p>}
      {error && <p role="alert">{error.message}</p>}
      {row && (
        <>
          <p>
            <span
              className={`portal-leave-badge portal-leave-badge--${row.status}`}
            >
              {row.status}
            </span>
          </p>
          <dl className="portal-details">
            <div>
              <dt>Movement</dt>
              <dd>
                {row.direction === 'IN'
                  ? 'Late entry (IN)'
                  : 'Early exit (OUT)'}
              </dd>
            </div>
            <div>
              <dt>Expected date and time</dt>
              <dd>
                <LeaveDate value={row.expected_at} />
              </dd>
            </div>
            <div>
              <dt>Submitted</dt>
              <dd>
                <LeaveDate value={row.created_at} />
              </dd>
            </div>
            <div>
              <dt>Request reference</dt>
              <dd>{row.late_access_id}</dd>
            </div>
            <div className="portal-leave-full">
              <dt>Reason</dt>
              <dd className="portal-leave-prose">{row.reason}</dd>
            </div>
            {row.status === 'pending' ? (
              <div className="portal-leave-full">
                <dt>Decision</dt>
                <dd>Waiting for a hostel staff decision.</dd>
              </div>
            ) : (
              <>
                <div>
                  <dt>Decided at</dt>
                  <dd>
                    <LeaveDate value={row.decided_at!} />
                  </dd>
                </div>
                <div className="portal-leave-full">
                  <dt>
                    {row.status === 'rejected'
                      ? 'Rejection reason'
                      : 'Decision note'}
                  </dt>
                  <dd className="portal-leave-prose">
                    {row.decision_note || 'No note provided.'}
                  </dd>
                </div>
              </>
            )}
          </dl>
          {row.status === 'approved' && (
            <div className="portal-note portal-card portal-access-use">
              <h3>Recorded use</h3>
              <p>
                {row.consumed_at ? (
                  <>
                    <span>Used at </span>
                    <LeaveDate value={row.consumed_at} />
                  </>
                ) : (
                  'No use recorded for this permission.'
                )}
              </p>
              <p className="portal-caption">
                This is a recorded use status, not a guarantee of access or your
                current location.
              </p>
            </div>
          )}
          <p className="portal-caption">
            Times use your device timezone. Only hostel staff can decide a
            request. Approval does not change your recorded presence.
          </p>
        </>
      )}
    </section>
  );
}
