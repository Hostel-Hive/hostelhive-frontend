import { useCallback, useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { routePaths } from '../../../app/router/routePaths';
import Button from '../../../shared/components/ui/Button';
import useAuth from '../../auth/hooks/useAuth';
import { getLeave, leaveFilters } from '../api/leave.api';
import useLeaveRequest from '../hooks/useLeaveRequest';
import LeaveRequestState from '../components/LeaveRequestState';
import LeaveDate from '../components/LeaveDate';
export default function LeaveDetailPage() {
  const { leaveID = '' } = useParams();
  const { account } = useAuth();
  const [params] = useSearchParams();
  const uid = account?.firebase_uid ?? '';
  const key = `${uid}:${leaveID}`;
  const load = useCallback(
    (signal: AbortSignal) => getLeave(leaveID, uid, signal),
    [leaveID, uid],
  );
  const request = useLeaveRequest(key, load);
  const heading = useRef<HTMLHeadingElement>(null);
  const error = request.error;
  const row = !error ? request.data : undefined;
  let back = routePaths.leaves as string;
  try {
    const filters = leaveFilters(params);
    filters.delete('limit');
    back += `?${filters}`;
  } catch {
    /* Invalid return filters are discarded. */
  }
  function refresh() {
    request.retry();
  }
  return (
    <section
      className="leave-page leave-detail-page"
      aria-labelledby="leave-detail-title"
    >
      <Link className="leave-back" to={back}>
        <span aria-hidden="true">← </span>
        Back to leave requests
      </Link>
      <p className="eyebrow">Operations / Leave request</p>
      <h1 id="leave-detail-title" ref={heading} tabIndex={-1}>
        Leave request details
      </h1>
      <p className="page-description">
        Read-only history of ordinary leave requests. This workflow has been
        retired; existing records and decisions are preserved.
      </p>

      {!row || error ? (
        <LeaveRequestState error={error} retry={refresh} />
      ) : (
        <>
          <div className="leave-toolbar leave-detail-toolbar">
            <span className={`leave-badge leave-badge--${row.status}`}>
              {row.status}
            </span>
            <div className="leave-actions">
              <Link
                className="leave-view-link"
                to={`${routePaths.students}/${row.student_id}`}
              >
                View student profile <span aria-hidden="true">↗</span>
              </Link>
              <Button variant="secondary" size="sm" onClick={refresh}>
                Refresh request
              </Button>
            </div>
          </div>
          <div className="leave-detail-grid">
            <div className="leave-card leave-request-card">
              <h2>Request</h2>
              <dl className="leave-period">
                <div>
                  <dt>Starts</dt>
                  <dd>
                    <LeaveDate value={row.starts_at} compact />
                  </dd>
                </div>
                <div>
                  <dt>Ends</dt>
                  <dd>
                    <LeaveDate value={row.ends_at} compact />
                  </dd>
                </div>
              </dl>
              <p className="leave-submitted">
                Submitted <LeaveDate value={row.created_at} />
              </p>
              <div className="leave-reason">
                <h3>Reason</h3>
                <p className="leave-prose">{row.reason}</p>
              </div>
              <details className="leave-reference-panel">
                <summary>Request references</summary>
                <dl className="leave-details">
                  <dt>Leave request ID</dt>
                  <dd className="leave-id">{row.leave_id}</dd>
                  <dt>Student ID</dt>
                  <dd className="leave-id">{row.student_id}</dd>
                  <dt>Submitted by (account ID)</dt>
                  <dd className="leave-id">{row.submitted_by}</dd>
                </dl>
              </details>
            </div>
            <div className="leave-card leave-decision-card">
              <h2>Recorded decision</h2>
              {row.status === 'cancelled' ? (
                <dl className="leave-details">
                  <dt>Cancelled at</dt>
                  <dd>
                    <LeaveDate value={row.cancelled_at!} />
                  </dd>
                  <dt>Cancelled by (account ID)</dt>
                  <dd className="leave-id">{row.cancelled_by}</dd>
                </dl>
              ) : row.status === 'pending' ? (
                <>
                  <p>
                    No decision was recorded. This historical request remains
                    pending and cannot be approved or rejected.
                  </p>
                </>
              ) : (
                <dl className="leave-details">
                  <dt>Decision</dt>
                  <dd>{row.status}</dd>
                  <dt>Decided at</dt>
                  <dd>
                    <LeaveDate value={row.decided_at!} />
                  </dd>
                  <dt>Decided by (account ID)</dt>
                  <dd className="leave-id">{row.decided_by}</dd>
                  <dt>Decision note</dt>
                  <dd className="leave-prose">
                    {row.decision_note || 'No note provided.'}
                  </dd>
                </dl>
              )}
            </div>
          </div>
          <p className="leave-detail-caption">
            Dates include your browser’s local timezone. Approval does not
            record departure, return or attendance; entry/exit scans record
            presence.
          </p>
        </>
      )}
    </section>
  );
}
