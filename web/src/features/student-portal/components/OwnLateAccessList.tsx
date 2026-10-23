import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../../shared/components/ui/Button';
import { routePaths } from '../../../app/router/routePaths';
import {
  listOwnLateAccess,
  ownLateAccessError,
  lateAccessAccountError,
} from '../api/own-late-access.api';
import type {
  OwnLateAccessPage,
  OwnLateAccessError,
} from '../api/own-late-access.api';
import type { LateAccessStatus } from '../../late-access/late-access.types';
import type { StudentPortalError } from '../api/student-portal.api';
import LeaveDate from '../../leave/components/LeaveDate';

export interface OwnLateAccessProps {
  uid: string;
  studentID: string;
  onAccessError: (error: StudentPortalError) => void;
}
export default function OwnLateAccessList({
  uid,
  studentID,
  onAccessError,
}: OwnLateAccessProps) {
  const [query, setQuery] = useState<{
    status: LateAccessStatus | '';
    offset: number;
    attempt: number;
  }>({ status: '', offset: 0, attempt: 0 });
  const [result, setResult] = useState<{
    uid: string;
    studentID: string;
    query: typeof query;
    data?: OwnLateAccessPage;
    error?: OwnLateAccessError;
  }>();
  const busy = useRef(true);
  useEffect(() => {
    const controller = new AbortController();
    busy.current = true;
    listOwnLateAccess(
      uid,
      studentID,
      controller.signal,
      query.status,
      query.offset,
    )
      .then((data) => {
        if (!controller.signal.aborted)
          setResult({ uid, studentID, query, data });
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        const error = ownLateAccessError(reason);
        setResult({ uid, studentID, query, error });
        const access = lateAccessAccountError(error);
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
  const locked = pending || Boolean(error && lateAccessAccountError(error));
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
    <section className="portal-card" aria-labelledby="own-access-list-title">
      <div className="portal-leave-toolbar portal-directory-heading">
        <h2 id="own-access-list-title">My access requests</h2>
        <Link
          className="ui-button ui-button--primary ui-button--sm"
          to={routePaths.ownLateAccessNew}
        >
          New access request
        </Link>
      </div>
      <p className="portal-muted">
        Request permission for an early exit or late entry and follow the staff
        decision. Only scans record your actual movements.
      </p>
      <div className="portal-leave-toolbar portal-directory-filters">
        <label className="portal-leave-status-filter">
          Status
          <select
            value={query.status}
            disabled={locked}
            onChange={(event) =>
              load(event.target.value as LateAccessStatus | '')
            }
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
        aria-label="Your access request results"
        aria-busy={pending}
      >
        {pending && <p role="status">Loading your access requests…</p>}
        {error && (
          <>
            <p role="alert">{error.message}</p>
            {!lateAccessAccountError(error) && (
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
                  : 'No access requests found for this status.'}
              </p>
            ) : (
              <ul className="portal-leave-list">
                {data.items.map((row) => (
                  <li key={row.late_access_id}>
                    <div>
                      <span
                        className={`portal-leave-badge portal-leave-badge--${row.status}`}
                      >
                        {row.status}
                      </span>
                      <h3 className="portal-request-link">
                        <Link
                          to={`${routePaths.ownLateAccess}/${row.late_access_id}`}
                        >
                          View request <span aria-hidden="true"> →</span>
                        </Link>
                      </h3>
                      <dl className="portal-request-dates">
                        <div>
                          <dt>Movement</dt>
                          <dd>
                            {row.direction === 'IN'
                              ? 'Late entry'
                              : 'Early exit'}
                          </dd>
                        </div>
                        <div>
                          <dt>Expected time</dt>
                          <dd>
                            <LeaveDate value={row.expected_at} compact />
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
              aria-label="Access request pages"
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
