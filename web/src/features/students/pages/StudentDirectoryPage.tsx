import { useCallback, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { routePaths } from '../../../app/router/routePaths';
import Input from '../../../shared/components/ui/Input';
import Button from '../../../shared/components/ui/Button';
import useAuth from '../../auth/hooks/useAuth';
import { listStudents } from '../api/students.api';
import useStudentRequest from '../hooks/useStudentRequest';
import StudentRequestState from '../components/StudentRequestState';
import StudentRestoreDialog from '../components/StudentRestoreDialog';
import type { Student } from '../student.types';

export default function StudentDirectoryPage() {
  const location = useLocation();
  const { account } = useAuth();
  const [params, setParams] = useSearchParams();
  const search = params.toString();
  const uid = account?.firebase_uid ?? '';
  const archived = params.get('status') === 'archived';
  const [selected, setSelected] = useState<{ student: Student; uid: string }>();
  const [notice, setNotice] = useState<{ text: string; uid: string }>();
  const load = useCallback(
    (signal: AbortSignal) =>
      listStudents(new URLSearchParams(search), uid, signal),
    [search, uid],
  );
  const { data, error, retry } = useStudentRequest(
    `${uid}:${account?.role}:${search}`,
    load,
  );
  const filtered = ['q', 'faculty', 'year'].some((key) =>
    Boolean(params.get(key)),
  );
  function paginate(offset: number) {
    const next = new URLSearchParams(params);
    if (offset) next.set('offset', String(offset));
    else next.delete('offset');
    setParams(next);
  }
  return (
    <section
      className="students-page student-directory-page"
      aria-labelledby="students-title"
    >
      <div className="student-directory-heading">
        <div>
          <p className="eyebrow">Directory / Students</p>
          <h1 id="students-title">Students</h1>
          <p className="page-description">
            {archived
              ? 'Review archived profiles and restore eligible students to the current directory.'
              : 'Browse resident profiles and account status.'}
          </p>
        </div>
        <div className="student-directory-actions">
          <Link
            className="button-link"
            to={`${routePaths.students}/new${search ? `?${search}` : ''}`}
          >
            Add student
          </Link>
          {account?.role === 'admin' && (
            <Link
              className="button-link student-import-link"
              to={`${routePaths.studentImport}${search ? `?${search}` : ''}`}
            >
              Import CSV
            </Link>
          )}
        </div>
      </div>
      {account?.role === 'admin' && (
        <nav
          className="student-directory-tabs"
          aria-label="Student profile status"
        >
          {[
            ['current', 'Current students'],
            ['archived', 'Archived students'],
          ].map(([status, label]) => (
            <Button
              key={status}
              variant={
                archived === (status === 'archived') ? 'primary' : 'secondary'
              }
              aria-pressed={archived === (status === 'archived')}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.delete('offset');
                if (status === 'archived') next.set('status', 'archived');
                else next.delete('status');
                setParams(next);
              }}
            >
              {label}
            </Button>
          ))}
        </nav>
      )}
      {notice?.uid === uid && (
        <p role="status" className="student-restored-notice">
          {notice.text}
        </p>
      )}
      {account?.role === 'admin' &&
        location.state?.checkoutActor === uid &&
        [
          'Hostel stay ended successfully.',
          'Original checkout confirmed.',
        ].includes(location.state?.checkoutNotice) && (
          <p role="status" className="student-restored-notice">
            {location.state.checkoutNotice}
          </p>
        )}
      {location.state?.studentNotice === 'Student profile archived.' && (
        <p role="status">Student profile archived.</p>
      )}
      <div className="student-directory-panel">
        <form
          key={search}
          className="student-filters"
          onSubmit={(event) => {
            event.preventDefault();
            const values = new FormData(event.currentTarget);
            const next = new URLSearchParams();
            if (archived) next.set('status', 'archived');
            for (const key of ['q', 'faculty', 'year']) {
              const value = String(values.get(key) ?? '').trim();
              if (value) next.set(key, value);
            }
            setParams(next);
          }}
        >
          <div>
            <label htmlFor="student-search">Search students</label>
            <Input
              id="student-search"
              name="q"
              maxLength={200}
              defaultValue={params.get('q') ?? ''}
              placeholder="Name or student ID"
            />
          </div>
          <div>
            <label htmlFor="student-faculty">Faculty</label>
            <Input
              id="student-faculty"
              name="faculty"
              maxLength={120}
              defaultValue={params.get('faculty') ?? ''}
              placeholder="Faculty name"
            />
          </div>
          <div>
            <label htmlFor="student-year">Year</label>
            <select
              id="student-year"
              name="year"
              className="ui-input"
              defaultValue={params.get('year') ?? ''}
            >
              <option value="">All years</option>
              {Array.from({ length: 10 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  Year {i + 1}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit">Apply filters</Button>
          <Button
            variant="secondary"
            onClick={() =>
              setParams(
                new URLSearchParams(archived ? { status: 'archived' } : {}),
              )
            }
          >
            Clear filters
          </Button>
        </form>
        {!data || error ? (
          <StudentRequestState error={error} retry={retry} />
        ) : data.students.length === 0 ? (
          <p role="status" className="student-state">
            {filtered
              ? 'No students match these filters.'
              : data.offset
                ? 'No students on this page. Go to the previous page or clear filters.'
                : archived
                  ? 'No archived student profiles.'
                  : 'No student records yet.'}
          </p>
        ) : (
          <div
            className="student-table-wrap"
            role="region"
            aria-label="Student directory table"
            tabIndex={0}
          >
            <table className="student-table">
              <caption>
                Student directory — {data.students.length} profiles on this page
              </caption>
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  <th scope="col">Student ID</th>
                  <th scope="col">Faculty</th>
                  <th scope="col">Year</th>
                  <th scope="col">Account status</th>
                  <th scope="col">{archived ? 'Recovery' : 'Profile'}</th>
                </tr>
              </thead>
              <tbody>
                {data.students.map((student) => (
                  <tr key={student.student_id}>
                    <th scope="row">
                      <div className="student-directory-identity">
                        <span
                          className="student-directory-avatar"
                          aria-hidden="true"
                        >
                          {student.full_name
                            .trim()
                            .split(/\s+/)
                            .slice(0, 2)
                            .map((part) => part[0])
                            .join('')
                            .toUpperCase()}
                        </span>
                        <span>{student.full_name}</span>
                      </div>
                    </th>
                    <td className="student-id">{student.index_no}</td>
                    <td>{student.faculty || 'Not provided'}</td>
                    <td>{student.year}</td>
                    <td>
                      <span
                        className={`student-badge ${student.account_active ? 'student-badge--active' : ''}`}
                      >
                        <span
                          className="student-status-dot"
                          aria-hidden="true"
                        />
                        {student.account_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      {archived ? (
                        account?.role === 'admin' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setSelected({ student, uid })}
                            aria-label={`Restore ${student.full_name}`}
                          >
                            Restore profile
                          </Button>
                        )
                      ) : (
                        <Link
                          className="student-view-link"
                          to={`${routePaths.students}/${encodeURIComponent(student.student_id)}${search ? `?${search}` : ''}`}
                          aria-label={`View ${student.full_name}`}
                        >
                          View
                          <span aria-hidden="true"> ↗</span>
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && (
          <nav className="student-pagination" aria-label="Student pagination">
            <Button
              variant="secondary"
              disabled={data.offset === 0}
              onClick={() => paginate(Math.max(0, data.offset - data.limit))}
            >
              Previous
            </Button>
            <p role="status">Page {Math.floor(data.offset / data.limit) + 1}</p>
            <Button
              variant="secondary"
              disabled={!data.has_more || data.offset + data.limit > 1000000}
              onClick={() => paginate(data.offset + data.limit)}
            >
              Next
            </Button>
          </nav>
        )}
      </div>
      {account?.role === 'admin' && archived && selected?.uid === uid && (
        <StudentRestoreDialog
          key={`${uid}:${selected.student.student_id}`}
          student={selected.student}
          uid={uid}
          close={() => setSelected(undefined)}
          restored={(alreadyCurrent) => {
            setSelected(undefined);
            setNotice({
              uid,
              text: alreadyCurrent
                ? 'Student profile is already restored.'
                : 'Student profile restored successfully.',
            });
            retry();
          }}
        />
      )}
    </section>
  );
}
