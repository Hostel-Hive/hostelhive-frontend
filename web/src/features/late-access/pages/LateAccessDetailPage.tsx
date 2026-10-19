import { useCallback, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { routePaths } from '../../../app/router/routePaths';
import Button from '../../../shared/components/ui/Button';
import useAuth from '../../auth/hooks/useAuth';
import {
  getLateAccess,
  lateAccessFilters,
  type LateAccessError,
} from '../api/late-access.api';
import type {
  LateAccessDecision,
  LateAccessRequest,
} from '../late-access.types';
import useLateAccessRequest from '../hooks/useLateAccessRequest';
import LateAccessRequestState from '../components/LateAccessRequestState';
import LateAccessDate from '../components/LateAccessDate';
import LateAccessDecisionDialog from '../components/LateAccessDecisionDialog';
export default function LateAccessDetailPage() {
  const { lateAccessID = '' } = useParams();
  const { account } = useAuth();
  const [params] = useSearchParams();
  const uid = account?.firebase_uid ?? '';
  const key = `${uid}:${lateAccessID}`;
  const load = useCallback(
    (signal: AbortSignal) => getLateAccess(lateAccessID, uid, signal),
    [lateAccessID, uid],
  );
  const request = useLateAccessRequest(key, load);
  const [override, setOverride] = useState<{
    key: string;
    row?: LateAccessRequest;
    error?: LateAccessError;
  }>();
  const [decision, setDecision] = useState<{
    key: string;
    status: LateAccessDecision;
  }>();
  const [notice, setNotice] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const current = override?.key === key ? override : undefined;
  const error = current?.error ?? request.error;
  const row = !error ? (current?.row ?? request.data) : undefined;
  let back = routePaths.lateAccess as string;
  try {
    const filters = lateAccessFilters(params);
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
    <section
      className="late-access-page"
      aria-labelledby="late-access-detail-title"
    >
      <Link className="late-access-back" to={back}>
        Back to access requests
      </Link>
      <p className="eyebrow">Operations / Access request</p>
      <h1 id="late-access-detail-title" ref={heading} tabIndex={-1}>
        Access request details
      </h1>
      {notice && <p role="status">{notice}</p>}
      {!row || error ? (
        <LateAccessRequestState error={error} retry={refresh} />
      ) : (
        <>
          <div className="late-access-toolbar">
            <span
              className={`late-access-badge late-access-badge--${row.status}`}
            >
              {row.status}
            </span>
            <Button variant="secondary" onClick={refresh}>
              Refresh request
            </Button>
          </div>
          <div className="late-access-card">
            <h2>Request</h2>
            <dl className="late-access-details">
              <dt>Access request ID</dt>
              <dd className="late-access-id">{row.late_access_id}</dd>
              <dt>Student ID</dt>
              <dd className="late-access-id">{row.student_id}</dd>
              <dt>Movement</dt>
              <dd>
                {row.direction === 'IN'
                  ? 'Late entry (IN)'
                  : 'Early exit (OUT)'}
              </dd>
              <dt>Expected time</dt>
              <dd>
                <LateAccessDate value={row.expected_at} />
              </dd>
              <dt>Submitted</dt>
              <dd>
                <LateAccessDate value={row.created_at} />
              </dd>
              <dt>Submitted by (account ID)</dt>
              <dd className="late-access-id">{row.submitted_by}</dd>
              <dt>Reason</dt>
              <dd className="late-access-prose">{row.reason}</dd>
            </dl>
          </div>
          <div className="late-access-card">
            <h2>Recorded decision</h2>
            {row.status === 'pending' ? (
              <>
                <p>No decision has been recorded.</p>
                <div className="late-access-actions">
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
              <dl className="late-access-details">
                <dt>Decision</dt>
                <dd>{row.status}</dd>
                <dt>Decided at</dt>
                <dd>
                  <LateAccessDate value={row.decided_at!} />
                </dd>
                <dt>Decided by (account ID)</dt>
                <dd className="late-access-id">{row.decided_by}</dd>
                <dt>Decision note</dt>
                <dd className="late-access-prose">
                  {row.decision_note || 'No note provided.'}
                </dd>
              </dl>
            )}
          </div>
          {row.status === 'approved' && (
            <div className="late-access-card">
              <h2>Recorded permission use</h2>
              {row.consumed_at ? (
                <dl className="late-access-details">
                  <dt>Used at</dt>
                  <dd>
                    <LateAccessDate value={row.consumed_at} />
                  </dd>
                  <dt>Scanner device reference</dt>
                  <dd className="late-access-id">{row.consumed_device_id}</dd>
                  <dt>Scan event reference</dt>
                  <dd className="late-access-id">{row.consumed_event_id}</dd>
                </dl>
              ) : (
                <p>
                  No permission use is recorded in this response. This does not
                  guarantee that the permission is currently usable.
                </p>
              )}
            </div>
          )}
          <p>
            Dates include your browser’s local timezone. Approval does not
            record movement, mark permission used or operate a gate. Hostel
            policy and scan eligibility are checked by the backend.
          </p>
          {row.status === 'pending' && decision?.key === key && (
            <LateAccessDecisionDialog
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
