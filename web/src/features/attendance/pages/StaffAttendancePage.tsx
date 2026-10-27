import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import useAuth from '../../auth/hooks/useAuth';
import Button from '../../../shared/components/ui/Button';
import { routePaths } from '../../../app/router/routePaths';
import { attendanceError } from '../api/student-attendance.api';
import type { AttendanceError } from '../api/student-attendance.api';
import {
  attendanceSearch,
  emptyIncidentFilters,
  getIncident,
  getPresenceSummary,
  listIncidents,
  listPresence,
  validateIncidentFilters,
} from '../api/staff-attendance.api';
import type { IncidentFilters } from '../api/staff-attendance.api';
import useStaffAttendanceRead from '../hooks/useStaffAttendanceRead';
import LiveAttendance from '../components/LiveAttendance';
import '../../../styles/staff-attendance.css';

type View = 'dashboard' | 'incidents' | 'incident';
type Reader = { uid: string; denied: (error: AttendanceError) => void };
export default function StaffAttendancePage({
  view = 'dashboard',
  title = 'Attendance dashboard',
}: {
  view?: View;
  title?: string;
}) {
  const { account } = useAuth();
  const { incidentID = '' } = useParams();
  const [params] = useSearchParams();
  if (!account || (account.role !== 'admin' && account.role !== 'warden'))
    return <p role="alert">Admin or Warden access is required.</p>;
  return (
    <Workspace
      key={`${account.firebase_uid}:${account.role}:${view}:${incidentID}:${params}`}
      uid={account.firebase_uid}
      view={view}
      title={title}
      incidentID={incidentID}
      studentID={params.get('student_id') ?? ''}
    />
  );
}
function Workspace({
  uid,
  view,
  title,
  incidentID,
  studentID,
}: {
  uid: string;
  view: View;
  title: string;
  incidentID: string;
  studentID: string;
}) {
  const { retry, signOut } = useAuth();
  const [error, setError] = useState<AttendanceError>();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <section className="staff-attendance">
      <p className="eyebrow">Staff / Attendance</p>
      <h1 ref={heading} tabIndex={-1}>
        {view === 'dashboard'
          ? title
          : view === 'incidents'
            ? 'Attendance incidents'
            : 'Attendance incident'}
      </h1>
      <p className="page-description">
        Read-only scanner records. Recorded presence is the last accepted
        movement, not a guarantee of physical location. UNKNOWN does not mean
        outside.
      </p>
      <nav
        className="staff-attendance-navigation"
        aria-label="Attendance navigation"
      >
        <Link
          to={routePaths.attendance}
          aria-current={view === 'dashboard' ? 'page' : undefined}
        >
          Presence dashboard
        </Link>
        <Link
          to={routePaths.attendanceIncidents}
          aria-current={view !== 'dashboard' ? 'page' : undefined}
        >
          Attendance incidents
        </Link>
      </nav>
      {error ? (
        <section className="staff-attendance-card">
          <p role="alert">{error.message}</p>
          <div className="staff-attendance-toolbar">
            <Button
              size="sm"
              onClick={() => void retry().then(() => setError(undefined))}
            >
              Verify account access
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void signOut()}
            >
              Sign in again
            </Button>
          </div>
        </section>
      ) : view === 'dashboard' ? (
        <PresenceDashboard uid={uid} denied={setError} />
      ) : view === 'incidents' ? (
        <IncidentList
          uid={uid}
          denied={setError}
          initialStudentID={studentID}
        />
      ) : (
        <IncidentDetail uid={uid} denied={setError} id={incidentID} />
      )}
    </section>
  );
}
function ReadState({
  error,
  retry,
  pending,
}: {
  error?: AttendanceError;
  retry: () => void;
  pending: boolean;
}) {
  return pending ? (
    <p role="status">Loading attendance data…</p>
  ) : error ? (
    <div>
      <p role="alert">{error.message}</p>
      <Button size="sm" onClick={retry}>
        Retry attendance
      </Button>
    </div>
  ) : null;
}
function Time({ value }: { value: string | null }) {
  return value ? (
    <time dateTime={value}>
      {new Date(value).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })}
    </time>
  ) : (
    <>No recorded movement</>
  );
}
function Pages({
  offset,
  more,
  pending,
  onPage,
}: {
  offset: number;
  more: boolean;
  pending: boolean;
  onPage: (n: number) => void;
}) {
  return (
    <nav
      className="staff-attendance-toolbar staff-attendance-pagination"
      aria-label="Attendance pages"
    >
      <Button
        size="sm"
        variant="secondary"
        disabled={!offset || pending}
        onClick={() => onPage(Math.max(0, offset - 20))}
      >
        Previous
      </Button>
      <span>Page {offset / 20 + 1}</span>
      <Button
        size="sm"
        variant="secondary"
        disabled={!more || pending || offset >= 1000000}
        onClick={() => onPage(offset + 20)}
      >
        Next
      </Button>
    </nav>
  );
}
function PresenceDashboard({ uid, denied }: Reader) {
  const [revision, setRevision] = useState(0);
  const liveUpdate = useCallback(() => setRevision((n) => n + 1), []);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [applied, setApplied] = useState({ query: '', status: '' });
  const [offset, setOffset] = useState(0);
  const [validation, setValidation] = useState('');
  const load = useCallback(
    async (signal: AbortSignal) => {
      const [summary, list] = await Promise.all([
        getPresenceSummary(uid, signal, applied.query),
        listPresence(uid, signal, applied.query, applied.status, offset),
      ]);
      return { summary, list };
    },
    [uid, applied, offset],
  );
  const request = useStaffAttendanceRead(
    `${uid}:${JSON.stringify(applied)}:${offset}`,
    load,
    denied,
    revision,
  );
  const region = useRef<HTMLDivElement>(null);
  const focus = useRef(false);
  useEffect(() => {
    if (!request.pending && focus.current) {
      focus.current = false;
      region.current?.focus();
    }
  }, [request.pending]);
  function apply(e: FormEvent) {
    e.preventDefault();
    try {
      const query = attendanceSearch(search);
      setValidation('');
      setApplied({ query, status });
      setOffset(0);
      request.retry();
      focus.current = true;
    } catch (error) {
      setValidation(attendanceError(error).message);
    }
  }
  function refresh() {
    setOffset(0);
    request.retry();
    focus.current = true;
  }
  return (
    <section
      className="staff-attendance-card"
      aria-labelledby="presence-list-title"
    >
      <div className="staff-attendance-toolbar">
        <h2 id="presence-list-title">Student presence</h2>
        <Button
          size="sm"
          variant="secondary"
          disabled={request.pending}
          onClick={refresh}
        >
          Refresh attendance
        </Button>
      </div>
      <LiveAttendance uid={uid} onUpdate={liveUpdate} denied={denied} />
      {request.refreshing && <p role="status">Updating attendance records…</p>}
      <form className="staff-attendance-filters" onSubmit={apply}>
        <label>
          Search name or Student ID
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-describedby="attendance-search-help"
          />
        </label>
        <label>
          Recorded status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option>IN</option>
            <option>OUT</option>
            <option>UNKNOWN</option>
          </select>
        </label>
        <Button size="sm" type="submit" disabled={request.pending}>
          Apply filters
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={request.pending}
          onClick={() => {
            setSearch('');
            setStatus('');
            setApplied({ query: '', status: '' });
            setOffset(0);
            setValidation('');
            request.retry();
            focus.current = true;
          }}
        >
          Clear filters
        </Button>
      </form>
      <p id="attendance-search-help" className="staff-attendance-caption">
        Search up to 200 characters. Counts cover active student accounts with
        non-archived profiles matching the applied search; the status filter
        applies only to the list.
      </p>
      {validation && <p role="alert">{validation}</p>}
      <div
        ref={region}
        tabIndex={-1}
        role="region"
        aria-label="Presence results"
        aria-busy={request.pending}
      >
        <ReadState {...request} retry={refresh} />
        {request.data && (
          <>
            <dl
              className="staff-attendance-summary"
              aria-label="Backend presence counts"
            >
              {(['total', 'in', 'out', 'unknown'] as const).map((key) => (
                <div key={key} className={`staff-summary--${key}`}>
                  <dt>
                    {key === 'total' ? 'Total students' : key.toUpperCase()}
                  </dt>
                  <dd>{request.data!.summary[key]}</dd>
                </div>
              ))}
            </dl>
            <p role="status">
              {request.data.list.total} students match the list filters.
              {request.data.list.items.length > 0 &&
                ` Showing ${offset + 1}–${offset + request.data.list.items.length}.`}
            </p>
            {request.data.list.items.length ? (
              <div
                className="staff-attendance-table"
                role="region"
                aria-label="Student presence table"
                tabIndex={0}
              >
                <table>
                  <caption>Last recorded student presence</caption>
                  <thead>
                    <tr>
                      <th scope="col">Student</th>
                      <th scope="col">Recorded status</th>
                      <th scope="col">Last movement</th>
                      <th scope="col">Incidents</th>
                    </tr>
                  </thead>
                  <tbody>
                    {request.data.list.items.map((row) => (
                      <tr key={row.student_id}>
                        <th scope="row">
                          <div className="staff-attendance-identity">
                            <span
                              className="staff-attendance-avatar"
                              aria-hidden="true"
                            >
                              {row.full_name
                                .trim()
                                .split(/\s+/)
                                .slice(0, 2)
                                .map((part) => part[0])
                                .join('')
                                .toUpperCase()}
                            </span>
                            <div>
                              <Link
                                to={`${routePaths.students}/${row.student_id}`}
                              >
                                {row.full_name}
                              </Link>
                              <span className="staff-attendance-caption">
                                {row.index_no}
                              </span>
                            </div>
                          </div>
                        </th>
                        <td>
                          <span
                            className={`staff-presence staff-presence--${row.status.toLowerCase()}`}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td>
                          <Time value={row.updated_at} />
                        </td>
                        <td>
                          <Link
                            className="staff-attendance-link"
                            to={`${routePaths.attendanceIncidents}?student_id=${row.student_id}`}
                            aria-label={`View incidents for ${row.full_name}`}
                          >
                            View incidents
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>
                {offset
                  ? 'No students on this page. Use Previous or refresh.'
                  : 'No students match these filters.'}
              </p>
            )}
            <Pages
              offset={offset}
              more={request.data.list.has_more}
              pending={request.pending}
              onPage={(n) => {
                setOffset(n);
                focus.current = true;
              }}
            />
          </>
        )}
      </div>
      <p className="staff-attendance-caption">
        Refresh reloads counts and the list together from page 1. They are
        separate backend snapshots and can differ briefly during scanner
        activity. Name/Student ID order. Movement times use your device timezone
        ({Intl.DateTimeFormat().resolvedOptions().timeZone}).
      </p>
    </section>
  );
}
const incidentLabel = (type: string) =>
  type === 'early_exit'
    ? 'Early exit without permission'
    : 'Late entry without permission';
function IncidentList({
  uid,
  denied,
  initialStudentID,
}: Reader & { initialStudentID: string }) {
  const initial = { ...emptyIncidentFilters, studentID: initialStudentID };
  const [draft, setDraft] = useState<IncidentFilters>(initial);
  const [filters, setFilters] = useState<IncidentFilters>(initial);
  const [offset, setOffset] = useState(0);
  const [validation, setValidation] = useState('');
  const load = useCallback(
    (signal: AbortSignal) => listIncidents(uid, signal, filters, offset),
    [uid, filters, offset],
  );
  const request = useStaffAttendanceRead(
    `${uid}:${JSON.stringify(filters)}:${offset}`,
    load,
    denied,
  );
  const region = useRef<HTMLDivElement>(null);
  const focus = useRef(false);
  useEffect(() => {
    if (!request.pending && focus.current) {
      focus.current = false;
      region.current?.focus();
    }
  }, [request.pending]);
  function refresh() {
    setOffset(0);
    request.retry();
    focus.current = true;
  }
  function apply(e: FormEvent) {
    e.preventDefault();
    try {
      setFilters(validateIncidentFilters(draft));
      setOffset(0);
      request.retry();
      setValidation('');
      focus.current = true;
    } catch (error) {
      setValidation(attendanceError(error).message);
    }
  }
  return (
    <section
      className="staff-attendance-card"
      aria-labelledby="incident-list-title"
    >
      <div className="staff-attendance-toolbar">
        <h2 id="incident-list-title">Recorded incidents</h2>
        <Button
          size="sm"
          variant="secondary"
          disabled={request.pending}
          onClick={refresh}
        >
          Refresh incidents
        </Button>
      </div>
      <form
        onSubmit={apply}
        className="staff-attendance-filters staff-incident-filters"
      >
        <label>
          Student profile ID
          <input
            placeholder="All students (optional UUID)"
            value={draft.studentID}
            onChange={(e) => setDraft({ ...draft, studentID: e.target.value })}
            aria-describedby="incident-filter-help"
          />
        </label>
        <label>
          Direction
          <select
            value={draft.direction}
            onChange={(e) =>
              setDraft({
                ...draft,
                direction: e.target.value as IncidentFilters['direction'],
              })
            }
          >
            <option value="">All directions</option>
            <option>IN</option>
            <option>OUT</option>
          </select>
        </label>
        <label>
          Incident type
          <select
            value={draft.type}
            onChange={(e) =>
              setDraft({
                ...draft,
                type: e.target.value as IncidentFilters['type'],
              })
            }
          >
            <option value="">All types</option>
            <option value="early_exit">Early exit</option>
            <option value="late_entry">Late entry</option>
          </select>
        </label>
        <div className="staff-incident-filter-actions">
          <Button type="submit" size="sm" disabled={request.pending}>
            Apply filters
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={request.pending}
            onClick={() => {
              setDraft(emptyIncidentFilters);
              setFilters(emptyIncidentFilters);
              setOffset(0);
              setValidation('');
              request.retry();
              focus.current = true;
            }}
          >
            Clear filters
          </Button>
        </div>
      </form>
      <p id="incident-filter-help" className="staff-attendance-caption">
        Optional profile UUID. Use View incidents in the presence list to select
        a student. These are retained historical incidents, not unresolved
        cases.
      </p>
      {validation && <p role="alert">{validation}</p>}
      <div
        ref={region}
        tabIndex={-1}
        role="region"
        aria-label="Incident results"
        aria-busy={request.pending}
      >
        <ReadState {...request} retry={refresh} />
        {request.data && (
          <>
            <div className="staff-incident-results-heading">
              <p role="status">
                {request.data.total} incidents.
                {request.data.items.length > 0 &&
                  ` Showing ${offset + 1}–${offset + request.data.items.length}.`}
              </p>
              <span>Newest first</span>
            </div>
            {request.data.items.length ? (
              <ul className="staff-incident-list">
                {request.data.items.map((row) => (
                  <li key={row.incident_id} className="staff-incident-card">
                    <div className="staff-incident-card-heading">
                      <svg
                        className="staff-incident-icon"
                        aria-hidden="true"
                        width="40"
                        height="40"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" />
                      </svg>
                      <h3>
                        <Link
                          to={`${routePaths.attendanceIncidents}/${row.incident_id}`}
                        >
                          {incidentLabel(row.incident_type)}
                        </Link>
                      </h3>
                    </div>
                    <p className="staff-incident-meta">
                      <span
                        className={`staff-presence staff-presence--${row.direction.toLowerCase()}`}
                      >
                        {row.direction}
                      </span>
                      <Time value={row.occurred_at} />
                    </p>
                    <details className="staff-incident-reference">
                      <summary>Record references</summary>
                      <p className="staff-attendance-caption">
                        Student reference: {row.student_id}
                      </p>
                      <p className="staff-attendance-caption">
                        Incident reference: {row.incident_id}
                      </p>
                    </details>
                    <div className="staff-incident-card-actions">
                      <Link
                        className="staff-attendance-link"
                        to={`${routePaths.attendanceIncidents}/${row.incident_id}`}
                        aria-label={`View incident: ${incidentLabel(row.incident_type)}`}
                      >
                        View incident <span aria-hidden="true">↗</span>
                      </Link>
                      <Link
                        className="staff-incident-student-link"
                        to={`${routePaths.students}/${row.student_id}`}
                      >
                        View student profile
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                {offset
                  ? 'No incidents on this page. Use Previous or refresh.'
                  : 'No incidents match these filters.'}
              </p>
            )}
            <Pages
              offset={offset}
              more={request.data.has_more}
              pending={request.pending}
              onPage={(n) => {
                setOffset(n);
                focus.current = true;
              }}
            />
          </>
        )}
      </div>
      <p className="staff-attendance-caption">
        Newest event first. Times above use your device timezone (
        {Intl.DateTimeFormat().resolvedOptions().timeZone}). Open an incident to
        view its recorded policy snapshot. No resolution or attendance editing
        is available.
      </p>
    </section>
  );
}
const clock = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
function policyTime(value: string, zone: string) {
  try {
    return new Date(value).toLocaleString(undefined, {
      timeZone: zone,
      dateStyle: 'medium',
      timeStyle: 'long',
    });
  } catch {
    return `${new Date(value).toLocaleString()} (device time; stored timezone cannot be formatted)`;
  }
}
function IncidentDetail({ uid, denied, id }: Reader & { id: string }) {
  const load = useCallback(
    (signal: AbortSignal) => getIncident(id, uid, signal),
    [uid, id],
  );
  const request = useStaffAttendanceRead(`${uid}:${id}`, load, denied);
  const row = request.data;
  return (
    <section
      className="staff-attendance-card"
      aria-labelledby="incident-detail-title"
    >
      <div className="staff-attendance-toolbar">
        <h2 id="incident-detail-title">Incident details</h2>
        <Button
          size="sm"
          variant="secondary"
          disabled={request.pending}
          onClick={request.retry}
        >
          Refresh incident
        </Button>
      </div>
      <ReadState {...request} />
      {row && (
        <>
          <h3>{incidentLabel(row.incident_type)}</h3>
          <p className="staff-incident-explanation">
            This scanner-recorded movement had no matching permission under the
            policy below. This record does not establish the student’s current
            location or a disciplinary outcome.
          </p>
          <dl className="staff-incident-details">
            {[
              ['Incident reference', row.incident_id],
              ['Direction', row.direction],
              [
                'Occurred (recorded hostel timezone)',
                policyTime(row.occurred_at, row.hostel_timezone),
              ],
              ['Recorded hostel timezone', row.hostel_timezone],
              ['Exit opening time', clock(row.exit_opening_minute)],
              ['Entry deadline', clock(row.entry_deadline_minute)],
              [
                'Permission matching window',
                `±${row.permission_window_seconds / 60} minutes around expected movement time`,
              ],
              ['Student profile reference', row.student_id],
              ['Scanner reference', row.device_id],
              ['Event reference', row.event_id],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="staff-attendance-caption">
            These policy values were saved with this incident. They may differ
            from current settings. Scanner and event references identify the
            original recorded movement.
          </p>
          <Link
            className="staff-attendance-link"
            to={`${routePaths.students}/${row.student_id}`}
          >
            View student profile
          </Link>
        </>
      )}
    </section>
  );
}
