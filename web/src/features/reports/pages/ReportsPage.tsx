import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import useAuth from '../../auth/hooks/useAuth';
import Button from '../../../shared/components/ui/Button';
import { routePaths } from '../../../app/router/routePaths';
import {
  exportReport,
  getReport,
  ReportError,
  reportAccessError,
  reportError,
  validatedFilters,
} from '../api/reports.api';
import type { ReportDownload } from '../api/reports.api';
import type {
  ExportFormat,
  ReportFilters,
  ReportKind,
  ReportPage,
} from '../reports.types';
import { emptyReportFilters, reportTitles } from '../reports.types';
import ReportResults from '../components/ReportResults';
import '../../../styles/reports.css';

export default function ReportsPage({
  kind = 'attendance',
}: {
  kind?: ReportKind;
}) {
  const { account } = useAuth();
  if (!account || (account.role !== 'admin' && account.role !== 'warden'))
    return <p role="alert">Admin or Warden access is required for reports.</p>;
  return (
    <Workspace
      key={`${account.firebase_uid}:${account.role}:${kind}`}
      uid={account.firebase_uid}
      kind={kind}
    />
  );
}
function Workspace({ uid, kind }: { uid: string; kind: ReportKind }) {
  const { retry, signOut } = useAuth();
  const [denied, setDenied] = useState<ReportError>();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <section className="reports-page">
      <p className="eyebrow">Staff / Reports</p>
      <h1 tabIndex={-1} ref={heading}>
        Reports
      </h1>
      <p className="page-description">
        Review historical records and export reports for a selected period.
      </p>
      <nav className="report-navigation" aria-label="Report navigation">
        {(Object.keys(reportTitles) as ReportKind[]).map((item) => (
          <Link
            key={item}
            to={
              item === 'attendance'
                ? routePaths.reports
                : `${routePaths.reports}/${item}`
            }
            aria-current={kind === item ? 'page' : undefined}
          >
            {reportTitles[item]}
          </Link>
        ))}
      </nav>
      {denied ? (
        <section className="report-card">
          <p role="alert">{denied.message}</p>
          <div className="report-toolbar">
            <Button
              size="sm"
              onClick={() => void retry().then(() => setDenied(undefined))}
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
      ) : (
        <ReportBrowser uid={uid} kind={kind} onAccessError={setDenied} />
      )}
    </section>
  );
}
function DownloadLink({ file }: { file: ReportDownload }) {
  const link = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const element = link.current!;
    const url = URL.createObjectURL(file.blob);
    element.href = url;
    element.focus();
    return () => {
      element.removeAttribute('href');
      URL.revokeObjectURL(url);
    };
  }, [file.blob]);
  return (
    <div className="report-download">
      <p role="status">
        {file.format === 'pdf' ? 'PDF' : 'Excel'} file ready. Use the link to
        save it to your device.
      </p>
      <a ref={link} className="button-link" download={file.filename}>
        Save {file.format === 'pdf' ? 'PDF' : 'Excel'} report
      </a>
      <p className="report-caption">
        {file.filename}. This file contains private report data. Only save it
        where appropriate.
      </p>
    </div>
  );
}
function ReportBrowser({
  uid,
  kind,
  onAccessError,
}: {
  uid: string;
  kind: ReportKind;
  onAccessError: (e: ReportError) => void;
}) {
  const [draft, setDraft] = useState<ReportFilters>(emptyReportFilters);
  const [applied, setApplied] = useState<ReportFilters | null>(null);
  const [offset, setOffset] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [validation, setValidation] = useState('');
  const [result, setResult] = useState<{
    key: string;
    data?: ReportPage;
    error?: ReportError;
  }>();
  const [file, setFile] = useState<ReportDownload>();
  const [exportFailure, setExportFailure] = useState<{
    error: ReportError;
    format: ExportFormat;
  }>();
  const [exportBusy, setExportBusy] = useState(false);
  const download = useRef<AbortController | null>(null);
  const region = useRef<HTMLDivElement>(null);
  const focus = useRef(false);
  const key = `${uid}:${kind}:${JSON.stringify(applied)}:${offset}:${attempt}`;
  useEffect(() => {
    const controller = new AbortController();
    if (applied)
      getReport(kind, applied, offset, uid, controller.signal)
        .then((data) => {
          if (!controller.signal.aborted) setResult({ key, data });
        })
        .catch((reason) => {
          if (controller.signal.aborted) return;
          const error = reportError(reason);
          if (reportAccessError(error)) onAccessError(error);
          else setResult({ key, error });
        });
    return () => controller.abort();
  }, [uid, kind, key, applied, offset, onAccessError]);
  useEffect(() => () => download.current?.abort(), []);
  const current = result?.key === key ? result : undefined;
  const pending = Boolean(applied) && !current;
  useEffect(() => {
    if (!pending && focus.current) {
      focus.current = false;
      region.current?.focus();
    }
  }, [pending]);
  const setField = (name: keyof ReportFilters, value: string) =>
    setDraft({ ...draft, [name]: value });
  function run(e: FormEvent) {
    e.preventDefault();
    if (download.current) return;
    try {
      const next = validatedFilters(kind, draft);
      setApplied(next);
      setOffset(0);
      setAttempt((n) => n + 1);
      setValidation('');
      setFile(undefined);
      setExportFailure(undefined);
      focus.current = true;
    } catch (reason) {
      setValidation(reportError(reason).message);
    }
  }
  function refresh() {
    setFile(undefined);
    setExportFailure(undefined);
    setOffset(0);
    setAttempt((n) => n + 1);
    focus.current = true;
  }
  async function prepare(format: ExportFormat) {
    if (!applied || !current?.data || pending || download.current) return;
    const controller = new AbortController();
    download.current = controller;
    setExportBusy(true);
    setExportFailure(undefined);
    setFile(undefined);
    try {
      const value = await exportReport(
        kind,
        applied,
        format,
        uid,
        controller.signal,
      );
      if (!controller.signal.aborted) setFile(value);
    } catch (reason) {
      if (controller.signal.aborted) return;
      const error = reportError(reason);
      if (reportAccessError(error)) onAccessError(error);
      else setExportFailure({ error, format });
    } finally {
      if (!controller.signal.aborted) {
        download.current = null;
        setExportBusy(false);
      }
    }
  }
  function cancel() {
    download.current?.abort();
    download.current = null;
    setExportBusy(false);
    setExportFailure(undefined);
    setFile(undefined);
  }
  const attendance = kind === 'attendance' || kind === 'daily';
  return (
    <section className="report-card" aria-labelledby="report-type-title">
      <h2 id="report-type-title">{reportTitles[kind]}</h2>
      <p className="report-description">
        {attendance
          ? 'Dates select recorded movement time in the backend hostel timezone. Ignored scan attempts are excluded.'
          : kind === 'leaves'
            ? 'Dates select when the leave request was submitted, not its planned leave dates. Status is the current request status.'
            : 'Dates select when the complaint was submitted. Category and status describe the current complaint snapshot.'}
      </p>
      {kind === 'daily' && (
        <p>
          Every calendar date is included, including zero-activity dates. Zero
          movements does not mean students were absent.
        </p>
      )}
      <form onSubmit={run}>
        <fieldset disabled={exportBusy} className="report-filters">
          <legend>Report filters</legend>
          <label>
            From date
            <input
              type="date"
              value={draft.from}
              onChange={(e) => setField('from', e.target.value)}
              min="0001-01-01"
              max="9998-12-31"
              required
            />
          </label>
          <label>
            To date
            <input
              type="date"
              value={draft.to}
              onChange={(e) => setField('to', e.target.value)}
              min="0001-01-01"
              max="9998-12-31"
              required
            />
          </label>
          <label>
            Student profile ID (optional)
            <input
              value={draft.studentID}
              onChange={(e) => setField('studentID', e.target.value)}
              placeholder="Profile UUID"
            />
          </label>
          {attendance && (
            <label>
              Direction
              <select
                value={draft.direction}
                onChange={(e) => setField('direction', e.target.value)}
              >
                <option value="">All directions</option>
                <option>IN</option>
                <option>OUT</option>
              </select>
            </label>
          )}
          {!attendance && (
            <label>
              Status
              <select
                value={draft.status}
                onChange={(e) => setField('status', e.target.value)}
              >
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                {kind === 'leaves' ? (
                  <>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="cancelled">Cancelled</option>
                  </>
                ) : (
                  <>
                    <option value="in_progress">In progress</option>
                    <option value="resolved">Resolved</option>
                  </>
                )}
              </select>
            </label>
          )}
          {kind === 'complaints' && (
            <label>
              Category
              <select
                value={draft.category}
                onChange={(e) => setField('category', e.target.value)}
              >
                <option value="">All categories</option>
                <option value="maintenance">Maintenance</option>
                <option value="disciplinary">Disciplinary</option>
              </select>
            </label>
          )}
          <div className="report-filter-actions">
            <Button type="submit" size="sm" disabled={pending}>
              Run report
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                setDraft(emptyReportFilters);
                setApplied(null);
                setOffset(0);
                setValidation('');
                setFile(undefined);
                setExportFailure(undefined);
              }}
            >
              Clear filters
            </Button>
          </div>
        </fieldset>
      </form>
      <p className="report-caption">
        Dates are inclusive hostel calendar dates, maximum 366 days. The backend
        returns the configured timezone with results. Student profile ID is an
        optional UUID, not a university Student ID. Edit fields, then Run report
        to apply them.
      </p>
      {validation && <p role="alert">{validation}</p>}
      <div className="report-toolbar report-export-toolbar">
        <Button
          size="sm"
          variant="secondary"
          disabled={!applied || pending || exportBusy}
          onClick={refresh}
        >
          Refresh report
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={!current?.data || pending || exportBusy}
          onClick={() => void prepare('pdf')}
        >
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5" />
          </svg>
          Download PDF
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={!current?.data || pending || exportBusy}
          onClick={() => void prepare('xlsx')}
        >
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5" />
          </svg>
          Download Excel
        </Button>
        {exportBusy && (
          <Button size="sm" variant="secondary" onClick={cancel}>
            Cancel download
          </Button>
        )}
      </div>
      {!current?.data && !pending && (
        <p className="report-caption">
          Run a report to enable PDF and Excel downloads.
        </p>
      )}
      <details className="report-export-help">
        <summary>Export limits and data scope</summary>
        <p className="report-caption">
          Exports use the applied filters and include every matching row, not
          just this page. Excel supports up to 5,000 rows; PDF up to 1,000 rows
          with document-size/page limits. Exports are generated from a new
          backend snapshot and can differ from the displayed report. Narrow
          filters if an export is too large.
        </p>
      </details>
      {exportBusy && <p role="status">Preparing private report download…</p>}
      {exportFailure && (
        <div>
          <p role="alert">{exportFailure.error.message}</p>
          {['busy', 'unavailable'].includes(exportFailure.error.kind) && (
            <Button
              size="sm"
              onClick={() => void prepare(exportFailure.format)}
            >
              Retry {exportFailure.format === 'pdf' ? 'PDF' : 'Excel'} export
            </Button>
          )}
        </div>
      )}
      {file && <DownloadLink file={file} />}
      <div
        ref={region}
        tabIndex={-1}
        role="region"
        aria-label="Report results"
        aria-busy={pending}
      >
        {!applied ? (
          <div className="report-empty-state">
            <svg
              aria-hidden="true"
              width="44"
              height="44"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M14 3H5v18h14V8l-5-5ZM14 3v5h5M8 12h8M8 16h5" />
            </svg>
            <h3>No report generated yet</h3>
            <p>Choose a date range and run a report.</p>
          </div>
        ) : pending ? (
          <p role="status">Loading report…</p>
        ) : current?.error ? (
          <div>
            <p role="alert">{current.error.message}</p>
            <Button size="sm" onClick={refresh}>
              Retry report
            </Button>
          </div>
        ) : (
          current?.data && (
            <>
              <p className="report-caption">
                Applied student profile: {applied.studentID || 'All students'}.
                {attendance
                  ? ` Direction: ${applied.direction || 'All directions'}.`
                  : ` Status: ${applied.status || 'All statuses'}.`}
                {kind === 'complaints' &&
                  ` Category: ${applied.category || 'All categories'}.`}
              </p>
              <ReportResults page={current.data} />
              <nav
                className="report-toolbar report-pagination"
                aria-label="Report pages"
              >
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!offset || exportBusy}
                  onClick={() => {
                    setOffset((n) => Math.max(0, n - 20));
                    setFile(undefined);
                    setExportFailure(undefined);
                    focus.current = true;
                  }}
                >
                  Previous
                </Button>
                <span>Page {offset / 20 + 1}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={
                    !current.data.has_more || offset >= 1000000 || exportBusy
                  }
                  onClick={() => {
                    setOffset((n) => n + 20);
                    setFile(undefined);
                    setExportFailure(undefined);
                    focus.current = true;
                  }}
                >
                  Next
                </Button>
              </nav>
            </>
          )
        )}
      </div>
      <p className="report-caption">
        Refresh returns to page 1. Reports are read-only historical records, not
        attendance edits, leave allowance calculations or scheduled jobs.
      </p>
    </section>
  );
}
