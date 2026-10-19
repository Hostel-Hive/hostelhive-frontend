import { useCallback, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { routePaths } from '../../../app/router/routePaths';
import Button from '../../../shared/components/ui/Button';
import useAuth from '../../auth/hooks/useAuth';
import { getLeave, leaveFilters, type LeaveError } from '../api/leave.api';
import type { LeaveDecision, LeaveRequest } from '../leave.types';
import useLeaveRequest from '../hooks/useLeaveRequest';
import LeaveRequestState from '../components/LeaveRequestState';
import LeaveDate from '../components/LeaveDate';
import LeaveDecisionDialog from '../components/LeaveDecisionDialog';
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
  const [override, setOverride] = useState<{
    key: string;
    row?: LeaveRequest;
    error?: LeaveError;
  }>();
  const [decision, setDecision] = useState<{
    key: string;
    status: LeaveDecision;
  }>();
  const [notice, setNotice] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const current = override?.key === key ? override : undefined;
  const error = current?.error ?? request.error;
  const row = !error ? (current?.row ?? request.data) : undefined;
  let back = routePaths.leaves as string;
  try {
    const filters = leaveFilters(params);
    filters.delete('limit');
    back += `?${filters}`;
  } catch {
    /* Invalid return filters are discarded. */
  }
  function refresh() {
    setOverride(undefined);
    request.retry();
  }
  return (
    <section className="leave-page" aria-labelledby="leave-detail-title">
      <Link className="leave-back" to={back}>
        Back to leave requests
      </Link>
      <p className="eyebrow">Operations / Leave request</p>
      <h1 id="leave-detail-title" ref={heading} tabIndex={-1}>
        Leave request details
      </h1>
      {notice && <p role="status">{notice}</p>}
      {!row || error ? (
        <LeaveRequestState error={error} retry={refresh} />
      ) : (
        <>
          <div className="leave-toolbar">
            <span className={`leave-badge leave-badge--${row.status}`}>
              {row.status}
            </span>
            <Button variant="secondary" onClick={refresh}>
              Refresh request
            </Button>
          </div>
          <div className="leave-card">
            <h2>Request</h2>
            <dl className="leave-details">
              <dt>Leave request ID</dt>
              <dd className="leave-id">{row.leave_id}</dd>
              <dt>Student ID</dt>
              <dd className="leave-id">{row.student_id}</dd>
              <dt>Starts</dt>
              <dd>
                <LeaveDate value={row.starts_at} />
              </dd>
              <dt>Ends</dt>
              <dd>
                <LeaveDate value={row.ends_at} />
              </dd>
              <dt>Submitted</dt>
              <dd>
                <LeaveDate value={row.created_at} />
              </dd>
              <dt>Submitted by (account ID)</dt>
              <dd className="leave-id">{row.submitted_by}</dd>
              <dt>Reason</dt>
              <dd className="leave-prose">{row.reason}</dd>
            </dl>
          </div>
          <div className="leave-card">
            <h2>Recorded decision</h2>
            {row.status === 'pending' ? (
              <>
                <p>No decision has been recorded.</p>
                <div className="leave-actions">
                  <Button
                    onClick={() => setDecision({ key, status: 'approved' })}
                  >
                    Approve request
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => setDecision({ key, status: 'rejected' })}
                  >
                    Reject request
                  </Button>
                </div>
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
          <p>
            Dates include your browser’s local timezone. Approval does not
            record departure, return or attendance; entry/exit scans record
            presence.
          </p>
          {row.status === 'pending' && decision?.key === key && (
            <LeaveDecisionDialog
              key={`${key}:${decision.status}`}
              row={row}
              status={decision.status}
              uid={uid}
              onClose={() => setDecision(undefined)}
              onSaved={() => {
                setDecision(undefined);
                setNotice('Decision saved. Refreshing the request.');
                heading.current?.focus();
                refresh();
              }}
              onChecked={(fresh) => {
                setOverride({ key, row: fresh });
                setNotice(`Current request status: ${fresh.status}.`);
                if (fresh.status !== 'pending') {
                  setDecision(undefined);
                  heading.current?.focus();
                }
              }}
              onDenied={(failure) => {
                setDecision(undefined);
                setOverride({ key, error: failure });
              }}
            />
          )}
        </>
      )}
    </section>
  );
}
