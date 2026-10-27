import { useEffect, useRef, useState } from 'react';
import { Link, useBlocker, useSearchParams } from 'react-router-dom';
import Button from '../../../shared/components/ui/Button';
import { routePaths } from '../../../app/router/routePaths';
import useAuth from '../../auth/hooks/useAuth';
import { studentError } from '../api/students.api';
import {
  getStudentImportTemplate,
  importStudents,
} from '../api/student-import.api';
import {
  IMPORT_ERRORS,
  importReportCSV,
  readStudentCSV,
  STUDENT_CSV_COLUMNS,
} from '../student-import';
import type { ImportReport, StudentCSV } from '../student-import';
import NavigationIcon from '../../../layouts/components/NavigationIcon';
import '../../../styles/student-import.css';

const registrationLabels = {
  queued: 'Invitation queued',
  replayed: 'Already registered',
  rejected: 'Rejected',
  not_attempted: 'Not attempted',
  retry_required: 'Unconfirmed',
};

function CSVDownload({
  blob,
  filename,
  children,
}: {
  blob: Blob;
  filename: string;
  children: string;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const link = ref.current!;
    const url = URL.createObjectURL(blob);
    link.href = url;
    return () => {
      link.removeAttribute('href');
      URL.revokeObjectURL(url);
    };
  }, [blob]);
  return (
    <a className="button-link" ref={ref} download={filename}>
      {children}
    </a>
  );
}
function LeaveImport({
  pending,
  keep,
  leave,
}: {
  pending: boolean;
  keep: () => void;
  leave: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    dialog.querySelector('button')?.focus();
    return () => {
      dialog.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      className="student-discard"
      ref={ref}
      aria-labelledby="leave-import-title"
      onCancel={(event) => {
        event.preventDefault();
        keep();
      }}
    >
      <h2 id="leave-import-title">Leave student import?</h2>
      <p>
        The selected CSV and report are kept only on this page. Leaving will not
        undo any imported records.
      </p>
      {pending && (
        <p role="status">
          Wait for the current request to finish. Imported rows cannot be
          cancelled.
        </p>
      )}
      <div className="student-form-actions">
        <Button variant="secondary" onClick={keep}>
          Stay on this page
        </Button>
        <Button disabled={pending} onClick={leave}>
          Leave import
        </Button>
      </div>
    </dialog>
  );
}
function Report({
  report,
  directory,
}: {
  report: ImportReport;
  directory: string;
}) {
  const [blob] = useState(
    () =>
      new Blob([importReportCSV(report)], { type: 'text/csv;charset=utf-8' }),
  );
  return (
    <section
      className="student-card import-results"
      aria-labelledby="import-report-title"
    >
      <h2 id="import-report-title">Import report</h2>
      <p role="status">
        {report.registration ? (
          `${report.registration.queued} invitations queued · ${report.registration.replayed} already registered · ${report.registration.rejected} rejected · ${report.registration.retry_required} unconfirmed · ${report.registration.not_attempted} not attempted · ${report.total} total`
        ) : (
          <>
            {report.created} confirmed · {report.rejected} rejected ·{' '}
            {report.not_attempted} not attempted · {report.total} total
          </>
        )}
      </p>
      <div className="import-metrics" aria-label="Import totals">
        {(report.registration
          ? [
              ['Invitations queued', report.registration.queued, 'success'],
              ['Already registered', report.registration.replayed, 'neutral'],
              ['Rejected', report.registration.rejected, 'error'],
              ['Unconfirmed', report.registration.retry_required, 'error'],
              ['Not attempted', report.registration.not_attempted, 'neutral'],
            ]
          : [
              ['Confirmed', report.created, 'success'],
              ['Rejected', report.rejected, 'error'],
              ['Not attempted', report.not_attempted, 'neutral'],
            ]
        ).map(([label, count, tone]) => (
          <div className={`import-metric import-metric--${tone}`} key={label}>
            <span>{label}</span>
            <strong>{count}</strong>
          </div>
        ))}
      </div>
      {report.stopped_reason && (
        <p role="alert">
          {IMPORT_ERRORS[report.stopped_reason]} Earlier successful rows are
          kept.
        </p>
      )}
      <p>
        Confirmed rows have an account and profile. New registrations queue
        setup invitations; exact retries confirm the original registration
        without sending another invitation. Queued email does not mean
        delivered. Retry unchanged data as the same Admin if processing stops.
      </p>
      <div className="student-form-actions">
        <CSVDownload blob={blob} filename="student-import-report.csv">
          Download report CSV
        </CSVDownload>
        <Link className="button-link" to={directory}>
          View refreshed student directory
        </Link>
      </div>
      <div
        className="student-table-wrap student-import-table"
        tabIndex={0}
        role="region"
        aria-label="Import results"
      >
        <table className="student-table">
          <caption>Results by CSV record and starting line</caption>
          <thead>
            <tr>
              <th scope="col">Record</th>
              <th scope="col">Line</th>
              <th scope="col">Status</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <tr key={row.record}>
                <th scope="row">{row.record}</th>
                <td>{row.line}</td>
                <td>
                  <span
                    className={`import-status import-status--${row.registration_status ?? row.status}`}
                  >
                    {row.registration_status
                      ? registrationLabels[row.registration_status]
                      : row.status === 'not_attempted'
                        ? row.error === 'registration_unavailable'
                          ? 'Unconfirmed'
                          : 'Not attempted'
                        : row.status === 'created'
                          ? 'Confirmed'
                          : 'Rejected'}
                  </span>
                </td>
                <td>
                  {row.status === 'created' ? (
                    <Link to={`${routePaths.students}/${row.student_id}`}>
                      View student profile (record {row.record})
                    </Link>
                  ) : (
                    IMPORT_ERRORS[row.error!]
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ImportWorkspace({ uid }: { uid: string }) {
  const { signOut } = useAuth();
  const [params] = useSearchParams();
  const search = params.toString();
  const directory = `${routePaths.students}${search ? `?${search}` : ''}`;
  const [csv, setCSV] = useState<StudentCSV | null>(null);
  const [template, setTemplate] = useState<Blob | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState<'read' | 'template' | 'import' | null>(
    null,
  );
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [expired, setExpired] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [checked, setChecked] = useState(false);
  const active = useRef(false);
  const operation = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const summary = useRef<HTMLHeadingElement>(null);
  const blocker = useBlocker(
    () => operation.current || Boolean(csv && !report) || uncertain,
  );
  useEffect(() => {
    if (csv) summary.current?.focus();
  }, [csv]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!pending && (!csv || report) && !uncertain) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [csv, report, pending, uncertain]);
  function failure(reason: unknown, importing: boolean) {
    const problem = studentError(reason);
    if (problem.kind === 'session' || problem.kind === 'forbidden') {
      setBlocked(true);
      setExpired(problem.kind === 'session');
      setCSV(null);
      setTemplate(null);
      setError(
        problem.kind === 'session'
          ? 'Your session has expired. Sign in again.'
          : 'Administrator access is required. Import controls are disabled.',
      );
      if (importing) setUncertain(true);
    } else if (importing && problem.kind === 'invalid') {
      setError(
        'The server rejected the CSV structure, size, or encoding. No rows were imported by this request. Correct the file and select it again.',
      );
      setCSV(null);
      setConfirmed(false);
    } else {
      if (importing) setUncertain(true);
      setError(
        importing
          ? 'The import outcome could not be confirmed. Some rows may already have been created. Do not resubmit blindly.'
          : 'Template unavailable. Try downloading it again.',
      );
    }
  }
  async function choose(file?: File) {
    if (operation.current || blocked || uncertain || report) return;
    setCSV(null);
    setError('');
    setConfirmed(false);
    if (!file) return;
    operation.current = true;
    setPending('read');
    try {
      const value = await readStudentCSV(file);
      if (active.current) setCSV(value);
    } catch (reason) {
      if (active.current)
        setError(
          reason instanceof Error ? reason.message : 'Unable to read this CSV.',
        );
    } finally {
      operation.current = false;
      if (active.current) setPending(null);
    }
  }
  async function perform(importing: boolean, exactRetry = false) {
    if (
      operation.current ||
      blocked ||
      (uncertain && !exactRetry) ||
      (importing && (!csv || !confirmed || report))
    )
      return;
    operation.current = true;
    setPending(importing ? 'import' : 'template');
    setError('');
    const abort = new AbortController();
    controller.current = abort;
    try {
      if (importing) {
        const result = await importStudents(csv!.file, uid, abort.signal);
        if (!active.current) return;
        if (
          result.total !== csv!.records.length ||
          result.rows.some((row, i) => row.line !== csv!.records[i]?.line)
        )
          throw new Error('Import report does not match the selected CSV.');
        setReport(result);
        setUncertain(false);
        setCSV(null);
        setConfirmed(false);
        if (result.stopped_reason === 'forbidden') {
          setBlocked(true);
          setTemplate(null);
        }
      } else {
        const blob = await getStudentImportTemplate(uid, abort.signal);
        if (active.current) setTemplate(blob);
      }
    } catch (reason) {
      if (active.current) failure(reason, importing);
    } finally {
      operation.current = false;
      if (active.current) setPending(null);
    }
  }
  function reset() {
    if (operation.current || blocked || (uncertain && !checked)) return;
    setCSV(null);
    setReport(null);
    setConfirmed(false);
    setError('');
    setUncertain(false);
    setChecked(false);
  }
  return (
    <>
      <Link className="student-back" to={directory}>
        <span aria-hidden="true">← </span>Back to students
      </Link>
      <p className="page-description">
        Register students in bulk using their email and profile details. Upload
        your CSV, review the records, then queue their setup invitations.
      </p>
      <ol className="import-steps" aria-label="Import progress">
        {['Upload CSV', 'Review records', 'View results'].map(
          (label, index) => {
            const current = report ? 2 : csv ? 1 : 0;
            return (
              <li
                key={label}
                aria-current={index === current ? 'step' : undefined}
                className={index < current ? 'is-complete' : ''}
              >
                <span aria-hidden="true">
                  {index < current ? '✓' : index + 1}
                </span>
                {label}
              </li>
            );
          },
        )}
      </ol>
      <section
        className="student-card student-import import-workspace"
        aria-labelledby="csv-file-title"
        aria-busy={Boolean(pending)}
      >
        <div className="import-upload-panel">
          <div className="import-section-heading">
            <span className="import-section-icon">
              <NavigationIcon name="students" />
            </span>
            <div>
              <h2 id="csv-file-title">Upload your student list</h2>
              <p>Start with the template for a correctly formatted file.</p>
            </div>
          </div>
          {!blocked && (
            <div className="student-form-actions">
              <Button
                variant="secondary"
                disabled={Boolean(pending) || uncertain}
                onClick={() => void perform(false)}
              >
                Get CSV template
              </Button>
              {template && (
                <CSVDownload
                  blob={template}
                  filename="student-import-template.csv"
                >
                  Save CSV template
                </CSVDownload>
              )}
            </div>
          )}
          {!blocked && (
            <div className="student-form-field student-import-file import-upload-box">
              <svg
                aria-hidden="true"
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 16V3m-5 5 5-5 5 5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
              </svg>
              <label htmlFor="student-csv">Choose student CSV</label>
              <p id="csv-help">UTF-8 CSV · Up to 2 MiB · Maximum 100 records</p>
              <input
                id="student-csv"
                type="file"
                accept=".csv,text/csv"
                aria-describedby="csv-help"
                disabled={Boolean(pending) || uncertain || Boolean(report)}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  void choose(file);
                }}
              />
              {csv && (
                <span className="import-selected-file">
                  Selected: {csv.file.name}
                </span>
              )}
            </div>
          )}
          {pending && (
            <p role="status">
              {pending === 'read'
                ? 'Checking CSV structure…'
                : pending === 'template'
                  ? 'Loading template…'
                  : 'Importing student profiles. Keep this page open…'}
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          {expired && (
            <Button variant="secondary" onClick={() => void signOut()}>
              Sign in again
            </Button>
          )}
        </div>
        <aside className="import-guide" aria-labelledby="import-guide-title">
          <span className="import-guide-label">BEFORE YOU IMPORT</span>
          <h3 id="import-guide-title">A few things to check</h3>
          <ul>
            <li>Use each student's email from an approved email domain.</li>
            <li>Include 1–10 guardians for each student.</li>
            <li>
              Existing profiles are kept. Duplicate registrations are reported
              per row.
            </li>
          </ul>
          <div className="import-guide-note">
            Each new registration creates an account and profile and queues a
            private invitation to choose a password. No password is needed in
            the CSV.
          </div>
          <details className="import-format-guide">
            <summary>CSV format &amp; column guide</summary>
            <p>
              Use the exact template headers in any order. Blank lines are
              ignored.
            </p>
            <code className="student-import-columns">
              {STUDENT_CSV_COLUMNS.join(',')}
            </code>
            <p>
              Include <code>email</code>, not a user UUID or Firebase UID. Exact
              retries by the same Admin reuse the original registration.
            </p>
            <p>
              Guardian details must be a JSON array inside a properly quoted CSV
              field.
            </p>
          </details>
        </aside>
      </section>
      {csv && !report && !blocked && (
        <section
          className="student-card import-review"
          aria-labelledby="csv-review-title"
        >
          <h2 id="csv-review-title" tabIndex={-1} ref={summary}>
            2. Review {csv.records.length} records
          </h2>
          <p>
            {csv.file.name} · Document structure checked. The server validates
            student fields, guardians, email domains, and duplicates when you
            import.
          </p>
          <div
            className="student-table-wrap"
            tabIndex={0}
            role="region"
            aria-label="CSV preview"
          >
            <table className="student-table">
              <caption>
                First {Math.min(csv.records.length, 5)} records — preview only
              </caption>
              <thead>
                <tr>
                  <th scope="col">Record / line</th>
                  <th scope="col">Student ID</th>
                  <th scope="col">Name</th>
                  <th scope="col">Faculty</th>
                  <th scope="col">Year</th>
                </tr>
              </thead>
              <tbody>
                {csv.records.slice(0, 5).map((row) => (
                  <tr key={row.record}>
                    <th scope="row">
                      {row.record} / {row.line}
                    </th>
                    <td>{row.values.index_no}</td>
                    <td>{row.values.full_name}</td>
                    <td>{row.values.faculty}</td>
                    <td>{row.values.year}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="student-import-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={Boolean(pending) || uncertain}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            I understand that valid rows will register students and queue setup
            invitations. Successful registrations remain if the import stops.
          </label>
          <div className="student-form-actions">
            <Button
              disabled={!confirmed || Boolean(pending) || uncertain}
              onClick={() => void perform(true)}
            >
              Import {csv.records.length} records
            </Button>
            <Button
              variant="ghost"
              disabled={Boolean(pending) || uncertain}
              onClick={reset}
            >
              Clear selected CSV
            </Button>
          </div>
        </section>
      )}
      {uncertain && (
        <section
          className="student-card import-recovery"
          aria-labelledby="import-recovery-title"
        >
          <h2 id="import-recovery-title">
            Check the directory before another import
          </h2>
          <p>
            Check which registrations exist. Retry the unchanged CSV as the same
            Admin to confirm completed registrations and process remaining rows.
            Correct only definitively rejected rows. Existing profiles are never
            overwritten.
          </p>
          <Link
            to={routePaths.students}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open student directory in a new tab
          </Link>
          {!blocked && (
            <>
              {csv && (
                <Button
                  disabled={Boolean(pending)}
                  onClick={() => void perform(true, true)}
                >
                  Retry same CSV
                </Button>
              )}
              <label className="student-import-confirm">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => setChecked(event.target.checked)}
                />
                I checked the directory and will review the remaining records
                before importing again.
              </label>
              <Button
                variant="secondary"
                disabled={!checked || Boolean(pending)}
                onClick={reset}
              >
                Prepare another CSV
              </Button>
            </>
          )}
        </section>
      )}
      {report && <Report report={report} directory={directory} />}
      {report && !blocked && (
        <div className="student-import-file">
          <p>
            Before another import, review rejected or unattempted records and
            check the directory. Successful rows already exist.
          </p>
          <Button variant="secondary" onClick={reset}>
            Prepare another CSV
          </Button>
        </div>
      )}
      {blocker.state === 'blocked' && (
        <LeaveImport
          pending={Boolean(pending)}
          keep={() => blocker.reset()}
          leave={() => blocker.proceed()}
        />
      )}
    </>
  );
}
export default function StudentImportPage() {
  const { account } = useAuth();
  return (
    <section
      className="students-page student-import-page"
      aria-labelledby="student-import-title"
    >
      <p className="eyebrow">Directory / Students / Admin import</p>
      <h1 id="student-import-title">Import students</h1>
      {account?.role === 'admin' ? (
        <ImportWorkspace
          key={account.firebase_uid}
          uid={account.firebase_uid}
        />
      ) : (
        <p role="alert">Administrator access is required to import students.</p>
      )}
    </section>
  );
}
