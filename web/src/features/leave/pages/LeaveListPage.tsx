import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Button from '../../../shared/components/ui/Button';
import Input from '../../../shared/components/ui/Input';
import useAuth from '../../auth/hooks/useAuth';
import { routePaths } from '../../../app/router/routePaths';
import { listLeaves, leaveStatuses } from '../api/leave.api';
import useLeaveRequest from '../hooks/useLeaveRequest';
import LeaveRequestState from '../components/LeaveRequestState';
import LeaveDate from '../components/LeaveDate';
export default function LeaveListPage() {
  const { account } = useAuth();
  const [params, setParams] = useSearchParams();
  const search = params.toString();
  const uid = account?.firebase_uid ?? '';
  const load = useCallback(
    (signal: AbortSignal) =>
      listLeaves(new URLSearchParams(search), uid, signal),
    [search, uid],
  );
  const { data, error, retry } = useLeaveRequest(`${uid}:${search}`, load);
  const denied = error?.kind === 'session' || error?.kind === 'forbidden';
  function paginate(offset: number) {
    const next = new URLSearchParams(params);
    next.set('offset', String(offset));
    setParams(next);
  }
  return (
    <section className="leave-page" aria-labelledby="leave-list-title">
      <p className="eyebrow">Operations / Leave requests</p>
      <h1 id="leave-list-title">Leave requests</h1>
      <p className="page-description">
        Review extended leave requests and recorded decisions. Dates include
        your browser’s local timezone.
      </p>
      {!denied && (
        <form
          className="leave-filters"
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
            <label htmlFor="leave-status">Status</label>
            <select
              id="leave-status"
              name="status"
              className="ui-input"
              defaultValue={params.get('status') ?? ''}
            >
              <option value="">All statuses</option>
              {leaveStatuses.map((status) => (
                <option key={status} value={status}>
                  {status[0].toUpperCase() + status.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="leave-student">Student ID (UUID)</label>
            <Input
              id="leave-student"
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
        <LeaveRequestState error={error} retry={retry} />
      ) : (
        <>
          {data.items.length === 0 ? (
            <p className="leave-state" role="status">
              {data.offset
                ? 'No requests on this page. Go to the previous page.'
                : search
                  ? 'No leave requests match these filters.'
                  : 'No leave requests yet.'}
            </p>
          ) : (
            <div
              className="leave-table-wrap"
              role="region"
              aria-label="Leave request table"
              tabIndex={0}
            >
              <table>
                <caption>
                  {data.total} leave requests in this selection · newest first
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Student</th>
                    <th scope="col">Starts</th>
                    <th scope="col">Ends</th>
                    <th scope="col">Status</th>
                    <th scope="col">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr key={row.leave_id}>
                      <th scope="row" className="leave-id">
                        {row.student_id}
                      </th>
                      <td>
                        <LeaveDate value={row.starts_at} />
                      </td>
                      <td>
                        <LeaveDate value={row.ends_at} />
                      </td>
                      <td>
                        <span
                          className={`leave-badge leave-badge--${row.status}`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td>
                        <Link
                          to={`${routePaths.leaves}/${row.leave_id}${search ? `?${search}` : ''}`}
                          aria-label={`View leave request ${row.leave_id}`}
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
            aria-label="Leave request pagination"
            className="leave-pagination"
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
