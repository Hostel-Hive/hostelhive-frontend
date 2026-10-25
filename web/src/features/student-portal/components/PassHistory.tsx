import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Button from '../../../shared/components/ui/Button';
import { routePaths } from '../../../app/router/routePaths';
import {
  listOwnPasses,
  passHistoryQuery,
  passStatuses,
  type PassPage,
} from '../api/pass-history.api';
import {
  isAccessError,
  portalError,
  type StudentPortalError,
} from '../api/student-portal.api';
import '../../../styles/pass-history.css';
const date = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
export default function PassHistory({
  uid,
  studentID,
  onAccessError,
}: {
  uid: string;
  studentID: string;
  onAccessError: (error: StudentPortalError) => void;
}) {
  const [params, setParams] = useSearchParams();
  const search = params.toString();
  const query = passHistoryQuery(params);
  const [revision, setRevision] = useState(0);
  const [response, setResponse] = useState<{
    key: string;
    data?: PassPage;
    error?: StudentPortalError;
  }>();
  const summary = useRef<HTMLDivElement>(null);
  const focusResult = useRef(false);
  const key = `${uid}:${studentID}:${search}:${revision}`;
  const current = response?.key === key ? response : undefined;
  const data = query ? current?.data : undefined;
  const error = current?.error;
  const denied = Boolean(
    error && (isAccessError(error) || error.kind === 'not-found'),
  );
  const loading = Boolean(query && !current);
  useEffect(() => {
    const selection = passHistoryQuery(new URLSearchParams(search));
    if (!selection) return;
    const controller = new AbortController();
    void listOwnPasses(uid, studentID, selection, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResponse({ key, data });
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        const error = portalError(reason);
        setResponse({ key, error });
        if (isAccessError(error) || error.kind === 'not-found')
          onAccessError(error);
      });
    return () => controller.abort();
  }, [uid, studentID, search, revision, key, onAccessError]);
  useEffect(() => {
    if (current && focusResult.current) {
      focusResult.current = false;
      summary.current?.focus();
    }
  }, [current]);
  function change(field: 'type' | 'status', value: string) {
    const next = new URLSearchParams();
    if (query?.type) next.set('type', query.type);
    if (query?.status) next.set('status', query.status);
    if (value) next.set(field, value);
    else next.delete(field);
    focusResult.current = true;
    setParams(next);
  }
  function page(offset: number) {
    const next = new URLSearchParams(search);
    if (offset) next.set('offset', String(offset));
    else next.delete('offset');
    focusResult.current = true;
    setParams(next);
  }
  function refresh() {
    focusResult.current = true;
    page(0);
    setRevision((v) => v + 1);
  }
  return (
    <section
      className="portal-card pass-history"
      aria-labelledby="pass-history-title"
    >
      <div className="pass-history-heading">
        <div>
          <p className="eyebrow">Your request records</p>
          <h2 id="pass-history-title">My pass history</h2>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={loading || denied || !query}
          onClick={refresh}
        >
          Refresh history
        </Button>
      </div>
      <p className="pass-history-notice">
        Access requests and historical leave records, newest submission first.
        This history is read-only. Going Home declarations are not included.
      </p>
      <div className="pass-history-filters">
        <label>
          Request type
          <select
            value={query?.type ?? ''}
            disabled={denied}
            onChange={(event) => change('type', event.target.value)}
          >
            <option value="">All request types</option>
            <option value="late_access">Access requests</option>
            <option value="leave">Historical leave</option>
          </select>
        </label>
        <label>
          Status
          <select
            value={query?.status ?? ''}
            disabled={denied}
            onChange={(event) => change('status', event.target.value)}
          >
            <option value="">All statuses</option>
            {passStatuses.map((status) => (
              <option key={status} value={status}>
                {status[0].toUpperCase() + status.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="secondary"
          size="sm"
          disabled={denied}
          onClick={() => {
            focusResult.current = true;
            setParams(new URLSearchParams());
            setRevision((v) => v + 1);
          }}
        >
          Clear filters
        </Button>
      </div>
      <div
        ref={summary}
        role="region"
        aria-label="Pass history results"
        tabIndex={-1}
        aria-busy={loading}
      >
        {!query && (
          <p role="alert" className="pass-history-error">
            These history filters are invalid. Clear filters to load your
            records.
          </p>
        )}
        {loading && (
          <p role="status" className="pass-history-empty">
            Loading your pass history…
          </p>
        )}
        {error && (
          <div className="pass-history-error">
            <p role="alert">{error.message}</p>
            {!denied && (
              <Button size="sm" onClick={() => setRevision((v) => v + 1)}>
                Retry history
              </Button>
            )}
          </div>
        )}
        {data && (
          <>
            <p role="status" className="pass-history-count">
              {data.total} {data.total === 1 ? 'request' : 'requests'}
              {data.items.length > 0
                ? ` · Showing ${data.offset + 1}–${data.offset + data.items.length}`
                : ''}
            </p>
            {!data.items.length ? (
              <div className="pass-history-empty">
                <h3>No matching records</h3>
                <p>
                  {query?.type || query?.status
                    ? 'Choose another request type or status to view more history.'
                    : 'Your access requests and historical leave records will appear here.'}
                </p>
              </div>
            ) : (
              <ol className="pass-history-list">
                {data.items.map((row) => (
                  <li key={row.type + ':' + row.source_id}>
                    <article className="pass-history-record">
                      <div className="pass-record-heading">
                        <h3>
                          {row.type === 'leave'
                            ? 'Historical leave request'
                            : row.direction === 'IN'
                              ? 'Entry access request'
                              : 'Exit access request'}
                        </h3>
                        <div className="pass-record-badges">
                          <span
                            className={`pass-badge pass-badge-${row.status}`}
                          >
                            {row.status[0].toUpperCase() + row.status.slice(1)}
                          </span>
                          {row.consumed_at && (
                            <span className="pass-badge pass-badge-used">
                              Used
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="pass-history-reason">
                        {row.reason || 'No reason recorded.'}
                      </p>
                      <dl className="pass-record-details">
                        <div>
                          <dt>Submitted</dt>
                          <dd>
                            <time dateTime={row.created_at}>
                              {date(row.created_at)}
                            </time>
                          </dd>
                        </div>
                        {row.type === 'leave' ? (
                          <>
                            <div>
                              <dt>Starts</dt>
                              <dd>
                                <time dateTime={row.starts_at!}>
                                  {date(row.starts_at!)}
                                </time>
                              </dd>
                            </div>
                            <div>
                              <dt>Ends</dt>
                              <dd>
                                <time dateTime={row.ends_at!}>
                                  {date(row.ends_at!)}
                                </time>
                              </dd>
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <dt>Movement</dt>
                              <dd>
                                {row.direction === 'IN'
                                  ? 'Entry (IN)'
                                  : 'Exit (OUT)'}
                              </dd>
                            </div>
                            <div>
                              <dt>Expected time</dt>
                              <dd>
                                <time dateTime={row.expected_at!}>
                                  {date(row.expected_at!)}
                                </time>
                              </dd>
                            </div>
                          </>
                        )}
                        {row.decided_at && (
                          <div>
                            <dt>Decision recorded</dt>
                            <dd>
                              <time dateTime={row.decided_at}>
                                {date(row.decided_at)}
                              </time>
                            </dd>
                          </div>
                        )}
                        {row.cancelled_at && (
                          <div>
                            <dt>Cancelled</dt>
                            <dd>
                              <time dateTime={row.cancelled_at}>
                                {date(row.cancelled_at)}
                              </time>
                            </dd>
                          </div>
                        )}
                        {row.consumed_at && (
                          <div>
                            <dt>Used at scan</dt>
                            <dd>
                              <time dateTime={row.consumed_at}>
                                {date(row.consumed_at)}
                              </time>
                            </dd>
                          </div>
                        )}
                      </dl>
                      {row.decision_note && (
                        <p className="pass-decision-note">
                          <strong>Decision note:</strong> {row.decision_note}
                        </p>
                      )}
                      <div className="pass-record-footer">
                        {row.consumed_at && (
                          <p>
                            This approval has been used for a recorded scan.
                          </p>
                        )}
                        <Link
                          className="ui-button ui-button--secondary ui-button--sm"
                          to={`${row.type === 'leave' ? routePaths.ownLeaves : routePaths.ownLateAccess}/${row.source_id}`}
                        >
                          View original request{' '}
                          <span aria-hidden="true">↗</span>
                        </Link>
                      </div>
                    </article>
                  </li>
                ))}
              </ol>
            )}
            <div className="pass-history-pagination">
              <Button
                variant="secondary"
                size="sm"
                disabled={!data.offset}
                onClick={() => page(Math.max(0, data.offset - 20))}
              >
                Previous
              </Button>
              <span>Page {Math.floor(data.offset / 20) + 1}</span>
              <Button
                variant="secondary"
                size="sm"
                disabled={!data.has_more || data.offset >= 1000000}
                onClick={() => page(data.offset + 20)}
              >
                Next
              </Button>
            </div>
            <p className="pass-history-caption">
              Times use your device timezone. Used permissions remain Approved.
              Reading history does not change presence or use a permission.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
