import { useEffect, useRef, useState } from 'react';
import Button from '../../../shared/components/ui/Button';
import {
  emptyHistoryFilters,
  getOwnAttendance,
  historyPageSize,
  validateHistoryFilters,
} from '../api/own-attendance.api';
import type { HistoryFilters, OwnHistoryPage } from '../api/own-attendance.api';
import { isAccessError, portalError } from '../api/student-portal.api';
import type { StudentPortalError } from '../api/student-portal.api';

export default function OwnAttendanceHistory({
  uid,
  onAccessError,
}: {
  uid: string;
  onAccessError: (error: StudentPortalError) => void;
}) {
  const [draft, setDraft] = useState<HistoryFilters>(emptyHistoryFilters);
  const [validation, setValidation] = useState('');
  const [query, setQuery] = useState({
    filters: emptyHistoryFilters,
    offset: 0,
    attempt: 0,
  });
  const [result, setResult] = useState<{
    uid: string;
    query: typeof query;
    data?: OwnHistoryPage;
    error?: StudentPortalError;
  }>();
  const busy = useRef(true);
  const validationMessage = useRef<HTMLParagraphElement>(null);
  const outcome = useRef<HTMLDivElement>(null);
  const focusResult = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    busy.current = true;
    getOwnAttendance(uid, controller.signal, query.filters, query.offset)
      .then((data) => {
        if (!controller.signal.aborted) setResult({ uid, query, data });
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        const error = portalError(reason);
        setResult({ uid, query, error });
        if (isAccessError(error)) onAccessError(error);
      })
      .finally(() => {
        if (!controller.signal.aborted) busy.current = false;
      });
    return () => controller.abort();
  }, [uid, query, onAccessError]);
  useEffect(() => {
    if (validation) validationMessage.current?.focus();
  }, [validation]);
  const current =
    result?.uid === uid && result.query === query ? result : undefined;
  const pending = !current;
  const data = current?.data;
  const error = current?.error;
  const locked = pending || Boolean(error && isAccessError(error));
  useEffect(() => {
    if (current && focusResult.current) {
      focusResult.current = false;
      outcome.current?.focus();
    }
  }, [current]);
  function load(filters: HistoryFilters, offset = 0) {
    if (busy.current || locked) return;
    busy.current = true;
    focusResult.current = true;
    setValidation('');
    setQuery((previous) => ({
      filters,
      offset,
      attempt: previous.attempt + 1,
    }));
  }
  return (
    <section
      className="portal-card portal-history"
      aria-labelledby="own-history-title"
    >
      <p className="portal-kicker">Recorded movements</p>
      <h2 id="own-history-title">Attendance and movement history</h2>
      <p className="portal-muted">
        Your recorded hostel entries and exits, newest first. These records do
        not confirm your current location or grant permission to leave or enter.
      </p>
      <form
        className="portal-history-filters"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (busy.current || locked) return;
          const message = validateHistoryFilters(draft);
          setValidation(message);
          if (!message) load({ ...draft });
        }}
        aria-label="Filter your movements"
      >
        <label>
          From date
          <input
            type="date"
            min="0001-01-01"
            max="9998-12-31"
            value={draft.from}
            disabled={locked}
            onChange={(event) =>
              setDraft({ ...draft, from: event.target.value })
            }
            aria-describedby="history-filter-help"
          />
        </label>
        <label>
          To date
          <input
            type="date"
            min="0001-01-01"
            max="9998-12-31"
            value={draft.to}
            disabled={locked}
            onChange={(event) => setDraft({ ...draft, to: event.target.value })}
            aria-describedby="history-filter-help"
          />
        </label>
        <label>
          Direction
          <select
            value={draft.direction}
            disabled={locked}
            onChange={(event) =>
              setDraft({
                ...draft,
                direction: event.target.value as HistoryFilters['direction'],
              })
            }
          >
            <option value="">All movements</option>
            <option value="IN">Entry</option>
            <option value="OUT">Exit</option>
          </select>
        </label>
        <div className="portal-history-filter-actions">
          <Button type="submit" size="sm" disabled={locked}>
            Apply filters
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={locked}
            onClick={() => {
              setDraft(emptyHistoryFilters);
              load(emptyHistoryFilters);
            }}
          >
            Clear filters
          </Button>
        </div>
      </form>
      <p id="history-filter-help" className="portal-caption">
        Leave both dates empty for all history, or enter both dates for a range
        of up to 366 days. Dates include both endpoints in the hostel timezone
        shown with the results.
      </p>
      {validation && (
        <p ref={validationMessage} role="alert" tabIndex={-1}>
          {validation}
        </p>
      )}
      <div className="portal-actions">
        <Button
          size="sm"
          variant="secondary"
          disabled={locked}
          onClick={() => load(query.filters)}
        >
          {pending ? 'Loading history…' : 'Refresh history'}
        </Button>
      </div>
      <div
        ref={outcome}
        tabIndex={-1}
        aria-busy={pending}
        role="region"
        aria-label="Movement history results"
      >
        {pending && <p role="status">Loading your recorded movements…</p>}
        {error && (
          <div>
            <p role="alert">
              {error.kind === 'not-found'
                ? 'Your attendance history is unavailable. Your profile may be unlinked or archived. Contact your hostel administrator.'
                : error.message}
            </p>
            {!isAccessError(error) && (
              <Button
                size="sm"
                onClick={() => load(query.filters, query.offset)}
              >
                Retry history
              </Button>
            )}
          </div>
        )}
        {data && (
          <>
            <p className="portal-caption">
              Hostel timezone: <strong>{data.timezone}</strong>. Refresh returns
              to page 1 using the applied filters. New scans may shift records
              between pages.
            </p>
            <p role="status">
              {data.total} recorded movement{data.total === 1 ? '' : 's'}
              {query.filters.from || query.filters.direction
                ? ' matching your filters'
                : ''}
              .
              {data.items.length > 0 &&
                ` Showing ${data.offset + 1}–${data.offset + data.items.length}.`}
            </p>
            {!data.items.length ? (
              <p>
                {data.offset
                  ? 'No movements on this page. Use Previous or refresh history.'
                  : 'No recorded movements found. Try a different date range or clear the filters.'}
              </p>
            ) : (
              <div
                className="portal-history-table-wrap"
                role="region"
                aria-label="Your recorded movements"
                tabIndex={0}
              >
                <table className="portal-history-table">
                  <caption>
                    Hostel entry and exit history · {data.timezone}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Date and time</th>
                      <th scope="col">Movement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((row) => (
                      <tr key={row.movement_id}>
                        <td>
                          <time dateTime={row.occurred_at}>
                            {new Intl.DateTimeFormat(undefined, {
                              timeZone: data.timezone,
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            }).format(new Date(row.occurred_at))}
                          </time>
                        </td>
                        <td>
                          <span
                            className={`portal-movement portal-movement--${row.direction.toLowerCase()}`}
                          >
                            {row.direction === 'IN' ? 'Entry' : 'Exit'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <nav
              className="portal-history-pagination"
              aria-label="Movement history pages"
            >
              <Button
                size="sm"
                variant="secondary"
                disabled={data.offset === 0}
                onClick={() =>
                  load(
                    query.filters,
                    Math.max(0, data.offset - historyPageSize),
                  )
                }
              >
                Previous
              </Button>
              <span>Page {Math.floor(data.offset / historyPageSize) + 1}</span>
              <Button
                size="sm"
                variant="secondary"
                disabled={
                  !data.has_more || data.offset + historyPageSize > 1000000
                }
                onClick={() =>
                  load(query.filters, data.offset + historyPageSize)
                }
              >
                Next
              </Button>
            </nav>
            {data.has_more && data.offset + historyPageSize > 1000000 && (
              <p className="portal-caption">
                Narrow your date filters to view more movements.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
