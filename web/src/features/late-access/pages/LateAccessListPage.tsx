import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Button from '../../../shared/components/ui/Button';
import Input from '../../../shared/components/ui/Input';
import useAuth from '../../auth/hooks/useAuth';
import { routePaths } from '../../../app/router/routePaths';
import {
  listLateAccessRequests,
  lateAccessStatuses,
} from '../api/late-access.api';
import useLateAccessRequest from '../hooks/useLateAccessRequest';
import LateAccessRequestState from '../components/LateAccessRequestState';
import LateAccessDate from '../components/LateAccessDate';
export default function LateAccessListPage() {
  const { account } = useAuth();
  const [params, setParams] = useSearchParams();
  const search = params.toString();
  const uid = account?.firebase_uid ?? '';
  const load = useCallback(
    (signal: AbortSignal) =>
      listLateAccessRequests(new URLSearchParams(search), uid, signal),
    [search, uid],
  );
  const { data, error, retry } = useLateAccessRequest(`${uid}:${search}`, load);
  const denied = error?.kind === 'session' || error?.kind === 'forbidden';
  function paginate(offset: number) {
    const next = new URLSearchParams(params);
    next.set('offset', String(offset));
    setParams(next);
  }
  return (
    <section
      className="late-access-page"
      aria-labelledby="late-access-list-title"
    >
      <p className="eyebrow">Operations / Access requests</p>
      <h1 id="late-access-list-title">Access requests</h1>
      <p className="page-description">
        Review early-exit and late-entry requests and recorded decisions. Dates
        include your browser’s local timezone.
      </p>
      {!denied && (
        <form
          className="late-access-filters"
          key={search}
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const next = new URLSearchParams();
            for (const key of ['status', 'student_id']) {
              const value = String(form.get(key) ?? '').trim();
              if (value) next.set(key, value);
            }
            setParams(next);
          }}
        >
          <div>
            <label htmlFor="late-access-status">Status</label>
            <select
              id="late-access-status"
              name="status"
              className="ui-input"
              defaultValue={params.get('status') ?? ''}
            >
              <option value="">All statuses</option>
              {lateAccessStatuses.map((status) => (
                <option key={status} value={status}>
                  {status[0].toUpperCase() + status.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="late-access-student">Student ID (UUID)</label>
            <Input
              id="late-access-student"
              name="student_id"
              defaultValue={params.get('student_id') ?? ''}
              placeholder="Student profile UUID"
            />
          </div>
          <Button type="submit">Apply filters</Button>
          <Button
            variant="secondary"
            onClick={() => setParams(new URLSearchParams())}
          >
            Clear filters
          </Button>
          <Button variant="ghost" onClick={retry}>
            Refresh requests
          </Button>
        </form>
      )}
      {!data || error ? (
        <LateAccessRequestState error={error} retry={retry} />
      ) : (
        <>
          {data.items.length === 0 ? (
            <p className="late-access-state" role="status">
              {data.offset
                ? 'No requests on this page. Go to the previous page.'
                : params.has('status') || params.has('student_id')
                  ? 'No access requests match these filters.'
                  : 'No access requests yet.'}
            </p>
          ) : (
            <div
              className="late-access-table-wrap"
              role="region"
              aria-label="Access request table"
              tabIndex={0}
            >
              <table>
                <caption>
                  {data.total} access requests in this selection · newest first
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Student</th>
                    <th scope="col">Movement</th>
                    <th scope="col">Expected time</th>
                    <th scope="col">Status</th>
                    <th scope="col">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr key={row.late_access_id}>
                      <th scope="row" className="late-access-id">
                        {row.student_id}
                      </th>
                      <td>
                        {row.direction === 'IN'
                          ? 'Late entry (IN)'
                          : 'Early exit (OUT)'}
                      </td>
                      <td>
                        <LateAccessDate value={row.expected_at} />
                      </td>
                      <td>
                        <span
                          className={`late-access-badge late-access-badge--${row.status}`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td>
                        <Link
                          to={`${routePaths.lateAccess}/${row.late_access_id}${search ? `?${search}` : ''}`}
                          aria-label={`View access request ${row.late_access_id}`}
                        >
                          View request
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <nav
            aria-label="Access request pagination"
            className="late-access-pagination"
          >
            <Button
              variant="secondary"
              disabled={data.offset === 0}
              onClick={() => paginate(Math.max(0, data.offset - 20))}
            >
              Previous
            </Button>
            <span>
              Page {Math.floor(data.offset / 20) + 1} · {data.total} requests
            </span>
            <Button
              variant="secondary"
              disabled={
                !data.has_more || data.offset > Number.MAX_SAFE_INTEGER - 40
              }
              onClick={() => paginate(data.offset + 20)}
            >
              Next
            </Button>
          </nav>
        </>
      )}
    </section>
  );
}
