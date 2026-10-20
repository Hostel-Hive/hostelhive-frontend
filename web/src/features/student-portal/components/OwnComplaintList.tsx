import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../../shared/components/ui/Button';
import { routePaths } from '../../../app/router/routePaths';
import {
  listOwnComplaints,
  ownComplaintError,
  complaintAccessError,
} from '../api/own-complaints.api';
import type { OwnComplaintError } from '../api/own-complaints.api';
import type {
  Complaint,
  ComplaintPage,
  ComplaintCategory,
  ComplaintStatus,
} from '../../complaints/complaints.types';
import type { StudentPortalError } from '../api/student-portal.api';
import ComplaintDate from '../../complaints/components/ComplaintDate';

export interface OwnComplaintProps {
  uid: string;
  studentID: string;
  onAccessError: (error: StudentPortalError) => void;
}
export default function OwnComplaintList({
  uid,
  studentID,
  onAccessError,
}: OwnComplaintProps) {
  const [query, setQuery] = useState<{
    status: ComplaintStatus | '';
    category: ComplaintCategory | '';
    offset: number;
    attempt: number;
  }>({ status: '', category: '', offset: 0, attempt: 0 });
  const [result, setResult] = useState<{
    uid: string;
    studentID: string;
    query: typeof query;
    data?: ComplaintPage<Complaint>;
    error?: OwnComplaintError;
  }>();
  const busy = useRef(true);
  useEffect(() => {
    const controller = new AbortController();
    busy.current = true;
    listOwnComplaints(
      uid,
      studentID,
      controller.signal,
      query.status,
      query.category,
      query.offset,
    )
      .then((data) => {
        if (!controller.signal.aborted)
          setResult({ uid, studentID, query, data });
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        const error = ownComplaintError(reason);
        setResult({ uid, studentID, query, error });
        const access = complaintAccessError(error);
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
  const locked = pending || Boolean(error && complaintAccessError(error));
  const summary = useRef<HTMLDivElement>(null);
  const focusResult = useRef(false);
  useEffect(() => {
    if (current && focusResult.current) {
      focusResult.current = false;
      summary.current?.focus();
    }
  }, [current]);
  function load(status = query.status, offset = 0, category = query.category) {
    if (busy.current || locked) return;
    busy.current = true;
    focusResult.current = true;
    setQuery((previous) => ({
      status,
      category,
      offset,
      attempt: previous.attempt + 1,
    }));
  }
  return (
    <section className="portal-card" aria-labelledby="own-complaint-list-title">
      <div className="portal-leave-toolbar">
        <h2 id="own-complaint-list-title">My complaints</h2>
        <Link
          className="ui-button ui-button--primary ui-button--sm"
          to={routePaths.ownComplaintNew}
        >
          New complaint
        </Link>
      </div>
      <p className="portal-muted">
        Report maintenance or disciplinary concerns and follow staff responses.
      </p>
      <div className="portal-leave-toolbar">
        <label className="portal-leave-status-filter">
          Status
          <select
            value={query.status}
            disabled={locked}
            onChange={(event) =>
              load(event.target.value as ComplaintStatus | '')
            }
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In progress</option>
            <option value="resolved">Resolved</option>
          </select>
        </label>
        <label className="portal-leave-status-filter">
          Category
          <select
            value={query.category}
            disabled={locked}
            onChange={(event) =>
              load(
                query.status,
                0,
                event.target.value as ComplaintCategory | '',
              )
            }
          >
            <option value="">All categories</option>
            <option value="maintenance">Maintenance</option>
            <option value="disciplinary">Disciplinary</option>
          </select>
        </label>
        <Button
          size="sm"
          variant="secondary"
          disabled={locked}
          onClick={() => load()}
        >
          Refresh complaints
        </Button>
      </div>
      <div
        ref={summary}
        role="region"
        tabIndex={-1}
        aria-label="Your complaint results"
        aria-busy={pending}
      >
        {pending && <p role="status">Loading your complaints…</p>}
        {error && (
          <>
            <p role="alert">{error.message}</p>
            {!complaintAccessError(error) && (
              <Button
                size="sm"
                onClick={() => load(query.status, query.offset, query.category)}
              >
                Retry complaints
              </Button>
            )}
          </>
        )}
        {data && (
          <>
            <p role="status">
              {data.total} complaint{data.total === 1 ? '' : 's'}
              {query.status ? ` with status ${query.status}` : ''}.
              {data.items.length > 0 &&
                ` Showing ${data.offset + 1}–${data.offset + data.items.length}.`}
            </p>
            {!data.items.length ? (
              <p>
                {data.offset
                  ? 'No complaints on this page. Use Previous or refresh.'
                  : 'No complaints match these filters.'}
              </p>
            ) : (
              <ul className="portal-leave-list">
                {data.items.map((row) => (
                  <li key={row.complaint_id}>
                    <div>
                      <span
                        className={`portal-leave-badge portal-leave-badge--${row.status}`}
                      >
                        {row.status.replace('_', ' ')}
                      </span>
                      <h3>
                        <Link
                          to={`${routePaths.ownComplaints}/${row.complaint_id}`}
                        >
                          View complaint{' '}
                          <span className="portal-caption">
                            · <ComplaintDate value={row.created_at} />
                          </span>
                        </Link>
                      </h3>
                      <p>
                        {row.category === 'maintenance'
                          ? 'Maintenance'
                          : 'Disciplinary'}
                      </p>
                      <p className="portal-leave-reason-preview">
                        {row.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <nav
              className="portal-history-pagination"
              aria-label="Complaint pages"
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
        selected filters.
      </p>
    </section>
  );
}
