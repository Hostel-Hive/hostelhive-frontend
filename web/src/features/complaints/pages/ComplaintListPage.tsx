import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Button from '../../../shared/components/ui/Button';
import Input from '../../../shared/components/ui/Input';
import { routePaths } from '../../../app/router/routePaths';
import useAuth from '../../auth/hooks/useAuth';
import {
  complaintCategories,
  complaintStatuses,
  listComplaints,
  statusLabel,
} from '../api/complaints.api';
import useComplaintRequest from '../hooks/useComplaintRequest';
import ComplaintRequestState from '../components/ComplaintRequestState';
import ComplaintDate from '../components/ComplaintDate';
function localDate(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return '';
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export default function ComplaintListPage() {
  const { account } = useAuth();
  const uid = account?.firebase_uid ?? '';
  const [params, setParams] = useSearchParams();
  const search = params.toString();
  const [formError, setFormError] = useState('');
  const load = useCallback(
    (signal: AbortSignal) =>
      listComplaints(new URLSearchParams(search), uid, signal),
    [search, uid],
  );
  const { data, error, retry } = useComplaintRequest(`${uid}:${search}`, load);
  const denied = error?.kind === 'session' || error?.kind === 'forbidden';
  function paginate(offset: number) {
    const next = new URLSearchParams(params);
    next.set('offset', String(offset));
    setParams(next);
  }
  return (
    <section className="complaint-page" aria-labelledby="complaints-title">
      <p className="eyebrow">Operations / Complaints</p>
      <h1 id="complaints-title">Complaints</h1>
      <p className="page-description">
        Track maintenance and disciplinary complaints. Date filters use your
        browser’s local timezone.
      </p>
      {!denied && (
        <form
          key={search}
          className="complaint-filters"
          onSubmit={(event) => {
            event.preventDefault();
            setFormError('');
            const form = new FormData(event.currentTarget);
            const next = new URLSearchParams();
            for (const key of ['status', 'category', 'student_id']) {
              const value = String(form.get(key) ?? '').trim();
              if (value) next.set(key, value);
            }
            for (const key of ['created_from', 'created_to']) {
              const value = String(form.get(key) ?? '');
              if (value) {
                const date = new Date(value);
                if (!Number.isFinite(date.getTime())) {
                  setFormError('Choose valid creation times.');
                  return;
                }
                next.set(key, date.toISOString());
              }
            }
            setParams(next);
          }}
        >
          <div>
            <label htmlFor="complaint-status">Status</label>
            <select
              id="complaint-status"
              className="ui-input"
              name="status"
              defaultValue={params.get('status') ?? ''}
            >
              <option value="">All statuses</option>
              {complaintStatuses.map((v) => (
                <option key={v} value={v}>
                  {statusLabel(v)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="complaint-category">Category</label>
            <select
              id="complaint-category"
              className="ui-input"
              name="category"
              defaultValue={params.get('category') ?? ''}
            >
              <option value="">All categories</option>
              {complaintCategories.map((v) => (
                <option key={v} value={v}>
                  {v === 'maintenance' ? 'Maintenance' : 'Disciplinary'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="complaint-student">Student ID (UUID)</label>
            <Input
              id="complaint-student"
              name="student_id"
              defaultValue={params.get('student_id') ?? ''}
            />
          </div>
          <div>
            <label htmlFor="complaint-from">Created from (inclusive)</label>
            <Input
              id="complaint-from"
              name="created_from"
              type="datetime-local"
              defaultValue={localDate(params.get('created_from'))}
            />
          </div>
          <div>
            <label htmlFor="complaint-to">Created before (exclusive)</label>
            <Input
              id="complaint-to"
              name="created_to"
              type="datetime-local"
              defaultValue={localDate(params.get('created_to'))}
            />
          </div>
          <Button type="submit">Apply filters</Button>
          <Button
            variant="secondary"
            onClick={() => {
              setFormError('');
              setParams(new URLSearchParams());
            }}
          >
            Clear filters
          </Button>
          <Button variant="ghost" onClick={retry}>
            Refresh complaints
          </Button>
          {formError && <p role="alert">{formError}</p>}
        </form>
      )}
      {!data || error ? (
        <ComplaintRequestState error={error} retry={retry} />
      ) : (
        <>
          {data.items.length === 0 ? (
            <p role="status" className="complaint-state">
              {data.offset
                ? 'No complaints on this page. Go to the previous page.'
                : [
                      'status',
                      'category',
                      'student_id',
                      'created_from',
                      'created_to',
                    ].some((k) => params.has(k))
                  ? 'No complaints match these filters.'
                  : 'No complaints yet.'}
            </p>
          ) : (
            <div
              className="complaint-table-wrap"
              role="region"
              aria-label="Complaint table"
              tabIndex={0}
            >
              <table>
                <caption>{data.total} complaints · newest first</caption>
                <thead>
                  <tr>
                    <th scope="col">Student</th>
                    <th scope="col">Category</th>
                    <th scope="col">Status</th>
                    <th scope="col">Created</th>
                    <th scope="col">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr key={row.complaint_id}>
                      <th scope="row" className="complaint-id">
                        {row.student_id}
                      </th>
                      <td>
                        {row.category === 'maintenance'
                          ? 'Maintenance'
                          : 'Disciplinary'}
                      </td>
                      <td>
                        <span
                          className={`complaint-badge complaint-badge--${row.status}`}
                        >
                          {statusLabel(row.status)}
                        </span>
                      </td>
                      <td>
                        <ComplaintDate value={row.created_at} />
                      </td>
                      <td>
                        <Link
                          aria-label={`View complaint ${row.complaint_id}`}
                          to={`${routePaths.complaints}/${row.complaint_id}${search ? `?${search}` : ''}`}
                        >
                          View complaint
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <nav
            className="complaint-pagination"
            aria-label="Complaint pagination"
          >
            <Button
              variant="secondary"
              disabled={!data.offset}
              onClick={() => paginate(Math.max(0, data.offset - 20))}
            >
              Previous
            </Button>
            <span>
              Page {Math.floor(data.offset / 20) + 1} · {data.total} complaints
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
