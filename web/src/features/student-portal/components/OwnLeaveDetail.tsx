import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { routePaths } from '../../../app/router/routePaths';
import Button from '../../../shared/components/ui/Button';
import {
  getOwnLeave,
  ownLeaveError,
  leaveAccessError,
} from '../api/own-leave.api';
import type { OwnLeave, OwnLeaveError } from '../api/own-leave.api';
import type { OwnLeaveProps } from './OwnLeaveList';
import LeaveDate from '../../leave/components/LeaveDate';
export default function OwnLeaveDetail({
  uid,
  studentID,
  onAccessError,
}: OwnLeaveProps) {
  const location = useLocation();
  const { leaveID = '' } = useParams();
  const [attempt, setAttempt] = useState(0);
  const key = `${uid}:${studentID}:${leaveID}:${attempt}`;
  const [result, setResult] = useState<{
    key: string;
    data?: OwnLeave;
    error?: OwnLeaveError;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    getOwnLeave(leaveID, uid, studentID, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResult({ key, data });
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        const error = ownLeaveError(reason);
        setResult({ key, error });
        const access = leaveAccessError(error);
        if (access) onAccessError(access);
      });
    return () => controller.abort();
  }, [uid, studentID, leaveID, key, onAccessError]);
  const current = result?.key === key ? result : undefined;
  const row = current?.data;
  const error = current?.error;
  return (
    <section
      className="portal-card portal-request-detail"
      aria-labelledby="own-leave-detail-title"
    >
      <Link to={routePaths.ownLeaves}>Back to my leave requests</Link>
      {location.state?.leaveSubmitted === true && (
        <p role="status">
          Your leave request was submitted. Its current status is shown below.
        </p>
      )}
      <div className="portal-leave-toolbar">
        <h2 id="own-leave-detail-title">Leave request details</h2>
        <Button
          size="sm"
          variant="secondary"
          disabled={!current || Boolean(error && leaveAccessError(error))}
          onClick={() => setAttempt((n) => n + 1)}
        >
          Refresh request
        </Button>
      </div>
      {!current && <p role="status">Loading your leave request…</p>}
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
              <dt>Starts</dt>
              <dd>
                <LeaveDate value={row.starts_at} />
              </dd>
            </div>
            <div>
              <dt>Ends</dt>
              <dd>
                <LeaveDate value={row.ends_at} />
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
              <dd>{row.leave_id}</dd>
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
          <p className="portal-caption">
            Times use your device timezone. Only hostel staff can decide a
            request. Approval does not change your recorded presence.
          </p>
        </>
      )}
    </section>
  );
}
