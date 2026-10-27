import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../../shared/components/ui/Button';
import { routePaths } from '../../../app/router/routePaths';
import {
  listOwnLeaves,
  ownLeaveError,
  leaveAccessError,
} from '../api/own-leave.api';
import type { OwnLeavePage, OwnLeaveError } from '../api/own-leave.api';
import type { LeaveStatus } from '../../leave/leave.types';
import type { StudentPortalError } from '../api/student-portal.api';
import LeaveDate from '../../leave/components/LeaveDate';

export interface OwnLeaveProps {
  uid: string;
  studentID: string;
  onAccessError: (error: StudentPortalError) => void;
}
export default function OwnLeaveList({
  uid,
  studentID,
  onAccessError,
}: OwnLeaveProps) {
  const [query, setQuery] = useState<{
    status: LeaveStatus | '';
    offset: number;
    attempt: number;
  }>({ status: '', offset: 0, attempt: 0 });
  const [result, setResult] = useState<{
    uid: string;
    studentID: string;
    query: typeof query;
    data?: OwnLeavePage;
    error?: OwnLeaveError;
  }>();
  const busy = useRef(true);
  useEffect(() => {
    const controller = new AbortController();
    busy.current = true;
    listOwnLeaves(uid, studentID, controller.signal, query.status, query.offset)
      .then((data) => {
        if (!controller.signal.aborted)
          setResult({ uid, studentID, query, data });
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        const error = ownLeaveError(reason);
        setResult({ uid, studentID, query, error });
        const access = leaveAccessError(error);
        if (access) onAccessError(access);
      })
      .finally(() => {
        if (!controller.signal.aborted) busy.current = false;
      });
    return () => controller.abort();
  }, [uid, studentID, query, onAccessError]);
  const current =
    result?.uid === uid &&
    result.studentID === studentID &&
    result.query === query
      ? result
      : undefined;
  const data = current?.data;
  const error = current?.error;
  const pending = !current;
  const locked = pending || Boolean(error && leaveAccessError(error));
  const summary = useRef<HTMLDivElement>(null);
  const focusResult = useRef(false);
  useEffect(() => {
    if (current && focusResult.current) {
      focusResult.current = false;
      summary.current?.focus();
    }
  }, [current]);
  function load(status = query.status, offset = 0) {
    if (busy.current || locked) return;
    busy.current = true;
    focusResult.current = true;
    setQuery((previous) => ({ status, offset, attempt: previous.attempt + 1 }));
  }
  return (
    <section className="portal-card" aria-labelledby="own-leave-list-title">
      <div className="portal-leave-toolbar portal-directory-heading">
        <h2 id="own-leave-list-title">My leave requests</h2>
        <Link
          className="ui-button ui-button--primary ui-button--sm"
          to={routePaths.ownLeaveNew}
        >
          New leave request
        </Link>
      </div>
      <p className="portal-muted">
        Request time away from the hostel and follow the staff decision.
        Approval does not record a departure or return; scans record your
        movements.
      </p>
      <div className="portal-leave-toolbar portal-directory-filters">
        <label className="portal-leave-status-filter">
          Status
          <select
            value={query.status}
            disabled={locked}
            onChange={(event) => load(event.target.value as LeaveStatus | '')}
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
        <Button
          size="sm"
          variant="secondary"
          disabled={locked}
          onClick={() => load()}
        >
          Refresh requests
        </Button>
      </div>
      <div
        ref={summary}
        role="region"
        tabIndex={-1}
        aria-label="Your leave request results"
        aria-busy={pending}
      >
        {pending && <p role="status">Loading your leave requests…</p>}
        {error && (
          <>
            <p role="alert">{error.message}</p>
            {!leaveAccessError(error) && (
              <Button
                size="sm"
                onClick={() => load(query.status, query.offset)}
              >
                Retry requests
              </Button>
            )}
          </>
        )}
        {data && (
          <>
            <p role="status">
              {data.total} request{data.total === 1 ? '' : 's'}
              {query.status ? ` with status ${query.status}` : ''}.
              {data.items.length > 0 &&
                ` Showing ${data.offset + 1}–${data.offset + data.items.length}.`}
            </p>
            {!data.items.length ? (
              <p>
                {data.offset
                  ? 'No requests on this page. Use Previous or refresh.'
                  : 'No leave requests found for this status.'}
              </p>
            ) : (
              <ul className="portal-leave-list">
                {data.items.map((row) => (
                  <li key={row.leave_id}>
                    <div>
                      <span
                        className={`portal-leave-badge portal-leave-badge--${row.status}`}
                      >
                        {row.status}
                      </span>
                      <h3 className="portal-request-link">
                        <Link to={`${routePaths.ownLeaves}/${row.leave_id}`}>
                          View request <span aria-hidden="true"> →</span>
                        </Link>
                      </h3>
                      <dl className="portal-request-dates">
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
                      <p className="portal-leave-reason-preview">
                        {row.reason}
                      </p>
                      <p className="portal-request-submitted">
                        Submitted <LeaveDate value={row.created_at} />
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <nav
              className="portal-history-pagination"
              aria-label="Leave request pages"
            >
              <Button
                size="sm"
                variant="secondary"
                disabled={data.offset === 0}
                onClick={() =>
                  load(query.status, Math.max(0, data.offset - 20))
                }
              >
                Previous
              </Button>
              <span>Page {Math.floor(data.offset / 20) + 1}</span>
              <Button
                size="sm"
                variant="secondary"
                disabled={
                  !data.has_more || data.offset > Number.MAX_SAFE_INTEGER - 40
                }
                onClick={() => load(query.status, data.offset + 20)}
              >
                Next
              </Button>
            </nav>
          </>
        )}
      </div>
      <p className="portal-caption">
        Times use your device timezone. Refresh returns to page 1 with the
        selected status.
      </p>
    </section>
  );
}
